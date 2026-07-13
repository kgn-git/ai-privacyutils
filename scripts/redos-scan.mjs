/**
 * ReDoS CLI scanner for src/patterns.ts (S5 per security review).
 *
 * Runs the `recheck` library over every RegExp literal exported from
 * src/patterns.ts and fails CI if any returns a non-`safe` verdict.
 * Complements eslint-plugin-redos by surfacing findings as a dedicated
 * required status check.
 *
 * v1.1 expands the scan from 5 patterns (v1.0.0) to 21 (adds 5 locale
 * address factories + 6 postcode factories per #1 R1 resolution, then 5
 * national-ID extraction factories per #8 R10 resolution).
 *
 * Usage: `npm run redos:scan` or `node scripts/redos-scan.mjs`.
 */
import { check } from 'recheck';

import {
  emailPattern,
  addressPattern,
  addressFrPattern,
  addressDePattern,
  addressItPattern,
  addressEsPattern,
  addressPtPattern,
  postcodeUkPattern,
  postcodeFrPattern,
  postcodeDePattern,
  postcodeItPattern,
  postcodeEsPattern,
  postcodePtPattern,
  nationalIdUkExtractionPattern,
  nationalIdFrExtractionPattern,
  nationalIdItExtractionPattern,
  nationalIdEsExtractionPattern,
  nationalIdPtExtractionPattern,
  phoneInternationalPattern,
  phoneDomesticPattern,
  dobPattern,
  dobContextCuePattern,
} from '../dist/patterns.js';

// Pattern exports are factory functions (IMP-1); call each to obtain the
// underlying /g RegExp that recheck will analyse.
const targets = [
  ['emailPattern', emailPattern()],
  ['addressPattern (EN)', addressPattern()],
  ['addressFrPattern', addressFrPattern()],
  ['addressDePattern', addressDePattern()],
  ['addressItPattern', addressItPattern()],
  ['addressEsPattern', addressEsPattern()],
  ['addressPtPattern', addressPtPattern()],
  ['postcodeUkPattern', postcodeUkPattern()],
  ['postcodeFrPattern', postcodeFrPattern()],
  ['postcodeDePattern', postcodeDePattern()],
  ['postcodeItPattern', postcodeItPattern()],
  ['postcodeEsPattern', postcodeEsPattern()],
  ['postcodePtPattern', postcodePtPattern()],
  ['nationalIdUkExtractionPattern', nationalIdUkExtractionPattern()],
  ['nationalIdFrExtractionPattern', nationalIdFrExtractionPattern()],
  ['nationalIdItExtractionPattern', nationalIdItExtractionPattern()],
  ['nationalIdEsExtractionPattern', nationalIdEsExtractionPattern()],
  ['nationalIdPtExtractionPattern', nationalIdPtExtractionPattern()],
  ['phoneInternationalPattern', phoneInternationalPattern()],
  ['phoneDomesticPattern', phoneDomesticPattern()],
  ['dobPattern', dobPattern()],
  ['dobContextCuePattern', dobContextCuePattern()],
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
