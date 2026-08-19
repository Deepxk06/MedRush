from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_roles, update_last_login
from app.auth.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.database import get_db
from app.models import Driver, Hospital, HospitalStaff, Patient, User
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from app.services.audit import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(db: Session, user: User) -> dict:
    data = {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "patient_id": None,
        "driver_id": None,
        "hospital_id": None,
        "hospital_name": None,
        "ambulance_id": None,
    }
    if user.role == "PATIENT" and user.patient:
        data["patient_id"] = user.patient.id
    if user.role == "DRIVER" and user.driver:
        data["driver_id"] = user.driver.id
        data["ambulance_id"] = user.driver.ambulance_id
    if user.role == "HOSPITAL" and user.hospital_staff:
        data["hospital_id"] = user.hospital_staff.hospital_id
        hospital = db.get(Hospital, user.hospital_staff.hospital_id)
        if hospital:
            data["hospital_name"] = hospital.name
    return data


def _tokens(user: User) -> dict:
    return {
        "access_token": create_access_token(user.id, user.role),
        "refresh_token": create_refresh_token(user.id, user.role),
        "token_type": "bearer",
        "user": _user_out(SessionLocalProxy(), user),
    }


class SessionLocalProxy:  # placeholder replaced below
    pass


@router.post("/register", response_model=TokenResponse, summary="Register a new user (patient, driver, or hospital staff)")
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        phone=payload.phone,
        role=payload.role,
    )
    db.add(user)
    db.flush()

    if payload.role == "PATIENT":
        patient = Patient(
            user_id=user.id,
            age=payload.age,
            gender=payload.gender,
            blood_group=payload.blood_group,
            allergies=payload.allergies,
            medical_history=payload.medical_history,
            emergency_contact_name=payload.emergency_contact_name,
            emergency_contact_phone=payload.emergency_contact_phone,
        )
        db.add(patient)
    elif payload.role == "DRIVER":
        if not payload.license_number:
            db.rollback()
            raise HTTPException(status_code=400, detail="License number required for drivers")
        if db.query(Driver).filter(Driver.license_number == payload.license_number).first():
            db.rollback()
            raise HTTPException(status_code=400, detail="License number already in use")
        driver = Driver(user_id=user.id, license_number=payload.license_number)
        db.add(driver)
    elif payload.role == "HOSPITAL":
        if not payload.hospital_id:
            db.rollback()
            raise HTTPException(status_code=400, detail="hospital_id required for hospital staff accounts")
        hospital = db.get(Hospital, payload.hospital_id)
        if not hospital:
            db.rollback()
            raise HTTPException(status_code=400, detail="Hospital not found")
        staff = HospitalStaff(user_id=user.id, hospital_id=hospital.id, role=payload.hospital_role or "STAFF")
        db.add(staff)

    db.commit()
    db.refresh(user)
    log_action(db, "user_registered", user.id, "user", user.id, {"role": user.role}, request.client.host if request.client else None)
    response = {
        "access_token": create_access_token(user.id, user.role),
        "refresh_token": create_refresh_token(user.id, user.role),
        "token_type": "bearer",
        "user": UserOut(**{
            "id": user.id, "email": user.email, "full_name": user.full_name, "phone": user.phone,
            "role": user.role, "is_active": user.is_active, "created_at": user.created_at,
            "patient_id": None, "driver_id": None, "hospital_id": None, "hospital_name": None, "ambulance_id": None,
        }),
    }
    return response


@router.post("/login", response_model=TokenResponse, summary="Login with email and password")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated. Contact admin.")
    update_last_login(db, user)
    log_action(db, "user_login", user.id, "user", user.id, {"role": user.role}, request.client.host if request.client else None)
    return {
        "access_token": create_access_token(user.id, user.role),
        "refresh_token": create_refresh_token(user.id, user.role),
        "token_type": "bearer",
        "user": _user_out(db, user),
    }


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    decoded = decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.get(User, int(decoded["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return {
        "access_token": create_access_token(user.id, user.role),
        "refresh_token": create_refresh_token(user.id, user.role),
        "token_type": "bearer",
        "user": _user_out(db, user),
    }


@router.get("/me", response_model=UserOut, summary="Get current authenticated user")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _user_out(db, user)


@router.put("/profile", response_model=UserOut, summary="Update own profile")
def update_profile(
    payload: UpdateProfileRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.phone is not None:
        user.phone = payload.phone
    if user.role == "PATIENT" and user.patient:
        for field in ["age", "gender", "blood_group", "allergies", "medical_history", "emergency_contact_name", "emergency_contact_phone"]:
            value = getattr(payload, field)
            if value is not None:
                setattr(user.patient, field, value)
    db.commit()
    log_action(db, "profile_updated", user.id, "user", user.id, {}, request.client.host if request.client else None)
    return _user_out(db, user)


@router.post("/change-password", response_model=MessageResponse, summary="Change own password")
def change_password(payload: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


@router.post("/logout", response_model=MessageResponse, summary="Logout (audited)")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log_action(db, "user_logout", user.id, "user", user.id, {})
    return {"message": "Logged out"}