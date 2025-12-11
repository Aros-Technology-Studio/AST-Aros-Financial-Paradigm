import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { DteService } from './dte.service';

@Controller('dte')
export class DteController {
    constructor(private readonly dteService: DteService) { }

    @Post('encode')
    async encode(@Body() body: any) {
        if (!body || Object.keys(body).length === 0) {
            throw new BadRequestException('Empty body');
        }

        // 1. Validate
        this.dteService.validateTransaction(body);

        // 2. Encode
        const encodedBuffer = this.dteService.encodeTransaction(body);

        // 3. Hash
        const hash = this.dteService.hashTransaction(encodedBuffer);

        // 4. Mock Quorum / Metadata
        // In a real system, this would involve consensus.
        const metadata = {
            quorum_verified: true,
            encoding_node: 'node-01',
            timestamp: new Date().toISOString()
        };

        return {
            tx_id: hash,
            encoded: encodedBuffer.toString('base64'),
            hash,
            metadata
        };
    }
}
