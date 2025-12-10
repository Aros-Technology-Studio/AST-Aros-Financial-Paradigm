#!/usr/bin/env python3
"""
Autonomous logic guard for AROS‑PARADIGM‑AST.
Scans markdown and JSON files for terminology, logic and documentation issues
according to a specification file.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# --------------------------------------------------------------------------- #
# Utility helpers
# --------------------------------------------------------------------------- #

SKIP_DIRS = {'.git', 'node_modules', 'reports'}

def load_spec(spec_path: Path) -> dict:
    """Load JSON spec with // comments stripped."""
    lines = []
    for line in spec_path.read_text(encoding='utf-8').splitlines():
        line = line.split('//')[0].strip()
        if line:
            lines.append(line)
    return json.loads('\n'.join(lines))

def iter_files(root: Path):
    """Yield repository files of interest."""
    for path in root.rglob('*'):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.is_file() and path.suffix in {'.md', '.json'}:
            yield path

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return path.read_text(encoding='utf-8', errors='ignore')

def detect_language_mix(text: str) -> float:
    cyr = len(re.findall(r'[\u0410-\u044f]', text))
    lat = len(re.findall(r'[A-Za-z]', text))
    total = cyr + lat
    if total == 0:
        return 0.0
    return min(cyr, lat) / total

# --------------------------------------------------------------------------- #
# Guard class
# --------------------------------------------------------------------------- #

