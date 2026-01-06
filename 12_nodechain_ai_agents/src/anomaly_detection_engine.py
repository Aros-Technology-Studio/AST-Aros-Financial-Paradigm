import numpy as np
from sklearn.ensemble import IsolationForest
from .agent_base import BaseAgent
from .schemas import AnalysisRequest, AnalysisResult
import time

class AnomalyDetectionAgent(BaseAgent):
    def initialize(self):
        # In a real scenario, we'd load a pre-trained model path.
        # For this prototype, we initialize a fresh model and fit it on dummy data to have it 'ready'.
        self.model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
        
        # Fit on some dummy "normal" data to initialize the estimator
        # representing normal tx amounts/frequency
        X_dummy = np.random.normal(loc=100, scale=20, size=(200, 2)) 
        self.model.fit(X_dummy)
        print(f"[{self.agent_id}] Initialized and fitted with dummy baseline.")

    def analyze(self, request: AnalysisRequest) -> AnalysisResult:
        """
        Analyze transaction for anomalies. 
        Input features: [amount, timestamp_delta] (simplified)
        """
        risk_score = 0.0
        decision = "NORMAL"
        details = {}

        if request.transaction:
            # Extract features (simplified)
            # We treat 'amount' as feature 1.
            # We might treat 'timestamp % 86400' as feature 2 (time of day) or similar.
            features = np.array([[request.transaction.amount, 0]]) # Second dim dummy for now
            
            # Predict returns -1 for outlier, 1 for inlier
            pred = self.model.predict(features)[0]
            # Score samples gives negative anomaly score. Lower = more abnormal.
            score = self.model.score_samples(features)[0]

            # Normalize score to 0..1 risk
            # IsolationForest score_samples returns approx -0.5 to 0.5. 
            # We map lower values to HIGHER risk.
            # Simple heuristic mapping for prototype
            risk_score = 1.0 if pred == -1 else 0.1
            
            decision = "ANOMALY" if pred == -1 else "NORMAL"
            details = {"raw_score": float(score), "prediction": int(pred)}

        elif request.validator:
            # Simple rule-based check for validator
            if request.validator.uptime_score < 95.0:
                risk_score = 0.8
                decision = "ANOMALY"
                details = {"reason": "Low Uptime"}
            else:
                risk_score = 0.05
                details = {"reason": "Healthy"}

        result = AnalysisResult(
            agent_id=self.agent_id,
            timestamp=int(time.time()),
            risk_score=risk_score,
            confidence=0.9,
            decision=decision,
            details=details
        )
        
        self.log_audit(result)
        return result
