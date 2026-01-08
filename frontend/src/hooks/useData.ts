import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8080';

export interface Node {
    id: string;
    type: string;
    ip: string;
    isActive: boolean;
}

export interface Transaction {
    hash: string;
    type: string;
    sender: string;
    recipient: string;
    amount: string;
    ledgerHeight: string;
    createdAt: string;
}

export interface Proposal {
    id: string;
    title: string;
    description: string;
    status: string;
    proposerId: string;
}

export interface Stats {
    ledgerHeight: number;
    activeNodes: number;
    epoch: number;
}

export const useData = () => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [stats, setStats] = useState<Stats>({ ledgerHeight: 0, activeNodes: 0, epoch: 1 });
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [nodesRes, statsRes, txRes, propRes] = await Promise.all([
                fetch(`${API_BASE}/nodechain/nodes`),
                fetch(`${API_BASE}/nodechain/stats`),
                fetch(`${API_BASE}/api/v1/ledger/recent?limit=20`),
                fetch(`${API_BASE}/governance/proposals`)
            ]);

            if (nodesRes.ok) setNodes(await nodesRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
            if (txRes.ok) setTransactions(await txRes.json());
            if (propRes.ok) setProposals(await propRes.json());
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    return { nodes, transactions, proposals, stats, loading, refresh: fetchData };
};
