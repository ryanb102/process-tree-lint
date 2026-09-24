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

// A detached process (detach=true) forks away from its parent and is no
// longer supervised directly; when it exits, something has to be sitting
// in the ancestry with reaper=true to waitpid() it, or it lingers as a
// zombie. Walking the tree with the id of the nearest reaping ancestor
// finds any detached node that has nothing above it doing that job.
const detachedWithoutReaper: Rule = (roots) => {
  const findings: Finding[] = [];

  function visit(node: ProcessNode, hasReapingAncestor: boolean): void {
    const isDetached = node.attrs.detach === 'true';
    const isReaper = node.attrs.reaper === 'true';

    if (isDetached && !hasReapingAncestor) {
      findings.push({
        ruleId: 'detached-without-reaper',
        severity: 'warning',
        line: node.line,
        processName: node.name,
        message: `process "${node.name}" is detached but has no reaper in its ancestry; orphaned children will not be reaped`,
      });
    }

    for (const child of node.children) {
      visit(child, hasReapingAncestor || isReaper);
    }
  }

  for (const root of roots) {
    visit(root, false);
  }

  return findings;
};

const KNOWN_ATTRS = ['cmd', 'restart', 'detach', 'reaper'];

// Plain edit distance between two strings, used to suggest a known
// attribute when someone typos one (e.g. "comand" for "cmd").
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp[a.length][b.length];
}

function closestKnownAttr(attr: string): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;

  for (const known of KNOWN_ATTRS) {
    const distance = levenshtein(attr, known);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = known;
    }
  }

  // Beyond a distance of 2 the match is more likely coincidental than a typo.
  return bestDistance <= 2 ? best : undefined;
}

// Attribute names aren't validated anywhere else, so a typo like
// "restrat=always" silently does nothing instead of failing loudly.
const unknownAttribute: Rule = (roots) => {
  const findings: Finding[] = [];

  walk(roots, (node) => {
    for (const key of Object.keys(node.attrs)) {
      if (KNOWN_ATTRS.includes(key)) {
        continue;
      }

      const suggestion = closestKnownAttr(key);
      const message = suggestion
        ? `process "${node.name}" has unknown attribute "${key}", did you mean "${suggestion}"?`
        : `process "${node.name}" has unknown attribute "${key}"`;

      findings.push({
        ruleId: 'unknown-attribute',
        severity: 'warning',
        line: node.line,
        processName: node.name,
        message,
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

export const rules: Rule[] = [
  duplicateProcessName,
  missingCommand,
  noRestartPolicyWithChildren,
  detachedWithoutReaper,
  unknownAttribute,
  emptyTree,
];
