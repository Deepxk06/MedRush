"""Generates the synthetic healthcare datasets used to train the AI modules.

Datasets are fully synthetic — no real patient identities are used.
"""

import csv
import os
import random
from datetime import datetime, timedelta

import numpy as np

random.seed(42)
np.random.seed(42)

HOSPITALS = [
    {"id": 1, "beds": 120, "icu": 12, "vent": 14, "doctors": 45, "nurses": 90},
    {"id": 2, "beds": 200, "icu": 18, "vent": 20, "doctors": 70, "nurses": 140},
    {"id": 3, "beds": 80, "icu": 8, "vent": 10, "doctors": 30, "nurses": 60},
    {"id": 4, "beds": 150, "icu": 14, "vent": 16, "doctors": 55, "nurses": 110},
]

RESOURCE_KEYS = ["beds", "icu", "emergency_beds", "ventilators", "doctors"]

EMERGENCY_TYPES = [
    "cardiac_arrest", "heart_attack", "stroke", "severe_bleeding", "unconscious",
    "breathing_difficulty", "severe_burn", "road_accident", "trauma", "seizure",
    "severe_pain", "high_fever", "fracture", "diabetic_emergency", "allergic_reaction", "other",
]


def generate_resource_dataset(path: str, days: int = 365, hourly: bool = True) -> None:
    """Hourly resource usage per hospital over `days` days."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    start = datetime(2025, 1, 1)
    rows = []
    steps = days * 24 if hourly else days
    for h in HOSPITALS:
        base_load = 0.55 + random.uniform(-0.1, 0.1)
        prev = {"beds": 0, "icu": 0, "ventilators": 0}
        for step in range(steps):
            ts = start + timedelta(hours=step if hourly else step * 24)
            hour = ts.hour
            dow = ts.weekday()
            month = ts.month
            weekend = 1 if dow >= 5 else 0
            wave = 1 + 0.18 * np.sin(2 * np.pi * (hour - 8) / 24)
            weekly = 1.12 if weekend else 1.0
            seasonal = 1 + 0.12 * np.sin(2 * np.pi * (month - 1) / 12)
            noise = np.random.normal(0, 0.06)
            emergency_cases = max(0, int(round(h["beds"] * 0.02 * wave * weekly * seasonal + noise * 8 + random.uniform(-1, 2))))
            admissions = max(0, int(round(h["beds"] * 0.015 * wave + random.uniform(-1, 3))))
            discharges = max(0, int(round(h["beds"] * 0.013 * wave + random.uniform(-1, 3))))
            bed_usage = int(round(h["beds"] * min(0.98, max(0.3, base_load * wave * weekly * seasonal + noise))))
            icu_usage = int(round(h["icu"] * min(0.98, max(0.2, (base_load - 0.05) * wave + noise))))
            vent_usage = int(round(h["vent"] * min(0.98, max(0.15, (base_load - 0.1) * wave + noise))))
            staff = int(round(h["doctors"] * (0.6 + 0.3 * (0.5 + 0.5 * np.sin(2 * np.pi * (hour - 9) / 24)) + random.uniform(-0.05, 0.05))))
            usage_by_resource = {
                "beds": bed_usage,
                "icu": icu_usage,
                "emergency_beds": max(0, int(round(h["beds"] * 0.1 * wave * weekly + noise * 4))),
                "ventilators": vent_usage,
                "doctors": staff,
            }
            current_bed = prev["beds"] if step > 0 else bed_usage
            current_icu = prev["icu"] if step > 0 else icu_usage
            current_vent = prev["ventilators"] if step > 0 else vent_usage
            prev = {"beds": bed_usage, "icu": icu_usage, "ventilators": vent_usage}
            for rkey in RESOURCE_KEYS:
                rows.append({
                    "hospital_id": h["id"],
                    "date": ts.date().isoformat(),
                    "hour": hour,
                    "day_of_week": dow,
                    "month": month,
                    "is_weekend": weekend,
                    "emergency_cases": emergency_cases,
                    "admissions": admissions,
                    "discharges": discharges,
                    "current_bed_usage": current_bed,
                    "icu_usage": current_icu,
                    "ventilator_usage": current_vent,
                    "staff_available": staff,
                    "resource_type": rkey,
                    "resource_usage": usage_by_resource[rkey],
                })
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Resource dataset written: {path} ({len(rows)} rows)")


def _priority_from_factors(severity_encoded: int, type_risk: int, age: int, ck: int, hk: int, hr: float, spo2: float, rr: float, sbp: float) -> str:
    score = (
        severity_encoded * 20 * 0.45
        + type_risk * 0.30
        + (25 if age >= 65 else 0) * 0.10
        + ck * 18 * 0.10
        + hk * 8 * 0.05
        + (25 if hr and (hr < 40 or hr > 140) else 0)
        + (30 if spo2 and spo2 < 90 else (15 if spo2 and spo2 < 95 else 0))
        + (20 if rr and (rr < 10 or rr > 28) else 0)
        + (25 if sbp and sbp < 90 else 0)
    )
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 35:
        return "MEDIUM"
    return "LOW"


def generate_priority_dataset(path: str, rows: int = 2500) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    severity_enc = [0, 1, 2, 3]
    data = []
    for _ in range(rows):
        sev = random.choice(severity_enc)
        etype = random.choice(EMERGENCY_TYPES)
        type_risk = {"cardiac_arrest": 95, "heart_attack": 90, "stroke": 85, "severe_bleeding": 80, "unconscious": 80, "breathing_difficulty": 75, "severe_burn": 70, "road_accident": 70, "trauma": 70, "seizure": 60, "severe_pain": 55, "high_fever": 40, "fracture": 45, "diabetic_emergency": 55, "allergic_reaction": 65, "other": 35}[etype]
        age = random.randint(1, 95)
        ck = random.randint(0, 2) if sev >= 2 else random.randint(0, 1)
        hk = random.randint(0, 3)
        hr = random.choice([0, 60, 72, 85, 95, 110, 150, 165])
        spo2 = random.choice([0, 96, 94, 92, 88, 84])
        rr = random.choice([0, 12, 16, 20, 26, 32])
        sbp = random.choice([0, 110, 120, 135, 150, 170, 85])
        label = _priority_from_factors(sev, type_risk, age, ck, hk, hr, spo2, rr, sbp)
        data.append({
            "severity_encoded": sev, "type_risk": type_risk, "age": age,
            "critical_keywords": ck, "high_keywords": hk,
            "hr": hr, "spo2": spo2, "rr": rr, "sbp": sbp, "label": label,
        })
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(data[0].keys()))
        writer.writeheader()
        writer.writerows(data)
    print(f"Priority dataset written: {path} ({len(data)} rows)")


if __name__ == "__main__":
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "datasets")
    generate_resource_dataset(os.path.join(base, "resource_usage.csv"))
    generate_priority_dataset(os.path.join(base, "priority_dataset.csv"))