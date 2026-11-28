
from pathlib import Path

import pandas as pd
import joblib
import matplotlib.pyplot as plt

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import LinearSVC
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    ConfusionMatrixDisplay
)

# 1. Define file paths
BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
MODEL_DIR = BASE_DIR / "models"

MODEL_DIR.mkdir(exist_ok=True)

# 2. Load datasets
train_data = pd.read_csv(
    DATASET_DIR / "report_categories_train.csv"
)

test_data = pd.read_csv(
    DATASET_DIR / "report_categories_test.csv"
)

# 3. Validate datasets
for data in [train_data, test_data]:
    assert data["description"].notna().all()
    assert data["category"].notna().all()

# Prevent scenario overlap between training and testing
assert not (
    set(train_data["scenario_id"])
    & set(test_data["scenario_id"])
), "Scenario overlap detected!"

print("Training samples:", len(train_data))
print("Testing samples:", len(test_data))

print("\nTraining category distribution:")
print(train_data["category"].value_counts())

# 4. Separate input features and target labels
X_train = train_data["description"]
y_train = train_data["category"]

X_test = test_data["description"]
y_test = test_data["category"]

# 5. Create machine learning pipeline
model = Pipeline([
    (
        "tfidf",
        TfidfVectorizer(
            analyzer="char",
            ngram_range=(2, 5),
            sublinear_tf=True
        )
    ),
    (
        "classifier",
        LinearSVC(
            max_iter=10000,
            random_state=42
        )
    )
])

# 6. Train the classification model
print("\nTraining report classification model...")

model.fit(X_train, y_train)

print("Training completed!")

# 7. Evaluate model performance
y_pred = model.predict(X_test)

accuracy = accuracy_score(y_test, y_pred)

print(f"\nOverall accuracy: {accuracy:.2%}")

print("\nClassification Report:")
print(
    classification_report(
        y_test,
        y_pred,
        zero_division=0
    )
)

# 8. Evaluate performance by language
print("\nAccuracy by language:")

for language in test_data["language"].unique():
    mask = test_data["language"] == language

    language_accuracy = accuracy_score(
        y_test[mask],
        y_pred[mask]
    )

    print(f"{language}: {language_accuracy:.2%}")

# 9. Generate confusion matrix
fig, ax = plt.subplots(figsize=(10, 8))

ConfusionMatrixDisplay.from_predictions(
    y_test,
    y_pred,
    cmap="Blues",
    xticks_rotation=30,
    ax=ax
)

plt.title("Report Category Classification (Linear SVM)")
plt.tight_layout()

plt.savefig(
    MODEL_DIR / "report_category_confusion_matrix.png",
    dpi=300
)

plt.close(fig)

# 10. Save trained model
joblib.dump(
    model,
    MODEL_DIR / "report_category_model.joblib"
)

print("\nModel saved successfully!")
print("Confusion matrix saved successfully!")
