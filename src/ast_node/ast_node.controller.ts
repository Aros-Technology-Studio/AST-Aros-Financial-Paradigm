import { Controller, Post, Body } from '@nestjs/common';
import { AstNodeService } from './ast_node.service';

@Controller('node')
export class AstNodeController {
    constructor(private readonly astNodeService: AstNodeService) { }

    @Post('submit-tx')
    async submitTx(@Body() body: any) {
        return this.astNodeService.processTransaction(body);
    }

    @Post('finalize-batch')
    async finalizeBatch() {
        return this.astNodeService.finalizeBatch();
    }
}