class ASTGuard:
    def __init__(self, repo: Path, spec: dict):
        self.repo = repo
        self.spec = spec
        self.findings = []
        self.summary = defaultdict(lambda: {'errors': 0, 'warnings': 0})
        self.hard_fail = False
        self.file_text = {}
        self.global_markers = defaultdict(int)

    def add_finding(self, rule, file, line, severity, message, excerpt):
        self.findings.append({
            'file': str(file) if file else None,
            'line': line,
            'rule': rule,
            'severity': severity,
            'message': message,
            'excerpt': excerpt.strip()
        })
        self.summary[rule][severity + 's'] += 1
        if rule == 'TERM-FORBID' or (rule == 'AUD-ROLLBACK' and 'contradiction' in message.lower()) or rule == 'JSON-VALID':
            self.hard_fail = True

    # ------------------------------- checks -------------------------------- #

    def check_terminology(self, path: Path, text: str):
        lower = text.lower()
        for term in self.spec['terminology']['forbidden']:
            if term.lower() in lower or term.lower() in path.name.lower():
                line_no = lower.split(term.lower())[0].count('\n') + 1
                self.add_finding('TERM-FORBID', path, line_no, 'error',
                                 f'Forbidden term "{term}" found',
                                 term)
        for term in self.spec['terminology']['allowed']:
            if term.lower() in lower:
                self.global_markers['allowed_terms'] += 1

    def check_non_speculative(self, path: Path, text: str):
        if re.search(r'staking rewards', text, re.IGNORECASE):
            line_no = text.lower().split('staking rewards')[0].count('\n') + 1
            self.add_finding('NON-SPEC', path, line_no, 'error',
                             'Non‑speculative design violated ("staking rewards")',
                             'staking rewards')

    def check_audit(self, path: Path, text: str):
        lower = text.lower()
        for marker in self.spec['logic']['audit_markers']:
            if marker.lower() in lower:
                self.global_markers['audit'] += 1
        if 'rollback' in lower and ('no rollback' in lower or 'без отката' in lower):
            line_no = lower.split('rollback')[0].count('\n') + 1
            self.add_finding('AUD-ROLLBACK', path, line_no, 'error',
                             'Contradiction: rollback and no rollback present',
                             'rollback / no rollback')

    def check_kyc(self, path: Path, text: str):
        lower = text.lower()
        markers = [m.lower() for m in self.spec['logic']['kyc_markers']]
        if any(m in lower for m in markers):
            self.global_markers['kyc'] += 1
            req = [r.lower() for r in self.spec['logic']['kyc_require']]
            if not any(r in lower for r in req):
                line_no = 1
                self.add_finding('KYC-LINK', path, line_no, 'error',
                                 'KYC/AML mentioned without region/jurisdiction/retention',
                                 ' '.join(markers))

    def check_time_sync(self, path: Path, text: str):
        lower = text.lower()
        tm = self.spec['logic']['time_markers']
        if any(m.lower() in lower for m in tm):
            self.global_markers['time'] += 1
        ttl_matches = re.findall(r'ttl[^0-9]{0,5}(\d+)', lower)
        for m in ttl_matches:
            ttl = int(m)
            if ttl > self.spec['logic']['ttl_max_seconds']:
                line_no = lower.split('ttl')[0].count('\n') + 1
                self.add_finding('TIME-SYNC', path, line_no, 'error',
                                 f'TTL {ttl}s exceeds limit',
                                 f'TTL {ttl}')
            if not any(x in lower for x in ['syncclock', 'heartbeat', 'nonce', 'time drift']):
                line_no = lower.split('ttl')[0].count('\n') + 1
                self.add_finding('TIME-SYNC', path, line_no, 'warning',
                                 'TTL used without time source mention',
                                 f'TTL {ttl}')

    def check_crypto(self, path: Path, text: str):
        lower = text.lower()
        markers = [m.lower() for m in self.spec['logic']['crypto_markers'][:3]]
        if any(m in lower for m in markers):
            self.global_markers['crypto'] += 1
            required = [m.lower() for m in self.spec['logic']['crypto_markers'][3:]]
            if not all(r in lower for r in required):
                line_no = lower.split(markers[0])[0].count('\n') + 1
                self.add_finding('CRYPTO-LINK', path, line_no, 'error',
                                 'Crypto marker without nonce/hash/quorum',
                                 markers[0])

    def check_doc_style(self, path: Path, text: str):
        lines = text.splitlines()
        if self.spec['docs_style']['require_h1']:
            if not lines or not lines[0].startswith('#'):
                self.add_finding('DOC-STYLE', path, 1, 'error',
                                 'Missing H1 title', '')
        for forb in self.spec['docs_style']['forbidden_markers']:
            if forb.lower() in text.lower():
                line_no = text.lower().split(forb.lower())[0].count('\n') + 1
                self.add_finding('DOC-STYLE', path, line_no, 'error',
                                 f'Forbidden marker "{forb}"', forb)
        if self.spec['docs_style']['check_mermaid']:
            for match in re.finditer(r'```(\w+)', text):
                lang = match.group(1).strip()
                if lang.lower() == 'mermaid':
                    continue
                if 'mermaid' in lang.lower():
                    line_no = text[:match.start()].count('\n') + 1
                    self.add_finding('DOC-STYLE', path, line_no, 'warning',
                                     'Incorrect Mermaid block syntax', lang)
        mix = detect_language_mix(text)
        if mix > self.spec['docs_style']['language_mixed_threshold']:
            self.add_finding('DOC-STYLE', path, 1, 'warning',
                             'Possible mixed languages', '')

    def check_json_valid(self, path: Path, text: str):
        try:
            json.loads(text)
        except Exception as exc:
            self.add_finding('JSON-VALID', path, 1, 'error',
                             f'Invalid JSON: {exc}', '')

    def process_file(self, path: Path):
        text = read_text(path)
        self.file_text[path] = text.lower()
        self.check_terminology(path, text)
        self.check_non_speculative(path, text)
        self.check_audit(path, text)
        self.check_kyc(path, text)
        self.check_time_sync(path, text)
        self.check_crypto(path, text)
        if path.suffix == '.md':
            self.check_doc_style(path, text)
        if path.suffix == '.json':
            self.check_json_valid(path, text)
        for marker in self.spec['logic']['must_have_markers']:
            if marker.lower() in text.lower():
                self.global_markers['pot'] += 1

    def cross_refs(self):
        for ref in self.spec['logic']['layer_cross_refs']:
            if any(self.global_markers[m.lower()] > 0 for m in ref['if_any']):
                ok = False
                for rel in ref['then_any_in_files']:
                    fpath = self.repo / rel
                    if fpath.exists():
                        content = read_text(fpath).lower()
                        if any(m.lower() in content for m in ref['if_any']):
                            ok = True
                            break
                if not ok:
                    self.add_finding('XREF', None, None, 'error',
                                     f'Missing cross reference for {ref["if_any"]}',
                                     '')

    def final_checks(self):
        if self.global_markers['pot'] == 0:
            self.add_finding('POT-LOGIC', None, None, 'error',
                             'No PoT markers found', '')
        if self.global_markers['audit'] == 0:
            self.add_finding('AUD-ROLLBACK', None, None, 'warning',
                             'No audit markers found', '')
        if self.global_markers['kyc'] == 0:
            self.add_finding('KYC-LINK', None, None, 'warning',
                             'No KYC/AML markers found', '')
        if self.global_markers['time'] == 0:
            self.add_finding('TIME-SYNC', None, None, 'warning',
                             'No time-sync markers found', '')
        if self.global_markers['crypto'] == 0:
            self.add_finding('CRYPTO-LINK', None, None, 'warning',
                             'No crypto markers found', '')
        self.cross_refs()

    # ------------------------------ reporting ------------------------------- #

    def compute_score(self):
        weights = self.spec['scoring']['weights']
        category_map = {
            'terminology': ['TERM-FORBID'],
            'pot_logic': ['POT-LOGIC'],
            'audit_rollback': ['AUD-ROLLBACK'],
            'kyc_link': ['KYC-LINK'],
            'time_sync': ['TIME-SYNC'],
            'crypto_link': ['CRYPTO-LINK'],
            'non_speculative': ['NON-SPEC'],
            'cross_layer_refs': ['XREF'],
            'doc_style': ['DOC-STYLE', 'JSON-VALID']
        }
        total = sum(weights.values())
        score = 0
        for cat, weight in weights.items():
            rules = category_map.get(cat, [])
            if not any(self.summary[r]['errors'] > 0 for r in rules):
                score += weight
        return 0.0 if self.hard_fail else (score / total) * 100

    def save_reports(self, out_dir: Path, report: dict):
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / 'ast_report.json').write_text(
            json.dumps(report, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )
        lines = ['# AST Logic Guard Summary', '', '| Rule | Errors | Warnings |', '|---|---|---|']
        for rule, counts in sorted(self.summary.items()):
            lines.append(f'| {rule} | {counts["errors"]} | {counts["warnings"]} |')
        lines.append('')
        crit = [f for f in self.findings if f['severity'] == 'error' and (
            f['rule'] == 'TERM-FORBID' or ('rollback' in f['message'].lower()) or f['rule'] == 'JSON-VALID')]
        if crit:
            lines.append('## Critical findings')
            for f in crit:
                lines.append(f'- {f["rule"]}: {f["message"]} ({f["file"]})')
        (out_dir / 'ast_summary.md').write_text('\n'.join(lines), encoding='utf-8')

    def print_summary(self, report: dict):
        print(f'AST Logic Guard score: {report["score"]:.2f} (threshold {report["threshold"]})')
        for rule, counts in sorted(self.summary.items()):
            print(f'{rule}: {counts["errors"]} errors, {counts["warnings"]} warnings')
        if self.hard_fail:
            print('Hard fail conditions encountered.')

    # ------------------------------- workflow -------------------------------- #

    def run(self):
        for path in iter_files(self.repo):
            self.process_file(path)
        self.final_checks()
        score = self.compute_score()
        report = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'score': score,
            'threshold': self.spec['scoring']['overall_threshold'],
            'hard_fail': self.hard_fail,
            'summary': self.summary,
            'findings': self.findings
        }
        return report

# --------------------------------------------------------------------------- #
# CLI entry
# --------------------------------------------------------------------------- #

def main():
    p = argparse.ArgumentParser(description='AST Logic Guard')
    p.add_argument('--repo', required=True, type=Path)
    p.add_argument('--spec', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    args = p.parse_args()

    spec = load_spec(args.spec)
    guard = ASTGuard(args.repo, spec)
    report = guard.run()
    guard.save_reports(args.out, report)
    guard.print_summary(report)
    if guard.hard_fail or report['score'] < report['threshold']:
        sys.exit(1)

if __name__ == '__main__':
    main()
