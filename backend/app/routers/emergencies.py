import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.ai import emergency_priority, hospital_recommendation, route_optimization
from app.auth.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Ambulance, EmergencyRequest, Hospital, Patient, Route, User
from app.schemas import CancelRequest, EmergencyCreate, EmergencyOut, HistoryOut, StatusUpdate
from app.services.audit import log_action
from app.services.emergency_service import (
    broadcast_emergency,
    emergency_payload,
    find_and_assign_ambulance,
    finalize_recommendation,
    set_status,
)
from app.services.notifications import notify
from app.utils.helpers import to_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/emergencies", tags=["emergencies"])


@router.post("", response_model=EmergencyOut, status_code=201, summary="Create an emergency — runs priority AI, hospital recommendation, ambulance assignment and route optimization")
async def create_emergency(
    payload: EmergencyCreate,
    request: Request,
    user: User = Depends(require_roles("PATIENT", "ADMIN")),
    db: Session = Depends(get_db),
):
    if user.role == "PATIENT":
        patient = user.patient
        if patient is None:
            raise HTTPException(status_code=400, detail="Patient profile not found — update your profile first")
    else:
        patient = db.get(Patient, payload.patient_id) if payload.patient_id else None
        if patient is None:
            patient = db.query(Patient).order_by(Patient.id).first()
        if patient is None:
            raise HTTPException(status_code=400, detail="No patient available for this request")

    age = payload.patient_age if payload.patient_age is not None else patient.age
    priority = emergency_priority.compute_priority(
        payload.severity, payload.emergency_type, age, payload.symptoms, payload.vitals
    )

    emergency = EmergencyRequest(
        patient_id=patient.id,
        patient_name=patient.user.full_name,
        patient_age=age,
        patient_gender=payload.patient_gender or patient.gender,
        contact_phone=payload.contact_phone or patient.user.phone,
        emergency_type=payload.emergency_type,
        severity=payload.severity,
        symptoms=payload.symptoms or "",
        medical_history=payload.medical_history or patient.medical_history,
        blood_group=payload.blood_group or patient.blood_group,
        allergies=payload.allergies or patient.allergies,
        pickup_lat=payload.pickup_lat,
        pickup_lng=payload.pickup_lng,
        pickup_address=payload.pickup_address,
        preferred_hospital_hint=payload.preferred_hospital_hint,
        priority=priority["priority"],
        priority_score=priority["score"],
        priority_reason=priority["reason"],
        status="REQUESTED",
    )
    db.add(emergency)
    db.commit()
    db.refresh(emergency)

    log_action(db, "emergency_created", user.id, "emergency", emergency.id, {
        "type": emergency.emergency_type,
        "severity": emergency.severity,
        "priority": emergency.priority,
        "score": emergency.priority_score,
    }, request.client.host if request.client else None)

    notify(
        db, patient.user_id,
        "Emergency request received",
        f"Request #{emergency.id} received. AI priority: {emergency.priority} (score {emergency.priority_score}).",
        "SUCCESS", "emergency", emergency.id,
    )
    await broadcast_emergency(db, emergency, "emergency_created")

    recommendation = hospital_recommendation.recommend_hospital(
        db,
        payload.pickup_lat,
        payload.pickup_lng,
        payload.emergency_type,
        payload.severity,
        payload.preferred_hospital_hint,
    )
    if recommendation["recommended"]:
        await finalize_recommendation(db, emergency, recommendation)

    await find_and_assign_ambulance(db, emergency)
    return await _optimize_and_store_route(db, emergency)


async def _optimize_and_store_route(db: Session, emergency: EmergencyRequest) -> dict:
    origin_lat, origin_lng = 13.0827, 80.2707
    if emergency.assigned_ambulance_id:
        ambulance = db.get(Ambulance, emergency.assigned_ambulance_id)
        if ambulance and ambulance.current_lat is not None:
            origin_lat, origin_lng = ambulance.current_lat, ambulance.current_lng

    leg1 = route_optimization.compute_route(
        (origin_lat, origin_lng), (emergency.pickup_lat, emergency.pickup_lng), priority=emergency.priority
    )
    route_payload = dict(leg1)
    route_payload["legs"] = {"to_pickup": {k: leg1[k] for k in ("distance_km", "duration_min", "path", "method")}}

    dest_lat, dest_lng = emergency.pickup_lat, emergency.pickup_lng
    if emergency.recommended_hospital_id:
        hospital = db.get(Hospital, emergency.recommended_hospital_id)
        if hospital:
            dest_lat, dest_lng = hospital.lat, hospital.lng
            leg2 = route_optimization.compute_route(
                (emergency.pickup_lat, emergency.pickup_lng), (hospital.lat, hospital.lng),
                priority=emergency.priority,
            )
            route_payload["legs"]["to_hospital"] = {k: leg2[k] for k in ("distance_km", "duration_min", "path", "method")}

    emergency.route_json = to_json(route_payload)

    route_row = db.query(Route).filter(Route.emergency_id == emergency.id).first()
    if route_row is None:
        route_row = Route(
            emergency_id=emergency.id,
            ambulance_id=emergency.assigned_ambulance_id,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            pickup_lat=emergency.pickup_lat,
            pickup_lng=emergency.pickup_lng,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            distance_km=leg1["distance_km"],
            duration_min=leg1["duration_min"],
            traffic_factor=leg1["traffic_factor"],
            method=leg1["method"],
            path_json=to_json(leg1["path"]),
            explanation=leg1["explanation"],
        )
        db.add(route_row)
    else:
        route_row.ambulance_id = emergency.assigned_ambulance_id
        route_row.path_json = to_json(leg1["path"])
    db.commit()
    db.refresh(emergency)
    await broadcast_emergency(db, emergency, "route_optimized")
    return emergency_payload(db, emergency)


