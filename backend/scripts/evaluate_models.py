"""Evaluate trained AI models against held-out data.

Usage: python scripts/evaluate_models.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai.priority_model import PriorityModel  # noqa: E402
from app.ai.resource_model import ResourceModel  # noqa: E402

print("=" * 60)
print("MEDRUSH AI — Model Evaluation")
print("=" * 60)

resource = ResourceModel.get_instance()
print("\n[Resource Prediction]")
if resource.trained:
    print(f"  Algorithm : {resource.algorithm}")
    print(f"  Version   : {resource.version}")
    print(f"  Rows      : {resource.dataset_rows}")
    print("  Per-resource metrics (MAE / RMSE / R2):")
    for rname, metrics in resource.metrics.items():
        print(f"    {rname:<16} {metrics['mae']:>7} {metrics['rmse']:>7} {metrics['r2']:>7}")
else:
    print("  NOT TRAINED — run scripts/train_resource_model.py after generating datasets/generate_dataset.py")

priority = PriorityModel.get_instance()
print("\n[Emergency Priority]")
if priority.trained:
    print(f"  Algorithm : {priority.algorithm}")
    print(f"  Version   : {priority.version}")
    print(f"  Rows      : {priority.dataset_rows}")
    print("  Metrics   :", priority.metrics)
else:
    print("  NOT TRAINED (rule-based fallback active)")

print("\nDone.")