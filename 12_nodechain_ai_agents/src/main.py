from fastapi import FastAPI, HTTPException
from .anomaly_detection_engine import AnomalyDetectionAgent
from .meta_learning import MetaLearningAgent
from .schemas import AnalysisRequest, AnalysisResult

app = FastAPI(title="NodeChain AI Agents API", version="1.0")

# Initialize Agent Singleton
agent = AnomalyDetectionAgent(agent_id="ADE-AI-01")
meta_agent = MetaLearningAgent(agent_id="META-AI-01")

@app.get("/")
def health_check():
    return {"status": "active", "agents": [agent.agent_id, meta_agent.agent_id]}

@app.post("/analyze/anomaly", response_model=AnalysisResult)
def analyze_anomaly(request: AnalysisRequest):
    try:
        if request.agent_id != agent.agent_id:
             # Just a logical check, not strictly enforcing 
             pass
        
        result = agent.analyze(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/feedback/submit")
def submit_feedback(audit_id: str, outcome: str):
    """
    Submit feedback for meta-learning.
    outcome: 'CONFIRMED' | 'REVERSED'
    """
    update = meta_agent.process_feedback(audit_id, outcome)
    return {"status": "processed", "update": update}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
