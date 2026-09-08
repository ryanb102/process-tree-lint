// Parses the .ptree text format into a tree of ProcessNode, tracking the
// source line of every node so lint findings can point back at the file.

export interface ProcessNode {
  name: string;
  attrs: Record<string, string>;
  children: ProcessNode[];
  line: number;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  roots: ProcessNode[];
  errors: ParseError[];
}

// Two-space indentation marks depth; parens after the name hold comma
// separated attributes, e.g. worker (cmd="node worker.js", restart=always).
const LINE_PATTERN = /^( *)([A-Za-z0-9_.\-/]+)(?:\s*\((.*)\))?\s*$/;

export function parseProcessTree(source: string): ParseResult {
  const errors: ParseError[] = [];
  const roots: ProcessNode[] = [];
  const stack: { node: ProcessNode; depth: number }[] = [];

  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNumber = i + 1;

    if (raw.trim() === '' || raw.trim().startsWith('#')) {
      continue;
    }

    if (raw.includes('\t')) {
      errors.push({ line: lineNumber, message: 'tabs are not allowed for indentation, use spaces' });
      continue;
    }

    const match = raw.match(LINE_PATTERN);
    if (!match) {
      errors.push({ line: lineNumber, message: `could not parse line: "${raw}"` });
      continue;
    }

    const [, indent, name, attrsRaw] = match;
    if (indent.length % 2 !== 0) {
      errors.push({
        line: lineNumber,
        message: `indentation must be a multiple of 2 spaces, got ${indent.length}`,
      });
      continue;
    }
    const depth = indent.length / 2;

    let attrs: Record<string, string>;
    try {
      attrs = parseAttrs(attrsRaw ?? '');
    } catch (err) {
      errors.push({ line: lineNumber, message: (err as Error).message });
      continue;
    }

    const node: ProcessNode = { name, attrs, children: [], line: lineNumber };

    if (depth === 0) {
      roots.push(node);
      stack.length = 0;
      stack.push({ node, depth });
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      errors.push({
        line: lineNumber,
        message: `process "${name}" is indented but has no parent at that level`,
      });
      continue;
    }

    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth });
  }

  return { roots, errors };
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const trimmed = raw.trim();
  if (trimmed === '') {
    return attrs;
  }

  let i = 0;
  while (i < trimmed.length) {
    while (i < trimmed.length && /[\s,]/.test(trimmed[i])) i++;
    if (i >= trimmed.length) break;

    const keyStart = i;
    while (i < trimmed.length && trimmed[i] !== '=') i++;
    if (i >= trimmed.length) {
      throw new Error(`malformed attribute near "${trimmed.slice(keyStart)}"`);
    }
    const key = trimmed.slice(keyStart, i).trim();
    i++; // skip '='

    let value: string;
    if (trimmed[i] === '"') {
      i++;
      const valStart = i;
      while (i < trimmed.length && trimmed[i] !== '"') i++;
      if (i >= trimmed.length) {
        throw new Error(`unterminated quoted value for attribute "${key}"`);
      }
      value = trimmed.slice(valStart, i);
      i++; // skip closing quote
    } else {
      const valStart = i;
      while (i < trimmed.length && trimmed[i] !== ',') i++;
      value = trimmed.slice(valStart, i).trim();
    }

    if (key === '') {
      throw new Error('attribute name cannot be empty');
    }
    attrs[key] = value;
  }

  return attrs;
}
