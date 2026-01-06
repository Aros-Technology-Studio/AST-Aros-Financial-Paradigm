import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GovernanceService } from '../src/governance/governance.service';
import { NodeChainService } from '../src/nodechain_engine/nodechain.service';
import { NodeType } from '../src/nodechain_engine/consensus.types';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

async function bootstrap() {
    const logger = new Logger('GovTest');
    const app = await NestFactory.createApplicationContext(AppModule);

    const governance = app.get(GovernanceService);
    const nodeChain = app.get(NodeChainService);

    logger.log('--- STARTING GOVERNANCE TEST ---');

    try {
        // 1. Setup Validator
        const validatorId = randomUUID();
        await nodeChain.registerNode(validatorId, NodeType.VALIDATOR, '127.0.0.1');
        logger.log(`[1] Registered Validator: ${validatorId}`);

        // 2. Create First Proposal
        logger.log('[2] Creating Proposal 1...');
        const p1 = await governance.createProposal('Prop 1', 'Test Hash', validatorId);
        logger.log(`    Created: ${p1.id}`);

        if (!p1.hash) {
            throw new Error('Proposal 1 missing hash!');
        }
        logger.log(`    Hash Verified: ${p1.hash}`);

        // 3. Try to Create Second Proposal (Should Fail Rate Limit)
        logger.log('[3] Attempting Proposal 2 (Should Fail)...');
        try {
            await governance.createProposal('Prop 2', 'Should Fail', validatorId);
            logger.error('    FAILED: Proposal 2 was created but should have been blocked by rate limit!');
        } catch (e: any) {
            if (e.message.includes('User already has an active proposal')) {
                logger.log(`    SUCCESS: Blocked by Active Limit. Error: ${e.message}`);
            } else {
                throw e;
            }
        }

    } catch (error: any) {
        logger.error(`TEST FAILED: ${error.message}`);
    } finally {
        await app.close();
    }
}

bootstrap();
