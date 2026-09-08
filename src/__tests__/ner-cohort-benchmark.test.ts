// Cohort 1 (Western European) TP ≥ 70 % is the CI-blocking gate (C1); cohorts 2–4 and the false-positive set are
// measured and logged without a gate; the ≥ 95 % / ≤ 5 pp target is carried to the ML-engine upgrade (C7). Each
// fixture holds exactly one name; FP fixtures hold none. Measured rates: ADR 004, and the record § 5 (R3-residual).

import { describe, it, expect, beforeAll } from 'vitest';

import { CompromiseNerEngine } from '../ner/compromise-ner-engine.js';

interface Fixture {
  text: string;
  expectedName: string; // canonical full name we expect detected
}

// Cohort 1 — Western European (≥ 10 fixtures, TP ≥ 70 % CI-blocking gate)
const COHORT_1_WESTERN_EU: ReadonlyArray<Fixture> = [
  { text: 'Alice Brown applied for the role.', expectedName: 'Alice Brown' },
  { text: 'Bob Smith joined the team.', expectedName: 'Bob Smith' },
  { text: 'Charlotte Williams sent her CV.', expectedName: 'Charlotte Williams' },
  { text: 'David Johnson is the lead engineer.', expectedName: 'David Johnson' },
  { text: 'Emma Garcia leads the marketing team.', expectedName: 'Emma Garcia' },
  { text: 'Hans Schmidt has 10 years of experience.', expectedName: 'Hans Schmidt' },
  { text: 'Sophie Martin contributed to the project.', expectedName: 'Sophie Martin' },
  { text: 'Marco Rossi presented at the conference.', expectedName: 'Marco Rossi' },
  { text: 'Carlos Rodriguez completed the certification.', expectedName: 'Carlos Rodriguez' },
  { text: 'Maria Silva published the paper.', expectedName: 'Maria Silva' },
  { text: 'James Wilson reviewed the proposal.', expectedName: 'James Wilson' },
  { text: 'Sarah Davis approved the design.', expectedName: 'Sarah Davis' },
];

// Cohort 2 — Maghrebi (≥ 5 fixtures, benchmark only)
const COHORT_2_MAGHREBI: ReadonlyArray<Fixture> = [
  { text: 'Mohamed Bensalem applied for the role.', expectedName: 'Mohamed Bensalem' },
  { text: 'Fatima Zahra leads the project.', expectedName: 'Fatima Zahra' },
  { text: 'Karim Benali joined the team.', expectedName: 'Karim Benali' },
  { text: 'Yasmine Khelil has a Ph.D. in physics.', expectedName: 'Yasmine Khelil' },
  { text: 'Ahmed El Mansouri is a senior engineer.', expectedName: 'Ahmed El Mansouri' },
  { text: 'Nadia Boubakeur completed the course.', expectedName: 'Nadia Boubakeur' },
];

// Cohort 3 — East Asian transliterated (≥ 5 fixtures, benchmark only)
const COHORT_3_EAST_ASIAN: ReadonlyArray<Fixture> = [
  { text: 'Wei Zhang reviewed the code.', expectedName: 'Wei Zhang' },
  { text: 'Yuki Tanaka shipped the feature.', expectedName: 'Yuki Tanaka' },
  { text: 'Hiroshi Sato joined as a contractor.', expectedName: 'Hiroshi Sato' },
  { text: 'Min Park leads the design team.', expectedName: 'Min Park' },
  { text: 'Jun Liu wrote the migration script.', expectedName: 'Jun Liu' },
  { text: 'Akiko Yamamoto presented the results.', expectedName: 'Akiko Yamamoto' },
];