@router.get("", response_model=list[EmergencyOut], summary="List emergencies (role-aware filtering + pagination)")
def list_emergencies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    severity: Optional[str] = None,
    emergency_type: Optional[str] = None,
    search: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(EmergencyRequest)
    if user.role == "PATIENT":
        query = query.filter(EmergencyRequest.patient_id == user.patient.id)
    elif user.role == "DRIVER":
        query = query.filter(EmergencyRequest.assigned_driver_id == user.driver.id)
    elif user.role == "HOSPITAL":
        query = query.filter(EmergencyRequest.recommended_hospital_id == user.hospital_staff.hospital_id)

    if status_filter:
        query = query.filter(EmergencyRequest.status == status_filter)
    if severity:
        query = query.filter(EmergencyRequest.severity == severity)
    if emergency_type:
        query = query.filter(EmergencyRequest.emergency_type == emergency_type)
    if search:
        like = f"%{search}%"
        query = query.filter(
            EmergencyRequest.patient_name.ilike(like) | EmergencyRequest.emergency_type.ilike(like)
            | EmergencyRequest.pickup_address.ilike(like)
        )
    total = query.count()
    items = (
        query.order_by(EmergencyRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [emergency_payload(db, e) for e in items]


@router.get("/{emergency_id}", response_model=EmergencyOut, summary="Get a single emergency with full context")
def get_emergency(emergency_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emergency = db.get(EmergencyRequest, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found")
    return emergency_payload(db, emergency)


@router.get("/{emergency_id}/history", response_model=list[HistoryOut], summary="Emergency history timeline")
def emergency_history(emergency_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emergency = db.get(EmergencyRequest, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found")
    return emergency.history


@router.put("/{emergency_id}/status", response_model=EmergencyOut, summary="Transition emergency status (driver/hospital/admin actions)")
async def update_status(
    emergency_id: int,
    payload: StatusUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    emergency = db.get(EmergencyRequest, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found")

    actor = {"user_id": user.id, "role": user.role}
    if user.role == "DRIVER" and emergency.assigned_driver_id != user.driver.id:
        raise HTTPException(status_code=403, detail="Not your assignment")
    if user.role == "HOSPITAL":
        if emergency.recommended_hospital_id != user.hospital_staff.hospital_id:
            raise HTTPException(status_code=403, detail="Not your hospital's emergency")
        if payload.status not in ("ARRIVED_AT_HOSPITAL", "PATIENT_ADMITTED", "COMPLETED"):
            raise HTTPException(status_code=403, detail="Hospital can only admit or complete")

    try:
        emergency = await set_status(db, emergency, payload.status, actor, payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    log_action(db, f"status_changed:{payload.status}", user.id, "emergency", emergency.id, {
        "from_status": None
    })
    db.refresh(emergency)
    return emergency_payload(db, emergency)


@router.post("/{emergency_id}/cancel", response_model=EmergencyOut, summary="Cancel an emergency (patient/admin)")
async def cancel_emergency(
    emergency_id: int,
    payload: CancelRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    emergency = db.get(EmergencyRequest, emergency_id)
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency not found")
    if user.role == "PATIENT" and emergency.patient.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not your emergency")
    if emergency.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(status_code=400, detail=f"Emergency already {emergency.status.lower()}")
    if emergency.status in ("ARRIVED_AT_HOSPITAL", "PATIENT_ADMITTED"):
        raise HTTPException(status_code=400, detail="Cannot cancel at this stage")

    emergency = await set_status(db, emergency, "CANCELLED", {"user_id": user.id, "role": user.role}, payload.reason or "Cancelled by user")
    log_action(db, "emergency_cancelled", user.id, "emergency", emergency.id, {"reason": payload.reason})
    db.refresh(emergency)
    return emergency_payload(db, emergency)
