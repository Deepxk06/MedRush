"""Ambulance location tracking — stores GPS history and broadcasts live updates."""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import Ambulance, AmbulanceLocation, Driver, EmergencyRequest, HospitalStaff, User
from app.utils.helpers import haversine_km
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)


def update_location(
    db: Session,
    ambulance_id: int,
    lat: float,
    lng: float,
    heading: float | None = None,
    speed_kmh: float | None = None,
    broadcast: bool = True,
) -> dict[str, Any]:
    ambulance = db.get(Ambulance, ambulance_id)
    if not ambulance:
        raise ValueError("Ambulance not found")
    ambulance.current_lat = lat
    ambulance.current_lng = lng
    record = AmbulanceLocation(
        ambulance_id=ambulance.id,
        lat=lat,
        lng=lng,
        heading=heading,
        speed_kmh=speed_kmh,
        recorded_at=datetime.now(timezone.utc),
    )
    db.add(record)
    if ambulance.driver_id:
        driver = db.get(Driver, ambulance.driver_id)
        if driver:
            driver.current_lat = lat
            driver.current_lng = lng
    db.commit()

    payload = {
        "ambulance_id": ambulance.id,
        "vehicle_number": ambulance.vehicle_number,
        "lat": lat,
        "lng": lng,
        "heading": heading,
        "speed_kmh": speed_kmh,
        "recorded_at": record.recorded_at.isoformat(),
    }
    if broadcast:
        recipients = _tracking_recipients(db, ambulance_id)
        import asyncio

        for uid in recipients:
            asyncio.create_task(ws_manager.send_to_user(uid, "ambulance_location_updated", payload))
    return payload


def _tracking_recipients(db: Session, ambulance_id: int) -> list[int]:
    """Users who should see this ambulance move: patient on active trip, hospital staff, admins."""
    recipients: set[int] = set()
    emergency = (
        db.query(EmergencyRequest)
        .filter(
            EmergencyRequest.assigned_ambulance_id == ambulance_id,
            EmergencyRequest.status.in_([
                "AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE",
                "ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL",
                "ARRIVED_AT_HOSPITAL",
            ]),
        )
        .order_by(EmergencyRequest.id.desc())
        .first()
    )
    if emergency:
        if emergency.patient:
            recipients.add(emergency.patient.user_id)
        if emergency.recommended_hospital_id:
            staff = db.query(HospitalStaff).filter(HospitalStaff.hospital_id == emergency.recommended_hospital_id).all()
            recipients.update(m.user_id for m in staff)
    for (uid,) in db.query(User.id).filter(User.role == "ADMIN", User.is_active.is_(True)).all():
        recipients.add(uid)
    return list(recipients)


def latest_location(db: Session, ambulance_id: int) -> dict | None:
    record = (
        db.query(AmbulanceLocation)
        .filter(AmbulanceLocation.ambulance_id == ambulance_id)
        .order_by(AmbulanceLocation.recorded_at.desc())
        .first()
    )
    if not record:
        return None
    return {
        "lat": record.lat,
        "lng": record.lng,
        "heading": record.heading,
        "speed_kmh": record.speed_kmh,
        "recorded_at": record.recorded_at.isoformat(),
    }


def distance_traveled_km(db: Session, ambulance_id: int, since: datetime | None = None) -> float:
    query = db.query(AmbulanceLocation).filter(AmbulanceLocation.ambulance_id == ambulance_id)
    if since:
        query = query.filter(AmbulanceLocation.recorded_at >= since)
    points = query.order_by(AmbulanceLocation.recorded_at).all()
    total = 0.0
    for prev, curr in zip(points, points[1:]):
        total += haversine_km(prev.lat, prev.lng, curr.lat, curr.lng)
    return round(total, 2)