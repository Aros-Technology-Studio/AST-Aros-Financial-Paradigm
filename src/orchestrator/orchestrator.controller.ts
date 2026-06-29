import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RunProcessDto } from './dto/run-process.dto';
import { OrchestratorService, RunProcessResult } from './orchestrator.service';

/**
 * OrchestratorController — the thin HTTP surface over the process lifecycle.
 *
 * It delegates every operation to OrchestratorService and performs no business logic of its
 * own. The request body for a process run is validated by the global ValidationPipe against
 * RunProcessDto before the lifecycle is driven.
 */
@Controller('processes')
export class OrchestratorController {
    constructor(private readonly orchestrator: OrchestratorService) { }

    /**
     * Run a process through the full AST lifecycle. The validated body supplies the process
     * identity, value, type, admissibility, and optional explicit node assignment / epoch.
     */
    @Post()
    async run(@Body() dto: RunProcessDto): Promise<RunProcessResult> {
        return this.orchestrator.runProcess(dto);
    }

    /**
     * Read the recorded PoT verdict and the NodeChain events for a process. Read-only: it
     * neither issues a verdict nor records anything.
     */
    @Get(':id')
    async get(@Param('id') id: string) {
        return this.orchestrator.getProcess(id);
    }
}
