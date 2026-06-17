import { AST } from './orchestrator.js';
import { Emission } from './emission.js';
import { ArosCoin } from './aroscoin.js';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✔ ${name}`); } else { fail++; console.log(`x FAIL: ${name}`); } };

console.log('── Проверка инвариантов Модели 1 ──');

// I-EM-2 / 14.1: эмиссия без подтверждения PoT невозможна
let threw = false;
try { new Emission(new ArosCoin()).mint('X', 100, false); } catch { threw = true; }
ok('14.1 — mint без PoT-подтверждения отклоняется', threw);

const ast = new AST();
[
  { id: 'A', amount: 500, type: 't', admissible: true },
  { id: 'B', amount: 700, type: 't', admissible: true },
  { id: 'C', amount: 300, type: 't', admissible: false },
].forEach(r => ast.runProcess(r));
const epoch = ast.finalizeEpoch();

// P1 / I-PoT-1: стоимость только из подтверждённого; недопустимый процесс не эмитировал
ok('P1 — недопустимый процесс не породил стоимость', ast.coin.snapshot().processMinted === 1200);

// I-EM-3 / I-AC-3: процессная часть сожжена (processNet → 0)
ok('I-EM-3 — процессная часть сожжена (processNet=0)', ast.coin.processNet() === 0);

// I-AC-5 / I-EM-5: totalSupply выводим = заработанное удержанное
ok('I-AC-5 — totalSupply = earnedRetained', Math.abs(ast.coin.totalSupply() - ast.coin.retained) < 1e-9);

// I-CM-4: пул сведён без остатка
ok('I-CM-4 — комиссионный пул сведён', epoch.reconciled);

// I-NC-1/2: цепочка целостна; подмена ломает её
ok('I-NC — целостность NodeChain', ast.chain.reconstruct().ok);

// 14.6 / I-ND-2: у ноды нет поля стейка (влияние из работы, не из баланса)
const n = ast.nodes.list()[0] as unknown as Record<string, unknown>;
ok('14.6 — у ноды отсутствует stake/stakedBalance', !('stake' in n) && !('stakedBalance' in n));

// I-EYE-1/2: Eye пассивен — наблюдал, но не менял супплай
const before = ast.coin.totalSupply();
ast.eye.compareSupply(ast.coin.snapshot());
ok('I-EYE — Eye пассивен (супплай не изменился)', ast.coin.totalSupply() === before);

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
