import React from 'react';
import { ArrowUpRight, ArrowDownLeft, Box } from 'lucide-react';
import type { Transaction } from '../hooks/useData';

export const LedgerFeed: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
    return (
        <div className="glass-panel" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                    <tr>
                        <th style={{ padding: '15px', textAlign: 'left', color: 'var(--color-text-dim)', fontSize: '12px' }}>TYPE</th>
                        <th style={{ padding: '15px', textAlign: 'left', color: 'var(--color-text-dim)', fontSize: '12px' }}>HASH</th>
                        <th style={{ padding: '15px', textAlign: 'right', color: 'var(--color-text-dim)', fontSize: '12px' }}>AMOUNT</th>
                        <th style={{ padding: '15px', textAlign: 'right', color: 'var(--color-text-dim)', fontSize: '12px' }}>TIME</th>
                    </tr>
                </thead>
                <tbody>
                    {transactions.map(tx => (
                        <tr key={tx.hash} style={{ borderTop: '1px solid var(--glass-border)' }}>
                            <td style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {tx.type === 'MINT' && <ArrowDownLeft size={14} color="var(--color-success)" />}
                                {tx.type === 'BURN' && <ArrowUpRight size={14} color="var(--color-danger)" />}
                                {tx.type === 'REWARD' && <Box size={14} color="var(--color-primary)" />}
                                <span style={{
                                    fontSize: '12px', fontWeight: 'bold',
                                    color: tx.type === 'MINT' ? 'var(--color-success)' :
                                        tx.type === 'BURN' ? 'var(--color-danger)' : 'var(--color-primary)'
                                }}>
                                    {tx.type}
                                </span>
                            </td>
                            <td style={{ padding: '15px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                                {tx.hash.substring(0, 16)}...
                            </td>
                            <td style={{ padding: '15px', textAlign: 'right', fontWeight: 'bold' }}>
                                {tx.amount} AROS
                            </td>
                            <td style={{ padding: '15px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                                {new Date(tx.createdAt).toLocaleTimeString()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
