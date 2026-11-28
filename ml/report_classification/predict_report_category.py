
from pathlib import Path
import joblib

# 1. Define model path
BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = (
    BASE_DIR / "models" / "report_category_model.joblib"
)

# 2. Define decision-score threshold
DECISION_THRESHOLD = 0.30

# 3. Load trained model
model = joblib.load(MODEL_PATH)


# 4. Predict report category
def predict_category(description):

    description = description.strip()

    if not description:
        raise ValueError("Description cannot be empty.")

    # Predict category
    category = model.predict([description])[0]

    # Calculate the highest SVM decision score
    scores = model.decision_function([description])[0]

    decision_score = float(max(scores))

    # Determine whether to suggest the category
    auto_suggest = category != "Unrelated" and decision_score >= DECISION_THRESHOLD

    return {
        "category": str(category),
        "decision_score": decision_score,
        "auto_suggest": auto_suggest,
        "suggested_category": (
            str(category) if auto_suggest else None
        )
    }


# 5. Manual prediction testing
if __name__ == "__main__":

    print("HeatSafe KL Report Category Classification")
    print(f"Decision-score threshold: {DECISION_THRESHOLD:.2f}")
    print("Type 'exit' to stop.")

    while True:

        description = input("\nEnter report description: ")

        if description.strip().lower() == "exit":
            break

        if not description.strip():
            print("Please enter a description.")
            continue

        result = predict_category(description)

        print("Predicted category:", result["category"])
        print(f"Decision score: {result['decision_score']:.4f}")

        if result["auto_suggest"]:
            print("Status: Automatic suggestion")
            print("Suggested category:", result["suggested_category"])

        else:
            print("Status: Unrelated description" if result["category"] == "Unrelated" else "Status: Insufficient decision score")
            print("Please select a category manually.")
