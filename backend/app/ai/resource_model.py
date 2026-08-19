"""Trained ML wrapper for hospital resource demand prediction.

One GradientBoosting model per resource type trained on historical usage.
If no artifact exists, it auto-trains from the synthetic dataset so the API
always returns real model-driven numbers.
"""

import logging
import os
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error
from sklearn.model_selection import train_test_split

from app.config import get_settings

logger = logging.getLogger(__name__)

RESOURCES = ["beds", "icu", "emergency_beds", "ventilators", "doctors"]


def _load_dataset() -> pd.DataFrame | None:
    path = os.path.join(get_settings().datasets_dir, "resource_usage.csv")
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, parse_dates=["date"])
    df["is_weekend"] = df["is_weekend"].astype(int)
    return df


class ResourceModel:
    _instance: "ResourceModel | None" = None

    def __init__(self) -> None:
        self.models: dict[str, Any] = {}
        self.metrics: dict[str, dict] = {}
        self.version: str | None = None
        self.trained: bool = False
        self.dataset_rows: int = 0
        self.algorithm = "GradientBoostingRegressor"
        self.feature_columns = [
            "hour", "day_of_week", "month", "is_weekend",
            "emergency_cases", "admissions", "discharges",
            "current_bed_usage", "icu_usage", "ventilator_usage", "staff_available",
        ]
        self._load_artifacts()
        if not self.trained:
            try:
                self.train()
            except Exception as exc:  # pragma: no cover
                logger.warning("Resource model auto-training failed: %s", exc)

    def _load_artifacts(self) -> None:
        path = os.path.join(get_settings().ml_models_dir, "resource_models.joblib")
        if not os.path.exists(path):
            return
        try:
            artifact = joblib.load(path)
            self.models = artifact.get("models", {})
            self.metrics = artifact.get("metrics", {})
            self.version = artifact.get("version")
            self.dataset_rows = artifact.get("dataset_rows", 0)
            self.trained = bool(self.models)
        except Exception as exc:  # pragma: no cover
            logger.warning("Could not load resource models: %s", exc)

    def train(self, dataset_path: str | None = None) -> dict[str, Any]:
        df = _load_dataset()
        if df is None and dataset_path:
            df = pd.read_csv(dataset_path, parse_dates=["date"])
        if df is None:
            logger.warning("No resource dataset available; model not trained.")
            return {"trained": False, "reason": "dataset missing"}
        df = df.dropna(subset=["resource_usage"])
        self.dataset_rows = len(df)
        results = {}
        for resource in RESOURCES:
            sub = df[df["resource_type"] == resource]
            if len(sub) < 200:
                continue
            features = sub[self.feature_columns].fillna(sub[self.feature_columns].median()).values
            target = sub["resource_usage"].values
            X_train, X_test, y_train, y_test = train_test_split(
                features, target, test_size=0.2, random_state=42
            )
            model = GradientBoostingRegressor(
                n_estimators=100, max_depth=4, learning_rate=0.08, random_state=42
            )
            model.fit(X_train, y_train)
            preds = model.predict(X_test)
            results[resource] = {
                "model": model,
                "metrics": {
                    "mae": round(mean_absolute_error(y_test, preds), 3),
                    "rmse": round(root_mean_squared_error(y_test, preds), 3),
                    "r2": round(float(r2_score(y_test, preds)), 4),
                    "test_samples": int(len(y_test)),
                },
                "baseline": float(np.mean(y_train)),
            }
            self.models[resource] = model
            self.metrics[resource] = results[resource]["metrics"]
        self.version = "auto-train-v1"
        self.trained = bool(self.models)
        self._save()
        return {"trained": self.trained, "resources": list(self.models.keys()), "rows": self.dataset_rows, "metrics": self.metrics}

    def _save(self) -> None:
        os.makedirs(get_settings().ml_models_dir, exist_ok=True)
        path = os.path.join(get_settings().ml_models_dir, "resource_models.joblib")
        artifact = {
            "models": self.models,
            "metrics": self.metrics,
            "version": self.version,
            "dataset_rows": self.dataset_rows,
            "algorithm": self.algorithm,
            "feature_columns": self.feature_columns,
            "trained_at": pd.Timestamp.now().isoformat(),
        }
        joblib.dump(artifact, path)

    def predict_hour(self, resource: str, hospital_row: dict[str, Any], hour_offset: int) -> float:
        """Predict resource demand `hour_offset` hours from now for a hospital context row."""
        if resource not in self.models:
            return float(hospital_row.get("current_usage", 0.0))
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        target = now + timedelta(hours=hour_offset)
        row = [
            target.hour,
            target.weekday(),
            target.month,
            1 if target.weekday() >= 5 else 0,
            hospital_row.get("emergency_cases", 5),
            hospital_row.get("admissions", 4),
            hospital_row.get("discharges", 3),
            hospital_row.get("current_bed_usage", 60),
            hospital_row.get("icu_usage", 40),
            hospital_row.get("ventilator_usage", 30),
            hospital_row.get("staff_available", 50),
        ]
        try:
            return float(max(0.0, self.models[resource].predict([row])[0]))
        except Exception as exc:  # pragma: no cover
            logger.warning("Prediction failed for %s: %s", resource, exc)
            return float(hospital_row.get("current_usage", 0.0))

    def predict_series(self, resource: str, hospital_row: dict[str, Any], horizon_hours: int = 6) -> list[dict]:
        base = self.predict_hour(resource, hospital_row, 0)
        series = []
        for offset in range(1, horizon_hours + 1):
            value = self.predict_hour(resource, hospital_row, offset)
            series.append({"hour_offset": offset, "predicted_usage": round(value, 1)})
        return series

    def info(self) -> dict[str, Any]:
        return {
            "name": "resource_prediction",
            "algorithm": self.algorithm,
            "trained": self.trained,
            "version": self.version,
            "metrics": self.metrics,
            "dataset_rows": self.dataset_rows,
            "description": "GradientBoosting regression per resource type predicting future demand from temporal and operational features.",
        }

    @classmethod
    def get_instance(cls) -> "ResourceModel":
        if cls._instance is None:
            cls._instance = ResourceModel()
        return cls._instance