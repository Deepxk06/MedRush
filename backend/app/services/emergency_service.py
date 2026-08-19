"""Emergency workflow engine — assignment, status transitions, notifications, real-time events."""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.ai.route_optimization import estimate_eta
from app.models import (
    Ambulance,
    AmbulanceAssignment,
    Driver,
    EmergencyHistory,
    EmergencyRequest,
    HospitalStaff,
    Route,
)
from app.services.audit import log_action
from app.services.notifications import notify, notify_hospital_staff, notify_roles
from app.utils.helpers import from_json, to_json
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)

STATUS_FLOW: dict[str, list[str]] = {
    "REQUESTED": ["SEARCHING_AMBULANCE", "CANCELLED"],
    "SEARCHING_AMBULANCE": ["AMBULANCE_ASSIGNED", "CANCELLED"],
    "AMBULANCE_ASSIGNED": ["DRIVER_ACCEPTED", "DRIVER_EN_ROUTE", "CANCELLED"],
    "DRIVER_ACCEPTED": ["DRIVER_EN_ROUTE", "CANCELLED"],
    "DRIVER_EN_ROUTE": ["ARRIVED_AT_PICKUP", "CANCELLED"],
    "ARRIVED_AT_PICKUP": ["PATIENT_PICKED_UP", "CANCELLED"],
    "PATIENT_PICKED_UP": ["EN_ROUTE_TO_HOSPITAL", "CANCELLED"],
    "EN_ROUTE_TO_HOSPITAL": ["ARRIVED_AT_HOSPITAL", "CANCELLED"],
    "ARRIVED_AT_HOSPITAL": ["PATIENT_ADMITTED"],
    "PATIENT_ADMITTED": ["COMPLETED"],
    "COMPLETED": [],
    "CANCELLED": [],
}

TIMESTAMP_FIELD = {
    "AMBULANCE_ASSIGNED": "assigned_at",
    "DRIVER_ACCEPTED": "driver_accepted_at",
    "DRIVER_EN_ROUTE": "driver_en_route_at",
    "ARRIVED_AT_PICKUP": "arrived_at_pickup_at",
    "PATIENT_PICKED_UP": "picked_up_at",
    "EN_ROUTE_TO_HOSPITAL": "en_route_hospital_at",
    "ARRIVED_AT_HOSPITAL": "arrived_hospital_at",
    "PATIENT_ADMITTED": "admitted_at",
    "COMPLETED": "completed_at",
    "CANCELLED": "cancelled_at",
}

ACTOR_NOTIFY = {
    "driver": "drivers",
    "hospital": "hospitals",
}


async def add_history(db: Session, emergency: EmergencyRequest, event: str, description: str, actor: dict | None = None) -> None:
    entry = EmergencyHistory(
        emergency_id=emergency.id,
        event=event,
        description=description,
        actor_user_id=(actor or {}).get("user_id"),
        actor_role=(actor or {}).get("role"),
    )
    db.add(entry)
    history = from_json(emergency.status_history, [])
    history.append({"status": emergency.status, "at": datetime.now(timezone.utc).isoformat()})
    emergency.status_history = to_json(history)
    db.commit()
    await ws_manager.send_to_users(
        [emergency.patient_id],
        "history_created",
        {"emergency_id": emergency.id, "event": event, "description": description},
    )


async def broadcast_emergency(db: Session, emergency: EmergencyRequest, event: str) -> None:
    """Push emergency payload to patient, driver, hospital staff and admin rooms."""
    data = emergency_payload(db, emergency)
    patient_user = emergency.patient.user_id if emergency.patient else None
    recipients = []
    if patient_user:
        recipients.append(patient_user)
    if emergency.assigned_driver_id:
        driver = db.get(Driver, emergency.assigned_driver_id)
        if driver:
            recipients.append(driver.user_id)
    if emergency.recommended_hospital_id:
        staff = db.query(HospitalStaff).filter(HospitalStaff.hospital_id == emergency.recommended_hospital_id).all()
        recipients.extend(m.user_id for m in staff)
    from app.models import User

    admin_ids = [uid for (uid,) in db.query(User.id).filter(User.role == "ADMIN", User.is_active.is_(True)).all()]
    recipients.extend(admin_ids)
    await ws_manager.send_to_users(list(set(recipients)), event, data)


