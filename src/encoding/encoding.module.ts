import { Module } from '@nestjs/common';
import { TxEncoderService } from './tx_encoder.service';

@Module({
    providers: [TxEncoderService],
    exports: [TxEncoderService],
})
export class EncodingModule { }
