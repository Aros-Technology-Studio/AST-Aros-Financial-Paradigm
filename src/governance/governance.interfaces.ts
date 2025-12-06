export interface IProposalLifecycle {
    createProposal(title: string, description: string, proposerId: string): Promise<string>;
    cancelProposal(proposalId: string): Promise<void>;
    executeProposal(proposalId: string): Promise<void>;
}

export interface IVotingMechanism {
    castVote(proposalId: string, voterId: string, choice: string, weight: number): Promise<void>;
    tallyVotes(proposalId: string): Promise<any>;
}

export interface IQuorumChecker {
    isQuorumMet(proposalId: string): Promise<boolean>;
}