def emergency_payload(db: Session, emergency: EmergencyRequest) -> dict[str, Any]:
    ambulance = db.get(Ambulance, emergency.assigned_ambulance_id) if emergency.assigned_ambulance_id else None
    driver = db.get(Driver, emergency.assigned_driver_id) if emergency.assigned_driver_id else None
    route = db.query(Route).filter(Route.emergency_id == emergency.id).first()
    from app.models import Hospital

    hospital = db.get(Hospital, emergency.recommended_hospital_id) if emergency.recommended_hospital_id else None
    return {
        "id": emergency.id,
        "patient_id": emergency.patient_id,
        "patient_name": emergency.patient_name,
        "patient_age": emergency.patient_age,
        "patient_gender": emergency.patient_gender,
        "emergency_type": emergency.emergency_type,
        "severity": emergency.severity,
        "symptoms": emergency.symptoms,
        "medical_history": emergency.medical_history,
        "blood_group": emergency.blood_group,
        "allergies": emergency.allergies,
        "contact_phone": emergency.contact_phone,
        "pickup_lat": emergency.pickup_lat,
        "pickup_lng": emergency.pickup_lng,
        "pickup_address": emergency.pickup_address,
        "preferred_hospital_hint": emergency.preferred_hospital_hint,
        "priority": emergency.priority,
        "priority_score": emergency.priority_score,
        "priority_reason": emergency.priority_reason,
        "status": emergency.status,
        "assigned_ambulance_id": emergency.assigned_ambulance_id,
        "assigned_driver_id": emergency.assigned_driver_id,
        "recommended_hospital_id": emergency.recommended_hospital_id,
        "hospital_score": emergency.hospital_score,
        "hospital_reason": emergency.hospital_reason,
        "hospital_rankings": from_json(emergency.hospital_rankings, []),
        "route_json": emergency.route_json,
        "created_at": emergency.created_at.isoformat() if emergency.created_at else None,
        "updated_at": emergency.updated_at.isoformat() if emergency.updated_at else None,
        "requested_at": emergency.requested_at.isoformat() if emergency.requested_at else None,
        "assigned_at": emergency.assigned_at.isoformat() if emergency.assigned_at else None,
        "driver_accepted_at": emergency.driver_accepted_at.isoformat() if emergency.driver_accepted_at else None,
        "driver_en_route_at": emergency.driver_en_route_at.isoformat() if emergency.driver_en_route_at else None,
        "arrived_at_pickup_at": emergency.arrived_at_pickup_at.isoformat() if emergency.arrived_at_pickup_at else None,
        "picked_up_at": emergency.picked_up_at.isoformat() if emergency.picked_up_at else None,
        "en_route_hospital_at": emergency.en_route_hospital_at.isoformat() if emergency.en_route_hospital_at else None,
        "arrived_hospital_at": emergency.arrived_hospital_at.isoformat() if emergency.arrived_hospital_at else None,
        "admitted_at": emergency.admitted_at.isoformat() if emergency.admitted_at else None,
        "completed_at": emergency.completed_at.isoformat() if emergency.completed_at else None,
        "cancelled_at": emergency.cancelled_at.isoformat() if emergency.cancelled_at else None,
        "cancel_reason": emergency.cancel_reason,
        "ambulance": {
            "id": ambulance.id,
            "vehicle_number": ambulance.vehicle_number,
            "type": ambulance.type,
            "status": ambulance.status,
            "current_lat": ambulance.current_lat,
            "current_lng": ambulance.current_lng,
        } if ambulance else None,
        "driver": {
            "id": driver.id,
            "name": driver.user.full_name,
            "phone": driver.user.phone,
        } if driver and driver.user else None,
        "hospital": {
            "id": hospital.id,
            "name": hospital.name,
            "lat": hospital.lat,
            "lng": hospital.lng,
        } if hospital else None,
        "route": from_json(emergency.route_json, None),
    }


