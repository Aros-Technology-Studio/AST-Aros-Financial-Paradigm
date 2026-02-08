import { Module, forwardRef } from '@nestjs/common';
import { CirculationService } from './circulation.service';
import { TokenModule } from '../token/token.module';

@Module({
    imports: [forwardRef(() => TokenModule)],
    providers: [CirculationService],
    exports: [CirculationService]
})
export class ValueCirculationModule { }
