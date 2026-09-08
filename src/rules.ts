import { ProcessNode } from './parser';
import { Finding } from './types';

export type Rule = (roots: ProcessNode[]) => Finding[];

function walk(nodes: ProcessNode[], visit: (node: ProcessNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// Two processes sharing a name usually means a copy-paste mistake, and
// downstream tooling that keys on name (restart tracking, log routing)
// will only ever see one of them.
const duplicateProcessName: Rule = (roots) => {
  const findings: Finding[] = [];
  const seen = new Map<string, ProcessNode>();

  walk(roots, (node) => {
    const existing = seen.get(node.name);
    if (existing) {
      findings.push({
        ruleId: 'duplicate-process-name',
        severity: 'error',
        line: node.line,
        processName: node.name,
        message: `process "${node.name}" is already defined at line ${existing.line}`,
      });
    } else {
      seen.set(node.name, node);
    }
  });

  return findings;
};

const missingCommand: Rule = (roots) => {
  const findings: Finding[] = [];

  walk(roots, (node) => {
    if (!node.attrs.cmd || node.attrs.cmd.trim() === '') {
      findings.push({
        ruleId: 'missing-command',
        severity: 'error',
        line: node.line,
        processName: node.name,
        message: `process "${node.name}" has no cmd attribute`,
      });
    }
  });

  return findings;
};

// A parent with no restart policy that dies takes its whole subtree with
// it (or leaves it orphaned, depending on the supervisor), which is rarely
// what was intended when children were nested under it.
const noRestartPolicyWithChildren: Rule = (roots) => {
  const findings: Finding[] = [];

  walk(roots, (node) => {
    if (node.children.length > 0 && !node.attrs.restart) {
      findings.push({
        ruleId: 'no-restart-policy-with-children',
        severity: 'warning',
        line: node.line,
        processName: node.name,
        message: `process "${node.name}" has children but no restart policy; if it dies its children are orphaned`,
      });
    }
  });

  return findings;
};

const emptyTree: Rule = (roots) => {
  if (roots.length === 0) {
    return [
      {
        ruleId: 'empty-tree',
        severity: 'error',
        line: 1,
        processName: '',
        message: 'process tree file defines no processes',
      },
    ];
  }
  return [];
};

export const rules: Rule[] = [duplicateProcessName, missingCommand, noRestartPolicyWithChildren, emptyTree];
