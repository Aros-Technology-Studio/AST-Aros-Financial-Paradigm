import React from 'react';
import type { Proposal } from '../hooks/useData';

export const GovernancePanel: React.FC<{ proposals: Proposal[] }> = ({ proposals }) => {
    if (proposals.length === 0) return (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
            No active proposals found.
        </div>
    );

    const getImpactColor = (impact: string) => {
        switch (impact) {
            case 'CRITICAL': return 'var(--color-danger)';
            case 'HIGH': return '#ff8800';
            case 'MEDIUM': return 'var(--color-primary)';
            default: return 'var(--color-success)';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'var(--color-success)';
            case 'VETOED': return 'var(--color-danger)';
            case 'FAILED_QUORUM': return '#ff8800';
            default: return 'var(--color-text-dim)';
        }
    };

    return (
        <div style={{ display: 'grid', gap: '20px' }}>
            {proposals.map(prop => (
                <div key={prop.id} className="glass-panel" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
                    {/* Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <span style={{
                                background: `rgba(0, 0, 0, 0.3)`,
                                border: `1px solid ${getStatusColor(prop.status)}`,
                                color: getStatusColor(prop.status),
                                padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'
                            }}>
                                {prop.status}
                            </span>
                            <span style={{
                                background: `rgba(0, 0, 0, 0.3)`,
                                border: `1px solid ${getImpactColor(prop.impactLevel)}`,
                                color: getImpactColor(prop.impactLevel),
                                padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'
                            }}>
                                {prop.impactLevel} IMPACT
                            </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>
                            ID: {prop.id.substring(0, 8)}
                        </span>
                    </div>

                    <h3 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>{prop.title}</h3>

                    <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--color-text-dim)', marginBottom: '15px' }}>
                        <span>Type: <strong style={{ color: 'white' }}>{prop.actionType}</strong></span>
                        <span>Quorum Required: <strong style={{ color: 'white' }}>{prop.requiredQuorumPercent}%</strong></span>
                        <span>TimeLock: <strong style={{ color: 'white' }}>{prop.timelockWindow} Snapshots</strong></span>
                    </div>

                    <p style={{ color: 'var(--color-text-dim)', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
                        {prop.description}
                    </p>

                    {/* Voting Actions */}
                    {prop.status === 'ACTIVE' && (
                        <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                            <button className="glass-panel" style={{
                                flex: 2, padding: '12px', cursor: 'pointer',
                                background: 'rgba(0, 255, 157, 0.05)',
                                color: 'var(--color-success)', fontWeight: 'bold', border: '1px solid rgba(0,255,157,0.3)',
                                transition: 'all 0.2s'
                            }}>
                                VOTE YES
                            </button>
                            <button className="glass-panel" style={{
                                flex: 2, padding: '12px', cursor: 'pointer',
                                background: 'rgba(255, 0, 85, 0.05)',
                                color: 'var(--color-danger)', fontWeight: 'bold', border: '1px solid rgba(255,0,85,0.3)',
                                transition: 'all 0.2s'
                            }}>
                                VOTE NO
                            </button>
                            <button className="glass-panel" style={{
                                flex: 1, padding: '12px', cursor: 'pointer',
                                color: 'var(--color-text-dim)', border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                                ABSTAIN
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
