import { Controller, Get } from '@nestjs/common';
import { NodeChainService } from './nodechain.service';

@Controller('nodechain')
export class NodeChainController {
    constructor(private readonly nodeChainService: NodeChainService) { }

    @Get('nodes')
    async getNodes() {
        return this.nodeChainService.getConnectedNodes();
    }

    @Get('stats')
    async getStats() {
        const height = await this.nodeChainService.getLedgerHeight();
        const nodes = await this.nodeChainService.getConnectedNodes();
        return {
            ledgerHeight: height,
            activeNodes: nodes.length,
            epoch: 1 // Placeholder until FeeDistribution integration
        };
    }
}
