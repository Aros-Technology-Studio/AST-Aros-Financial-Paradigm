import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OversightLog } from './entities/oversight_log.entity';
import { sha3_512 } from 'js-sha3';

@Injectable()
export class OversightService {
    constructor(
        @InjectRepository(OversightLog)
        private readonly logRepo: Repository<OversightLog>,
    ) { }

    async logEvent(source: string, eventType: string, payload: any): Promise<OversightLog> {
        // 1. Fetch last log for chaining
        const lastLog = await this.logRepo.findOne({
            order: { timestamp: 'DESC' },
            where: {},
        });

        const prevHash = lastLog ? lastLog.hash : '0xGENESIS_OVERSIGHT_LOG';
        const timestamp = new Date();

        // 2. Compute Hash
        // Hash(prevHash + source + type + payload + timestamp)
        const dataToHash = prevHash + source + eventType + JSON.stringify(payload) + timestamp.toISOString();
        const hash = sha3_512(dataToHash);

        // 3. Save
        const log = this.logRepo.create({
            source,
            event_type: eventType,
            payload,
            timestamp,
            hash,
            prev_hash: prevHash,
        });

        return this.logRepo.save(log);
    }

    async getLogs(limit: number = 50): Promise<OversightLog[]> {
        return this.logRepo.find({
            take: limit,
            order: { timestamp: 'DESC' },
        });
    }
}
