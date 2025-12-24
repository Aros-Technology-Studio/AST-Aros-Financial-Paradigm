import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service';

@Controller('system')
export class HandshakeController {
    constructor(private readonly lifecycleService: LifecycleService) { }

    @Post('handshake')
    handshake(@Body() body: { token: string }) {
        const success = this.lifecycleService.initiateHandshake(body.token);
        if (!success) {
            throw new HttpException('Handshake failed', HttpStatus.UNAUTHORIZED);
        }
        return { status: 'Handshake accepted. System Active.' };
    }
}
