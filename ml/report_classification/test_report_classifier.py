
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

from predict_report_category import predict_category

# 1. Define output directory
BASE_DIR = Path(__file__).resolve().parent
RESULT_DIR = BASE_DIR / "evaluation" / "prediction_testing"

RESULT_DIR.mkdir(parents=True, exist_ok=True)

# 2. Define report categories
UNSAFE = "Unsafe heat conditions"
ISSUE = "Cooling centre issue"
NEW = "New cooling centre found"
INCIDENT = "Heat-related incident"

# None represents unrelated or ambiguous descriptions

# 3. Prepare testing descriptions
test_cases = [
    # English - Valid reports
    ("en", "The outdoor queue has no shelter from the afternoon sun.", UNSAFE),
    ("en", "The metal seats at the bus stop are dangerously hot.", UNSAFE),

    ("en", "The cooling centre has no working ventilation.", ISSUE),
    ("en", "Visitors cannot enter the listed cooling centre.", ISSUE),

    ("en", "A nearby library now offers a free cool resting area.", NEW),
    ("en", "I discovered a public hall providing shelter and air conditioning.", NEW),

    ("en", "A cyclist collapsed after exercising in extreme heat.", INCIDENT),
    ("en", "An elderly woman experienced dizziness and nausea due to heat.", INCIDENT),

    # Malay - Valid reports
    ("ms", "Tempat menunggu bas sangat panas tanpa bumbung.", UNSAFE),
    ("ms", "Kawasan permainan terlalu panas dan tiada pokok teduhan.", UNSAFE),

    ("ms", "Kipas di pusat penyejukan tidak berfungsi.", ISSUE),
    ("ms", "Pusat penyejukan ditutup walaupun masih dalam waktu operasi.", ISSUE),

    ("ms", "Saya menjumpai perpustakaan yang menyediakan ruang rehat berhawa dingin.", NEW),
    ("ms", "Dewan komuniti ini menyediakan tempat berehat yang sejuk secara percuma.", NEW),

    ("ms", "Seorang pekerja mengalami pening akibat cuaca panas.", INCIDENT),
    ("ms", "Seorang pelajar pengsan selepas berada di bawah matahari.", INCIDENT),

    # Chinese - Valid reports
    ("zh", "这个巴士站没有遮阳棚，下午非常炎热。", UNSAFE),
    ("zh", "公园的座椅被太阳晒得非常烫。", UNSAFE),

    ("zh", "降温中心的空调无法正常运作。", ISSUE),
    ("zh", "地图上显示开放的降温中心已经关闭。", ISSUE),

    ("zh", "我发现附近的图书馆提供免费冷气休息区。", NEW),
    ("zh", "社区礼堂现在开放给公众避暑休息。", NEW),

    ("zh", "一名工人因为天气太热而感到头晕。", INCIDENT),
    ("zh", "有一位老人因为中暑而晕倒。", INCIDENT),

    # English - Unrelated or ambiguous
    ("en", "I cannot log into my account.", None),
    ("en", "How do I change my profile picture?", None),
    ("en", "There is a traffic jam near my house.", None),
    ("en", "It is quite warm today.", None),

    # Malay - Unrelated or ambiguous
    ("ms", "Saya terlupa kata laluan akaun.", None),
    ("ms", "Bagaimana hendak menukar gambar profil?", None),
    ("ms", "Jalan raya sangat sesak hari ini.", None),
    ("ms", "Cuaca hari ini agak panas.", None),

    # Chinese - Unrelated or ambiguous
    ("zh", "我无法登录我的账号。", None),
    ("zh", "请问怎样修改个人资料？", None),
    ("zh", "我家附近发生交通堵塞。", None),
    ("zh", "今天的天气有点热。", None)
]

