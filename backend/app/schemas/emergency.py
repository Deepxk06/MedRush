from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EmergencyCreate(BaseModel):
    emergency_type: str = Field(min_length=1, max_length=100)
    severity: str = Field(pattern="^(LOW|MEDIUM|HIGH|CRITICAL)$")
    symptoms: Optional[str] = None
    medical_history: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    patient_age: Optional[int] = Field(default=None, ge=0, le=130)
    patient_gender: Optional[str] = None
    contact_phone: Optional[str] = None
    pickup_lat: float = Field(ge=-90, le=90)
    pickup_lng: float = Field(ge=-180, le=180)
    pickup_address: Optional[str] = None
    preferred_hospital_hint: Optional[str] = None
    vitals: Optional[dict] = None  # optional: heart_rate, blood_pressure, spo2, respiratory_rate
    patient_id: Optional[int] = Field(default=None, description="For admin/demo creation")


class StatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = None


class EmergencyOut(BaseModel):
    id: int
    patient_id: int
    patient_name: Optional[str] = None
    patient_age: Optional[int] = None
    patient_gender: Optional[str] = None
    contact_phone: Optional[str] = None
    emergency_type: str
    severity: str
    symptoms: Optional[str] = None
    medical_history: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None
    pickup_lat: float
    pickup_lng: float
    pickup_address: Optional[str] = None
    preferred_hospital_hint: Optional[str] = None
    priority: str
    priority_score: Optional[float] = None
    priority_reason: Optional[str] = None
    status: str
    status_history: Optional[str] = None
    assigned_ambulance_id: Optional[int] = None
    assigned_driver_id: Optional[int] = None
    recommended_hospital_id: Optional[int] = None
    hospital_score: Optional[float] = None
    hospital_reason: Optional[str] = None
    hospital_rankings: Optional[list[dict]] = None
    route_json: Optional[str] = None
    requested_at: datetime
    assigned_at: Optional[datetime] = None
    driver_accepted_at: Optional[datetime] = None
    driver_en_route_at: Optional[datetime] = None
    arrived_at_pickup_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    en_route_hospital_at: Optional[datetime] = None
    arrived_hospital_at: Optional[datetime] = None
    admitted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    ambulance: Optional[dict] = None
    driver: Optional[dict] = None
    hospital: Optional[dict] = None
    route: Optional[dict] = None

    model_config = {"from_attributes": True}


class CancelRequest(BaseModel):
    reason: Optional[str] = None


class DriverAction(BaseModel):
    pass


class HistoryOut(BaseModel):
    id: int
    emergency_id: int
    event: str
    description: Optional[str] = None
    actor_role: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}