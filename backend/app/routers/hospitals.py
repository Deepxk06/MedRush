from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.ai.resource_model import ResourceModel
from app.auth.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Ambulance, Driver, Hospital, HospitalResource, HospitalStaff, User
from app.schemas import (
    HospitalCreate,
    HospitalOut,
    HospitalResourceOut,
    HospitalStaffCreate,
    HospitalUpdate,
    ResourceUpdate,
)
from app.services.audit import log_action
from app.services.emergency_service import emergency_payload
from app.services.notifications import notify
from app.services.prediction_service import record_resource_snapshot
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/api/hospitals", tags=["hospitals"])


def _resource_out(db: Session, hospital_id: int) -> dict:
    hospital = db.get(Hospital, hospital_id)
    resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital_id).first()
    if not resources:
        return {"hospital_id": hospital_id, "hospital_name": hospital.name, "error": "no resources configured"}
    def pct(total, available):
        return round(((total - available) / max(1, total)) * 100, 1)
    return {
        "hospital_id": hospital_id,
        "hospital_name": hospital.name,
        "total_beds": resources.total_beds,
        "available_beds": resources.available_beds,
        "total_icu": resources.total_icu,
        "available_icu": resources.available_icu,
        "total_emergency_beds": resources.total_emergency_beds,
        "available_emergency_beds": resources.available_emergency_beds,
        "total_ventilators": resources.total_ventilators,
        "available_ventilators": resources.available_ventilators,
        "oxygen_capacity": resources.oxygen_capacity,
        "oxygen_available": resources.oxygen_available,
        "total_doctors": resources.total_doctors,
        "available_doctors": resources.available_doctors,
        "total_nurses": resources.total_nurses,
        "available_nurses": resources.available_nurses,
        "updated_at": resources.updated_at,
        "bed_usage_pct": pct(resources.total_beds, resources.available_beds),
        "icu_usage_pct": pct(resources.total_icu, resources.available_icu),
        "ventilator_usage_pct": pct(resources.total_ventilators, resources.available_ventilators),
    }


def _hospital_out(db: Session, hospital: Hospital) -> dict:
    resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).first()
    return {
        "id": hospital.id,
        "name": hospital.name,
        "address": hospital.address,
        "lat": hospital.lat,
        "lng": hospital.lng,
        "phone": hospital.phone,
        "email": hospital.email,
        "is_active": hospital.is_active,
        "level": hospital.level,
        "specialties": hospital.specialties,
        "created_at": hospital.created_at,
        "resources": _resource_out(db, hospital.id),
    }


@router.get("", response_model=list[HospitalOut], summary="List hospitals (active first)")
def list_hospitals(
    search: str | None = None,
    include_inactive: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Hospital)
    if not include_inactive and user.role != "ADMIN":
        query = query.filter(Hospital.is_active.is_(True))
    if search:
        query = query.filter(Hospital.name.ilike(f"%{search}%"))
    return [_hospital_out(db, h) for h in query.order_by(Hospital.name).all()]


