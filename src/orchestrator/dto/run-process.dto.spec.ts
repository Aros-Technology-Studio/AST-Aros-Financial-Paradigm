import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RunProcessDto } from './run-process.dto';

/**
 * RunProcessDto validates the body of a full lifecycle run. These specs confirm the contract
 * the global ValidationPipe enforces: required fields, a strictly positive amount, and the
 * optional explicit node assignment / epoch.
 */
const errorsFor = (obj: unknown) => validate(plainToInstance(RunProcessDto, obj));

const valid = {
    processId: 'p-1',
    amount: 100,
    type: 'transfer',
    admissible: true,
};

describe('RunProcessDto', () => {
    it('accepts a minimal well-formed body', async () => {
        expect(await errorsFor(valid)).toHaveLength(0);
    });

    it('accepts optional nodeIds and epoch when present', async () => {
        const errors = await errorsFor({ ...valid, nodeIds: ['n-1', 'n-2'], epoch: 3 });
        expect(errors).toHaveLength(0);
    });

    it('rejects a missing processId', async () => {
        const { processId: _omit, ...body } = valid;
        const errors = await errorsFor(body);
        expect(errors.some((e) => e.property === 'processId')).toBe(true);
    });

    it('rejects a zero or negative amount', async () => {
        expect((await errorsFor({ ...valid, amount: 0 })).some((e) => e.property === 'amount')).toBe(true);
        expect((await errorsFor({ ...valid, amount: -5 })).some((e) => e.property === 'amount')).toBe(true);
    });

    it('rejects a non-numeric amount', async () => {
        const errors = await errorsFor({ ...valid, amount: 'lots' });
        expect(errors.some((e) => e.property === 'amount')).toBe(true);
    });

    it('rejects a non-boolean admissible', async () => {
        const errors = await errorsFor({ ...valid, admissible: 'yes' });
        expect(errors.some((e) => e.property === 'admissible')).toBe(true);
    });

    it('rejects an empty nodeIds array (ArrayNotEmpty)', async () => {
        const errors = await errorsFor({ ...valid, nodeIds: [] });
        expect(errors.some((e) => e.property === 'nodeIds')).toBe(true);
    });

    it('rejects nodeIds containing a non-string entry', async () => {
        const errors = await errorsFor({ ...valid, nodeIds: ['n-1', 7] });
        expect(errors.some((e) => e.property === 'nodeIds')).toBe(true);
    });

    it('rejects a non-numeric epoch', async () => {
        const errors = await errorsFor({ ...valid, epoch: 'first' });
        expect(errors.some((e) => e.property === 'epoch')).toBe(true);
    });
});
