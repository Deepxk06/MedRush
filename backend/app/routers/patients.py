from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_roles
from app.database import get_db
from app.models import Patient, User
from app.schemas import MessageResponse
from app.services.audit import log_action

router = APIRouter(prefix="/api/patients", tags=["patients"])


def _patient_out(patient: Patient) -> dict:
    return {
        "id": patient.id,
        "user_id": patient.user_id,
        "full_name": patient.user.full_name,
        "email": patient.user.email,
        "phone": patient.user.phone,
        "age": patient.age,
        "gender": patient.gender,
        "blood_group": patient.blood_group,
        "allergies": patient.allergies,
        "medical_history": patient.medical_history,
        "emergency_contact_name": patient.emergency_contact_name,
        "emergency_contact_phone": patient.emergency_contact_phone,
        "is_active": patient.user.is_active,
    }


@router.get("", response_model=list[dict], summary="List patients (admin) with search")
def list_patients(
    search: str | None = None,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    query = db.query(Patient).join(Patient.user)
    if search:
        query = query.filter(
            User.full_name.ilike(f"%{search}%") | User.email.ilike(f"%{search}%") | User.phone.ilike(f"%{search}%")
        )
    return [_patient_out(p) for p in query.order_by(Patient.id).all()]


@router.get("/me", response_model=dict, summary="Current patient profile")
def me(user: User = Depends(require_roles("PATIENT")), db: Session = Depends(get_db)):
    if not user.patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return _patient_out(user.patient)


@router.put("/{patient_id}/status", response_model=dict, summary="Activate/deactivate patient (admin)")
def set_patient_status(
    patient_id: int,
    payload: dict,
    request: Request,
    user: User = Depends(require_roles("ADMIN")),
    db: Session = Depends(get_db),
):
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    is_active = payload.get("is_active")
    if is_active is None:
        raise HTTPException(status_code=400, detail="is_active required")
    patient.user.is_active = bool(is_active)
    db.commit()
    log_action(db, "patient_status_changed", user.id, "patient", patient.id, {"is_active": is_active}, request.client.host if request.client else None)
    return {"message": "Patient status updated", "is_active": patient.user.is_active}