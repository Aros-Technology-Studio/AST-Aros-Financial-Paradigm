import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppendEventDto } from './append-event.dto';

/**
 * AppendEventDto guards what may enter NodeChain. These specs exercise the class-validator
 * decorators the global ValidationPipe runs, confirming well-formed events pass and malformed
 * ones are rejected before any hash is computed.
 */
const errorsFor = (obj: unknown) => validate(plainToInstance(AppendEventDto, obj));

describe('AppendEventDto', () => {
    it('accepts a well-formed event', async () => {
        const errors = await errorsFor({ eventType: 'process.admitted', payload: { id: 1 } });
        expect(errors).toHaveLength(0);
    });

    it('accepts an empty payload object', async () => {
        const errors = await errorsFor({ eventType: 'heartbeat', payload: {} });
        expect(errors).toHaveLength(0);
    });

    it('rejects a missing eventType', async () => {
        const errors = await errorsFor({ payload: {} });
        expect(errors.some((e) => e.property === 'eventType')).toBe(true);
    });

    it('rejects an empty eventType', async () => {
        const errors = await errorsFor({ eventType: '', payload: {} });
        expect(errors.some((e) => e.property === 'eventType')).toBe(true);
    });

    it('rejects an eventType longer than 128 characters', async () => {
        const errors = await errorsFor({ eventType: 'e'.repeat(129), payload: {} });
        expect(errors.some((e) => e.property === 'eventType')).toBe(true);
    });

    it('rejects a non-string eventType', async () => {
        const errors = await errorsFor({ eventType: 42, payload: {} });
        expect(errors.some((e) => e.property === 'eventType')).toBe(true);
    });

    it('rejects a non-object payload', async () => {
        const errors = await errorsFor({ eventType: 'process.admitted', payload: 'not-an-object' });
        expect(errors.some((e) => e.property === 'payload')).toBe(true);
    });
});
