#!/usr/bin/env node
import * as fs from 'fs';
import { lintSource } from './lint';
import { ParseError } from './parser';
import { Finding } from './types';

function main(): void {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const filePaths = args.filter((a) => a !== '--json' && !a.startsWith('-'));

  if (filePaths.length === 0) {
    process.stderr.write('usage: ptree-lint [--json] <file.ptree> [more files...]\n');
    process.exit(2);
  }

  let hasError = false;
  const jsonReports: unknown[] = [];

  for (const filePath of filePaths) {
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      process.stderr.write(`ptree-lint: cannot read ${filePath}: ${(err as Error).message}\n`);
      hasError = true;
      continue;
    }

    const { findings, parseErrors } = lintSource(source);

    if (parseErrors.length > 0 || findings.some((f) => f.severity === 'error')) {
      hasError = true;
    }

    if (jsonMode) {
      jsonReports.push({ file: filePath, parseErrors, findings });
    } else {
      printHuman(filePath, parseErrors, findings);
    }
  }

  if (jsonMode) {
    process.stdout.write(JSON.stringify({ files: jsonReports }, null, 2) + '\n');
  }

  process.exit(hasError ? 1 : 0);
}

function printHuman(filePath: string, parseErrors: ParseError[], findings: Finding[]): void {
  if (parseErrors.length === 0 && findings.length === 0) {
    process.stdout.write(`${filePath}: no problems found\n`);
    return;
  }

  for (const err of parseErrors) {
    process.stdout.write(`${filePath}:${err.line}: parse error: ${err.message}\n`);
  }
  for (const finding of findings) {
    process.stdout.write(
      `${filePath}:${finding.line}: ${finding.severity}: ${finding.message} [${finding.ruleId}]\n`
    );
  }
}

main();
