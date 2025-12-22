import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ValidatorService } from './validator.service';

@Controller('validator')
export class ValidatorController {
    constructor(private readonly validatorService: ValidatorService) { }

    @Post('register')
    async register(@Body() body: { validator_id: string; pubkey: string }) {
        return this.validatorService.registerValidator(body);
    }

    @Post('stake')
    async stake(@Body() body: { validator_id: string; amount: string }) {
        return this.validatorService.addStake(body.validator_id, body.amount);
    }

    @Get('active')
    async getActive() {
        return this.validatorService.getActiveValidators();
    }

    @Get(':id')
    async getOne(@Param('id') id: string) {
        return this.validatorService.getValidator(id);
    }
}

@Controller('epoch')
export class EpochController {
    constructor(private readonly validatorService: ValidatorService) { }

    @Post('start')
    async startEpoch() {
        return this.validatorService.startEpoch();
    }

    @Post('end')
    async endEpoch(@Body() body: { rewards: string }) {
        return this.validatorService.endEpoch(body.rewards);
    }
}
