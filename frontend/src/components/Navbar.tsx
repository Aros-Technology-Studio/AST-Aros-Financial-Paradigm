import React from 'react';
import { Activity, Layers, FileText, Globe } from 'lucide-react';

interface NavbarProps {
    currentView: string;
    setView: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setView }) => {
    const navItems = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'validators', label: 'Validators', icon: Globe },
        { id: 'ledger', label: 'Ledger', icon: Layers },
        { id: 'governance', label: 'Governance', icon: FileText },
    ];

    return (
        <nav className="glass-panel" style={{
            marginBottom: '20px',
            padding: '15px 25px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                    width: '32px', height: '32px',
                    background: 'var(--color-primary)',
                    borderRadius: '50%',
                    boxShadow: '0 0 15px var(--color-primary)'
                }} />
                <h2 style={{ margin: 0, background: 'linear-gradient(to right, #fff, #aaa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    AST Aros
                </h2>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setView(item.id)}
                        className="glass-panel"
                        style={{
                            padding: '8px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            background: currentView === item.id ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                            borderColor: currentView === item.id ? 'var(--color-primary)' : 'transparent',
                            color: currentView === item.id ? 'var(--color-primary)' : 'var(--color-text-dim)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <item.icon size={16} />
                        {item.label}
                    </button>
                ))}
            </div>
        </nav>
    );
};
