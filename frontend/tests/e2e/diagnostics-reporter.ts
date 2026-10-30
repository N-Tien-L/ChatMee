import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** Allowlisted metadata only: raw errors, attachments and browser state are excluded. */
export default class DiagnosticsReporter implements Reporter {
  private readonly directory = resolve(process.cwd(), 'e2e-diagnostics');
  private infrastructureError = false;
  private results: { id: string; title: string; file: string; line: number; status: string;
    expectedStatus: string; durationMs: number; retry: number; errorKind: string | null }[] = [];
  private save(status: string) {
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(resolve(this.directory, 'suite.json'), JSON.stringify({ version: 1,
      timestamp: new Date().toISOString(), status, infrastructureError: this.infrastructureError,
      tests: this.results }, null, 2));
  }
  onBegin() { this.save('running'); }
  onError() { this.infrastructureError = true; this.save('running'); }
  onTestEnd(test: TestCase, result: TestResult) {
    this.results.push({ id: test.id, title: test.titlePath().slice(1).join(' / '),
      file: basename(test.location.file), line: test.location.line, status: result.status,
      expectedStatus: test.expectedStatus, durationMs: result.duration, retry: result.retry,
      errorKind: result.errors.length ? result.status === 'timedOut' ? 'timeout' : 'assertion-or-action' : null });
    this.save('running');
  }
  onEnd(result: FullResult) { this.save(result.status); }
}
