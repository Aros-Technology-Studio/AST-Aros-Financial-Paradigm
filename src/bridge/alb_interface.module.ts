import { Module } from '@nestjs/common';
import { AlbInterfaceService } from './alb_interface.service';

@Module({
    providers: [AlbInterfaceService],
    exports: [AlbInterfaceService],
})
export class AlbInterfaceModule { }
