import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { NodeSecurityService } from './node_security.service';

@Controller('node')
export class NodeSecurityController {
    constructor(private readonly securityService: NodeSecurityService) { }

    @Post('register')
    async register(@Body() body: { node_id: string; pubkey: string }) {
        return this.securityService.registerNode(body);
    }

    @Post('deposit')
    async deposit(@Body() body: { node_id: string; amount: string }) {
        return this.securityService.addSecurityDeposit(body.node_id, body.amount);
    }

    @Get('active')
    async getActive() {
        return this.securityService.getActiveNodes();
    }

    @Get(':id')
    async getOne(@Param('id') id: string) {
        return this.securityService.getNode(id);
    }
}

@Controller('epoch')
export class EpochController {
    constructor(private readonly securityService: NodeSecurityService) { }

    @Post('start')
    async startEpoch() {
        return this.securityService.startEpoch();
    }

    @Post('end')
    async endEpoch(@Body() body: { payments: string }) {
        return this.securityService.endEpoch(body.payments);
    }
}
