import { Module } from '@nestjs/common';
import { CirculationService } from './circulation.service';

@Module({
    providers: [CirculationService],
    exports: [CirculationService]
})
export class ValueCirculationModule { }
