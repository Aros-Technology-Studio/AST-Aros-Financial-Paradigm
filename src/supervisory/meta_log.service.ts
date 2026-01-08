import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetaEventEntity } from './entities/meta_event.entity';
import * as crypto from 'crypto';

@Injectable()
export class MetaLogService {
    private readonly logger = new Logger(MetaLogService.name);

    constructor(
        @InjectRepository(MetaEventEntity)
        private readonly metaRepo: Repository<MetaEventEntity>,
    ) { }

    async logEvent(type: string, source: string, payload: any, anomalyId?: string): Promise<MetaEventEntity> {
        const timestamp = Date.now();
        const eventId = `EVT-${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
        const signature = this.signEvent(eventId, payload);

        const event = this.metaRepo.create({
            eventId,
            timestamp,
            type,
            source,
            anomalyId,
            payload,
            signature
        });

        await this.metaRepo.save(event);

        if (type === 'anomaly_detected') {
            this.logger.warn(`[THE EYE] Anomaly Detected: ${anomalyId} from ${source}`);
        } else {
            this.logger.debug(`[THE EYE] Logged ${type}`);
        }

        return event;
    }

    private signEvent(eventId: string, payload: any): string {
        // In a real system, this would use a secure key from Vault/HSM.
        // For prototype, we simulate a signature.
        const data = `${eventId}:${JSON.stringify(payload)}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    async getRecentAnomalies(limit = 10): Promise<MetaEventEntity[]> {
        return this.metaRepo.find({
            where: { type: 'anomaly_detected' },
            order: { timestamp: 'DESC' },
            take: limit
        });
    }
}
