from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Ambulance, AmbulanceAssignment, Driver, EmergencyRequest, User
from app.schemas import DriverOut, LocationUpdate, MessageResponse
from app.services.audit import log_action
from app.services.demo_simulation import simulation_engine
from app.services.emergency_service import (
    broadcast_emergency,
    emergency_payload,
    set_status,
)
from app.services.notifications import notify
from app.services.tracking import update_location
from app.utils.helpers import from_json

router = APIRouter(prefix="/api/drivers", tags=["drivers"])


def _driver_out(db: Session, driver: Driver) -> dict:
    ambulance = db.get(Ambulance, driver.ambulance_id) if driver.ambulance_id else None
    return {
        "id": driver.id,
        "user_id": driver.user_id,
        "full_name": driver.user.full_name,
        "email": driver.user.email,
        "phone": driver.user.phone,
        "license_number": driver.license_number,
        "ambulance_id": driver.ambulance_id,
        "is_available": driver.is_available,
        "is_active": driver.user.is_active,
        "current_lat": driver.current_lat,
        "current_lng": driver.current_lng,
        "ambulance": {
            "id": ambulance.id,
            "vehicle_number": ambulance.vehicle_number,
            "type": ambulance.type,
            "status": ambulance.status,
        } if ambulance else None,
    }


@router.get("/me", response_model=DriverOut, summary="Current driver profile with ambulance")
def me(user: User = Depends(require_roles("DRIVER")), db: Session = Depends(get_db)):
    return _driver_out(db, user.driver)


@router.get("/me/ambulance", summary="Current driver's ambulance + live location")
def my_ambulance(user: User = Depends(require_roles("DRIVER")), db: Session = Depends(get_db)):
    driver = user.driver
    if not driver.ambulance_id:
        raise HTTPException(status_code=400, detail="No ambulance assigned to you")
    ambulance = db.get(Ambulance, driver.ambulance_id)
    return {
        "id": ambulance.id,
        "vehicle_number": ambulance.vehicle_number,
        "type": ambulance.type,
        "status": ambulance.status,
        "capacity": ambulance.capacity,
        "current_lat": ambulance.current_lat,
        "current_lng": ambulance.current_lng,
        "simulation_running": simulation_engine.is_running(ambulance.id),
    }


@router.post("/me/location", response_model=MessageResponse, summary="Report GPS location (also marks you en-route when an assignment is active)")
async def report_location(
    payload: LocationUpdate,
    user: User = Depends(require_roles("DRIVER")),
    db: Session = Depends(get_db),
):
    driver = user.driver
    if not driver.ambulance_id:
        raise HTTPException(status_code=400, detail="No ambulance assigned")
    ambulance = db.get(Ambulance, driver.ambulance_id)
    try:
        update_location(db, ambulance.id, payload.lat, payload.lng, payload.heading, payload.speed_kmh)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    active = (
        db.query(EmergencyRequest)
        .filter(
            EmergencyRequest.assigned_driver_id == driver.id,
            EmergencyRequest.status.in_([
                "AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE",
                "ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL",
                "ARRIVED_AT_HOSPITAL",
            ]),
        )
        .order_by(EmergencyRequest.id.desc())
        .first()
    )
    if active and active.status == "AMBULANCE_ASSIGNED":
        await set_status(db, active, "DRIVER_EN_ROUTE", {"user_id": user.id, "role": "DRIVER"})
        notify(
            db, active.patient.user_id,
            "Ambulance en route",
            f"{ambulance.vehicle_number} is on its way to your pickup location.",
            "SUCCESS", "emergency", active.id,
        )
    return {"message": "Location updated"}


