import { Module } from '@nestjs/common';
import { DteService } from './dte.service';
import { DteController } from './dte.controller';

@Module({
    controllers: [DteController],
    providers: [DteService],
    exports: [DteService],
})
export class DteModule { }
