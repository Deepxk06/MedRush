"""Emergency priority classification — transparent rule + ML hybrid.

The system never claims to diagnose; this is operational triage prioritization
used only to rank dispatch urgency.
"""

import math
from typing import Any

from app.ai.priority_model import PriorityModel
from app.utils.helpers import clamp

SEVERITY_RISK = {"LOW": 10, "MEDIUM": 30, "HIGH": 60, "CRITICAL": 90}

EMERGENCY_TYPE_RISK = {
    "cardiac_arrest": 95,
    "heart_attack": 90,
    "stroke": 85,
    "severe_bleeding": 80,
    "unconscious": 80,
    "breathing_difficulty": 75,
    "severe_burn": 70,
    "trauma": 70,
    "road_accident": 70,
    "seizure": 60,
    "severe_pain": 55,
    "poisoning": 65,
    "pregnancy_complication": 60,
    "diabetic_emergency": 55,
    "high_fever": 40,
    "fracture": 45,
    "drowning": 90,
    "electric_shock": 85,
    "allergic_reaction": 65,
    "mild_injury": 20,
    "general_checkup": 5,
    "other": 35,
}

CRITICAL_KEYWORDS = [
    "chest pain", "breathing", "unconscious", "bleeding", "seizure", "stroke",
    "paralysis", "slurred", "heart", "cardiac", "choking", "drowning", "burn",
]
HIGH_KEYWORDS = [
    "fever", "vomit", "headache", "diarrhea", "dehydrated", "pain", "fracture",
    "broken", "dizzy", "confusion", "weakness",
]

AGE_RISK = lambda age: (  # noqa: E731
    15 if age is None else (25 if age < 5 else (20 if age >= 65 else 0))
)

VITAL_WEIGHTS = {
    "heart_rate": lambda v: 25 if (v and (v < 40 or v > 140)) else (10 if (v and (v > 110 or v < 55)) else 0),
    "spo2": lambda v: 30 if (v is not None and v < 90) else (15 if (v is not None and v < 95) else 0),
    "respiratory_rate": lambda v: 20 if (v is not None and (v < 10 or v > 28)) else 0,
    "systolic_bp": lambda v: 25 if (v is not None and v < 90) else (10 if (v is not None and v > 160) else 0),
}


def _keyword_score(symptoms: str | None) -> int:
    text = (symptoms or "").lower()
    if not text:
        return 0
    score = 0
    for kw in CRITICAL_KEYWORDS:
        if kw in text:
            score += 18
    for kw in HIGH_KEYWORDS:
        if kw in text:
            score += 8
    return min(score, 60)


def rule_based_priority(
    severity: str,
    emergency_type: str,
    age: int | None = None,
    symptoms: str | None = None,
    vitals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute a transparent 0-100 priority score from explicit factors."""
    factors: dict[str, Any] = {}
    score = 0.0

    sev = clamp(SEVERITY_RISK.get(severity, 30), 0, 90)
    score += sev * 0.45
    factors["severity"] = round(sev * 0.45, 1)

    type_risk = EMERGENCY_TYPE_RISK.get((emergency_type or "").lower().strip(), 35)
    score += type_risk * 0.30
    factors["emergency_type"] = round(type_risk * 0.30, 1)

    age_risk = AGE_RISK(age)
    score += age_risk * 0.10
    factors["age"] = age_risk * 0.10 if age is not None else None

    kw = _keyword_score(symptoms)
    score += kw * 0.10
    factors["symptom_keywords"] = kw * 0.10

    vital_total = 0.0
    if vitals:
        for key, fn in VITAL_WEIGHTS.items():
            value = None
            if key == "systolic_bp" and vitals.get("blood_pressure"):
                try:
                    value = int(str(vitals["blood_pressure"]).split("/")[0])
                except (ValueError, IndexError):
                    value = None
            elif key in vitals:
                try:
                    value = float(vitals[key])
                except (TypeError, ValueError):
                    value = None
            w = fn(value) if value is not None else 0
            vital_total += w
        vital_total = clamp(vital_total, 0, 30)
        score += vital_total
        factors["vitals"] = vital_total

    score = clamp(score, 0, 100)

    if score >= 80:
        priority = "CRITICAL"
    elif score >= 60:
        priority = "HIGH"
    elif score >= 35:
        priority = "MEDIUM"
    else:
        priority = "LOW"

    reasons = []
    if sev >= 60:
        reasons.append(f"severity is {severity}")
    if type_risk >= 80:
        reasons.append(f"emergency type ({emergency_type}) is high-risk")
    if age is not None and age >= 65:
        reasons.append("patient age ≥ 65")
    if age is not None and age < 5:
        reasons.append("patient age < 5")
    if kw >= 30:
        reasons.append("symptoms contain critical indicators")
    if vital_total >= 20:
        reasons.append("vitals are outside normal ranges")

    return {
        "priority": priority,
        "score": round(score, 1),
        "factors": factors,
        "reason": "; ".join(reasons) if reasons else "no high-risk factors detected",
    }


def compute_priority(
    severity: str,
    emergency_type: str,
    age: int | None = None,
    symptoms: str | None = None,
    vitals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Hybrid: rule-based triage blended with the trained ML classifier (when available)."""
    rule = rule_based_priority(severity, emergency_type, age, symptoms, vitals)
    ml = PriorityModel.get_instance().predict(severity, emergency_type, age, symptoms, vitals)
    if ml and ml.get("priority") is not None:
        ml_share = 0.35
        final_score = rule["score"] * (1 - ml_share) + ml["score"] * ml_share
        final = clamp(final_score, 0, 100)
        if final >= 80:
            priority = "CRITICAL"
        elif final >= 60:
            priority = "HIGH"
        elif final >= 35:
            priority = "MEDIUM"
        else:
            priority = "LOW"
        rule["priority"] = priority
        rule["score"] = round(final, 1)
        rule["model_contribution"] = ml
        rule["reason"] = (rule["reason"] + "; ML classifier agrees") if rule["reason"] else "ML classifier input"
    return rule