@router.get("/{hospital_id}", response_model=HospitalOut, summary="Hospital detail with resources")
def get_hospital(hospital_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    hospital = db.get(Hospital, hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return _hospital_out(db, hospital)


@router.post("", response_model=HospitalOut, status_code=201, summary="Create hospital (admin)")
def create_hospital(
    payload: HospitalCreate,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    hospital = Hospital(**payload.model_dump())
    db.add(hospital)
    db.flush()
    db.add(HospitalResource(hospital_id=hospital.id))
    db.commit()
    db.refresh(hospital)
    log_action(db, "hospital_created", user.id, "hospital", hospital.id, {"name": hospital.name}, request.client.host if request.client else None)
    return _hospital_out(db, hospital)


@router.put("/{hospital_id}", response_model=HospitalOut, summary="Update hospital (admin)")
def update_hospital(
    hospital_id: int,
    payload: HospitalUpdate,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    hospital = db.get(Hospital, hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    for key, value in payload.model_dump().items():
        if value is not None:
            setattr(hospital, key, value)
    db.commit()
    log_action(db, "hospital_updated", user.id, "hospital", hospital.id, {}, request.client.host if request.client else None)
    return _hospital_out(db, hospital)


@router.delete("/{hospital_id}", summary="Deactivate hospital (admin)")
def deactivate_hospital(
    hospital_id: int,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    hospital = db.get(Hospital, hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    hospital.is_active = False
    db.commit()
    log_action(db, "hospital_deactivated", user.id, "hospital", hospital.id, {}, request.client.host if request.client else None)
    return {"message": "Hospital deactivated"}


@router.get("/{hospital_id}/resources", response_model=HospitalResourceOut, summary="Hospital live resource availability")
def get_resources(hospital_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = _resource_out(db, hospital_id)
    if "error" in data:
        raise HTTPException(status_code=404, detail=data["error"])
    return data


@router.put("/{hospital_id}/resources", response_model=HospitalResourceOut, summary="Update hospital resources (hospital staff/admin)")
async def update_resources(
    hospital_id: int,
    payload: ResourceUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role == "HOSPITAL" and user.hospital_staff.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="Not your hospital")
    if user.role not in ("HOSPITAL", "ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital_id).first()
    if not resources:
        resources = HospitalResource(hospital_id=hospital_id)
        db.add(resources)
    for key, value in payload.model_dump().items():
        if value is not None:
            setattr(resources, key, value)
    record_resource_snapshot(db, hospital_id, resources)
    db.commit()
    db.refresh(resources)

    log_action(db, "resources_updated", user.id, "hospital", hospital_id, payload.model_dump(exclude_none=True), request.client.host if request.client else None)

    staff = db.query(HospitalStaff).filter(HospitalStaff.hospital_id == hospital_id).all()
    for member in staff:
        if member.user_id != user.id:
            notify(db, member.user_id, "Hospital resources updated", f"{user.full_name} updated resource availability.", "INFO", "hospital", hospital_id)
    from app.services.notifications import notify_roles

    notify_roles(db, ["ADMIN"], "Hospital resources updated", f"{_hospital_out(db, db.get(Hospital, hospital_id))['name']} updated its resources.", "INFO", "hospital", hospital_id)

    admins = [uid for (uid,) in db.query(User.id).filter(User.role == "ADMIN").all()]
    await ws_manager.send_to_users(admins + [m.user_id for m in staff], "hospital_resource_updated", _resource_out(db, hospital_id))
    return _resource_out(db, hospital_id)


@router.post("/staff", response_model=dict, status_code=201, summary="Create hospital staff account (admin)")
def create_staff(
    payload: HospitalStaffCreate,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    from app.auth.security import hash_password

    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role="HOSPITAL",
    )
    db.add(new_user)
    db.flush()
    db.add(HospitalStaff(user_id=new_user.id, hospital_id=payload.hospital_id, role=payload.hospital_role))
    db.commit()
    log_action(db, "staff_created", user.id, "hospital_staff", new_user.id, {}, request.client.host if request.client else None)
    return {"message": "Hospital staff created", "user_id": new_user.id}


@router.get("/{hospital_id}/incoming", summary="Incoming ambulances/patients for a hospital (hospital staff/admin)")
def incoming(hospital_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "HOSPITAL" and user.hospital_staff.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="Not your hospital")
    from app.models import EmergencyRequest

    emergencies = (
        db.query(EmergencyRequest)
        .filter(
            EmergencyRequest.recommended_hospital_id == hospital_id,
            EmergencyRequest.status.in_([
                "AMBULANCE_ASSIGNED", "DRIVER_ACCEPTED", "DRIVER_EN_ROUTE",
                "ARRIVED_AT_PICKUP", "PATIENT_PICKED_UP", "EN_ROUTE_TO_HOSPITAL",
                "ARRIVED_AT_HOSPITAL", "PATIENT_ADMITTED",
            ]),
        )
        .order_by(EmergencyRequest.created_at.desc())
        .all()
    )
    return {"items": [emergency_payload(db, e) for e in emergencies]}