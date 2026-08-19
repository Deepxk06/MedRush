"""Hospital recommendation scoring.

Hospital Score = 0.30×proximity + 0.25×resource availability + 0.20×emergency
capacity + 0.15×doctor availability + 0.10×specialty match.
All components are normalized to 0..1 before weighting.
"""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.ai.route_optimization import estimate_eta
from app.models import Hospital, HospitalResource
from app.utils.helpers import haversine_km

logger = logging.getLogger(__name__)

WEIGHTS = {
    "proximity": 0.30,
    "resources": 0.25,
    "emergency_capacity": 0.20,
    "doctors": 0.15,
    "specialty": 0.10,
}

SPECIALTY_KEYWORDS = {
    "cardiac_arrest": ["cardiology"],
    "heart_attack": ["cardiology"],
    "stroke": ["neurology", "neurosurgery"],
    "severe_burn": ["burns", "plastic"],
    "trauma": ["trauma", "orthopedics", "surgery"],
    "road_accident": ["trauma", "orthopedics", "surgery"],
    "seizure": ["neurology"],
    "pregnancy_complication": ["obstetrics", "gynecology"],
    "severe_bleeding": ["surgery", "trauma"],
    "drowning": ["pulmonology"],
    "poisoning": ["toxicology", "internal"],
    "breathing_difficulty": ["pulmonology", "cardiology"],
    "diabetic_emergency": ["endocrinology", "internal"],
    "high_fever": ["infectious", "pediatrics", "internal"],
    "fracture": ["orthopedics"],
    "allergic_reaction": ["immunology", "emergency"],
}


def _norm(value: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 1.0
    return max(0.0, min(1.0, (value - lo) / (hi - lo)))


def recommend_hospital(
    db: Session,
    pickup_lat: float,
    pickup_lng: float,
    emergency_type: str = "other",
    severity: str = "MEDIUM",
    preferred_hint: str | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    """Rank active hospitals by suitability for this emergency."""
    hospitals = db.query(Hospital).filter(Hospital.is_active.is_(True)).all()
    if not hospitals:
        return {"recommended": None, "rankings": [], "explanation": "No active hospitals available."}

    hospitals_with_resources = []
    for hospital in hospitals:
        resources = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).first()
        if resources is None:
            continue
        hospitals_with_resources.append((hospital, resources))

    if not hospitals_with_resources:
        return {"recommended": None, "rankings": [], "explanation": "No hospitals with configured resources."}

    rows = []
    for hospital, resources in hospitals_with_resources:
        distance = haversine_km(pickup_lat, pickup_lng, hospital.lat, hospital.lng)
        eta = estimate_eta(pickup_lat, pickup_lng, hospital.lat, hospital.lng)["duration_min"]

        max_dist = max(haversine_km(pickup_lat, pickup_lng, h.lat, h.lng) for h, _ in hospitals_with_resources) or 1.0
        proximity = _norm(max_dist - distance, 0, max_dist)  # closer = higher

        bed_avail = max(0, resources.available_beds)
        icu_avail = max(0, resources.available_icu)
        resource_score = (
            0.4 * _norm(bed_avail, 0, max(1, resources.total_beds))
            + 0.35 * _norm(icu_avail, 0, max(1, resources.total_icu))
            + 0.25 * _norm(max(0, resources.available_ventilators), 0, max(1, resources.total_ventilators))
        )

        emergency_cap = _norm(max(0, resources.available_emergency_beds), 0, max(1, resources.total_emergency_beds))

        doctor_score = _norm(max(0, resources.available_doctors), 0, max(1, resources.total_doctors))

        specialties = (hospital.specialties or "").lower()
        wanted = SPECIALTY_KEYWORDS.get((emergency_type or "").lower().strip(), [])
        match_count = sum(1 for w in wanted if w in specialties)
        specialty_score = _norm(match_count, 0, max(1, len(wanted))) if wanted else 0.6

        score = (
            WEIGHTS["proximity"] * proximity
            + WEIGHTS["resources"] * resource_score
            + WEIGHTS["emergency_capacity"] * emergency_cap
            + WEIGHTS["doctors"] * doctor_score
            + WEIGHTS["specialty"] * specialty_score
        )

        if preferred_hint and preferred_hint.strip().lower() in hospital.name.lower():
            score = min(1.0, score + 0.15)

        reasons = []
        if bed_avail >= 5:
            reasons.append(f"{bed_avail} available beds")
        if icu_avail >= 2:
            reasons.append(f"{icu_avail} available ICU beds")
        if match_count > 0:
            reasons.append(f"specialty match ({', '.join(wanted)})")
        reasons.append(f"~{eta:.0f} min travel time")

        rows.append({
            "hospital_id": hospital.id,
            "name": hospital.name,
            "score": round(score, 4),
            "distance_km": round(distance, 2),
            "eta_min": round(eta, 1),
            "available_beds": bed_avail,
            "available_icu": icu_avail,
            "available_emergency_beds": max(0, resources.available_emergency_beds),
            "available_ventilators": max(0, resources.available_ventilators),
            "available_doctors": max(0, resources.available_doctors),
            "reason": "; ".join(reasons),
            "components": {
                "proximity": round(proximity, 3),
                "resources": round(resource_score, 3),
                "emergency_capacity": round(emergency_cap, 3),
                "doctors": round(doctor_score, 3),
                "specialty": round(specialty_score, 3),
            },
        })

    rows.sort(key=lambda r: r["score"], reverse=True)
    top = rows[0] if rows else None
    explanation = ""
    if top:
        explanation = (
            f"{top['name']} was recommended because it offers {top['reason']} "
            f"(suitability score {top['score']:.2f})."
        )
    return {
        "recommended": top,
        "rankings": rows[:limit],
        "explanation": explanation,
    }