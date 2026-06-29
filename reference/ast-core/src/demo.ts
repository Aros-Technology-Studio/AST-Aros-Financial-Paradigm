import { AST } from './orchestrator.js';

const ast = new AST();
const line = (s = '') => console.log(s);
line('═══════════════════════════════════════════════');
line('  AST (Aros Studio Tokenomics) — Model 1 core');
line('  Полный жизненный цикл процесса, end-to-end');
line('═══════════════════════════════════════════════');

const requests = [
  { id: 'P-1001', amount: 500, type: 'transfer', admissible: true },
  { id: 'P-1002', amount: 700, type: 'settlement', admissible: true },
  { id: 'P-1003', amount: 300, type: 'transfer', admissible: false }, // inadmissible -> rejected, no value
  { id: 'P-1004', amount: 900, type: 'settlement', admissible: true },
];

line('\n── Прогон процессов ──');
for (const r of requests) {
  const res = ast.runProcess(r);
  if (res.verified) line(`✔ ${res.processId}: verified, minted=${res.minted}, fee=${res.fee}`);
  else line(`x ${res.processId}: НЕ подтверждён (${res.reason}) — стоимость не возникла`);
}

line('\n── Финализация эпохи (оплата нодам post-factum) ──');
const epoch = ast.finalizeEpoch();
for (const d of epoch.distributionLog) line(`  ${d.nodeId}: оплата ${d.payment.toFixed(4)} (удержано нодой)`);
line(`  операционная маржа AST: ${epoch.margin.toFixed(4)} | пул сведён: ${epoch.reconciled}`);

line('\n── Состояние супплая ArosCoin ──');
const s = ast.coin.snapshot();
line(`  processMinted=${s.processMinted}  processBurned=${s.processBurned}  earnedRetained=${s.earnedRetained.toFixed(4)}`);
line(`  processNet=${ast.coin.processNet()} (→0)  totalSupply=${ast.coin.totalSupply().toFixed(4)} (= заработанное удержанное)`);

line('\n── Метрики устойчивости ──');
const m = ast.metrics();
line(`  reserveIndex=${m.reserveIndex.toFixed(4)}  velocity=${m.velocity.toFixed(2)}  internalPrice=${m.internalPrice.toFixed(4)}`);
line(`  Release Phase активна: ${m.release.active} (mature=${m.release.mature})`);

line('\n── Ноды (влияние из работы и репутации, без стейкинга) ──');
for (const n of ast.nodes.list())
  line(`  ${n.id} [${n.type}] reputation=${n.reputation.toFixed(3)} weight=${n.weight.toFixed(3)} earned=${n.earned.toFixed(4)}`);

line('\n── NodeChain (система записи) ──');
const rc = ast.chain.reconstruct();
line(`  снимков (ExecutionSnapshot): ${ast.chain.height}  целостность цепочки: ${rc.ok ? 'OK' : 'НАРУШЕНА@' + rc.brokenAt}`);

line('\n── All-Seeing Eye (пассивный надзор) ──');
line(`  записей в oversight ledger: ${ast.eye.ledger().length}  сигналов целостности: ${ast.eye.getSignals().length}`);
line('  (Eye только наблюдал и логировал — ни одного изменения состояния)');
line('\n✅ AST Model 1: полный цикл отработал end-to-end.');
