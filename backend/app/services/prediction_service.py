"""Resource prediction service — ties the trained ML model to the database."""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.ai.resource_model import ResourceModel, RESOURCES
from app.models import Hospital, HospitalPrediction, HospitalResource, ResourceHistory
from app.utils.helpers import from_json, to_json

logger = logging.getLogger(__name__)


def risk_level_for(shortage: float, current_available: float) -> str:
    """Dynamic risk classification from the predicted shortage."""
    if shortage <= 0:
        return "LOW"
    if current_available <= 0:
        return "CRITICAL"
    ratio = shortage / current_available
    if ratio >= 1.0:
        return "CRITICAL"
    if ratio >= 0.5:
        return "HIGH"
    if ratio >= 0.2:
        return "MEDIUM"
    return "LOW"


def _hospital_context(hospital: Hospital, resources: HospitalResource | None) -> dict[str, Any]:
    if resources is None:
        return {
            "current_usage": 0, "current_bed_usage": 0, "icu_usage": 0,
            "ventilator_usage": 0, "staff_available": 50, "emergency_cases": 5,
            "admissions": 4, "discharges": 3,
        }
    total = resources.total_beds or 1
    return {
        "current_usage": resources.total_beds - resources.available_beds,
        "current_bed_usage": resources.total_beds - resources.available_beds,
        "icu_usage": resources.total_icu - resources.available_icu,
        "ventilator_usage": resources.total_ventilators - resources.available_ventilators,
        "staff_available": resources.available_doctors,
        "emergency_cases": max(0, resources.total_emergency_beds - resources.available_emergency_beds),
        "admissions": 4,
        "discharges": 3,
    }


def _current_available(resources: HospitalResource | None, resource: str) -> float:
    if resources is None:
        return 0.0
    mapping = {
        "beds": resources.available_beds,
        "icu": resources.available_icu,
        "emergency_beds": resources.available_emergency_beds,
        "ventilators": resources.available_ventilators,
        "doctors": resources.available_doctors,
    }
    return float(mapping.get(resource, 0.0))


def _total(resources: HospitalResource | None, resource: str) -> float:
    if resources is None:
        return 1.0
    mapping = {
        "beds": resources.total_beds,
        "icu": resources.total_icu,
        "emergency_beds": resources.total_emergency_beds,
        "ventilators": resources.total_ventilators,
        "doctors": resources.total_doctors,
    }
    return float(max(1, mapping.get(resource, 1)))


def predict_resources(
    db: Session,
    hospital_id: int,
    resources: list[str] | None = None,
    horizon_hours: int = 6,
    persist: bool = True,
) -> list[dict[str, Any]]:
    hospital = db.get(Hospital, hospital_id)
    if not hospital:
        raise ValueError("Hospital not found")
    hospital_resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital_id).first()
    model = ResourceModel.get_instance()
    context = _hospital_context(hospital, hospital_resources)
    targets = resources or RESOURCES
    results = []
    for resource in targets:
        if resource not in RESOURCES:
            continue
        current_available = _current_available(hospital_resources, resource)
        total = _total(hospital_resources, resource)
        series = model.predict_series(resource, context, horizon_hours)
        predicted_usage = series[-1]["predicted_usage"]
        baseline = series[0]["predicted_usage"]
        predicted_demand = max(0.0, predicted_usage - baseline)
        expected_shortage = max(0.0, predicted_demand - current_available)
        risk = risk_level_for(expected_shortage, current_available)
        growth_pct = ((predicted_usage - baseline) / max(1.0, baseline)) * 100 if baseline > 0 else 0.0
        explanation = (
            f"{resource.replace('_', ' ').title()} demand is predicted to increase by "
            f"{growth_pct:.0f}% over the next {horizon_hours} hours (from {baseline:.0f} to "
            f"{predicted_usage:.0f} units). Current availability is {current_available:.0f} "
            f"of {total:.0f}. Expected shortage: {expected_shortage:.0f} — risk level {risk}."
        )
        metrics = model.metrics.get(resource)
        result = {
            "hospital_id": hospital.id,
            "hospital_name": hospital.name,
            "resource": resource,
            "horizon_hours": horizon_hours,
            "current_available": current_available,
            "current_total": total,
            "predicted_demand": round(predicted_demand, 1),
            "predicted_usage": round(predicted_usage, 1),
            "expected_shortage": round(expected_shortage, 1),
            "risk_level": risk,
            "confidence": round((0.75 + 0.2 * (1 - expected_shortage / max(1.0, total))) * (0.9 if model.trained else 0.6), 3),
            "explanation": explanation,
            "series": series,
            "model_version": model.version,
            "metrics": metrics,
        }
        if persist:
            prediction = HospitalPrediction(
                hospital_id=hospital.id,
                resource_type=resource,
                horizon_hours=horizon_hours,
                predicted_demand=round(predicted_demand, 1),
                current_available=current_available,
                expected_shortage=round(expected_shortage, 1),
                risk_level=risk,
                confidence=result["confidence"],
                model_version=model.version,
                explanation=explanation,
                series=to_json(series),
            )
            db.add(prediction)
        results.append(result)
    if persist:
        db.commit()
    return results


def record_resource_snapshot(db: Session, hospital_id: int, resources: HospitalResource) -> None:
    """Snapshot resource usage for trend analytics (called on every resource update)."""
    usage = [
        ("beds", resources.total_beds, resources.available_beds),
        ("icu", resources.total_icu, resources.available_icu),
        ("emergency_beds", resources.total_emergency_beds, resources.available_emergency_beds),
        ("ventilators", resources.total_ventilators, resources.available_ventilators),
        ("doctors", resources.total_doctors, resources.available_doctors),
    ]
    for rtype, total, available in usage:
        db.add(ResourceHistory(
            hospital_id=hospital_id,
            resource_type=rtype,
            total=total,
            available=available,
            usage_pct=round(((total - available) / max(1, total)) * 100, 1),
            recorded_at=datetime.now(timezone.utc),
        ))