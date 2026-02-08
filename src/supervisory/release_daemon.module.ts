
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReleaseDaemonService } from './release_daemon.service';

@Module({
    imports: [ScheduleModule.forRoot()],
    providers: [ReleaseDaemonService],
    exports: [ReleaseDaemonService]
})
export class ReleaseDaemonModule { }
