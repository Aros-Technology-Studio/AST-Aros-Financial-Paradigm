# AST Deployment Guide

This document provides comprehensive instructions for deploying the AROS Studio Tokenomics (AST) system, including prerequisites, setup, contract deployment, and testing. It assumes deployment on an Ethereum-compatible testnet (e.g., Sepolia) for development and a production-like environment for mainnet. The guide covers both Solidity contracts (e.g., ArosCoin) and Python-based services (e.g., FastAPI for bridges, AI agents), ensuring integration with the AST architecture (PoT, bridges, governance, etc.). Last updated: 2025-08-17.

## 1. Prerequisites
- **Hardware**: Mac/Linux with 8GB RAM, 4-core CPU, 50GB free disk space.
- **Software**:
  - **Git**: For cloning the repository.
  - **Node.js**: v18+ (LTS) for Hardhat and contract compilation.
  - **Python**: 3.11+ for processing layer, AI agents, and simulations.
  - **Docker**: For containerized services (optional for local dev).
  - **IPFS Node**: For log mirroring (optional, see 13_extra_supervisory_layer/).
  - **PostgreSQL**: 15+ for transaction storage.
  - **Redis**: 7+ for caching and queues.
- **Accounts**:
  - Ethereum wallet (e.g., MetaMask) with testnet ETH (Sepolia).
  - Alchemy/Infura API key for testnet/mainnet access.
  - Optional: Chainalysis or similar for KYC/AML oracle integration.

## 2. Repository Setup
Clone the repository and install dependencies:
```bash
mkdir ~/Projects && cd ~/Projects
git clone https://github.com/aros-studio/aros-tokenomics.git
cd aros-tokenomics
```

### Node.js Dependencies
```bash
npm install --save-dev hardhat @openzeppelin/contracts ethers
npx hardhat --init
```
Choose "Create a JavaScript project" during Hardhat init.

### Python Dependencies
Install Python packages via `pyproject.toml` (create if not exists):
```toml
[build-system]
requires = ["setuptools", "wheel"]
[project]
name = "aros-tokenomics"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn>=0.23.0",
    "sqlalchemy>=2.0.0",
    "alembic>=1.12.0",
    "redis>=5.0.0",
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
    "structlog>=23.0.0",
    "pytest>=7.4.0",
    "pytest-asyncio>=0.21.0",
    "httpx>=0.24.0",
    "black>=23.0.0",
    "isort>=5.12.0",
    "ruff>=0.0.290"
]
[tool.black]
line-length = 100
[tool.isort]
profile = "black"
[tool.ruff]
line-length = 100
```
Install:
```bash
pip install -r requirements.txt
```

### .env Configuration
Create `.env` in the root:
```
POSTGRES_DSN=postgresql+psycopg://user:pass@localhost:5432/ast
REDIS_URL=redis://localhost:6379/0
LOG_LEVEL=INFO
ALCHEMY_API_KEY=your_alchemy_key
KYC_ORACLE_KEY=your_chainalysis_key
```

## 3. Solidity Contracts Deployment
### Configure Hardhat
Edit `hardhat.config.js`:
```javascript
require("@nomicfoundation/hardhat-toolbox");
module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: ["YOUR_PRIVATE_KEY"]
    }
  }
};
```

### Deploy Contracts
Place `token_generation_contract.sol` in `contracts/` (from 01_coin_engine/):
```bash
npx hardhat compile
npx hardhat deploy --network sepolia
```
Verify on Etherscan:
```bash
npx hardhat verify --network sepolia <contract_address>
```

## 4. Python Services Setup
### Processing Layer (FastAPI)
Run the API (from 07_processing_layer/api/app.py):
```bash
uvicorn 07_processing_layer.api.app:app --reload --port 8080
```

### AI Agents (NodeChain)
Start AI agent services (stubbed, from 12_nodechain_ai_agents/):
```bash
python 12_nodechain_ai_agents/py/anomaly_detection_engine.py
```

### Database Setup
Initialize PostgreSQL with Alembic:
```bash
alembic init migrations
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
```

## 5. Testing
### Solidity Tests
Create `test/ArosCoin.js`:
```javascript
const { expect } = require("chai");
describe("ArosCoin", function () {
  it("Should mint tokens", async function () {
    const ArosCoin = await ethers.getContractFactory("ArosCoin");
    const coin = await ArosCoin.deploy();
    await coin.mint(ethers.constants.AddressZero, 1000);
    expect(await coin.totalSupply()).to.equal(1000);
  });
});
```
Run:
```bash
npx hardhat test
```

### Python Tests
Run pytest for processing layer:
```bash
pytest 07_processing_layer/tests/test_tx_queue.py
```

## 6. Production Notes
- **Monitoring**: Use Prometheus/Grafana, integrate with All-Seeing Eye signals (13_extra_supervisory_layer/integrity_signal_emission.md).
- **Security**: Run Slither for contract audits:
  ```bash
  slither contracts/
  ```
- **Scaling**: Deploy observer nodes on AWS/Kubernetes, use Redis cluster for queues.
- **Compliance**: Configure KYC/AML oracle keys in .env.

## 7. Troubleshooting
- **Hardhat errors**: Check `hardhat.config.js` for correct network keys.
- **Python errors**: Ensure Python 3.11+ (`python --version`), reinstall deps.
- **Database issues**: Verify PostgreSQL/Redis running (`psql`, `redis-cli ping`).

## Dependencies
- 01_coin_engine/token_generation_contract.sol
- 07_processing_layer/api/app.py
- 13_extra_supervisory_layer/implementation_guide.md

For additional support, contact AROS Studio at info@arosstudio.com.
