from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    phone: Optional[str] = None
    role: str = Field(default="PATIENT", pattern="^(PATIENT|DRIVER|HOSPITAL)$")
    # patient profile fields
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    medical_history: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    # driver fields
    license_number: Optional[str] = None
    # hospital staff fields
    hospital_id: Optional[int] = None
    hospital_role: Optional[str] = "STAFF"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime
    patient_id: Optional[int] = None
    driver_id: Optional[int] = None
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    ambulance_id: Optional[int] = None

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    medical_history: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


# ---------- Generic ----------
class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list


TokenResponse.model_rebuild()