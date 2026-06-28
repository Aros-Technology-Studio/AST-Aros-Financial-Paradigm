import { useState } from 'react';
import { useData } from './hooks/useData';
import { Navbar } from './components/Navbar';
import { Overview } from './components/Overview';
import { NodeList } from './components/NodeList';
import { LedgerFeed } from './components/LedgerFeed';
import { GovernancePanel } from './components/GovernancePanel';

function App() {
  const [view, setView] = useState('overview');
  const { nodes, transactions, proposals, stats, loading } = useData();

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
      INITIALIZING AST SYSTEM...
    </div>
  );

  return (
    <div className="page-container">
      <Navbar currentView={view} setView={setView} />

      <main>
        {view === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Overview stats={stats} />
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px', marginTop: '10px' }}>
              <LedgerFeed transactions={transactions.slice(0, 5)} />
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ marginTop: 0 }}>Active Validators</h3>
                <NodeList nodes={nodes.slice(0, 4)} />
              </div>
            </div>
          </div>
        )}

        {view === 'validators' && <NodeList nodes={nodes} />}
        {view === 'ledger' && <LedgerFeed transactions={transactions} />}
        {view === 'governance' && <GovernancePanel proposals={proposals} />}
      </main>
    </div>
  );
}

export default App;
