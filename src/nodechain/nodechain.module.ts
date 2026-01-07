import { Module } from '@nestjs/common';
import { Chain } from './chain';

@Module({
    providers: [Chain],
    exports: [Chain],
})
export class NodeChainModule { }