async def set_status(
    db: Session,
    emergency: EmergencyRequest,
    new_status: str,
    actor: dict | None = None,
    reason: str | None = None,
    allow_override: bool = False,
) -> EmergencyRequest:
    """Transition an emergency to a new status with validation, timestamps, events and notifications."""
    allowed = STATUS_FLOW.get(emergency.status, [])
    if new_status not in allowed and not allow_override:
        raise ValueError(f"Cannot transition from {emergency.status} to {new_status}")

    old = emergency.status
    emergency.status = new_status
    if new_status in TIMESTAMP_FIELD:
        setattr(emergency, TIMESTAMP_FIELD[new_status], datetime.now(timezone.utc))
    if new_status == "CANCELLED":
        emergency.cancel_reason = reason

    history = from_json(emergency.status_history, [])
    history.append({"status": new_status, "at": datetime.now(timezone.utc).isoformat()})
    emergency.status_history = to_json(history)
    db.commit()

    if new_status == "DRIVER_EN_ROUTE":
        assignment = db.query(AmbulanceAssignment).filter(
            AmbulanceAssignment.emergency_id == emergency.id,
            AmbulanceAssignment.status.in_(["PENDING", "ACCEPTED"]),
        ).order_by(AmbulanceAssignment.id.desc()).first()
        if assignment:
            assignment.status = "ACCEPTED"
            assignment.started_at = datetime.now(timezone.utc)
            db.commit()

    await add_history(db, emergency, f"status_changed:{new_status}", f"Status changed from {old} to {new_status}", actor)
    await broadcast_emergency(db, emergency, "status_updated")

    if new_status == "CANCELLED":
        if emergency.assigned_ambulance_id:
            ambulance = db.get(Ambulance, emergency.assigned_ambulance_id)
            if ambulance:
                ambulance.status = "AVAILABLE"
        if emergency.assigned_driver_id:
            driver = db.get(Driver, emergency.assigned_driver_id)
            if driver:
                driver.is_available = True
        db.commit()
        patient_user_id = emergency.patient.user_id if emergency.patient else None
        if patient_user_id:
            notify(db, patient_user_id, "Emergency cancelled", reason or "Your emergency request was cancelled.", "WARNING", "emergency", emergency.id)
        driver_user = db.get(Driver, emergency.assigned_driver_id) if emergency.assigned_driver_id else None
        if driver_user and driver_user.user_id != patient_user_id:
            notify(db, driver_user.user_id, "Trip cancelled", f"Emergency #{emergency.id} was cancelled.", "WARNING", "emergency", emergency.id)

    if new_status == "COMPLETED":
        if emergency.assigned_ambulance_id:
            ambulance = db.get(Ambulance, emergency.assigned_ambulance_id)
            if ambulance:
                ambulance.status = "AVAILABLE"
        if emergency.assigned_driver_id:
            driver = db.get(Driver, emergency.assigned_driver_id)
            if driver:
                driver.is_available = True
        assignment = db.query(AmbulanceAssignment).filter(
            AmbulanceAssignment.emergency_id == emergency.id
        ).order_by(AmbulanceAssignment.id.desc()).first()
        if assignment:
            assignment.status = "COMPLETED"
            assignment.completed_at = datetime.now(timezone.utc)
        db.commit()
        if emergency.recommended_hospital_id:
            notify_hospital_staff(db, emergency.recommended_hospital_id, "Patient admitted & emergency completed", f"Emergency #{emergency.id} completed.", "INFO", "emergency", emergency.id)
        patient_user_id = emergency.patient.user_id if emergency.patient else None
        if patient_user_id:
            notify(db, patient_user_id, "Emergency completed", "Your emergency has been completed. Stay safe!", "SUCCESS", "emergency", emergency.id)

    if new_status == "PATIENT_ADMITTED":
        if emergency.recommended_hospital_id:
            notify_hospital_staff(db, emergency.recommended_hospital_id, "Patient admitted", f"Patient from emergency #{emergency.id} has been admitted.", "INFO", "emergency", emergency.id)
        patient_user_id = emergency.patient.user_id if emergency.patient else None
        if patient_user_id:
            notify(db, patient_user_id, "Patient admitted", "You have been admitted to the hospital.", "SUCCESS", "emergency", emergency.id)

    return emergency


