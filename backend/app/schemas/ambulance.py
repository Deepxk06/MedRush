from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LocationUpdate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    heading: Optional[float] = None
    speed_kmh: Optional[float] = None


class AmbulanceCreate(BaseModel):
    vehicle_number: str = Field(min_length=2, max_length=50)
    type: str = Field(default="BASIC", pattern="^(BASIC|ADVANCED|ICU)$")
    capacity: int = Field(default=1, ge=1, le=10)
    status: str = Field(default="AVAILABLE", pattern="^(AVAILABLE|BUSY|MAINTENANCE|OFFLINE)$")
    driver_id: Optional[int] = None
    hospital_id: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class AmbulanceUpdate(BaseModel):
    vehicle_number: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern="^(BASIC|ADVANCED|ICU)$")
    capacity: Optional[int] = Field(default=None, ge=1, le=10)
    status: Optional[str] = Field(default=None, pattern="^(AVAILABLE|BUSY|MAINTENANCE|OFFLINE)$")
    driver_id: Optional[int] = None
    hospital_id: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class AmbulanceOut(BaseModel):
    id: int
    vehicle_number: str
    type: str
    capacity: int
    status: str
    driver_id: Optional[int] = None
    hospital_id: Optional[int] = None
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    updated_at: datetime
    driver: Optional[dict] = None
    driver_name: Optional[str] = None

    model_config = {"from_attributes": True}


class DriverCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=6)
    phone: Optional[str] = None
    license_number: str = Field(min_length=3, max_length=50)
    ambulance_id: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class DriverUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    ambulance_id: Optional[int] = None
    is_available: Optional[bool] = None
    is_active: Optional[bool] = None


class DriverOut(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    phone: Optional[str] = None
    license_number: str
    ambulance_id: Optional[int] = None
    is_available: bool
    is_active: bool
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    ambulance: Optional[dict] = None

    model_config = {"from_attributes": True}