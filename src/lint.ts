import { parseProcessTree, ParseError } from './parser';
import { rules } from './rules';
import { Finding } from './types';

export interface LintResult {
  findings: Finding[];
  parseErrors: ParseError[];
}

export interface LintOptions {
  disabledRules?: Set<string>;
}

export function lintSource(source: string, options: LintOptions = {}): LintResult {
  const { roots, errors } = parseProcessTree(source);
  const disabledRules = options.disabledRules ?? new Set<string>();

  const findings: Finding[] = [];
  for (const rule of rules) {
    if (disabledRules.has(rule.id)) {
      continue;
    }
    findings.push(...rule.run(roots));
  }
  findings.sort((a, b) => a.line - b.line);

  return { findings, parseErrors: errors };
}
