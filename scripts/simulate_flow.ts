
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
import { GovernanceService, ProposalImpactLevel } from '../src/governance/governance.service';
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

        // Step 3: Governance & Price Check
        logger.log('[3] Governance: Creating Proposal...');
        const priceBefore = (await app.get('TokenomicsService').getCurrentPrice()).toFixed(6);
        logger.log(`    Current Price BEFORE activity: ${priceBefore}`);

        const proposal = await governance.createProposal('Increase Fees', 'Raise fees by 1%', validatorId, ProposalImpactLevel.MEDIUM);
        logger.log(`    Proposal Created: ${proposal.id}`);

        logger.log('[3] Governance: Voting...');
        await governance.castVote(proposal.id, validatorId, 'YES');
        const tally = await governance.tallyVotes(proposal.id);
        logger.log(`    Vote Tally: Yes=${tally.yes}, No=${tally.no}`);

        // Step 4: Fee Distribution (Epoch)
        logger.log('[4] Fee Distribution: Triggering Epoch...');
        await fees.triggerEpochCycle();
        const currentEpoch = await fees.getCurrentEpoch();
        logger.log(`    New Active Epoch: ${currentEpoch?.epochNumber}`);

        // Step 5: Burn (Withdrawal)
        const priceMid = (await app.get('TokenomicsService').getCurrentPrice()).toFixed(6);
        logger.log(`    Price MIDDLE check: ${priceMid}`);

        logger.log('[5] Simulating Token Burn (Withdrawal)...');
        // Burn 500 tokens from validator
        const burnResult = await token.burn('500', validatorId, 'BANK_DETAILS_ABC');

        const priceFinal = (await app.get('TokenomicsService').getCurrentPrice()).toFixed(6);
        logger.log(`    Burn Success! TxHash: ${burnResult.txHash}`);
        logger.log(`    Bank Payout Ref: ${burnResult.bankTxId}`);
        logger.log(`    FINAL PRICE: ${priceFinal}`);

        if (parseFloat(priceFinal) > parseFloat(priceBefore)) {
            logger.log('*** VERIFICATION SUCCESS: Price Appreciated! ***');
        } else {
            logger.warn('*** VERIFICATION WARNING: Price did not appreciate. ***');
        }

        logger.log('--- SIMULATION COMPLETED SUCCESSFULLY ---');

    } catch (error) {
        if (error instanceof Error) {
            logger.error(`SIMULATION FAILED: ${error.message}`);
            logger.error(error.stack);
        } else {
            logger.error(`SIMULATION FAILED: ${String(error)}`);
        }
    } finally {
        await app.close();
    }
}

bootstrap();
