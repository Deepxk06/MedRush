from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    user_id: int
    title: str
    message: Optional[str] = None
    type: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    metadata_json: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class EmergencyPriorityResult(BaseModel):
    priority: str
    score: float
    reason: str
    factors: dict


class HospitalRank(BaseModel):
    hospital_id: int
    name: str
    score: float
    distance_km: float
    eta_min: float
    available_beds: int
    available_icu: int
    available_emergency_beds: int
    available_ventilators: int
    available_doctors: int
    reason: str


class HospitalRecommendationResult(BaseModel):
    recommended: HospitalRank
    rankings: list[HospitalRank]
    explanation: str


class RouteStep(BaseModel):
    distance_km: float
    duration_min: float
    lat: float
    lng: float


class RouteResult(BaseModel):
    path: list[list[float]]
    distance_km: float
    duration_min: float
    method: str
    traffic_factor: float
    explanation: str
    alternatives: Optional[list[dict]] = None


class PredictionResult(BaseModel):
    hospital_id: int
    hospital_name: str
    resource: str
    horizon_hours: int
    current_available: float
    predicted_demand: float
    expected_shortage: float
    risk_level: str
    confidence: float
    explanation: str
    series: list[dict]
    model_version: Optional[str] = None
    metrics: Optional[dict] = None


class ModelInfo(BaseModel):
    name: str
    version: Optional[str] = None
    trained: bool
    algorithm: str
    metrics: Optional[dict] = None
    dataset_rows: Optional[int] = None
    last_trained_at: Optional[datetime] = None