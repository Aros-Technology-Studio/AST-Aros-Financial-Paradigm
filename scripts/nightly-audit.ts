#!/usr/bin/env ts-node
/**
 * nightly-audit.ts — Full codebase audit script
 *
 * Runs all 14-module audit checks locally and generates NIGHTLY_AUDIT_REPORT.md.
 * Mirrors the logic in .github/workflows/nightly-audit.yml for local runs.
 *
 * Usage:
 *   npx ts-node scripts/nightly-audit.ts
 *   npm run audit:full
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const REPORT_FILE = path.join(ROOT, 'NIGHTLY_AUDIT_REPORT.md');

const MODULES = [
  '01_coin_engine',
  '02_nodechain_engine',
  '03_token_management_layer',
  '04_aros_value_circulation',
  '05_bridge_layer',
  '06_governance_layer',
  '07_processing_layer',
  '08_fee_distribution',
  '09_crypto_ingestion_pipeline',
  '10_proof_of_transaction_engine',
  '11_node_security_and_payments',
  '12_nodechain_ai_agents',
  '13_extra_supervisory_layer',
  '14_decentralized_tx_encoding',
];

interface ModuleAuditResult {
  name: string;
  exists: boolean;
  todoCount: number;
  stubCount: number;
  mockCount: number;
  tsFiles: number;
}

interface AuditSummary {
  date: string;
  commit: string;
  modules: ModuleAuditResult[];
  testsPassed: number;
  testsFailed: number;
  tscErrors: number;
  secCritical: number;
  secHigh: number;
  totalTodos: number;
  totalStubs: number;
  overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

function run(cmd: string, cwd: string = ROOT): string {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e: any) {
    return (e.stdout ?? '') + (e.stderr ?? '');
  }
}

function countMatches(dir: string, patterns: string[], fileExts: string[] = ['.ts', '.js']): number {
  if (!fs.existsSync(dir)) return 0;

  let count = 0;
  const walk = (d: string) => {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
          walk(full);
        } else if (entry.isFile() && fileExts.some(ext => entry.name.endsWith(ext))) {
          const content = fs.readFileSync(full, 'utf8');
          for (const pattern of patterns) {
            const regex = new RegExp(pattern, 'gi');
            const matches = content.match(regex);
            if (matches) count += matches.length;
          }
        }
      }
    } catch { /* skip */ }
  };
  walk(dir);
  return count;
}

function countTsFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const walk = (d: string) => {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') walk(full);
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) count++;
      }
    } catch { /* skip */ }
  };
  walk(dir);
  return count;
}

function auditModule(name: string): ModuleAuditResult {
  const dir = path.join(ROOT, name);
  const exists = fs.existsSync(dir);

  if (!exists) {
    return { name, exists: false, todoCount: 0, stubCount: 0, mockCount: 0, tsFiles: 0 };
  }

  const todoCount = countMatches(dir, ['TODO', 'FIXME', 'HACK', 'XXX']);
  const stubCount = countMatches(dir, ['stub', 'placeholder', 'not.implemented', 'NOT_IMPLEMENTED']);
  // Only count mocks in non-test files
  const allMocks = countMatches(dir, ['mock', 'fake', 'dummy']);
  const testMocks = countMatches(path.join(dir, '__tests__'), ['mock', 'fake', 'dummy']);
  const mockCount = Math.max(0, allMocks - testMocks);
  const tsFiles = countTsFiles(dir);

  return { name, exists: true, todoCount, stubCount, mockCount, tsFiles };
}

function runTests(): { passed: number; failed: number; output: string } {
  console.log('  Running test suite...');
  const output = run('npm test');
  const passed = (output.match(/✓|PASS |passed/g) ?? []).length;
  const failed = (output.match(/✗|FAIL |failed/g) ?? []).length;
  return { passed, failed, output };
}

function runTypeCheck(): { errors: number; output: string } {
  console.log('  Running TypeScript type check...');
  const output = run('npx tsc --noEmit');
  const errors = (output.match(/error TS/g) ?? []).length;
  return { errors, output };
}

function runSecurityAudit(): { critical: number; high: number; output: string } {
  console.log('  Running npm security audit...');
  const output = run('npm audit --json');
  let critical = 0;
  let high = 0;
  try {
    const parsed = JSON.parse(output);
    critical = parsed.metadata?.vulnerabilities?.critical ?? 0;
    high = parsed.metadata?.vulnerabilities?.high ?? 0;
  } catch { /* audit output may not be valid JSON on older npm */ }
  return { critical, high, output: run('npm audit') };
}

