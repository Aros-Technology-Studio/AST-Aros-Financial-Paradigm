import React from 'react';
import { Server, CheckCircle, XCircle } from 'lucide-react';
import type { Node } from '../hooks/useData';

export const NodeList: React.FC<{ nodes: Node[] }> = ({ nodes }) => {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {nodes.map(node => (
                <div key={node.id} className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{
                        width: '40px', height: '40px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Server size={20} color="var(--color-primary)" />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {node.id}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '4px' }}>
                            {node.ip} • <span style={{ color: 'var(--color-secondary)' }}>{node.type}</span>
                        </div>
                    </div>
                    {node.isActive ?
                        <CheckCircle size={18} color="var(--color-success)" /> :
                        <XCircle size={18} color="var(--color-text-dim)" />
                    }
                </div>
            ))}
        </div>
    );
};
