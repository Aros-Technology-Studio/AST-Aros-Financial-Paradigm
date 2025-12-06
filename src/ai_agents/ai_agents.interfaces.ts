export interface IAgentObserver {
    observeStream(streamSource: string): Promise<void>;
}

export interface IAnomalyDetector {
    detectPattern(dataPoints: any[]): Promise<number>; // probability score
}

export interface IAgentAction {
    triggerDefense(actionType: string, targetId: string): Promise<void>;
}
