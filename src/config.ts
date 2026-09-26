// Loads .ptreelintrc: a JSON file that turns individual rules on or off.
// Discovery walks up from the linted file's directory the way most dotfile
// configs do, so a config at the repo root covers files in subdirectories.

import * as fs from 'fs';
import * as path from 'path';
import { RULE_IDS } from './rules';

const CONFIG_FILENAME = '.ptreelintrc';

export interface PtreeLintConfig {
  disabledRules: Set<string>;
}

const EMPTY_CONFIG: PtreeLintConfig = { disabledRules: new Set() };

export function loadConfig(startDir: string): PtreeLintConfig {
  const configPath = findConfigFile(startDir);
  if (!configPath) {
    return EMPTY_CONFIG;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${configPath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${configPath} is not valid JSON: ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }

  const rulesField = (parsed as Record<string, unknown>).rules;
  const disabledRules = new Set<string>();

  if (rulesField !== undefined) {
    if (typeof rulesField !== 'object' || rulesField === null || Array.isArray(rulesField)) {
      throw new Error(`${configPath}: "rules" must be an object mapping rule id to true/false`);
    }

    for (const [ruleId, value] of Object.entries(rulesField as Record<string, unknown>)) {
      if (!RULE_IDS.includes(ruleId)) {
        throw new Error(
          `${configPath}: unknown rule "${ruleId}" (known rules: ${RULE_IDS.join(', ')})`
        );
      }

      if (value === false || value === 'off') {
        disabledRules.add(ruleId);
      } else if (value !== true && value !== 'on') {
        throw new Error(
          `${configPath}: rule "${ruleId}" must be set to true, false, "on", or "off"`
        );
      }
    }
  }

  return { disabledRules };
}

function findConfigFile(startDir: string): string | undefined {
  let dir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
