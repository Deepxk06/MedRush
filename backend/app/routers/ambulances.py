from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_roles
from app.auth.security import hash_password
from app.database import get_db
from app.models import Ambulance, Driver, User
from app.schemas import AmbulanceCreate, AmbulanceOut, AmbulanceUpdate, DriverCreate, DriverUpdate
from app.services.audit import log_action
from app.services.notifications import notify
from app.services.tracking import latest_location

router = APIRouter(prefix="/api", tags=["ambulances"])


def _ambulance_out(db: Session, ambulance: Ambulance) -> dict:
    driver = db.get(Driver, ambulance.driver_id) if ambulance.driver_id else None
    return {
        "id": ambulance.id,
        "vehicle_number": ambulance.vehicle_number,
        "type": ambulance.type,
        "capacity": ambulance.capacity,
        "status": ambulance.status,
        "driver_id": ambulance.driver_id,
        "hospital_id": ambulance.hospital_id,
        "current_lat": ambulance.current_lat,
        "current_lng": ambulance.current_lng,
        "updated_at": ambulance.updated_at,
        "driver_name": driver.user.full_name if driver and driver.user else None,
        "location": latest_location(db, ambulance.id),
    }


@router.get("/ambulances", response_model=list[AmbulanceOut], summary="List ambulances with filters")
def list_ambulances(
    status_filter: str | None = Query(None, alias="status"),
    vehicle_search: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Ambulance)
    if status_filter:
        query = query.filter(Ambulance.status == status_filter)
    if vehicle_search:
        query = query.filter(Ambulance.vehicle_number.ilike(f"%{vehicle_search}%"))
    return [_ambulance_out(db, a) for a in query.order_by(Ambulance.id).all()]


