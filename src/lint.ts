import { parseProcessTree, ParseError } from './parser';
import { rules } from './rules';
import { Finding } from './types';

export interface LintResult {
  findings: Finding[];
  parseErrors: ParseError[];
}

export function lintSource(source: string): LintResult {
  const { roots, errors } = parseProcessTree(source);

  const findings: Finding[] = [];
  for (const rule of rules) {
    findings.push(...rule(roots));
  }
  findings.sort((a, b) => a.line - b.line);

  return { findings, parseErrors: errors };
}
