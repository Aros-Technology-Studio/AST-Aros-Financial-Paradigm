
import { Controller, Get, Param } from '@nestjs/common';
import { TokenService } from './token.service';

@Controller('token')
export class TokenController {
    constructor(private readonly tokenService: TokenService) { }

    @Get('balance/:address')
    getBalance(@Param('address') address: string) {
        // Placeholder for actual logic calling service
        return { address, balance: 0 };
    }
}
