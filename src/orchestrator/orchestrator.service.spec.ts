import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { OversightLogEntry } from '../all-seeing-eye/entities/oversight-log-entry.entity';
import { AllSeeingEyeService } from '../all-seeing-eye/all-seeing-eye.service';
import { ArosCoinLedger } from '../aroscoin/entities/aroscoin-ledger.entity';
import { ArosCoinService } from '../aroscoin/aroscoin.service';
import { Epoch } from '../commission/entities/epoch.entity';
import { NodeEntity } from '../nodes/entities/node.entity';
import { ExecutionSnapshot } from '../nodechain/entities/execution-snapshot.entity';
import { NodeChainService } from '../nodechain/nodechain.service';
import { PotVerdict } from '../pot/entities/pot-verdict.entity';
import { ReleasePhase } from '../release/entities/release-phase.entity';
import { OrchestratorModule } from './orchestrator.module';
import { OrchestratorService } from './orchestrator.service';

/** Every entity the orchestrated stack persists, registered for the in-memory SQLite store. */
const ENTITIES = [
    ExecutionSnapshot,
    PotVerdict,
    ArosCoinLedger,
    Epoch,
    NodeEntity,
    ReleasePhase,
    OversightLogEntry,
];

/**
 * End-to-end specs for the ProcessOrchestrator over a real TypeORM stack backed by in-memory
 * SQLite. They prove the full lifecycle composes correctly and that the project invariants
 * hold across modules: the PoT value gate (I1/I2/P7), append-only recording (I3), determinism
 * (I4), process-part net-zero (I5), and the passive All-Seeing Eye (I10).
 *
 * `dropSchema: true` gives every test a clean database and a fresh chain.
 */
