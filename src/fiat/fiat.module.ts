import { Module } from '@nestjs/common';
import { FiatService } from './fiat.service';

@Module({
    providers: [FiatService],
    exports: [FiatService],
})
export class FiatModule { }
