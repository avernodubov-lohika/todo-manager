import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

// A fresh SQLite file per test run, schema applied with `prisma db push`.
export default function setup(project: TestProject) {
  const dir = mkdtempSync(path.join(tmpdir(), 'todo-test-'));
  const url = `file:${path.join(dir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  project.provide('dbUrl', url);
  return () => rmSync(dir, { recursive: true, force: true });
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
