"""Train and save the emergency priority classifier.

Usage: python scripts/train_priority_model.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai.priority_model import PriorityModel  # noqa: E402

model = PriorityModel()
if model.trained:
    print("Priority model ready.")
    print("Metrics:", model.metrics)
    print("Version:", model.version)
    print("Dataset rows:", model.dataset_rows)
else:
    print("Training failed — dataset missing.")
    print("Generate it with: python datasets/generate_dataset.py")
    sys.exit(1)