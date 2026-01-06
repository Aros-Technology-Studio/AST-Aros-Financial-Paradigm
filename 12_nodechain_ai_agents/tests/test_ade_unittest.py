import unittest
import time
import sys
import os

# Add src to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../')))

from src.anomaly_detection_engine import AnomalyDetectionAgent
from src.schemas import AnalysisRequest, TransactionData, ValidatorData

class TestAnomalyDetection(unittest.TestCase):
    def test_ade_initialization(self):
        agent = AnomalyDetectionAgent("TEST-ADE")
        self.assertEqual(agent.agent_id, "TEST-ADE")
        self.assertIsNotNone(agent.model)

    def test_ade_transaction_analysis_normal(self):
        agent = AnomalyDetectionAgent("TEST-ADE")
        tx = TransactionData(
            tx_hash="0x123",
            sender="Alice",
            amount=100.0,
            timestamp=int(time.time())
        )
        request = AnalysisRequest(agent_id="TEST-ADE", transaction=tx)
        result = agent.analyze(request)
        
        self.assertTrue(result.risk_score >= 0.0)
        self.assertTrue(result.risk_score <= 1.0)

    def test_ade_transaction_analysis_anomaly(self):
        agent = AnomalyDetectionAgent("TEST-ADE")
        tx = TransactionData(
            tx_hash="0x999",
            sender="Hacker",
            amount=10000.0,
            timestamp=int(time.time())
        )
        request = AnalysisRequest(agent_id="TEST-ADE", transaction=tx)
        result = agent.analyze(request)
        
        # IsolationForest varies, but we expect high risk for outlier
        self.assertEqual(result.decision, "ANOMALY")

    def test_ade_validator_rule(self):
        agent = AnomalyDetectionAgent("TEST-ADE")
        val = ValidatorData(
            validator_id="V-1",
            uptime_score=90.0,
            missed_blocks=10,
            total_validations=100
        )
        request = AnalysisRequest(agent_id="TEST-ADE", validator=val)
        result = agent.analyze(request)
        
        self.assertEqual(result.decision, "ANOMALY")
        self.assertEqual(result.risk_score, 0.8)

if __name__ == '__main__':
    unittest.main()
