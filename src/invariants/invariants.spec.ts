import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { PotService } from '../pot/pot.service';
import { EmissionService } from '../emission/emission.service';
import { StateRecordingService } from '../state-recording/state-recording.service';
import { ReleasePhase } from '../release/entities/release-phase.entity';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { OrchestratorService } from '../orchestrator/orchestrator.service';

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
 * Model-1 invariants suite (I1–I10 of AST_RULES.yaml), asserted against the real production
 * services. It boots the full wired stack via OrchestratorModule over in-memory SQLite, runs
 * complete processes through OrchestratorService, and proves each invariant by exercising the
 * actual code path — the same checks the reference `invariants.test.ts` makes, but against the
 * NestJS services rather than the reference core.
 *
 * Each `it('I…')` maps one-to-one to an invariant in AST_RULES.yaml. `dropSchema: true` gives
 * every test a clean database and a fresh chain so determinism and append-only claims hold.
 */
describe('Model-1 invariants (I1–I10) over production services', () => {
    /** Build a fresh, fully-wired stack on its own in-memory database (DRY bootstrap). */
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
    let pot: PotService;
    let emission: EmissionService;
    let recording: StateRecordingService;

    beforeEach(async () => {
        moduleRef = await buildStack();
        orchestrator = moduleRef.get(OrchestratorService);
        coin = moduleRef.get(ArosCoinService);
        chain = moduleRef.get(NodeChainService);
        eye = moduleRef.get(AllSeeingEyeService);
        pot = moduleRef.get(PotService);
        emission = moduleRef.get(EmissionService);
        recording = moduleRef.get(StateRecordingService);
    });

    afterEach(async () => {
        await moduleRef.close();
    });

    // I1: value (mint) exists only when PoT verified === 1. An inadmissible process is rejected
    // before any work, so it mints nothing and leaves supply flat.
    it('I1: inadmissible/unverified process mints no value', async () => {
        const supplyBefore = await coin.totalSupply();

        const result = await orchestrator.runProcess({
            processId: 'I1-P', amount: 400, type: 'transfer', admissible: false, epoch: 1,
        });

        expect(result.verified).toBe(0);
        expect(result.reason).toBe('inadmissible');
        expect(result.minted).toBe(0);
        expect(result.fee).toBe(0);
        expect(await coin.totalSupply()).toBe(supplyBefore);
        expect(await coin.processNet()).toBe(0);
    });

    // I2: every emission is bound to a confirmed process. Asking Emission.mint for a process with
    // no verified verdict throws; emit returns unauthorized with nothing minted.
    it('I2: emission without a confirmed-process verdict is refused', async () => {
        // No verdict recorded for this process id -> mint must throw, emit stays unauthorized.
        await expect(emission.mint('I2-unknown', 100)).rejects.toThrow();

        const supplyBefore = await coin.totalSupply();
        const emit = await emission.emit('I2-unknown', 100);
        expect(emit.authorized).toBe(false);
        expect(emit.minted).toBe(0);
        expect(await coin.totalSupply()).toBe(supplyBefore);
    });

    // I3: every significant event is recorded in NodeChain. A full verified run records the whole
    // lifecycle, and an incomplete (unrecorded) process fails the PoT completeness gate so no
    // value can advance past it.
    it('I3: significant events are recorded; missing events block advancement', async () => {
        await orchestrator.runProcess({
            processId: 'I3-P', amount: 300, type: 'settlement', admissible: true, epoch: 1,
        });

        const view = await orchestrator.getProcess('I3-P');
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

        // Completeness gate: a process whose required events were never recorded does not verify,
        // so emission cannot advance for it.
        await recording.capture('I3-incomplete', 'initiation', { amount: 100 });
        await recording.capture('I3-incomplete', 'task_assignment', { nodes: [] });
        // stage_transition and execution_complete are intentionally omitted.
        const verdict = await pot.verify('I3-incomplete');
        expect(verdict.verified).toBe(0);

        const supplyBefore = await coin.totalSupply();
        const emit = await emission.emit('I3-incomplete', 100);
        expect(emit.authorized).toBe(false);
        expect(await coin.totalSupply()).toBe(supplyBefore);
    });

    // I4: determinism. Two independent fresh stacks fed the same input yield identical supply
    // and identical metrics.
    it('I4: identical input on two fresh stacks yields identical supply and metrics', async () => {
        const run = async (mod: TestingModule) => {
            const svc = mod.get(OrchestratorService);
            const ledger = mod.get(ArosCoinService);
            await svc.runProcess({ processId: 'D-1', amount: 700, type: 'transfer', admissible: true, epoch: 1 });
            await svc.runProcess({ processId: 'D-2', amount: 200, type: 'settlement', admissible: true, epoch: 1 });
            await svc.runProcess({ processId: 'D-3', amount: 300, type: 'transfer', admissible: false, epoch: 1 });
            await svc.finalizeEpoch(1);
            return { metrics: await svc.metrics(1), supply: await ledger.totalSupply() };
        };

        const stackA = await buildStack();
        const stackB = await buildStack();
        try {
            const a = await run(stackA);
            const b = await run(stackB);
            expect(a.metrics).toEqual(b.metrics);
            expect(a.supply).toBe(b.supply);
        } finally {
            await stackA.close();
            await stackB.close();
        }
    });

    // I5: earned value is retained; the process part is minted then burned within the same
    // confirmed process, so its net contribution returns to 0.
    it('I5: process part nets to 0 (processMinted == processBurned) after a verified run', async () => {
        const result = await orchestrator.runProcess({
            processId: 'I5-P', amount: 500, type: 'transfer', admissible: true, epoch: 1,
        });

        expect(result.verified).toBe(1);
        expect(result.minted).toBe(500);
        const snap = await coin.snapshot();
        expect(snap.processMinted).toBe(snap.processBurned);
        expect(await coin.processNet()).toBe(0);
    });

    // I6: totalSupply is derivable from history and equals earnedRetained after burns. Before any
    // epoch finalize the process part has netted out, so supply is exactly the retained value.
    it('I6: totalSupply equals earnedRetained after burns (derivable from history)', async () => {
        await orchestrator.runProcess({ processId: 'I6-A', amount: 500, type: 'transfer', admissible: true, epoch: 1 });
        await orchestrator.runProcess({ processId: 'I6-B', amount: 900, type: 'settlement', admissible: true, epoch: 1 });

        // Process parts burned -> totalSupply == retained (which is 0 until finalize).
        expect(await coin.totalSupply()).toBeCloseTo(await coin.retained(), 9);

        await orchestrator.finalizeEpoch(1);
        const retained = await coin.retained();
        expect(await coin.totalSupply()).toBeCloseTo(retained, 9);
        expect(retained).toBeGreaterThan(0);
    });

    // I7: the commission pool reconciles per epoch — Σ(payments) + operationalMargin == Σ(fees).
    it('I7: epoch finalization reconciles the commission pool', async () => {
        await orchestrator.runProcess({ processId: 'I7-A', amount: 500, type: 'transfer', admissible: true, epoch: 1 });
        await orchestrator.runProcess({ processId: 'I7-B', amount: 900, type: 'settlement', admissible: true, epoch: 1 });

        const result = await orchestrator.finalizeEpoch(1);
        expect(result.reconciled).toBe(true);
        expect(result.paid + result.operationalMargin).toBeCloseTo(result.totalFees, 9);
    });

    // I8: NodeChain is append-only and hash-continuous. A clean chain reconstructs; a tampered
    // snapshot breaks reconstruction at the tampered position.
    it('I8: NodeChain reconstructs when intact and breaks when tampered', async () => {
        await orchestrator.runProcess({ processId: 'I8-P', amount: 600, type: 'transfer', admissible: true, epoch: 1 });

        const intact = await chain.reconstruct();
        expect(intact.ok).toBe(true);

        // Tamper with a persisted snapshot payload through the repository, bypassing the
        // append-only public API, to prove reconstruction detects the break.
        const repo = moduleRef.get<Repository<ExecutionSnapshot>>(
            getRepositoryToken(ExecutionSnapshot),
        );
        const target = await repo.findOne({ where: { sequenceId: 2 } });
        expect(target).not.toBeNull();
        target!.payload = { tampered: true };
        await repo.save(target!);

        const broken = await chain.reconstruct();
        expect(broken.ok).toBe(false);
        expect(broken.brokenAt).toBe(2);
    });

    // I9: node influence flows from work + reputation, not from a held balance. The persisted
    // entity carries work-quality metrics only and exposes no stake / stakedBalance field.
    it('I9: node influence derives from work+reputation, with no stake field', async () => {
        await orchestrator.runProcess({ processId: 'I9-P', amount: 500, type: 'transfer', admissible: true, epoch: 1 });

        const nodes = moduleRef.get((await import('../nodes/nodes.service')).NodesService);
        const list = await nodes.list();
        expect(list.length).toBeGreaterThan(0);

        const node = list[0] as unknown as Record<string, unknown>;
        expect('stake' in node).toBe(false);
        expect('stakedBalance' in node).toBe(false);
        expect('stakeFreeze' in node).toBe(false);

        // Weight is the deterministic function of reputation and uptime (work + availability).
        expect(node['weight']).toBeCloseTo((node['reputation'] as number) * (node['uptime'] as number), 9);
    });

    // I10: the All-Seeing Eye is passive — observing (compareSupply / verifyChain) does not change
    // supply or any other module's state, and a healthy run logs no new anomaly.
    it('I10: Eye observation does not change supply or state', async () => {
        await orchestrator.runProcess({ processId: 'I10-P', amount: 600, type: 'transfer', admissible: true, epoch: 1 });

        const supplyBefore = await coin.totalSupply();
        const netBefore = await coin.processNet();
        const chainLenBefore = (await chain.list()).length;
        const logBefore = (await eye.getLog()).length;

        await eye.compareSupply(await coin.supplyView());
        await eye.verifyChain();

        expect(await coin.totalSupply()).toBe(supplyBefore);
        expect(await coin.processNet()).toBe(netBefore);
        // The Eye never appends to NodeChain and logs nothing new on a consistent system.
        expect((await chain.list()).length).toBe(chainLenBefore);
        expect((await eye.getLog()).length).toBe(logBefore);
        // The Eye's own ledger remains hash-continuous.
        expect((await eye.verifyLog()).ok).toBe(true);
    });
});
