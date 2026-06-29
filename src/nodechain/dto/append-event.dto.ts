import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';

/**
 * AppendEventDto — input contract for `NodeChainService.append`.
 *
 * `eventType` names what just happened (e.g. 'process.admitted'). `payload` carries the
 * structured body of that event. Both feed straight into hash computation, so callers
 * are expected to send canonical, deterministic shapes (the service performs
 * `JSON.stringify(payload)` exactly once when hashing).
 */
export class AppendEventDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    eventType!: string;

    @IsObject()
    payload!: Record<string, unknown>;
}