// Cohort 4 — Slavic transliterated (≥ 5 fixtures, benchmark only)
const COHORT_4_SLAVIC: ReadonlyArray<Fixture> = [
  { text: 'Dmitri Volkov is the technical lead.', expectedName: 'Dmitri Volkov' },
  { text: 'Jana Novák joined the team.', expectedName: 'Jana Novák' },
  { text: 'Aleksandr Petrov reviewed the PR.', expectedName: 'Aleksandr Petrov' },
  { text: 'Olga Ivanova approved the budget.', expectedName: 'Olga Ivanova' },
  { text: 'Pavel Kowalski wrote the test.', expectedName: 'Pavel Kowalski' },
  { text: 'Natasha Sokolova manages the team.', expectedName: 'Natasha Sokolova' },
];

// False-positive fixtures — no person name in any of them (≥ 20 across categories)
const FP_FIXTURES: ReadonlyArray<string> = [
  // Company / brand names
  'I worked at Google for 5 years.',
  'Microsoft Azure is our cloud provider.',
  'Amazon Web Services hosts the production cluster.',
  'Apple Computer was founded in 1976.',
  'IBM Watson powers the analytics layer.',
  // University names
  'I graduated from MIT in 2018.',
  'Stanford University offers the program.',
  'Harvard Business School publishes the journal.',
  'Cambridge engineering department recommended me.',
  'Oxford alumni network is active.',
  // Tech terms / project names
  'I use React and Node.js daily.',
  'The Jenkins pipeline failed last night.',
  'We migrated to Kubernetes last quarter.',
  'TypeScript is my primary language.',
  'The Hudson server is being decommissioned.',
  // Job titles
  'I am a Senior Engineer at Acme.',
  'My role is Director of Engineering.',
  'I held the position of Vice President.',
  'I report to the Chief Technology Officer.',
  'My job title was Software Architect.',
  // Common phrases
  'Please review the attached document.',
  'I look forward to hearing from you.',
];

// Tolerant match: any span containing one token of the expected name counts — partial detection (a truncated
// compound, a surname collision) still reduces exposure against no redaction.
async function detectionRate(
  engine: CompromiseNerEngine,
  fixtures: ReadonlyArray<Fixture>,
): Promise<{ tp: number; misses: string[]; rate: number }> {
  let tp = 0;
  const misses: string[] = [];
  for (const f of fixtures) {
    const spans = await engine.detectPersonSpans(f.text);
    const detected = spans.some((s) => {
      const matched = f.text.slice(s.start, s.end);
      const expectedLower = f.expectedName.toLowerCase();
      const matchedLower = matched.toLowerCase();
      const expectedTokens = expectedLower.split(/\s+/);
      return expectedTokens.some((tok) => matchedLower.includes(tok));
    });
    if (detected) tp += 1;
    else misses.push(f.expectedName);
  }
  return { tp, misses, rate: tp / fixtures.length };
}

// A fixture counts as a false positive when the engine emits any span on it.
async function fpRate(
  engine: CompromiseNerEngine,
  fixtures: ReadonlyArray<string>,
): Promise<{ fp: number; details: string[]; rate: number }> {
  let fp = 0;
  const details: string[] = [];
  for (const text of fixtures) {
    const spans = await engine.detectPersonSpans(text);
    if (spans.length > 0) {
      fp += 1;
      details.push(`"${text}" → ${spans.map((s) => text.slice(s.start, s.end)).join(', ')}`);
    }
  }
  return { fp, details, rate: fp / fixtures.length };
}

describe('CompromiseNerEngine — cohort 1 (Western European) — TP ≥70% CI BLOCKING', () => {
  let engine: CompromiseNerEngine;
  let result: { tp: number; misses: string[]; rate: number };

  beforeAll(async () => {
    engine = new CompromiseNerEngine();
    await engine.ready;
    result = await detectionRate(engine, COHORT_1_WESTERN_EU);
    /* eslint-disable no-console */
    console.log(
      `[cohort-1 Western European] TP=${result.tp}/${COHORT_1_WESTERN_EU.length} ` +
        `(${(result.rate * 100).toFixed(1)}%); misses: ${result.misses.join(', ') || 'none'}`,
    );
    /* eslint-enable no-console */
  });

  it(`fixture count is at least 10 (compliance C2: ≥10 Western European fixtures)`, () => {
    expect(COHORT_1_WESTERN_EU.length).toBeGreaterThanOrEqual(10);
  });

  it('TP ≥70% — CI BLOCKING gate (compliance C1)', () => {
    expect(result.rate).toBeGreaterThanOrEqual(0.7);
  });
});

