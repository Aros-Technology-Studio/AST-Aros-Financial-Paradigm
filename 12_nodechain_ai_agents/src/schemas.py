from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

class TransactionData(BaseModel):
    tx_hash: str
    sender: str
    amount: float
    timestamp: int
    metadata: Optional[Dict[str, Any]] = None

class ValidatorData(BaseModel):
    validator_id: str
    uptime_score: float
    missed_blocks: int
    total_validations: int

class AnalysisRequest(BaseModel):
    agent_id: str
    transaction: Optional[TransactionData] = None
    validator: Optional[ValidatorData] = None

class AnalysisResult(BaseModel):
    agent_id: str
    timestamp: int
    risk_score: float = Field(..., ge=0.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    decision: str
    details: Dict[str, Any]
