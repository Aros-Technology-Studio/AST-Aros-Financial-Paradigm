import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { OversightService } from './oversight.service';

@Controller('oversight')
export class OversightController {
    constructor(private readonly oversightService: OversightService) { }

    @Post('log')
    async logEvent(@Body() body: { source: string; event: string; payload: any }) {
        return this.oversightService.logEvent(body.source, body.event, body.payload);
    }

    @Get()
    async getLogs(@Query('limit') limit: number) {
        return this.oversightService.getLogs(limit);
    }
}
