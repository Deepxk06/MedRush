from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class HospitalCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    address: Optional[str] = None
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    phone: Optional[str] = None
    email: Optional[str] = None
    level: str = Field(default="GENERAL", pattern="^(GENERAL|TRAUMA|SPECIALTY)$")
    specialties: Optional[str] = None
    is_active: bool = True


class HospitalUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    level: Optional[str] = Field(default=None, pattern="^(GENERAL|TRAUMA|SPECIALTY)$")
    specialties: Optional[str] = None
    is_active: Optional[bool] = None


class HospitalOut(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool
    level: str
    specialties: Optional[str] = None
    created_at: datetime
    resources: Optional[dict] = None

    model_config = {"from_attributes": True}


class ResourceUpdate(BaseModel):
    total_beds: Optional[int] = Field(default=None, ge=0)
    available_beds: Optional[int] = Field(default=None, ge=0)
    total_icu: Optional[int] = Field(default=None, ge=0)
    available_icu: Optional[int] = Field(default=None, ge=0)
    total_emergency_beds: Optional[int] = Field(default=None, ge=0)
    available_emergency_beds: Optional[int] = Field(default=None, ge=0)
    total_ventilators: Optional[int] = Field(default=None, ge=0)
    available_ventilators: Optional[int] = Field(default=None, ge=0)
    oxygen_capacity: Optional[int] = Field(default=None, ge=0)
    oxygen_available: Optional[int] = Field(default=None, ge=0)
    total_doctors: Optional[int] = Field(default=None, ge=0)
    available_doctors: Optional[int] = Field(default=None, ge=0)
    total_nurses: Optional[int] = Field(default=None, ge=0)
    available_nurses: Optional[int] = Field(default=None, ge=0)


class HospitalResourceOut(BaseModel):
    hospital_id: int
    hospital_name: str
    total_beds: int
    available_beds: int
    total_icu: int
    available_icu: int
    total_emergency_beds: int
    available_emergency_beds: int
    total_ventilators: int
    available_ventilators: int
    oxygen_capacity: int
    oxygen_available: int
    total_doctors: int
    available_doctors: int
    total_nurses: int
    available_nurses: int
    updated_at: datetime
    bed_usage_pct: float
    icu_usage_pct: float
    ventilator_usage_pct: float

    model_config = {"from_attributes": True}


class HospitalStaffCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: Optional[str] = None
    hospital_id: int
    hospital_role: str = "STAFF"