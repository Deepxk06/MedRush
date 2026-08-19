"""Train and save the hospital resource prediction models.

Usage: python scripts/train_resource_model.py [path/to/dataset.csv]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai.resource_model import ResourceModel  # noqa: E402

model = ResourceModel()
result = model.train()
print("Training result:", result)
if result.get("trained"):
    print("Models saved to ml_models/resource_models.joblib")
    for resource, metrics in model.metrics.items():
        print(f"  {resource}: MAE={metrics['mae']} RMSE={metrics['rmse']} R2={metrics['r2']}")
else:
    print("Training failed:", result.get("reason"))
    sys.exit(1)