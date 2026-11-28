
from pathlib import Path
from time import perf_counter

import pandas as pd
import matplotlib.pyplot as plt

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import MultinomialNB
from sklearn.svm import LinearSVC
from sklearn.pipeline import Pipeline
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    ConfusionMatrixDisplay
)

# 1. Define file paths
BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
RESULT_DIR = BASE_DIR / "evaluation"

RESULT_DIR.mkdir(exist_ok=True)

# 2. Load training dataset
data = pd.read_csv(
    DATASET_DIR / "report_categories_train.csv"
)

X = data["description"]
y = data["category"]
groups = data["scenario_id"]

# 3. Define classification algorithms
classifiers = {
    "Logistic Regression": LogisticRegression(
        max_iter=1000,
        random_state=42
    ),

    "Naive Bayes": MultinomialNB(),

    "Linear SVM": LinearSVC(
        max_iter=5000,
        random_state=42
    )
}

folder_names = {
    "Logistic Regression": "logistic_regression",
    "Naive Bayes": "naive_bayes",
    "Linear SVM": "linear_svm"
}

# 4. Configure grouped cross-validation
cv = StratifiedGroupKFold(
    n_splits=4,
    shuffle=True,
    random_state=42
)

splits = list(cv.split(X, y, groups))
results = []

# 5. Train and evaluate each algorithm
for name, classifier in classifiers.items():

    print(f"\nEvaluating {name}...")

    algorithm_dir = RESULT_DIR / folder_names[name]
    algorithm_dir.mkdir(exist_ok=True)

    all_actual = []
    all_predicted = []
    fold_results = []

    for fold, (train_idx, val_idx) in enumerate(
        splits, start=1
    ):

        X_train = X.iloc[train_idx]
        y_train = y.iloc[train_idx]

        X_val = X.iloc[val_idx]
        y_val = y.iloc[val_idx]

        model = Pipeline([
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char",
                    ngram_range=(2, 5),
                    sublinear_tf=True
                )
            ),
            ("classifier", classifier)
        ])

        # Measure training time
        start_time = perf_counter()

        model.fit(X_train, y_train)

        training_time = perf_counter() - start_time

        # Predict validation samples
        y_pred = model.predict(X_val)

        all_actual.extend(y_val.tolist())
        all_predicted.extend(y_pred.tolist())

        # Calculate evaluation metrics
        fold_results.append({
            "Fold": fold,
            "Accuracy": accuracy_score(
                y_val, y_pred
            ),
            "Precision": precision_score(
                y_val,
                y_pred,
                average="macro",
                zero_division=0
            ),
            "Recall": recall_score(
                y_val,
                y_pred,
                average="macro",
                zero_division=0
            ),
            "F1-score": f1_score(
                y_val,
                y_pred,
                average="macro",
                zero_division=0
            ),
            "Training Time (s)": training_time
        })

        print(f"Fold {fold} completed.")

    # 6. Save individual fold results
    fold_df = pd.DataFrame(fold_results)

    fold_df.to_csv(
        algorithm_dir / "fold_results.csv",
        index=False
    )

    # 7. Generate classification report
    report = classification_report(
        all_actual,
        all_predicted,
        zero_division=0
    )

    with open(
        algorithm_dir / "classification_report.txt",
        "w",
        encoding="utf-8"
    ) as file:

        file.write(f"Algorithm: {name}\n")
        file.write("Evaluation: 4-fold grouped CV\n\n")
        file.write(report)

    # 8. Generate individual confusion matrix
    fig, ax = plt.subplots(figsize=(10, 8))

    ConfusionMatrixDisplay.from_predictions(
        all_actual,
        all_predicted,
        cmap="Blues",
        xticks_rotation=30,
        ax=ax
    )

    plt.title(f"{name} - Confusion Matrix")
    plt.tight_layout()

    plt.savefig(
        algorithm_dir / "confusion_matrix.png",
        dpi=300
    )

    plt.close(fig)

    # 9. Store average performance
    results.append({
        "Algorithm": name,
        "Accuracy": fold_df["Accuracy"].mean(),
        "Precision": fold_df["Precision"].mean(),
        "Recall": fold_df["Recall"].mean(),
        "F1-score": fold_df["F1-score"].mean(),
        "F1 std": fold_df["F1-score"].std(ddof=0),
        "Mean fit time (s)": fold_df[
            "Training Time (s)"
        ].mean()
    })

    print(f"\n{name} Classification Report:")
    print(report)

# 10. Generate overall comparison results
results_df = pd.DataFrame(results)

results_df = results_df.sort_values(
    by="F1-score",
    ascending=False
)

print("\nModel Comparison Results:")
print(results_df.round(4).to_string(index=False))

results_df.to_csv(
    RESULT_DIR / "report_classifier_comparison.csv",
    index=False
)

# 11. Generate comparison chart
metrics = [
    "Accuracy",
    "Precision",
    "Recall",
    "F1-score"
]

ax = results_df.set_index("Algorithm")[metrics].plot(
    kind="bar",
    figsize=(12, 6)
)

ax.set_title("Report Classification Model Comparison")
ax.set_ylabel("Score")
ax.set_xlabel("Algorithm")
ax.set_ylim(0, 1.1)

plt.xticks(rotation=0)
plt.legend(loc="lower right")
plt.tight_layout()

plt.savefig(
    RESULT_DIR / "report_classifier_comparison.png",
    dpi=300
)

plt.close()

# 12. Identify best-performing algorithm
best_model = results_df.iloc[0]

print("\nBest validation model:", best_model["Algorithm"])
print(f"Macro F1-score: {best_model['F1-score']:.2%}")

print("\nComparison completed successfully!")
print("All evaluation results have been saved.")