@router.post("/ambulances", response_model=AmbulanceOut, status_code=201, summary="Create ambulance (admin)")
def create_ambulance(
    payload: AmbulanceCreate,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    ambulance = Ambulance(
        vehicle_number=payload.vehicle_number,
        type=payload.type,
        capacity=payload.capacity,
        status=payload.status,
        driver_id=payload.driver_id,
        hospital_id=payload.hospital_id,
        current_lat=payload.lat,
        current_lng=payload.lng,
    )
    db.add(ambulance)
    db.flush()
    if payload.driver_id:
        driver = db.get(Driver, payload.driver_id)
        if driver:
            driver.ambulance_id = ambulance.id
    db.commit()
    db.refresh(ambulance)
    log_action(db, "ambulance_created", user.id, "ambulance", ambulance.id, {"vehicle": ambulance.vehicle_number}, request.client.host if request.client else None)
    return _ambulance_out(db, ambulance)


@router.put("/ambulances/{ambulance_id}", response_model=AmbulanceOut, summary="Update ambulance (admin)")
def update_ambulance(
    ambulance_id: int,
    payload: AmbulanceUpdate,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    ambulance = db.get(Ambulance, ambulance_id)
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    old_driver_id = ambulance.driver_id
    for key, value in payload.model_dump().items():
        if value is not None:
            if key in ("lat", "lng"):
                key = {"lat": "current_lat", "lng": "current_lng"}.get(key)
            setattr(ambulance, key, value)
    if payload.driver_id is not None and payload.driver_id != old_driver_id:
        if old_driver_id:
            old_driver = db.get(Driver, old_driver_id)
            if old_driver and old_driver.ambulance_id == ambulance.id:
                old_driver.ambulance_id = None
        new_driver = db.get(Driver, payload.driver_id)
        if new_driver:
            new_driver.ambulance_id = ambulance.id
    db.commit()
    log_action(db, "ambulance_updated", user.id, "ambulance", ambulance.id, {}, request.client.host if request.client else None)
    return _ambulance_out(db, ambulance)


@router.delete("/ambulances/{ambulance_id}", summary="Delete ambulance (admin)")
def delete_ambulance(
    ambulance_id: int,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    ambulance = db.get(Ambulance, ambulance_id)
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    if ambulance.driver_id:
        driver = db.get(Driver, ambulance.driver_id)
        if driver:
            driver.ambulance_id = None
            driver.is_available = True
    db.delete(ambulance)
    db.commit()
    log_action(db, "ambulance_deleted", user.id, "ambulance", ambulance_id, {}, request.client.host if request.client else None)
    return {"message": "Ambulance deleted"}


# ---------------- Drivers (admin management) ----------------
@router.get("/drivers", response_model=list[dict], summary="List drivers")
def list_drivers(
    search: str | None = None,
    available: bool | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Driver).join(Driver.user)
    if available is not None:
        query = query.filter(Driver.is_available == available)
    if search:
        query = query.filter(User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%"))
    result = []
    for driver in query.order_by(Driver.id).all():
        ambulance = db.get(Ambulance, driver.ambulance_id) if driver.ambulance_id else None
        result.append({
            "id": driver.id,
            "user_id": driver.user_id,
            "full_name": driver.user.full_name,
            "email": driver.user.email,
            "phone": driver.user.phone,
            "license_number": driver.license_number,
            "ambulance_id": driver.ambulance_id,
            "is_available": driver.is_available,
            "is_active": driver.user.is_active,
            "ambulance_number": ambulance.vehicle_number if ambulance else None,
        })
    return result


@router.post("/drivers", response_model=dict, status_code=201, summary="Create driver account (admin)")
def create_driver(
    payload: DriverCreate,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(Driver).filter(Driver.license_number == payload.license_number).first():
        raise HTTPException(status_code=400, detail="License number already in use")
    new_user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role="DRIVER",
    )
    db.add(new_user)
    db.flush()
    driver = Driver(
        user_id=new_user.id,
        license_number=payload.license_number,
        ambulance_id=payload.ambulance_id,
        current_lat=payload.lat,
        current_lng=payload.lng,
    )
    db.add(driver)
    db.flush()
    if payload.ambulance_id:
        ambulance = db.get(Ambulance, payload.ambulance_id)
        if ambulance:
            ambulance.driver_id = driver.id
    db.commit()
    log_action(db, "driver_created", user.id, "driver", driver.id, {}, request.client.host if request.client else None)
    return {"message": "Driver created", "driver_id": driver.id, "user_id": new_user.id}


@router.put("/drivers/{driver_id}", response_model=dict, summary="Update driver (admin)")
def update_driver(
    driver_id: int,
    payload: DriverUpdate,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    driver = db.get(Driver, driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    if payload.full_name is not None:
        driver.user.full_name = payload.full_name
    if payload.phone is not None:
        driver.user.phone = payload.phone
    if payload.license_number is not None:
        driver.license_number = payload.license_number
    if payload.ambulance_id is not None:
        old = driver.ambulance_id
        if old and old != payload.ambulance_id:
            old_ambulance = db.get(Ambulance, old)
            if old_ambulance:
                old_ambulance.driver_id = None
        ambulance = db.get(Ambulance, payload.ambulance_id)
        if ambulance:
            ambulance.driver_id = driver.id
            driver.ambulance_id = payload.ambulance_id
    if payload.is_available is not None:
        driver.is_available = payload.is_available
    if payload.is_active is not None:
        driver.user.is_active = payload.is_active
    db.commit()
    log_action(db, "driver_updated", user.id, "driver", driver.id, {}, request.client.host if request.client else None)
    return {"message": "Driver updated"}


@router.delete("/drivers/{driver_id}", summary="Deactivate driver (admin)")
def deactivate_driver(
    driver_id: int,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    driver = db.get(Driver, driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver.user.is_active = False
    driver.is_available = False
    db.commit()
    log_action(db, "driver_deactivated", user.id, "driver", driver.id, {}, request.client.host if request.client else None)
    return {"message": "Driver deactivated"}