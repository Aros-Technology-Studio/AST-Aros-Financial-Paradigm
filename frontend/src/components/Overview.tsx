import React from 'react';

interface StatsProps {
    stats: {
        ledgerHeight: number;
        activeNodes: number;
        epoch: number;
    }
}

export const Overview: React.FC<StatsProps> = ({ stats }) => {
    const cards = [
        { label: 'Ledger Height', value: stats.ledgerHeight, color: 'var(--color-primary)' },
        { label: 'Active Validators', value: stats.activeNodes, color: 'var(--color-secondary)' },
        { label: 'Current Epoch', value: '#' + stats.epoch, color: 'var(--color-success)' },
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            {cards.map((card, i) => (
                <div key={i} className="glass-panel" style={{ padding: '24px', textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 10px 0', color: 'var(--color-text-dim)', fontSize: '14px', textTransform: 'uppercase' }}>
                        {card.label}
                    </h3>
                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: card.color, textShadow: `0 0 20px ${card.color}40` }}>
                        {card.value}
                    </div>
                </div>
            ))}
        </div>
    );
};
