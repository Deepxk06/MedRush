"""Trained ML wrapper for emergency priority classification.

Trains a lightweight RandomForest on a synthetic labeled dataset when no
trained artifact exists, so the module is always runnable.
"""

import logging
import os
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

from app.config import get_settings
from app.utils.helpers import clamp

logger = logging.getLogger(__name__)

LABELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
SEVERITY_MAP = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
TYPE_RISK = {
    "cardiac_arrest": 95, "heart_attack": 90, "stroke": 85, "severe_bleeding": 80,
    "unconscious": 80, "breathing_difficulty": 75, "severe_burn": 70, "trauma": 70,
    "road_accident": 70, "seizure": 60, "poisoning": 65, "pregnancy_complication": 60,
    "diabetic_emergency": 55, "high_fever": 40, "fracture": 45, "allergic_reaction": 65,
    "mild_injury": 20, "other": 35,
}


def _extract_vitals(vitals: dict | None) -> dict[str, float]:
    out = {"hr": 0.0, "spo2": 0.0, "rr": 0.0, "sbp": 0.0}
    if not vitals:
        return out
    try:
        out["hr"] = float(vitals.get("heart_rate") or 0)
    except (TypeError, ValueError):
        pass
    try:
        out["spo2"] = float(vitals.get("spo2") or 0)
    except (TypeError, ValueError):
        pass
    try:
        out["rr"] = float(vitals.get("respiratory_rate") or 0)
    except (TypeError, ValueError):
        pass
    bp = vitals.get("blood_pressure")
    if bp:
        try:
            out["sbp"] = float(str(bp).split("/")[0])
        except (ValueError, IndexError, TypeError):
            pass
    return out


def make_features(
    severity: str,
    emergency_type: str,
    age: int | None,
    symptoms: str | None,
    vitals: dict | None,
) -> np.ndarray:
    v = _extract_vitals(vitals)
    text = (symptoms or "").lower()
    critical_kw = sum(1 for kw in ["chest pain", "breathing", "unconscious", "bleeding", "seizure", "stroke", "choking"] if kw in text)
    high_kw = sum(1 for kw in ["fever", "pain", "fracture", "dizzy", "vomit"] if kw in text)
    row = [
        SEVERITY_MAP.get(severity, 1),
        TYPE_RISK.get((emergency_type or "").lower().strip(), 35),
        age if age is not None else 30,
        critical_kw,
        high_kw,
        v["hr"], v["spo2"], v["rr"], v["sbp"],
    ]
    return np.array([row], dtype=float)


class PriorityModel:
    _instance: "PriorityModel | None" = None

    def __init__(self) -> None:
        self.model: Any = None
        self.metrics: dict[str, Any] = {}
        self.version: str | None = None
        self.trained: bool = False
        self.dataset_rows: int = 0
        self.algorithm = "RandomForestClassifier"
        path = os.path.join(get_settings().ml_models_dir, "priority_model.joblib")
        if os.path.exists(path):
            try:
                artifact = joblib.load(path)
                self.model = artifact.get("model")
                self.metrics = artifact.get("metrics", {})
                self.version = artifact.get("version")
                self.dataset_rows = artifact.get("dataset_rows", 0)
                self.trained = self.model is not None
            except Exception as exc:  # pragma: no cover
                logger.warning("Could not load priority model: %s", exc)
        if not self.trained:
            try:
                self._train_from_dataset()
            except Exception as exc:  # pragma: no cover
                logger.warning("Priority model training failed: %s", exc)

    def _train_from_dataset(self) -> None:
        path = os.path.join(get_settings().datasets_dir, "priority_dataset.csv")
        if not os.path.exists(path):
            logger.warning("No priority dataset found at %s — rule-based mode only", path)
            return
        df = pd.read_csv(path)
        df = df.dropna(subset=["label"])
        self.dataset_rows = len(df)
        features = df[
            ["severity_encoded", "type_risk", "age", "critical_keywords", "high_keywords", "hr", "spo2", "rr", "sbp"]
        ].fillna(0).values
        targets = df["label"].map({l: i for i, l in enumerate(LABELS)}).astype(int).values
        X_train, X_test, y_train, y_test = train_test_split(
            features, targets, test_size=0.2, random_state=42, stratify=targets
        )
        self.model = RandomForestClassifier(n_estimators=120, max_depth=8, random_state=42)
        self.model.fit(X_train, y_train)
        preds = self.model.predict(X_test)
        self.metrics = {
            "accuracy": round(accuracy_score(y_test, preds), 4),
            "precision": round(precision_score(y_test, preds, average="weighted", zero_division=0), 4),
            "recall": round(recall_score(y_test, preds, average="weighted", zero_division=0), 4),
            "f1": round(f1_score(y_test, preds, average="weighted", zero_division=0), 4),
            "test_samples": int(len(y_test)),
        }
        self.version = "auto-train-v1"
        self.trained = True
        logger.info("Priority model trained on %d rows, metrics=%s", self.dataset_rows, self.metrics)

    def predict(self, severity: str, emergency_type: str, age: int | None, symptoms: str | None, vitals: dict | None) -> dict[str, Any] | None:
        if not self.trained or self.model is None:
            return None
        X = make_features(severity, emergency_type, age, symptoms, vitals)
        try:
            probs = self.model.predict_proba(X)[0]
            label_idx = int(self.model.predict(X)[0])
            label = LABELS[label_idx] if label_idx < len(LABELS) else "MEDIUM"
            score_map = {"LOW": 20, "MEDIUM": 45, "HIGH": 68, "CRITICAL": 88}
            return {
                "priority": label,
                "score": score_map.get(label, 45) * float(np.max(probs)),
                "confidence": round(float(np.max(probs)), 3),
                "model_version": self.version,
            }
        except Exception as exc:  # pragma: no cover
            logger.warning("Priority prediction failed: %s", exc)
            return None

    def info(self) -> dict[str, Any]:
        return {
            "name": "emergency_priority",
            "algorithm": self.algorithm,
            "trained": self.trained,
            "version": self.version,
            "metrics": self.metrics,
            "dataset_rows": self.dataset_rows,
            "description": "RandomForest classifier blending triage factors for dispatch prioritization (decision support only).",
        }

    @classmethod
    def get_instance(cls) -> "PriorityModel":
        if cls._instance is None:
            cls._instance = PriorityModel()
        return cls._instance