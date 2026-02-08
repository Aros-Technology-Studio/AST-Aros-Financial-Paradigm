import { Module } from '@nestjs/common';
import { PoTService } from './pot.service';
import { ProcessReserveLedgerService } from './process_reserve.service';

@Module({
    providers: [PoTService, ProcessReserveLedgerService],
    exports: [PoTService, ProcessReserveLedgerService],
})
export class PoTEngineModule { }
