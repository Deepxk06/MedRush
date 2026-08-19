from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.ai import emergency_priority, hospital_recommendation, route_optimization
from app.ai.priority_model import PriorityModel
from app.ai.resource_model import ResourceModel
from app.auth.deps import get_current_user
from app.database import get_db
from app.models import Ambulance, Driver, Hospital, HospitalResource, User
from app.schemas import (
    EmergencyPriorityResult,
    HospitalRecommendationResult,
    ModelInfo,
    PredictionResult,
    RouteResult,
)
from app.services.prediction_service import predict_resources

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/emergency-priority", response_model=EmergencyPriorityResult, summary="Classify emergency priority (rule + ML hybrid)")
def get_priority(payload: dict, user: User = Depends(get_current_user)):
    result = emergency_priority.compute_priority(
        payload.get("severity", "MEDIUM"),
        payload.get("emergency_type", "other"),
        payload.get("age"),
        payload.get("symptoms"),
        payload.get("vitals"),
    )
    return EmergencyPriorityResult(**result)


@router.post("/route-optimization", response_model=RouteResult, summary="Optimize an ambulance route (OSRM with fallback)")
def optimize_route(payload: dict, user: User = Depends(get_current_user)):
    origin = payload.get("origin")
    dest = payload.get("dest")
    if not origin or not dest:
        raise HTTPException(status_code=400, detail="origin and dest coordinates required")
    result = route_optimization.compute_route(
        (float(origin[0]), float(origin[1])),
        (float(dest[0]), float(dest[1])),
        traffic_factor=float(payload.get("traffic_factor", 1.15)),
        congestion=float(payload.get("congestion", 0.3)),
        priority=payload.get("priority", "MEDIUM"),
    )
    return RouteResult(**result)


@router.post("/hospital-recommendation", response_model=HospitalRecommendationResult, summary="Recommend best hospital for an emergency")
def recommend(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = hospital_recommendation.recommend_hospital(
        db,
        float(payload.get("pickup_lat", 0)),
        float(payload.get("pickup_lng", 0)),
        payload.get("emergency_type", "other"),
        payload.get("severity", "MEDIUM"),
        payload.get("preferred_hospital_hint"),
    )
    if not result["recommended"]:
        raise HTTPException(status_code=404, detail=result["explanation"])
    return HospitalRecommendationResult(**result)


@router.get("/resource-prediction", response_model=list[PredictionResult], summary="Predict hospital resource demand (ML)")
def resource_prediction(
    hospital_id: int = Query(..., description="Hospital id"),
    resource: str = Query("icu", description="beds | icu | emergency_beds | ventilators | doctors"),
    horizon_hours: int = Query(6, ge=1, le=24),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hospital = db.get(Hospital, hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    try:
        results = predict_resources(db, hospital_id, [resource], horizon_hours, persist=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not results:
        raise HTTPException(status_code=400, detail="Unknown resource type")
    return results


@router.get("/resource-prediction/all", response_model=list[PredictionResult], summary="Predict all resources for a hospital")
def resource_prediction_all(
    hospital_id: int,
    horizon_hours: int = Query(6, ge=1, le=24),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hospital = db.get(Hospital, hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    return predict_resources(db, hospital_id, None, horizon_hours, persist=False)


@router.get("/models", response_model=list[ModelInfo], summary="AI model information and metrics")
def model_info(user: User = Depends(get_current_user)):
    resource_model = ResourceModel.get_instance()
    priority_model = PriorityModel.get_instance()
    resource_info = resource_model.info()
    priority_info = priority_model.info()
    models = [
        ModelInfo(
            name="resource_prediction",
            algorithm=resource_info["algorithm"],
            trained=resource_info["trained"],
            version=resource_info.get("version"),
            metrics=resource_info.get("metrics"),
            dataset_rows=resource_info.get("dataset_rows"),
        ),
        ModelInfo(
            name="emergency_priority",
            algorithm=priority_info["algorithm"],
            trained=priority_info["trained"],
            version=priority_info.get("version"),
            metrics=priority_info.get("metrics"),
            dataset_rows=priority_info.get("dataset_rows"),
        ),
    ]
    return models