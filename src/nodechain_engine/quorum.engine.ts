import { Injectable, Logger } from '@nestjs/common';

/**
 * A single vote enriched with the voter's weight for quorum evaluation.
 */
export interface WeightedVote {
    voterId: string;
    approved: boolean;
    nodeWeight: number;
}

/**
 * Full result of a quorum evaluation.
 */
export interface QuorumResult {
    reached: boolean;
    countThreshold: number;    // ceil(2/3 * n) + 1
    weightThreshold: number;   // ceil(2/3 * totalWeight) + 1
    totalNodes: number;
    totalWeight: number;
    approvedCount: number;
    approvedWeight: number;
    rejectedCount: number;
    maxByzantineFaults: number; // floor((n - 1) / 3)
}

/**
 * QuorumEngine — реализует BFT кворум для NodeChain PoT.
 *
 * Формула кворума: q = ⌈2/3 × n⌉ + 1
 * Отказоустойчивость: n ≥ 3f + 1  →  f = ⌊(n - 1) / 3⌋
 *
 * Дополнительно учитывает NodeWeight: взвешенный кворум по сумме весов
 * проголосовавших «за» нод относительно суммарного веса всех валидаторов.
 * Оба условия (по количеству И по весу) должны быть выполнены.
 */
@Injectable()
export class QuorumEngine {
    private readonly logger = new Logger(QuorumEngine.name);

    /**
     * Вычисляет порог кворума по количеству нод.
     * q = ⌈2/3 × n⌉ + 1
     */
    computeCountThreshold(n: number): number {
        if (n <= 0) return 1;
        return Math.ceil((2 / 3) * n) + 1;
    }

    /**
     * Вычисляет порог кворума по суммарному весу.
     * weightQ = ⌈2/3 × totalWeight⌉ + 1
     */
    computeWeightThreshold(totalWeight: number): number {
        if (totalWeight <= 0) return 1;
        return Math.ceil((2 / 3) * totalWeight) + 1;
    }

    /**
     * Вычисляет максимальное число Byzantine-отказов, которые может выдержать сеть.
     * f = ⌊(n - 1) / 3⌋
     */
    computeMaxFaults(n: number): number {
        if (n <= 0) return 0;
        return Math.floor((n - 1) / 3);
    }

    /**
     * Оценивает, достигнут ли кворум.
     *
     * Кворум считается достигнутым, если выполнены ОБА условия:
     * 1. approvedCount  >= countThreshold  (достаточно различных нод «за»)
     * 2. approvedWeight >= weightThreshold  (достаточный суммарный вес «за»)
     *
     * @param votes - список проголосовавших нод с их весами
     * @param totalValidatorCount - полное число активных валидаторов сети
     * @param totalValidatorWeight - суммарный вес всех активных валидаторов
     */
    evaluate(
        votes: WeightedVote[],
        totalValidatorCount: number,
        totalValidatorWeight: number,
    ): QuorumResult {
        const countThreshold = this.computeCountThreshold(totalValidatorCount);
        const weightThreshold = this.computeWeightThreshold(totalValidatorWeight);
        const maxByzantineFaults = this.computeMaxFaults(totalValidatorCount);

        const approvedVotes = votes.filter(v => v.approved);
        const rejectedVotes = votes.filter(v => !v.approved);

        const approvedCount = approvedVotes.length;
        const approvedWeight = approvedVotes.reduce((sum, v) => sum + (v.nodeWeight ?? 1), 0);
        const rejectedCount = rejectedVotes.length;

        // Кворум требует выполнения обоих условий
        const countOk = approvedCount >= countThreshold;
        const weightOk = approvedWeight >= weightThreshold;
        const reached = countOk && weightOk;

        this.logger.debug(
            `Quorum eval: n=${totalValidatorCount}, approved=${approvedCount}/${countThreshold}, ` +
            `weight=${approvedWeight.toFixed(4)}/${weightThreshold.toFixed(4)}, reached=${reached}`,
        );

        return {
            reached,
            countThreshold,
            weightThreshold,
            totalNodes: totalValidatorCount,
            totalWeight: totalValidatorWeight,
            approvedCount,
            approvedWeight,
            rejectedCount,
            maxByzantineFaults,
        };
    }

    /**
     * Проверяет, соответствует ли конфигурация сети требованиям BFT (n ≥ 3f + 1).
     * При f=1: нужно минимум 4 ноды; при f=2: минимум 7 нод и т.д.
     */
    isBftCompliant(n: number, f: number): boolean {
        return n >= 3 * f + 1;
    }
}
