import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
    @Get()
    getHealth() {
        return {
            ok: true,
            service: 'AST',
            ts: new Date().toISOString()
        };
    }
}
