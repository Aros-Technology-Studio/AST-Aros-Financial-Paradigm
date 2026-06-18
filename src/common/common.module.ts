import { Global, Module } from '@nestjs/common';
import { ClockService } from './clock.service';

/**
 * Global foundation module. Provides shared deterministic primitives — currently the
 * monotonic ClockService — so every feature module can inject them with a single
 * shared instance and without re-importing CommonModule.
 */
@Global()
@Module({
    providers: [ClockService],
    exports: [ClockService],
})
export class CommonModule { }
