#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const exts = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const bans = [
  {
    name: 'maybeEnterOnlineDeathOverlay',
    replacement: 'maybeEnterDeathContinueOverlay',
    allow: [
      /function\s+maybeEnterOnlineDeathOverlay\s*\(/,
      /maybeEnterOnlineDeathOverlay\(\)\. Keep this alias/,
    ],
  },
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name.startsWith('.git')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(SRC_DIR)) {
  const rel = path.relative(ROOT, file).replaceAll('\\', '/');
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const ban of bans) {
      if (!line.includes(ban.name)) continue;
      const allowed = ban.allow.some((re) => re.test(line));
      if (!allowed) {
        failures.push(`${rel}:${idx + 1} -> legacy hook '${ban.name}' found; use '${ban.replacement}'`);
      }
    }
  });
}

if (failures.length) {
  console.error('\n[check-legacy-hooks] FAILED');
  for (const f of failures) console.error(' - ' + f);
  console.error('\nFix the stale references before running the game.');
  process.exit(1);
}

console.log('[check-legacy-hooks] OK');
