
/**
 * End-to-End Simulation Script for AST Aros Financial Paradigm
 * 
 * Flow:
 * 1. Register a Validator Node.
 * 2. Simulate Fiat Deposit (Bank -> AST) -> Mints Tokens.
 * 3. Governance: Create Proposal & Vote.
 * 4. Fee Distribution: Trigger Epoch to distribute rewards.
 * 5. Simulate Token Burn (AST -> Bank) -> Requests Payout.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

// Services
import { NodeChainService } from '../src/nodechain_engine/nodechain.service';
import { BridgeService } from '../src/bridge/bridge.service';
import { TokenService } from '../src/token/token.service';
import { FeeDistributionService } from '../src/fee_distribution/fee_distribution.service';
import { GovernanceService } from '../src/governance/governance.service';
import { NodeType } from '../src/nodechain_engine/consensus.types';
import { Logger } from '@nestjs/common';

async function bootstrap() {
    const logger = new Logger('Simulation');
    const app = await NestFactory.createApplicationContext(AppModule);

    // Get Services
    const nodeChain = app.get(NodeChainService);
    const bridge = app.get(BridgeService);
    const token = app.get(TokenService);
    const fees = app.get(FeeDistributionService);
    const governance = app.get(GovernanceService);

    logger.log('--- STARTING SIMULATION ---');

    try {
        // Step 1: Register Validator
        logger.log('[1] Registering Validator Node...');
        const validatorId = 'VALIDATOR_SIM_01';
        await nodeChain.registerNode(validatorId, NodeType.VALIDATOR, '127.0.0.1');

        // Step 2: Fiat Deposit (Mint)
        logger.log('[2] Simulating Fiat Deposit...');
        const depositPayload = {
            transactionId: `DEPOSIT_${Date.now()}`,
            amount: 1000,
            currency: 'USD',
            userWallet: validatorId // Minting to validator for simplicity
        };
        const mintResult = await bridge.handleFiatDepositWebhook(depositPayload, 'super_secret_bb_key_123');
        logger.log(`    Mint Success! TxHash: ${mintResult.txHash}`);

        // Step 3: Governance
        logger.log('[3] Governance: Creating Proposal...');
        const proposal = await governance.createProposal('Increase Fees', 'Raise fees by 1%', validatorId);
        logger.log(`    Proposal Created: ${proposal.id}`);

        logger.log('[3] Governance: Voting...');
        await governance.castVote(proposal.id, validatorId, 'YES');
        const tally = await governance.tallyVotes(proposal.id);
        logger.log(`    Vote Tally: Yes=${tally.yes}, No=${tally.no}`);

        // Step 4: Fee Distribution (Epoch)
        logger.log('[4] Fee Distribution: Triggering Epoch...');
        // Force epoch cycle. Logic will try to distribute fees if transactions exist. 
        // Our simulated mint transaction might generate fees if fee logic applies, or we assume zero fees for this test but check that it runs.
        await fees.triggerEpochCycle();
        const currentEpoch = await fees.getCurrentEpoch();
        logger.log(`    New Active Epoch: ${currentEpoch?.epochNumber}`);

        // Step 5: Burn (Withdrawal)
        logger.log('[5] Simulating Token Burn (Withdrawal)...');
        // Burn 500 tokens from validator
        const burnResult = await token.burn('500', validatorId, 'BANK_DETAILS_ABC');
        logger.log(`    Burn Success! TxHash: ${burnResult.txHash}`);
        logger.log(`    Bank Payout Ref: ${burnResult.bankTxId}`);

        logger.log('--- SIMULATION COMPLETED SUCCESSFULLY ---');

    } catch (error: any) {
        logger.error(`SIMULATION FAILED: ${error.message}`);
        logger.error(error.stack);
    } finally {
        await app.close();
    }
}

bootstrap();