describe('CompromiseNerEngine — cohort 2 (Maghrebi) — benchmark only', () => {
  let engine: CompromiseNerEngine;

  beforeAll(async () => {
    engine = new CompromiseNerEngine();
    await engine.ready;
  });

  it('fixture count is at least 5', () => {
    expect(COHORT_2_MAGHREBI.length).toBeGreaterThanOrEqual(5);
  });

  it('benchmark runs and reports measured TP rate (no CI gate)', async () => {
    const result = await detectionRate(engine, COHORT_2_MAGHREBI);
    /* eslint-disable no-console */
    console.log(
      `[cohort-2 Maghrebi] TP=${result.tp}/${COHORT_2_MAGHREBI.length} ` +
        `(${(result.rate * 100).toFixed(1)}%); misses: ${result.misses.join(', ') || 'none'}`,
    );
    /* eslint-enable no-console */
    expect(result.tp).toBeGreaterThanOrEqual(0);
  });
});

describe('CompromiseNerEngine — cohort 3 (East Asian transliterated) — benchmark only', () => {
  let engine: CompromiseNerEngine;

  beforeAll(async () => {
    engine = new CompromiseNerEngine();
    await engine.ready;
  });

  it('fixture count is at least 5', () => {
    expect(COHORT_3_EAST_ASIAN.length).toBeGreaterThanOrEqual(5);
  });

  it('benchmark runs and reports measured TP rate (no CI gate)', async () => {
    const result = await detectionRate(engine, COHORT_3_EAST_ASIAN);
    /* eslint-disable no-console */
    console.log(
      `[cohort-3 East Asian] TP=${result.tp}/${COHORT_3_EAST_ASIAN.length} ` +
        `(${(result.rate * 100).toFixed(1)}%); misses: ${result.misses.join(', ') || 'none'}`,
    );
    /* eslint-enable no-console */
    expect(result.tp).toBeGreaterThanOrEqual(0);
  });
});

describe('CompromiseNerEngine — cohort 4 (Slavic transliterated) — benchmark only', () => {
  let engine: CompromiseNerEngine;

  beforeAll(async () => {
    engine = new CompromiseNerEngine();
    await engine.ready;
  });

  it('fixture count is at least 5', () => {
    expect(COHORT_4_SLAVIC.length).toBeGreaterThanOrEqual(5);
  });

  it('benchmark runs and reports measured TP rate (no CI gate)', async () => {
    const result = await detectionRate(engine, COHORT_4_SLAVIC);
    /* eslint-disable no-console */
    console.log(
      `[cohort-4 Slavic] TP=${result.tp}/${COHORT_4_SLAVIC.length} ` +
        `(${(result.rate * 100).toFixed(1)}%); misses: ${result.misses.join(', ') || 'none'}`,
    );
    /* eslint-enable no-console */
    expect(result.tp).toBeGreaterThanOrEqual(0);
  });
});

describe('CompromiseNerEngine — false-positive rate (≥20 FP fixtures, benchmark)', () => {
  let engine: CompromiseNerEngine;

  beforeAll(async () => {
    engine = new CompromiseNerEngine();
    await engine.ready;
  });

  it('fixture count is at least 20', () => {
    expect(FP_FIXTURES.length).toBeGreaterThanOrEqual(20);
  });

  it('FP rate measured and logged — no CI gate', async () => {
    const result = await fpRate(engine, FP_FIXTURES);
    /* eslint-disable no-console */
    console.log(
      `[FP] ${result.fp}/${FP_FIXTURES.length} (${(result.rate * 100).toFixed(1)}%); ` +
        `details: ${result.details.length > 0 ? result.details.join(' | ') : 'none'}`,
    );
    /* eslint-enable no-console */
    expect(result.fp).toBeGreaterThanOrEqual(0);
  });
});
