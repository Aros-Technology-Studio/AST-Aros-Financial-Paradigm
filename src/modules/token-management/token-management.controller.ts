import { Controller } from '@nestjs/common';
import { TokenManagementService } from './token-management.service';

@Controller('token')
export class TokenManagementController {
    constructor(private readonly tokenService: TokenManagementService) { }
}