function generateReport(summary: AuditSummary): string {
  const { date, commit, modules, testsPassed, testsFailed, tscErrors, secCritical, secHigh, totalTodos, overallHealth } = summary;

  const moduleTable = modules.map(m =>
    `| ${m.name} | ${m.exists ? '✅' : '❌'} | ${m.todoCount} | ${m.stubCount} | ${m.mockCount} | ${m.tsFiles} |`
  ).join('\n');

  return `# Nightly Audit Report — AST-Aros-Financial-Paradigm

**Date:** ${date}
**Commit:** \`${commit}\`
**Overall Health:** ${overallHealth === 'HEALTHY' ? '✅ HEALTHY' : overallHealth === 'WARNING' ? '⚠️ WARNING' : '❌ CRITICAL'}

---

## Module Coverage (14 modules)

| Module | Exists | TODOs | Stubs | Mocks | TS Files |
|--------|--------|-------|-------|-------|----------|
${moduleTable}

**Totals:** TODOs: **${totalTodos}** | Stubs: **${summary.totalStubs}**

---

## Test Suite

| Metric | Value |
|--------|-------|
| Tests passed | ✅ ${testsPassed} |
| Tests failed | ${testsFailed > 0 ? `❌ ${testsFailed}` : '✅ 0'} |

---

## TypeScript

| Metric | Value |
|--------|-------|
| Type errors | ${tscErrors > 0 ? `❌ ${tscErrors}` : '✅ 0'} |

---

## Security (npm audit)

| Severity | Count |
|----------|-------|
| Critical | ${secCritical > 0 ? `🔴 ${secCritical}` : '✅ 0'} |
| High | ${secHigh > 0 ? `🟠 ${secHigh}` : '✅ 0'} |

---

## Action Items

${testsFailed > 0 ? `- ❌ Fix ${testsFailed} failing test(s)` : ''}
${tscErrors > 0 ? `- ❌ Fix ${tscErrors} TypeScript error(s)` : ''}
${secCritical > 0 ? `- 🔴 Address ${secCritical} critical security vulnerability(ies)` : ''}
${totalTodos > 20 ? `- ⚠️ ${totalTodos} TODOs in code — consider triaging` : ''}
${overallHealth === 'HEALTHY' ? '✅ All systems nominal. No critical issues found.' : ''}

---
*Auto-generated by nightly-audit.ts · ${date}*
`;
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('AST Nightly Audit — nightly-audit.ts');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  const date = new Date().toISOString().split('T')[0];
  const commit = run('git rev-parse --short HEAD').trim();

  // 1. Audit all modules
  console.log('\n[1/4] Auditing 14 modules...');
  const modules = MODULES.map(m => {
    const result = auditModule(m);
    const status = result.exists ? `✅ (${result.tsFiles} files, ${result.todoCount} TODOs)` : '❌ MISSING';
    console.log(`  ${m}: ${status}`);
    return result;
  });

  const totalTodos = modules.reduce((s, m) => s + m.todoCount, 0);
  const totalStubs = modules.reduce((s, m) => s + m.stubCount, 0);

  // 2. Run tests
  console.log('\n[2/4] Running test suite...');
  const tests = runTests();
  console.log(`  Passed: ${tests.passed} | Failed: ${tests.failed}`);

  // 3. TypeScript check
  console.log('\n[3/4] TypeScript check...');
  const ts = runTypeCheck();
  console.log(`  Errors: ${ts.errors}`);

  // 4. Security audit
  console.log('\n[4/4] Security audit...');
  const sec = runSecurityAudit();
  console.log(`  Critical: ${sec.critical} | High: ${sec.high}`);

  // Determine overall health
  const criticalCount = (tests.failed > 0 ? 1 : 0) + (ts.errors > 0 ? 1 : 0) + (sec.critical > 0 ? 1 : 0);
  const overallHealth: AuditSummary['overallHealth'] =
    criticalCount === 0 ? 'HEALTHY' :
    criticalCount <= 1 ? 'WARNING' :
    'CRITICAL';

  const summary: AuditSummary = {
    date,
    commit,
    modules,
    testsPassed: tests.passed,
    testsFailed: tests.failed,
    tscErrors: ts.errors,
    secCritical: sec.critical,
    secHigh: sec.high,
    totalTodos,
    totalStubs,
    overallHealth,
  };

  // Generate and write report
  const report = generateReport(summary);
  fs.writeFileSync(REPORT_FILE, report, 'utf8');

  console.log('\n' + '='.repeat(60));
  console.log(`Overall Health: ${overallHealth}`);
  console.log(`Report written to: ${REPORT_FILE}`);
  console.log('='.repeat(60));

  // Exit with error code if critical
  if (overallHealth === 'CRITICAL') {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('nightly-audit.ts fatal error:', err);
  process.exit(1);
});
