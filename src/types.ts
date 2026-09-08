export type Severity = 'error' | 'warning';

export interface Finding {
  ruleId: string;
  severity: Severity;
  line: number;
  processName: string;
  message: string;
}
