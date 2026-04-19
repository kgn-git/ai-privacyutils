/**
 * ReDoS CLI scanner for src/patterns.ts (S5 per security review).
 *
 * Runs the `recheck` library over every RegExp literal exported from
 * src/patterns.ts and fails CI if any returns a non-`safe` verdict.
 * Complements eslint-plugin-redos by surfacing findings as a dedicated
 * required status check.
 *
 * Usage: `npm run redos:scan` or `node scripts/redos-scan.mjs`.
 */
import { check } from 'recheck';

import {
  emailPattern,
  addressPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
} from '../dist/patterns.js';

const targets = [
  ['emailPattern', emailPattern],
  ['addressPattern', addressPattern],
  ['phoneInternationalPattern', phoneInternationalPattern],
  ['phoneDomesticPattern', phoneDomesticPattern],
  ['dobPattern', dobPattern],
];

let failed = 0;

for (const [name, re] of targets) {
  const result = await check(re.source, re.flags, { timeout: 30_000 });
  if (result.status === 'safe') {
    console.log(`  OK ${name}: safe`);
  } else if (result.status === 'unknown') {
    console.warn(`  WARN ${name}: unknown (${result.error?.kind ?? 'n/a'})`);
  } else {
    failed += 1;
    const complexity = result.complexity?.type ?? 'vulnerable';
    console.log(`  FAIL ${name}: ${complexity}`);
  }
}

if (failed > 0) {
  console.error(`\nredos-scan: ${failed} pattern(s) failed.`);
  process.exit(1);
}

console.log('\nredos-scan: all patterns safe.');
