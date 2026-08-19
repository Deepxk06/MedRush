from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai.resource_model import ResourceModel
from app.auth.deps import require_roles
from app.database import get_db
from app.models import (
    Ambulance,
    AmbulanceAssignment,
    AuditLog,
    Driver,
    EmergencyRequest,
    Hospital,
    HospitalResource,
    HospitalStaff,
    Patient,
    ResourceHistory,
    User,
)
from app.services.audit import log_action
from app.services.emergency_service import emergency_payload
from app.services.tracking import latest_location

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN = require_roles("ADMIN")

SECONDS_FIELDS = {
    "avg_response_sec": (EmergencyRequest.requested_at, EmergencyRequest.assigned_at),
    "avg_pickup_sec": (EmergencyRequest.requested_at, EmergencyRequest.picked_up_at),
    "avg_travel_sec": (EmergencyRequest.picked_up_at, EmergencyRequest.arrived_hospital_at),
}


def _seconds_between(start: datetime, end: datetime) -> float:
    if not start or not end:
        return 0.0
    return max(0.0, (end - start).total_seconds())


@router.get("/overview", summary="Live admin overview stats")
def overview(user=Depends(ADMIN), db: Session = Depends(get_db)):
    completed = db.query(EmergencyRequest).filter(EmergencyRequest.status == "COMPLETED").all()
    active = db.query(EmergencyRequest).filter(EmergencyRequest.status.in_([
        "REQUESTED", "SEARCHING_AMBULANCE", "AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED",
        "DRIVER_EN_ROUTE", "ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL",
        "ARRIVED_AT_HOSPITAL", "PATIENT_ADMITTED",
    ])).count()
    cancelled = db.query(EmergencyRequest).filter(EmergencyRequest.status == "CANCELLED").count()

    assigned_all = db.query(AmbulanceAssignment).filter(
        AmbulanceAssignment.assigned_at.isnot(None), AmbulanceAssignment.accepted_at.isnot(None)
    ).all()
    avg_response = (
        sum(_seconds_between(a.assigned_at, a.accepted_at) for a in assigned_all) / len(assigned_all)
        if assigned_all else 0
    )
    pickup_secs = [
        _seconds_between(e.requested_at, e.picked_up_at) for e in completed
        if e.picked_up_at and e.requested_at
    ]
    avg_pickup = sum(pickup_secs) / len(pickup_secs) if pickup_secs else 0
    travel_secs = [
        _seconds_between(e.picked_up_at, e.arrived_hospital_at) for e in completed
        if e.picked_up_at and e.arrived_hospital_at
    ]
    avg_travel = sum(travel_secs) / len(travel_secs) if travel_secs else 0

    ambulances = db.query(Ambulance).all()
    busy = sum(1 for a in ambulances if a.status == "BUSY")
    available = sum(1 for a in ambulances if a.status == "AVAILABLE")

    hospitals = db.query(Hospital).all()
    total_beds = sum(h.resources.total_beds for h in hospitals if h.resources) if False else 0
    total_beds = db.query(func.coalesce(func.sum(HospitalResource.total_beds), 0)).scalar() or 0
    total_icu = db.query(func.coalesce(func.sum(HospitalResource.total_icu), 0)).scalar() or 0
    available_beds = db.query(func.coalesce(func.sum(HospitalResource.available_beds), 0)).scalar() or 0
    available_icu = db.query(func.coalesce(func.sum(HospitalResource.available_icu), 0)).scalar() or 0

    utilization = 0.0
    if total_beds:
        utilization = round((1 - available_beds / total_beds) * 100, 1)

    return {
        "total_users": db.query(User).count(),
        "active_patients": db.query(Patient).join(Patient.user).filter(User.is_active.is_(True)).count(),
        "total_drivers": db.query(Driver).count(),
        "available_drivers": db.query(Driver).filter(Driver.is_available.is_(True)).count(),
        "total_ambulances": len(ambulances),
        "available_ambulances": available,
        "busy_ambulances": busy,
        "total_hospitals": db.query(Hospital).count(),
        "active_hospitals": db.query(Hospital).filter(Hospital.is_active.is_(True)).count(),
        "active_emergencies": active,
        "completed_emergencies": len(completed),
        "cancelled_requests": cancelled,
        "total_emergencies": db.query(EmergencyRequest).count(),
        "avg_response_sec": round(avg_response, 1),
        "avg_pickup_sec": round(avg_pickup, 1),
        "avg_travel_sec": round(avg_travel, 1),
        "ambulance_utilization_pct": round((busy / len(ambulances)) * 100, 1) if ambulances else 0,
        "hospital_bed_utilization_pct": utilization,
        "total_beds": total_beds,
        "available_beds": available_beds,
        "total_icu": total_icu,
        "available_icu": available_icu,
    }


