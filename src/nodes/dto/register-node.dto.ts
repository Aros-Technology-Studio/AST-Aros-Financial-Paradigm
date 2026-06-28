import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * RegisterNodeDto — input contract for `NodesService.register`.
 *
 * `id` is the stable identifier assigned to the node and `type` declares its role
 * (e.g. 'validator', 'router', 'recorder'). Both are persisted on the NodeEntity and
 * recorded on the NodeChain as part of the registration snapshot.
 */
export class RegisterNodeDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    id!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    type!: string;
}
