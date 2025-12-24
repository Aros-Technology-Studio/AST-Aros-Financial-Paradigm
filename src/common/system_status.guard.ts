import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service';

@Injectable()
export class SystemStatusGuard implements CanActivate {
    constructor(private lifecycleService: LifecycleService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        // Allow handshake endpoint
        // Note: Using includes is a simple check; ensure route definition matches.
        if (request.url.includes('/system/handshake')) {
            return true;
        }

        if (!this.lifecycleService.getStatus()) {
            throw new HttpException('System dormant. Handshake required (Red Line 1).', HttpStatus.SERVICE_UNAVAILABLE);
        }
        return true;
    }
}
