// Runs every *.test.js in tests/unit (and server/test) with Node's built-in test runner (Node 18+).
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dirs = [path.join(here, 'unit'), path.join(here, '..', 'server', 'test')].filter(existsSync);
const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(d, f)));
const env = { ...process.env, JWT_SECRET: process.env.JWT_SECRET || 'test-secret-'.padEnd(40, 'x'), NODE_ENV: 'test' };
process.exit(spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env }).status ?? 1);