# Additional regression cases, not used verbatim in training.
test_cases += [
    ("en", "I felt dizzy and nauseous after travelling on a winding road.", None),
    ("ms", "Kawan saya muntah selepas makan makanan yang sudah basi.", None),
    ("zh", "我因为昨晚没有睡好，今天觉得头晕。", None),
    ("mixed", "My friend pengsan sebab nampak darah.", None),
    ("mixed", "Ada rider tiba-tiba pening and rasa nak pengsan tepi jalan sebab panas sangat, now dah bagi air and duduk bawah shade.", INCIDENT),
    ("mixed", "Cooling centre kat balai raya aircond rosak, panas gila kat dalam, water dispenser pun habis.", ISSUE),
]

# 4. Generate predictions
results = []

for language, description, expected in test_cases:

    prediction = predict_category(description)

    category = prediction["category"]
    decision_score = prediction["decision_score"]

    results.append({
        "Language": language,
        "Description": description,
        "Expected Category": expected,
        "Predicted Category": category,
        "Decision Score": decision_score,
        "Valid Report": expected is not None,
        "Correct Prediction": (
            expected is not None
            and category == expected
        )
    })

results_df = pd.DataFrame(results)

# 5. Calculate accuracy for valid reports
valid_reports = results_df[
    results_df["Valid Report"]
]

accuracy = valid_reports[
    "Correct Prediction"
].mean()

print("\nPrediction Testing Results")
print("Total samples:", len(results_df))
print("Valid reports:", len(valid_reports))
print(f"Valid report accuracy: {accuracy:.2%}")

# 6. Evaluate different decision-score thresholds
thresholds = [-0.25, 0.0, 0.10, 0.20, 0.25, 0.30, 0.40, 0.50, 0.75, 1.0]

threshold_results = []

for threshold in thresholds:

    accepted = results_df[
        (results_df["Decision Score"] >= threshold) & (results_df["Predicted Category"] != "Unrelated")
    ]

    correct = accepted[
        accepted["Correct Prediction"]
    ]

    incorrect = accepted[
        ~accepted["Correct Prediction"]
    ]

    unrelated_accepted = accepted[
        ~accepted["Valid Report"]
    ]

    suggestion_accuracy = (
        len(correct) / len(accepted)
        if len(accepted) > 0
        else float("nan")
    )

    valid_coverage = (
        len(accepted[accepted["Valid Report"]])
        / len(valid_reports)
    )

    threshold_results.append({
        "Threshold": threshold,
        "Auto Suggestions": len(accepted),
        "Correct Suggestions": len(correct),
        "Incorrect Suggestions": len(incorrect),
        "Unrelated Accepted": len(unrelated_accepted),
        "Manual Selection": len(results_df) - len(accepted),
        "Suggestion Accuracy": suggestion_accuracy,
        "Valid Report Coverage": valid_coverage
    })

threshold_df = pd.DataFrame(threshold_results)

# 7. Display threshold comparison
print("\nDecision Score Threshold Comparison:")
print(threshold_df.round(4).to_string(index=False))

# 8. Save testing results
results_df.to_csv(
    RESULT_DIR / "prediction_test_results.csv",
    index=False,
    encoding="utf-8-sig"
)

threshold_df.to_csv(
    RESULT_DIR / "threshold_comparison.csv",
    index=False
)

# 9. Generate threshold comparison graph
plt.figure(figsize=(10, 6))

plt.plot(
    threshold_df["Threshold"],
    threshold_df["Suggestion Accuracy"] * 100,
    marker="o",
    label="Suggestion Accuracy"
)

plt.plot(
    threshold_df["Threshold"],
    threshold_df["Valid Report Coverage"] * 100,
    marker="s",
    label="Valid Report Coverage"
)

plt.xlabel("Decision Score Threshold")
plt.ylabel("Percentage (%)")
plt.title("Decision Score Threshold Evaluation")
plt.xticks(thresholds)
plt.ylim(0, 105)
plt.legend()
plt.grid(alpha=0.3)
plt.tight_layout()

plt.savefig(
    RESULT_DIR / "threshold_comparison.png",
    dpi=300
)

plt.close()

print("\nPrediction testing completed!")
print("Results saved to:", RESULT_DIR)

