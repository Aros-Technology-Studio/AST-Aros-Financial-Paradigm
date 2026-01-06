import React from 'react';
import type { Proposal } from '../hooks/useData';

export const GovernancePanel: React.FC<{ proposals: Proposal[] }> = ({ proposals }) => {
    if (proposals.length === 0) return (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-dim)' }}>
            No active proposals found.
        </div>
    );

    return (
        <div style={{ display: 'grid', gap: '20px' }}>
            {proposals.map(prop => (
                <div key={prop.id} className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <span style={{
                            background: 'rgba(0, 240, 255, 0.1)',
                            color: 'var(--color-primary)',
                            padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold'
                        }}>
                            {prop.status}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-dim)' }}>
                            ID: {prop.id.substring(0, 8)}
                        </span>
                    </div>
                    <h3 style={{ margin: '0 0 10px 0' }}>{prop.title}</h3>
                    <p style={{ color: 'var(--color-text-dim)', fontSize: '14px', lineHeight: '1.5' }}>
                        {prop.description}
                    </p>
                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                        <button className="glass-panel" style={{
                            flex: 1, padding: '10px', cursor: 'pointer',
                            color: 'var(--color-success)', fontWeight: 'bold', border: '1px solid rgba(0,255,157,0.2)'
                        }}>
                            VOTE YES
                        </button>
                        <button className="glass-panel" style={{
                            flex: 1, padding: '10px', cursor: 'pointer',
                            color: 'var(--color-danger)', fontWeight: 'bold', border: '1px solid rgba(255,0,85,0.2)'
                        }}>
                            VOTE NO
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};
