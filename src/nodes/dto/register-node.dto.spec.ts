import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterNodeDto } from './register-node.dto';

/**
 * RegisterNodeDto is the contract for admitting a node. These specs confirm the validation the
 * global ValidationPipe enforces: id and type must be present, non-empty, bounded strings.
 */
const errorsFor = (obj: unknown) => validate(plainToInstance(RegisterNodeDto, obj));

describe('RegisterNodeDto', () => {
    it('accepts a well-formed registration', async () => {
        const errors = await errorsFor({ id: 'node-1', type: 'validator' });
        expect(errors).toHaveLength(0);
    });

    it('rejects a missing id', async () => {
        const errors = await errorsFor({ type: 'validator' });
        expect(errors.some((e) => e.property === 'id')).toBe(true);
    });

    it('rejects an empty id', async () => {
        const errors = await errorsFor({ id: '', type: 'validator' });
        expect(errors.some((e) => e.property === 'id')).toBe(true);
    });

    it('rejects a missing type', async () => {
        const errors = await errorsFor({ id: 'node-1' });
        expect(errors.some((e) => e.property === 'type')).toBe(true);
    });

    it('rejects an id longer than 128 characters', async () => {
        const errors = await errorsFor({ id: 'n'.repeat(129), type: 'validator' });
        expect(errors.some((e) => e.property === 'id')).toBe(true);
    });

    it('rejects a type longer than 64 characters', async () => {
        const errors = await errorsFor({ id: 'node-1', type: 't'.repeat(65) });
        expect(errors.some((e) => e.property === 'type')).toBe(true);
    });

    it('rejects non-string fields', async () => {
        const errors = await errorsFor({ id: 1, type: true });
        expect(errors.some((e) => e.property === 'id')).toBe(true);
        expect(errors.some((e) => e.property === 'type')).toBe(true);
    });
});