@router.get("/analytics", summary="Chart data: emergencies over time, types, severity, ambulance/hospital utilization")
def analytics(
    days: int = Query(30, ge=1, le=365),
    user=Depends(ADMIN),
    db: Session = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    emergencies = db.query(EmergencyRequest).filter(EmergencyRequest.created_at >= since).all()

    daily: dict[str, int] = {}
    type_counts: dict[str, int] = {}
    severity_counts: dict[str, int] = {}
    priority_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    for e in emergencies:
        day = e.created_at.date().isoformat()
        daily[day] = daily.get(day, 0) + 1
        type_counts[e.emergency_type] = type_counts.get(e.emergency_type, 0) + 1
        severity_counts[e.severity] = severity_counts.get(e.severity, 0) + 1
        priority_counts[e.priority] = priority_counts.get(e.priority, 0) + 1
        status_counts[e.status] = status_counts.get(e.status, 0) + 1

    completed = [e for e in emergencies if e.status == "COMPLETED"]
    cancelled = [e for e in emergencies if e.status == "CANCELLED"]

    ambulance_usage = []
    ambulances = db.query(Ambulance).all()
    for a in ambulances:
        assignments = db.query(AmbulanceAssignment).filter(
            AmbulanceAssignment.ambulance_id == a.id,
            AmbulanceAssignment.assigned_at >= since,
        ).all()
        busy_seconds = sum(_seconds_between(x.assigned_at, x.completed_at or x.hospital_arrived_at) for x in assignments)
        ambulance_usage.append({
            "vehicle": a.vehicle_number,
            "assignments": len(assignments),
            "busy_hours": round(busy_seconds / 3600, 1),
        })

    hospital_usage = []
    hospitals = db.query(Hospital).all()
    for h in hospitals:
        resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == h.id).first()
        if resources:
            usage = round(((resources.total_beds - resources.available_beds) / max(1, resources.total_beds)) * 100, 1)
            hospital_usage.append({
                "hospital": h.name,
                "bed_usage_pct": usage,
                "icu_usage_pct": round(((resources.total_icu - resources.available_icu) / max(1, resources.total_icu)) * 100, 1),
                "vent_usage_pct": round(((resources.total_ventilators - resources.available_ventilators) / max(1, resources.total_ventilators)) * 100, 1),
            })

    return {
        "daily_emergencies": [{"date": d, "count": c} for d, c in sorted(daily.items())],
        "by_type": [{"type": k, "count": v} for k, v in sorted(type_counts.items(), key=lambda x: -x[1])],
        "by_severity": [{"severity": k, "count": v} for k, v in sorted(severity_counts.items())],
        "by_priority": [{"priority": k, "count": v} for k, v in sorted(priority_counts.items())],
        "by_status": [{"status": k, "count": v} for k, v in sorted(status_counts.items())],
        "completed_vs_cancelled": {"completed": len(completed), "cancelled": len(cancelled)},
        "ambulance_usage": ambulance_usage,
        "hospital_usage": hospital_usage,
    }


@router.get("/emergencies", summary="All emergencies with filters (admin)")
def all_emergencies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    severity: str | None = None,
    priority: str | None = None,
    emergency_type: str | None = None,
    search: str | None = None,
    user=Depends(ADMIN),
    db: Session = Depends(get_db),
):
    query = db.query(EmergencyRequest)
    if status:
        query = query.filter(EmergencyRequest.status == status)
    if severity:
        query = query.filter(EmergencyRequest.severity == severity)
    if priority:
        query = query.filter(EmergencyRequest.priority == priority)
    if emergency_type:
        query = query.filter(EmergencyRequest.emergency_type == emergency_type)
    if search:
        like = f"%{search}%"
        query = query.filter(
            EmergencyRequest.patient_name.ilike(like) | EmergencyRequest.emergency_type.ilike(like)
            | EmergencyRequest.pickup_address.ilike(like)
        )
    total = query.count()
    items = query.order_by(EmergencyRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "items": [emergency_payload(db, e) for e in items],
    }