async def find_and_assign_ambulance(db: Session, emergency: EmergencyRequest) -> EmergencyRequest:
    """Search available ambulances, compute travel time, pick the nearest suitable one and assign it."""
    emergency.status = "SEARCHING_AMBULANCE"
    db.commit()
    await add_history(db, emergency, "searching_ambulance", "Searching for a suitable ambulance", None)
    await broadcast_emergency(db, emergency, "status_updated")

    candidates = (
        db.query(Ambulance)
        .filter(Ambulance.status == "AVAILABLE")
        .order_by(Ambulance.updated_at.desc())
        .all()
    )
    scored = []
    for ambulance in candidates:
        if ambulance.driver_id is None:
            continue
        driver = db.get(Driver, ambulance.driver_id)
        if driver is None or not driver.is_available or not driver.user.is_active:
            continue
        lat, lng = ambulance.current_lat, ambulance.current_lng
        if lat is None or lng is None:
            lat, lng = driver.current_lat, driver.current_lng
        if lat is None or lng is None:
            continue
        eta = estimate_eta(lat, lng, emergency.pickup_lat, emergency.pickup_lng)
        score = eta["duration_min"]
        if emergency.priority == "CRITICAL":
            score *= 0.9
        scored.append((score, eta, ambulance, driver))

    if not scored:
        patient_user_id = emergency.patient.user_id if emergency.patient else None
        if patient_user_id:
            notify(db, patient_user_id, "No ambulance available", "No ambulance is currently available. We will keep trying.", "WARNING", "emergency", emergency.id)
        return emergency

    scored.sort(key=lambda x: x[0])
    score, eta, ambulance, driver = scored[0]
    ambulance.status = "BUSY"
    driver.is_available = False
    emergency.assigned_ambulance_id = ambulance.id
    emergency.assigned_driver_id = driver.id
    emergency.status = "AMBULANCE_ASSIGNED"
    emergency.assigned_at = datetime.now(timezone.utc)
    db.commit()

    assignment = AmbulanceAssignment(
        emergency_id=emergency.id,
        ambulance_id=ambulance.id,
        driver_id=driver.id,
        distance_km=eta["distance_km"],
        travel_time_min=eta["duration_min"],
    )
    db.add(assignment)
    db.commit()

    await add_history(
        db, emergency, "ambulance_assigned",
        f"Ambulance {ambulance.vehicle_number} assigned (ETA {eta['duration_min']:.0f} min)",
        None,
    )

    patient_user_id = emergency.patient.user_id if emergency.patient else None
    if patient_user_id:
        notify(
            db, patient_user_id,
            "Ambulance assigned",
            f"{ambulance.vehicle_number} ({ambulance.type}) has been assigned. ETA {eta['duration_min']:.0f} minutes.",
            "SUCCESS", "emergency", emergency.id,
        )
    notify(
        db, driver.user_id,
        "New emergency request",
        f"Emergency #{emergency.id} ({emergency.priority}) — pickup {emergency.pickup_address or 'at provided location'}. "
        f"Distance {eta['distance_km']:.1f} km, ETA {eta['duration_min']:.0f} min.",
        "EMERGENCY", "emergency", emergency.id,
    )
    await broadcast_emergency(db, emergency, "ambulance_assigned")
    return emergency


async def finalize_recommendation(db: Session, emergency: EmergencyRequest, recommendation: dict) -> EmergencyRequest:
    """Persist hospital recommendation, route and notify hospital staff."""
    emergency.recommended_hospital_id = recommendation["recommended"]["hospital_id"]
    emergency.hospital_score = recommendation["recommended"]["score"]
    emergency.hospital_reason = recommendation["explanation"]
    emergency.hospital_rankings = to_json(recommendation["rankings"])
    db.commit()
    await add_history(
        db, emergency, "hospital_recommended",
        f"Recommended {recommendation['recommended']['name']} (score {recommendation['recommended']['score']:.2f})",
        None,
    )
    notify_hospital_staff(
        db, emergency.recommended_hospital_id,
        "Incoming emergency patient",
        f"Emergency #{emergency.id} ({emergency.priority}) — {emergency.emergency_type}. "
        f"ETA {recommendation['recommended']['eta_min']:.0f} min. Prepare required resources.",
        "EMERGENCY", "emergency", emergency.id,
    )
    return emergency