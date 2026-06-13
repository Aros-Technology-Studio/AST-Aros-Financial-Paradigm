import { Module, forwardRef } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { TokenModule } from '../../token/token.module';

@Module({
    imports: [forwardRef(() => TokenModule)],
    providers: [IngestionService],
    exports: [IngestionService],
})
export class IngestionModule {}