describe('OrchestratorService (e2e lifecycle)', () => {
    /** Build a fresh, fully-wired stack on its own in-memory database. */
    async function buildStack(): Promise<TestingModule> {
        return Test.createTestingModule({
            imports: [
                CommonModule,
                TypeOrmModule.forRoot({
                    type: 'sqlite',
                    database: ':memory:',
                    dropSchema: true,
                    entities: ENTITIES,
                    synchronize: true,
                    logging: false,
                }),
                OrchestratorModule,
            ],
        }).compile();
    }

    let moduleRef: TestingModule;
    let orchestrator: OrchestratorService;
    let coin: ArosCoinService;
    let chain: NodeChainService;
    let eye: AllSeeingEyeService;

    beforeEach(async () => {
        moduleRef = await buildStack();
        orchestrator = moduleRef.get(OrchestratorService);
        coin = moduleRef.get(ArosCoinService);
        chain = moduleRef.get(NodeChainService);
        eye = moduleRef.get(AllSeeingEyeService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I1/I5: a fully-recorded process verifies; the process part mints then burns (net 0), so
    // total supply rises only by earned value; the reserve index grows from confirmed volume.
    it('I1/I5/I-RS-4: a verified process nets process part to 0 and grows the reserve', async () => {
        const supplyBefore = await coin.totalSupply();

        const result = await orchestrator.runProcess({
            processId: 'P-1', amount: 500, type: 'transfer', admissible: true, epoch: 1,
        });

        expect(result.verified).toBe(1);
        expect(result.minted).toBe(500);

        // Process part nets to zero: minted == burned, so totalSupply is unchanged by emission
        // before any earned value is paid (I5/I6). Earned value enters only at epoch finalize.
        expect(await coin.processNet()).toBe(0);
        expect(await coin.totalSupply()).toBe(supplyBefore);

        // Reserve index grows from the confirmed-work volume recorded on chain (I-RS-4).
        expect(result.reserveIndex).toBeGreaterThan(0);

        // After finalize, supply rises only by the earned (retained) value.
        await orchestrator.finalizeEpoch(1);
        const retained = await coin.retained();
        expect(await coin.totalSupply()).toBeCloseTo(retained, 9);
        expect(retained).toBeGreaterThan(0);
    });

    // I3: every significant event is appended to NodeChain, and the chain reconstructs cleanly.
    it('I3/I8: lifecycle events appear in NodeChain and the chain reconstructs', async () => {
        await orchestrator.runProcess({
            processId: 'P-2', amount: 300, type: 'settlement', admissible: true, epoch: 1,
        });

        const view = await orchestrator.getProcess('P-2');
        const recorded = view.events.map((e) => e.eventType);
        expect(recorded).toEqual(
            expect.arrayContaining([
                'initiation',
                'task_assignment',
                'stage_transition',
                'execution_complete',
                'pot.verified',
                'emission.minted',
                'emission.burned',
            ]),
        );

        const reconstruct = await chain.reconstruct();
        expect(reconstruct.ok).toBe(true);
    });

    // I1/I2/P7: an inadmissible process produces no value — nothing minted, no fee, supply flat.
    it('I1/P7: an inadmissible process mints nothing and leaves supply unchanged', async () => {
        const supplyBefore = await coin.totalSupply();

        const result = await orchestrator.runProcess({
            processId: 'P-3', amount: 400, type: 'transfer', admissible: false, epoch: 1,
        });

        expect(result.verified).toBe(0);
        expect(result.reason).toBe('inadmissible');
        expect(result.minted).toBe(0);
        expect(result.fee).toBe(0);
        expect(await coin.totalSupply()).toBe(supplyBefore);
        expect(await coin.processNet()).toBe(0);
    });

    // I1/I2/P7: an incomplete (admissible but never fully executed) process fails verification,
    // so no emission and no payment occur even though the process was admitted.
    it('I1/I2/P7: an incomplete process verifies to 0 with no emission and no payment', async () => {
        // Drive only the early steps by recording an admissible run whose execution we block:
        // an explicit empty assignment still records, but we simulate an unverifiable process by
        // running with no nodes and asserting the gate. Instead, exercise the gate directly via
        // a process whose required events are incomplete by using the PoT path.
        const recording = moduleRef.get(
            // StateRecordingService is provided transitively; fetch it by token-free class.
            (await import('../state-recording/state-recording.service')).StateRecordingService,
        );
        const pot = moduleRef.get((await import('../pot/pot.service')).PotService);
        const emission = moduleRef.get((await import('../emission/emission.service')).EmissionService);

        await recording.capture('P-4', 'initiation', { amount: 100 });
        await recording.capture('P-4', 'task_assignment', { nodes: [] });
        // stage_transition and execution_complete are intentionally omitted.

        const verdict = await pot.verify('P-4');
        expect(verdict.verified).toBe(0);

        const supplyBefore = await coin.totalSupply();
        const emit = await emission.emit('P-4', 100);
        expect(emit.authorized).toBe(false);
        expect(emit.minted).toBe(0);
        expect(await coin.totalSupply()).toBe(supplyBefore);
    });

    // I4: the same input on two independent fresh stacks yields identical metrics.
    it('I4: deterministic — identical input yields identical metrics on fresh stacks', async () => {
        const run = async (mod: TestingModule) => {
            const svc = mod.get(OrchestratorService);
            await svc.runProcess({ processId: 'D-1', amount: 700, type: 'transfer', admissible: true, epoch: 1 });
            await svc.runProcess({ processId: 'D-2', amount: 200, type: 'settlement', admissible: true, epoch: 1 });
            await svc.finalizeEpoch(1);
            return svc.metrics(1);
        };

        const stackA = await buildStack();
        const stackB = await buildStack();
        try {
            const metricsA = await run(stackA);
            const metricsB = await run(stackB);
            expect(metricsA).toEqual(metricsB);
        } finally {
            await stackA.close();
            await stackB.close();
        }
    });

    // I10: the All-Seeing Eye observed throughout but changed no other state. Supply after a
    // verified process equals what emission/commission produced — never what the Eye logged.
    it('I10: the Eye observes passively and does not change supply', async () => {
        await orchestrator.runProcess({
            processId: 'P-5', amount: 600, type: 'transfer', admissible: true, epoch: 1,
        });

        const logBefore = (await eye.getLog()).length;
        const supplyBefore = await coin.totalSupply();

        // Eye operations: comparing supply and verifying the chain only write to the Eye's own
        // ledger; they must not move the economy's supply.
        await eye.compareSupply(await coin.supplyView());
        await eye.verifyChain();

        expect(await coin.totalSupply()).toBe(supplyBefore);
        // The Eye recorded only when it detected an anomaly; a consistent system logs nothing
        // new from compareSupply/verifyChain, so its ledger did not grow on a healthy run.
        expect((await eye.getLog()).length).toBe(logBefore);

        // The Eye self-audit confirms its own append-only ledger is intact.
        expect((await eye.verifyLog()).ok).toBe(true);
    });

    // I7: the epoch pool reconciles after finalize: Σ(payments) + margin == Σ(fees).
    it('I7: epoch finalization reconciles the pool', async () => {
        await orchestrator.runProcess({ processId: 'R-1', amount: 500, type: 'transfer', admissible: true, epoch: 1 });
        await orchestrator.runProcess({ processId: 'R-2', amount: 900, type: 'settlement', admissible: true, epoch: 1 });

        const result = await orchestrator.finalizeEpoch(1);
        expect(result.reconciled).toBe(true);

        const metrics = await orchestrator.metrics(1);
        expect(metrics.verifiedProcessCount).toBe(2);
        expect(metrics.nodeChainLength).toBeGreaterThan(0);
    });

    // An explicit node assignment is honored as given, rather than the default roster.
    it('honors an explicit node assignment', async () => {
        const nodes = moduleRef.get((await import('../nodes/nodes.service')).NodesService);
        await nodes.register('chosen-1', 'worker');
        await nodes.register('chosen-2', 'worker');

        const result = await orchestrator.runProcess({
            processId: 'E-1', amount: 100, type: 'transfer', admissible: true,
            nodeIds: ['chosen-1', 'chosen-2'], epoch: 1,
        });

        expect(result.assignedNodes).toEqual(['chosen-1', 'chosen-2']);
    });

    // A run that omits the epoch defaults to the first epoch.
    it('defaults the fee to the first epoch when none is given', async () => {
        await orchestrator.runProcess({ processId: 'DEF-1', amount: 100, type: 'transfer', admissible: true });
        const metrics = await orchestrator.metrics();
        expect(metrics.currentEpoch).toBe(1);
        expect(metrics.epochPool).toBeGreaterThan(0);
    });

    // metrics() on a fresh stack reports the empty economy without an epoch row.
    it('reports a zeroed snapshot on a fresh system', async () => {
        const metrics = await orchestrator.metrics();
        expect(metrics.totalSupply).toBe(0);
        expect(metrics.epochPool).toBe(0);
        expect(metrics.verifiedProcessCount).toBe(0);
        expect(metrics.releaseActive).toBe(false);
    });

    // The Release maturity thresholds are exposed read-only for the readiness probe.
    it('exposes the Release maturity thresholds', () => {
        const thresholds = orchestrator.releaseThresholds;
        expect(typeof thresholds.threshold).toBe('number');
        expect(typeof thresholds.velocityTarget).toBe('number');
    });

    // Defensive guard: should a verdict come back unverified after admission, the run records a
    // rejected final status and produces no value (I1/I2/P7). Forcing the verdict exercises the
    // post-admission unverified path that a fully-recorded run never reaches on its own.
    it('I1/P7: an unverified verdict after admission produces no value', async () => {
        const pot = moduleRef.get((await import('../pot/pot.service')).PotService);
        jest.spyOn(pot, 'verify').mockResolvedValue({ verified: 0, reasons: ['forced'], snapshotSequenceId: 0 });

        const supplyBefore = await coin.totalSupply();
        const result = await orchestrator.runProcess({
            processId: 'U-1', amount: 100, type: 'transfer', admissible: true, epoch: 1,
        });

        expect(result.verified).toBe(0);
        expect(result.reason).toBe('unverified');
        expect(result.minted).toBe(0);
        expect(result.fee).toBe(0);
        expect(result.events).toContain('final_status');
        expect(await coin.totalSupply()).toBe(supplyBefore);
    });
});
