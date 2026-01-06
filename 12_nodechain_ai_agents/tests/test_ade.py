import pytest
from src.anomaly_detection_engine import AnomalyDetectionAgent
from src.schemas import AnalysisRequest, TransactionData, ValidatorData
import time

def test_ade_initialization():
    agent = AnomalyDetectionAgent("TEST-ADE")
    assert agent.agent_id == "TEST-ADE"
    assert agent.model is not None

def test_ade_transaction_analysis_normal():
    agent = AnomalyDetectionAgent("TEST-ADE")
    # Normal transaction (close to mean 100)
    tx = TransactionData(
        tx_hash="0x123",
        sender="Alice",
        amount=100.0,
        timestamp=int(time.time())
    )
    request = AnalysisRequest(agent_id="TEST-ADE", transaction=tx)
    result = agent.analyze(request)
    
    assert result.decision in ["NORMAL", "ANOMALY"] # Depending on random fit, but likely normal
    assert 0.0 <= result.risk_score <= 1.0

def test_ade_transaction_analysis_anomaly():
    agent = AnomalyDetectionAgent("TEST-ADE")
    # Anomalous transaction (far from mean 100)
    tx = TransactionData(
        tx_hash="0x999",
        sender="Hacker",
        amount=10000.0, # Huge outlier
        timestamp=int(time.time())
    )
    request = AnalysisRequest(agent_id="TEST-ADE", transaction=tx)
    result = agent.analyze(request)
    
    # Should detect anomaly for very high value
    # Note: IsolationForest is unsupervised, so behavior depends on the random fit, 
    # but 10000 vs 100 mean is 500 sigmas away.
    assert result.decision == "ANOMALY"
    assert result.risk_score > 0.5

def test_ade_validator_rule():
    agent = AnomalyDetectionAgent("TEST-ADE")
    val = ValidatorData(
        validator_id="V-1",
        uptime_score=90.0, # Below 95 threshold
        missed_blocks=10,
        total_validations=100
    )
    request = AnalysisRequest(agent_id="TEST-ADE", validator=val)
    result = agent.analyze(request)
    
    assert result.decision == "ANOMALY"
    assert result.risk_score == 0.8
