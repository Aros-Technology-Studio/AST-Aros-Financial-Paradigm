
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
// We might need an entity for this if we want persistence, 
// for now let's assume we can store it in a simple Key-Value or a generic 'SystemState' entity if it exists.
// Or we create a dedicated 'ProcessReserve' entity. 
// Given the prompt didn't specify a new entity for this explicitly but implicitly ("ProcessReserveLedgerService"),
// I'll create an in-memory version that persists to a file or logs for now, OR better,
// reuse the existing 'SupplySnapshot' or creating a new simple entity is best practice.
// Let's create a simple in-memory structure that logs heavily for the prototype phase as requested in "Logic of accumulation".

@Injectable()
export class ProcessReserveLedgerService {
    private readonly logger = new Logger(ProcessReserveLedgerService.name);

    private reserveState = {
        totalProcessVolume: 0, // Cumulative value of all validated transactions (PoT)
        reserveIndex: 1.0,     // An index representing the "strength" of the reserve
        lastUpdated: Date.now()
    };

    /**
     * Records new validated transaction volume into the Process Reserve.
     * This is the "Battery" of the Aros Currency.
     * @param volume Amount of ArosCoin processed/validated
     */
    public recordTransactionVolume(volume: number) {
        if (volume <= 0) return;

        this.reserveState.totalProcessVolume += volume;
        this.reserveState.lastUpdated = Date.now();

        // Recalculate Index (Simple Logarithmic Growth or Linear Accumulation)
        // Thesis: "Growth of value through scale"
        this.reserveState.reserveIndex = 1.0 + (Math.log1p(this.reserveState.totalProcessVolume) / 100);

        this.logger.log(`[ProcessReserve] Volume Added: ${volume}. Total: ${this.reserveState.totalProcessVolume.toFixed(2)}. Index: ${this.reserveState.reserveIndex.toFixed(4)}`);
    }

    public getReserveState() {
        return { ...this.reserveState };
    }

    /**
     * Returns the "Intrinsic Value" backing ArosCoin based on Process Volume.
     * Used by Pricing Calculator.
     */
    public getProcessBackingValue(): number {
        // This is a simplified "Fair Value" derived purely from work done.
        // E.g. every 1,000,000 units of Volume = +0.1 Unit of Value
        return this.reserveState.totalProcessVolume / 1000000;
    }
}