@router.get("/resource-trends", summary="Hospital resource usage history for charts")
def resource_trends(
    hospital_id: int | None = None,
    resource: str = "beds",
    days: int = Query(14, ge=1, le=90),
    user=Depends(ADMIN),
    db: Session = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = db.query(ResourceHistory).filter(ResourceHistory.recorded_at >= since)
    if hospital_id:
        query = query.filter(ResourceHistory.hospital_id == hospital_id)
    query = query.filter(ResourceHistory.resource_type == resource)
    rows = query.order_by(ResourceHistory.recorded_at).all()
    return [
        {"recorded_at": r.recorded_at.isoformat(), "usage_pct": r.usage_pct, "available": r.available, "total": r.total}
        for r in rows
    ]


@router.get("/audit-logs", summary="Audit log entries (paginated)")
def audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: str | None = None,
    user=Depends(ADMIN),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    result = []
    for row in rows:
        email = db.get(User, row.user_id).email if row.user_id else None
        result.append({
            "id": row.id,
            "user_id": row.user_id,
            "user_email": email,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "metadata_json": row.metadata_json,
            "ip_address": row.ip_address,
            "created_at": row.created_at,
        })
    return {"total": total, "items": result}


@router.get("/ai/models", summary="AI model status + metrics")
def model_status(user=Depends(ADMIN)):
    model = ResourceModel.get_instance()
    info = model.info()
    return {
        "trained": info["trained"],
        "algorithm": info["algorithm"],
        "version": info["version"],
        "metrics": info["metrics"],
        "dataset_rows": info["dataset_rows"],
    }


@router.post("/demo/simulate-emergency", summary="Demo Control: create an emergency through the real pipeline")
async def demo_emergency(
    payload: dict,
    request: Request,
    user=Depends(ADMIN),
    db: Session = Depends(get_db),
):
    from app.routers.emergencies import create_emergency as _create

    patient_id = payload.get("patient_id")
    patient = db.get(Patient, patient_id) if patient_id else db.query(Patient).first()
    if not patient:
        raise HTTPException(status_code=400, detail="No patient available")

    emergency_payload_data = {
        "patient_id": patient.id,
        "emergency_type": payload.get("emergency_type", "heart_attack"),
        "severity": payload.get("severity", "HIGH"),
        "symptoms": payload.get("symptoms", "Chest pain and shortness of breath."),
        "pickup_lat": float(payload.get("pickup_lat", patient_user_lat(db, patient))),
        "pickup_lng": float(payload.get("pickup_lng", 80.2707)),
        "pickup_address": payload.get("pickup_address", "Anna Nagar, Chennai"),
        "patient_age": patient.age,
        "patient_gender": patient.gender,
    }
    from app.schemas import EmergencyCreate

    return await _create(EmergencyCreate(**emergency_payload_data), request, user, db)


def patient_user_lat(db: Session, patient: Patient) -> float:
    return 13.0827


@router.post("/demo/simulation/{ambulance_id}/start", summary="Demo Control: start GPS simulation for an ambulance")
def sim_start(ambulance_id: int, payload: dict, user=Depends(ADMIN), db: Session = Depends(get_db)):
    emergency_id = payload.get("emergency_id")
    if not emergency_id:
        raise HTTPException(status_code=400, detail="emergency_id required")
    from app.services.demo_simulation import simulation_engine

    started = simulation_engine.start(ambulance_id, int(emergency_id))
    log_action(db, "demo_simulation_started", user.id, "ambulance", ambulance_id, {"emergency_id": emergency_id})
    return {"message": "Simulation started" if started else "Simulation already running", "running": simulation_engine.is_running(ambulance_id)}


@router.post("/demo/simulation/{ambulance_id}/stop", summary="Demo Control: stop GPS simulation")
def sim_stop(ambulance_id: int, user=Depends(ADMIN), db: Session = Depends(get_db)):
    from app.services.demo_simulation import simulation_engine

    stopped = simulation_engine.stop(ambulance_id)
    log_action(db, "demo_simulation_stopped", user.id, "ambulance", ambulance_id)
    return {"message": "Simulation stopped" if stopped else "Simulation not running", "running": simulation_engine.is_running(ambulance_id)}


@router.get("/demo/simulations", summary="Demo Control: running simulations + available ambulances")
def sim_status(user=Depends(ADMIN), db: Session = Depends(get_db)):
    from app.services.demo_simulation import simulation_engine

    active_emergency = (
        db.query(EmergencyRequest)
        .filter(EmergencyRequest.status.in_([
            "AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE",
            "ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL",
        ]))
        .order_by(EmergencyRequest.id.desc())
        .first()
    )
    ambulances = []
    for a in db.query(Ambulance).all():
        ambulances.append({
            "id": a.id,
            "vehicle_number": a.vehicle_number,
            "status": a.status,
            "simulation_running": simulation_engine.is_running(a.id),
            "lat": a.current_lat,
            "lng": a.current_lng,
        })
    return {
        "running": [aid for aid, task in simulation_engine.tasks.items()],
        "ambulances": ambulances,
        "active_emergency_id": active_emergency.id if active_emergency else None,
        "active_emergency_status": active_emergency.status if active_emergency else None,
    }