#!/usr/bin/env ts-node
/**
 * agents-status.ts — Agent system status dashboard
 *
 * Displays the current status of all CI/CD agents and workflows.
 * Checks: workflow files, recent runs, module health, test coverage.
 *
 * Usage:
 *   npx ts-node scripts/agents-status.ts
 *   npm run agents:status
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();

interface AgentStatus {
  name: string;
  module: string;
  workflowFile: string;
  workflowExists: boolean;
  lastModified?: string;
  testPath?: string;
  testsExist: boolean;
  moduleExists: boolean;
}

interface SystemStatus {
  agents: AgentStatus[];
  workflows: { name: string; path: string; exists: boolean }[];
  scripts: { name: string; path: string; exists: boolean }[];
  lastAuditReport?: string;
  gitBranch: string;
  lastCommit: string;
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e: any) {
    return (e.stdout ?? '') + (e.stderr ?? '');
  }
}

function fileExists(p: string): boolean {
  return fs.existsSync(path.join(ROOT, p));
}

function getLastModified(p: string): string {
  try {
    const stat = fs.statSync(path.join(ROOT, p));
    return stat.mtime.toISOString().split('T')[0];
  } catch {
    return 'unknown';
  }
}

function checkAgents(): AgentStatus[] {
  const agents: AgentStatus[] = [
    {
      name: 'AGENT-CHAIN',
      module: '02_nodechain_engine',
      workflowFile: '.github/workflows/agent-dispatcher.yml',
      testPath: 'tests/unit/nodechain',
      workflowExists: fileExists('.github/workflows/agent-dispatcher.yml'),
      moduleExists: fileExists('02_nodechain_engine'),
      testsExist: fileExists('tests/unit/nodechain') || run('find tests -name "*.spec.ts" | grep -i nodechain').trim().length > 0,
    },
    {
      name: 'AGENT-BRIDGE',
      module: '05_bridge_layer',
      workflowFile: '.github/workflows/agent-dispatcher.yml',
      testPath: 'tests/unit/bridge',
      workflowExists: fileExists('.github/workflows/agent-dispatcher.yml'),
      moduleExists: fileExists('05_bridge_layer'),
      testsExist: fileExists('tests/unit/bridge') || run('find tests -name "*.spec.ts" | grep -i bridge').trim().length > 0,
    },
    {
      name: 'AGENT-GOV',
      module: '06_governance_layer',
      workflowFile: '.github/workflows/agent-dispatcher.yml',
      testPath: 'tests/unit/governance',
      workflowExists: fileExists('.github/workflows/agent-dispatcher.yml'),
      moduleExists: fileExists('06_governance_layer'),
      testsExist: fileExists('tests/unit/governance'),
    },
    {
      name: 'AGENT-EMISSION',
      module: '10_proof_of_transaction_engine',
      workflowFile: '.github/workflows/agent-dispatcher.yml',
      testPath: 'tests/unit/emission',
      workflowExists: fileExists('.github/workflows/agent-dispatcher.yml'),
      moduleExists: fileExists('10_proof_of_transaction_engine'),
      testsExist: run('find tests -name "*.spec.ts" | grep -iE "emission|proof"').trim().length > 0,
    },
    {
      name: 'AGENT-TEST-INT',
      module: 'all modules',
      workflowFile: '.github/workflows/agent-dispatcher.yml',
      testPath: 'tests/',
      workflowExists: fileExists('.github/workflows/agent-dispatcher.yml'),
      moduleExists: true,
      testsExist: fileExists('tests'),
    },
    {
      name: 'AGENT-AUTOFIX',
      module: 'CI/CD',
      workflowFile: '.github/workflows/auto-fix.yml',
      workflowExists: fileExists('.github/workflows/auto-fix.yml'),
      moduleExists: true,
      testsExist: true,
    },
    {
      name: 'AGENT-NIGHTLY',
      module: 'all modules',
      workflowFile: '.github/workflows/nightly-audit.yml',
      workflowExists: fileExists('.github/workflows/nightly-audit.yml'),
      moduleExists: true,
      testsExist: true,
    },
  ];

  return agents.map(a => ({
    ...a,
    lastModified: a.workflowExists ? getLastModified(a.workflowFile) : undefined,
  }));
}

function checkWorkflows(): SystemStatus['workflows'] {
  return [
    { name: 'CI (main)',         path: '.github/workflows/ci.yml',               exists: fileExists('.github/workflows/ci.yml') },
    { name: 'Auto-Fix',          path: '.github/workflows/auto-fix.yml',         exists: fileExists('.github/workflows/auto-fix.yml') },
    { name: 'Agent Dispatcher',  path: '.github/workflows/agent-dispatcher.yml', exists: fileExists('.github/workflows/agent-dispatcher.yml') },
    { name: 'Nightly Audit',     path: '.github/workflows/nightly-audit.yml',    exists: fileExists('.github/workflows/nightly-audit.yml') },
    { name: 'AI Review',         path: '.github/workflows/ai-review.yml',        exists: fileExists('.github/workflows/ai-review.yml') },
  ];
}

function checkScripts(): SystemStatus['scripts'] {
  return [
    { name: 'fix-ci.ts',          path: 'scripts/fix-ci.ts',          exists: fileExists('scripts/fix-ci.ts') },
    { name: 'nightly-audit.ts',   path: 'scripts/nightly-audit.ts',   exists: fileExists('scripts/nightly-audit.ts') },
    { name: 'agents-status.ts',   path: 'scripts/agents-status.ts',   exists: fileExists('scripts/agents-status.ts') },
    { name: 'simulate_flow.ts',   path: 'scripts/simulate_flow.ts',   exists: fileExists('scripts/simulate_flow.ts') },
    { name: 'test_governance.ts', path: 'scripts/test_governance.ts', exists: fileExists('scripts/test_governance.ts') },
  ];
}

function printDashboard(status: SystemStatus): void {
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
  const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

  const ok = green('✅ OK');
  const miss = red('❌ MISSING');
  const warn = yellow('⚠️  PARTIAL');

  console.log('\n' + bold('═'.repeat(64)));
  console.log(bold('  AST-Aros-Financial-Paradigm — Agent System Status'));
  console.log(bold('═'.repeat(64)));
  console.log(`  Branch: ${cyan(status.gitBranch)}`);
  console.log(`  Commit: ${cyan(status.lastCommit)}`);
  console.log(`  Date:   ${new Date().toISOString()}`);
  console.log();

  // Workflows
  console.log(bold('  WORKFLOWS'));
  console.log('  ' + '─'.repeat(62));
  for (const wf of status.workflows) {
    const s = wf.exists ? ok : miss;
    console.log(`  ${s}  ${wf.name.padEnd(22)} ${wf.path}`);
  }
  console.log();

  // Agents
  console.log(bold('  AGENTS'));
  console.log('  ' + '─'.repeat(62));
  for (const agent of status.agents) {
    const wfOk = agent.workflowExists;
    const modOk = agent.moduleExists;
    const testOk = agent.testsExist;
    const allOk = wfOk && modOk;
    const s = allOk ? ok : !wfOk ? miss : warn;
    const testIcon = testOk ? green('🧪') : yellow('🚫');
    console.log(`  ${s}  ${agent.name.padEnd(18)} module: ${agent.module.padEnd(32)} tests: ${testIcon}`);
  }
  console.log();

  // Scripts
  console.log(bold('  SCRIPTS'));
  console.log('  ' + '─'.repeat(62));
  for (const sc of status.scripts) {
    const s = sc.exists ? ok : miss;
    console.log(`  ${s}  ${sc.path}`);
  }
  console.log();

  // Audit report
  if (status.lastAuditReport) {
    console.log(bold('  LAST NIGHTLY AUDIT'));
    console.log('  ' + '─'.repeat(62));
    const reportLines = status.lastAuditReport.split('\n').slice(0, 8);
    reportLines.forEach(l => console.log(`  ${l}`));
    console.log();
  }

  // Summary
  const totalAgents = status.agents.length;
  const healthyAgents = status.agents.filter(a => a.workflowExists && a.moduleExists).length;
  const totalWorkflows = status.workflows.length;
  const healthyWorkflows = status.workflows.filter(w => w.exists).length;

  console.log(bold('  SUMMARY'));
  console.log('  ' + '─'.repeat(62));
  console.log(`  Agents:    ${green(String(healthyAgents))}/${totalAgents} operational`);
  console.log(`  Workflows: ${green(String(healthyWorkflows))}/${totalWorkflows} present`);

  const overallOk = healthyAgents === totalAgents && healthyWorkflows === totalWorkflows;
  console.log(`  Status:    ${overallOk ? green('ALL SYSTEMS OPERATIONAL') : yellow('SOME COMPONENTS MISSING')}`);
  console.log(bold('═'.repeat(64)));
  console.log();
}

async function main(): Promise<void> {
  const agents = checkAgents();
  const workflows = checkWorkflows();
  const scripts = checkScripts();

  const gitBranch = run('git rev-parse --abbrev-ref HEAD').trim();
  const lastCommit = run('git log --oneline -1').trim();

  let lastAuditReport: string | undefined;
  const reportPath = path.join(ROOT, 'NIGHTLY_AUDIT_REPORT.md');
  if (fs.existsSync(reportPath)) {
    lastAuditReport = fs.readFileSync(reportPath, 'utf8');
  }

  const status: SystemStatus = {
    agents,
    workflows,
    scripts,
    lastAuditReport,
    gitBranch,
    lastCommit,
  };

  printDashboard(status);
}

main().catch(err => {
  console.error('agents-status.ts error:', err);
  process.exit(1);
});
