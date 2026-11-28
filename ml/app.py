
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from report_classification.predict_report_category import (
    predict_category
)

# 1. Initialise FastAPI
app = FastAPI(
    title="HeatSafe KL Machine Learning API",
    version="1.0.0"
)


# 2. Define request structure
class ReportRequest(BaseModel):
    description: str


# 3. Health check endpoint
@app.get("/")
def health_check():
    return {
        "status": "running",
        "service": "HeatSafe KL ML API"
    }


# 4. Report category prediction endpoint
@app.post("/predict/report-category")
def predict_report(request: ReportRequest):

    description = request.description.strip()

    if not description:
        raise HTTPException(
            status_code=400,
            detail="Description cannot be empty."
        )

    return predict_category(description)
