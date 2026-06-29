import {
    IsArray,
    IsBoolean,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    ArrayNotEmpty,
} from 'class-validator';

/**
 * RunProcessDto — the validated input for one full process run through the AST lifecycle.
 *
 * Mirrors the reference's `ProcessRequest` shape (reference/ast-core/src/types.ts) plus the
 * epoch the run accrues its fee into. Validation is enforced by the global ValidationPipe so
 * a malformed body is rejected before any state is recorded.
 *
 * Fields:
 *   - processId   : stable identifier of the process; used as the NodeChain/PoT key.
 *   - amount      : the process value; drives emission volume, fee, and confirmed volume.
 *   - type        : the kind of operation (e.g. 'transfer', 'settlement').
 *   - admissible  : whether the process is admitted into execution.
 *   - nodeIds     : optional explicit assignment; when omitted the orchestrator uses the
 *                   currently active node registry.
 *   - epoch       : optional epoch number the fee accrues into (defaults to epoch 1).
 */
export class RunProcessDto {
    @IsString()
    processId!: string;

    @IsNumber()
    @IsPositive()
    amount!: number;

    @IsString()
    type!: string;

    @IsBoolean()
    admissible!: boolean;

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    nodeIds?: string[];

    @IsOptional()
    @IsNumber()
    epoch?: number;
}