@router.post("/emergencies/{emergency_id}/accept", response_model=dict, summary="Accept an assigned emergency")
async def accept_emergency(
    emergency_id: int,
    user: User = Depends(require_roles("DRIVER")),
    db: Session = Depends(get_db),
):
    emergency = db.get(EmergencyRequest, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found")
    if emergency.assigned_driver_id != user.driver.id:
        raise HTTPException(status_code=403, detail="Not assigned to you")
    if emergency.status != "AMBULANCE_ASSIGNED":
        raise HTTPException(status_code=400, detail=f"Cannot accept in status {emergency.status}")

    assignment = (
        db.query(AmbulanceAssignment)
        .filter(AmbulanceAssignment.emergency_id == emergency.id)
        .order_by(AmbulanceAssignment.id.desc())
        .first()
    )
    if assignment:
        assignment.status = "ACCEPTED"
        assignment.accepted_at = datetime.now(timezone.utc)
    db.commit()

    emergency = await set_status(db, emergency, "DRIVER_ACCEPTED", {"user_id": user.id, "role": "DRIVER"})
    notify(
        db, emergency.patient.user_id,
        "Driver accepted",
        f"Driver {user.driver.user.full_name} accepted your emergency. Live tracking is starting.",
        "SUCCESS", "emergency", emergency.id,
    )
    log_action(db, "driver_accepted", user.id, "emergency", emergency.id, {})
    return emergency_payload(db, emergency)


@router.post("/emergencies/{emergency_id}/reject", response_model=dict, summary="Reject an assigned emergency (ambulance freed, re-assignment attempted)")
async def reject_emergency(
    emergency_id: int,
    request: Request,
    user: User = Depends(require_roles("DRIVER")),
    db: Session = Depends(get_db),
):
    emergency = db.get(EmergencyRequest, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found")
    if emergency.assigned_driver_id != user.driver.id:
        raise HTTPException(status_code=403, detail="Not assigned to you")
    if emergency.status != "AMBULANCE_ASSIGNED":
        raise HTTPException(status_code=400, detail="Cannot reject at this stage")

    driver = user.driver
    ambulance = db.get(Ambulance, emergency.assigned_ambulance_id) if emergency.assigned_ambulance_id else None
    if ambulance:
        ambulance.status = "AVAILABLE"
    driver.is_available = True
    db.commit()

    emergency.status = "SEARCHING_AMBULANCE"
    emergency.assigned_ambulance_id = None
    emergency.assigned_driver_id = None
    db.commit()
    await broadcast_emergency(db, emergency, "driver_rejected")

    from app.services.emergency_service import find_and_assign_ambulance

    emergency = await find_and_assign_ambulance(db, emergency)
    log_action(db, "driver_rejected", user.id, "emergency", emergency.id, {}, request.client.host if request.client else None)
    return emergency_payload(db, emergency)


@router.post("/emergencies/{emergency_id}/status", response_model=dict, summary="Driver status transitions: START_JOURNEY | ARRIVED_AT_PICKUP | PATIENT_PICKED_UP | START_HOSPITAL_JOURNEY | ARRIVED_AT_HOSPITAL | COMPLETE_TRIP")
async def driver_status(
    emergency_id: int,
    payload: dict,
    user: User = Depends(require_roles("DRIVER")),
    db: Session = Depends(get_db),
):
    emergency = db.get(EmergencyRequest, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found")
    if emergency.assigned_driver_id != user.driver.id:
        raise HTTPException(status_code=403, detail="Not your assignment")

    action = payload.get("action")
    mapping = {
        "START_JOURNEY": "DRIVER_EN_ROUTE",
        "ARRIVED_AT_PICKUP": "ARRIVED_AT_PICKUP",
        "PATIENT_PICKED_UP": "PATIENT_PICKED_UP",
        "START_HOSPITAL_JOURNEY": "EN_ROUTE_TO_HOSPITAL",
        "ARRIVED_AT_HOSPITAL": "ARRIVED_AT_HOSPITAL",
        "COMPLETE_TRIP": "COMPLETED",
    }
    new_status = mapping.get(action)
    if not new_status:
        raise HTTPException(status_code=400, detail="Invalid action")
    try:
        emergency = await set_status(db, emergency, new_status, {"user_id": user.id, "role": "DRIVER"})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    messages = {
        "DRIVER_EN_ROUTE": ("Ambulance en route", "The ambulance is heading to your pickup location."),
        "ARRIVED_AT_PICKUP": ("Ambulance arrived", "The ambulance has arrived at your pickup location."),
        "PATIENT_PICKED_UP": ("Patient picked up", "You have been picked up. Heading to the hospital."),
        "EN_ROUTE_TO_HOSPITAL": ("On the way to hospital", "The ambulance is now driving to the recommended hospital."),
        "ARRIVED_AT_HOSPITAL": ("Arrived at hospital", "The ambulance has arrived at the hospital."),
        "COMPLETED": ("Emergency completed", "Your emergency has been completed. Get well soon!"),
    }
    title, msg = messages[new_status]
    if emergency.patient and emergency.patient.user_id != user.id:
        notify(db, emergency.patient.user_id, title, msg, "SUCCESS", "emergency", emergency.id)
    log_action(db, f"driver_action:{action}", user.id, "emergency", emergency.id, {})
    return emergency_payload(db, emergency)


@router.get("/me/active-emergency", response_model=dict, summary="Driver's current active emergency")
def active_emergency(user: User = Depends(require_roles("DRIVER")), db: Session = Depends(get_db)):
    emergency = (
        db.query(EmergencyRequest)
        .filter(
            EmergencyRequest.assigned_driver_id == user.driver.id,
            EmergencyRequest.status.in_([
                "AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE",
                "ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL",
                "ARRIVED_AT_HOSPITAL",
            ]),
        )
        .order_by(EmergencyRequest.id.desc())
        .first()
    )
    return {"emergency": emergency_payload(db, emergency) if emergency else None}


@router.post("/me/sos", response_model=MessageResponse, summary="Emergency/SOS button (alerts admins)")
async def sos(
    payload: dict | None = None,
    user: User = Depends(require_roles("DRIVER")),
    db: Session = Depends(get_db),
):
    message = (payload or {}).get("message") or "Driver SOS"
    from app.services.notifications import notify_roles

    notify_roles(db, ["ADMIN"], "Driver SOS", f"{user.full_name} ({user.driver.license_number}) pressed SOS: {message}", "DANGER", "driver", user.driver.id)
    log_action(db, "driver_sos", user.id, "driver", user.driver.id, {"message": message})
    return {"message": "SOS alert sent to admin"}