import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { MetricsSnapshot, OrchestratorService } from './orchestrator.service';

/**
 * MetricsController — read-only system metrics plus epoch finalization.
 *
 * `GET /metrics` returns a derived snapshot of the economy; it mutates nothing. Epoch
 * finalization lives here under `/epochs/:epoch/finalize` and delegates to the orchestrator,
 * which pays nodes post-factum by PoT-confirmed participation weight.
 */
@Controller()
export class MetricsController {
    constructor(private readonly orchestrator: OrchestratorService) { }

    /**
     * Return a read-only metrics snapshot: total supply, earned retained value, reserve index,
     * verified process count, current epoch and its pool, NodeChain length, and the Release
     * active flag. The optional `epoch` query selects which epoch's pool to report.
     */
    @Get('metrics')
    async metrics(
        @Query('epoch', new DefaultValuePipe(1), ParseIntPipe) epoch: number,
    ): Promise<MetricsSnapshot> {
        return this.orchestrator.metrics(epoch);
    }

    /**
     * Finalize an epoch post-factum: pay nodes by PoT-confirmed participation weight and
     * allocate the operational margin to AST.
     */
    @Post('epochs/:epoch/finalize')
    async finalize(@Param('epoch', ParseIntPipe) epoch: number) {
        return this.orchestrator.finalizeEpoch(epoch);
    }
}
