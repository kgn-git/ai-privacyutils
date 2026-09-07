// COMPLIANCE: destructive one-way redaction — a validator or extraction match is used only to compute the byte
// range that is replaced; candidates, match contents and check-digit intermediates are never logged, returned or
// stored (match counts may be). Record: docs/compliance/redaction-record.md § 1, § 3.7.

// Each locale is a loose extraction regex over free text plus a validator applying its check value or structural
// rules; four of the five have a check value, which divides the bare-shape false-positive rate by 23, 11, 97 or 26.

// Agencia Tributaria mod-23 table; the letter at index `body mod 23`.
const ES_DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

// Empty string on a body that is not 8 digits, so a short or mixed input can never be mistaken for valid (S1).
export function computeEsDniCheckLetter(body: string): string {
  if (body.length !== 8 || !/^\d{8}$/.test(body)) return '';
  const n = Number.parseInt(body, 10);
  if (!Number.isFinite(n)) return '';
  return ES_DNI_LETTERS[n % 23] ?? '';
}

export function nationalIdEsValidator(): (candidate: string) => boolean {
  const re = /^\d{8}[A-Z]$/;
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || !re.test(candidate)) return false;
    const body = candidate.slice(0, 8);
    const letter = candidate.slice(8);
    return computeEsDniCheckLetter(body) === letter;
  };
}

// Weights for digits 1–8 of the NIF (Decreto-Lei n.º 463/79).
const PT_NIF_WEIGHTS = [9, 8, 7, 6, 5, 4, 3, 2] as const;

// Remainder 0 or 1 → 0, otherwise `11 − remainder`; `-1` on a body that is not 8 digits.
export function computePtNifCheckDigit(body: string): number {
  if (body.length !== 8 || !/^\d{8}$/.test(body)) return -1;
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += Number.parseInt(body[i]!, 10) * PT_NIF_WEIGHTS[i]!;
  }
  const rem = sum % 11;
  return rem < 2 ? 0 : 11 - rem;
}

// The check digit is the precision floor for a bare 9-digit run — about 1 in 11 random runs still passes (S3);
// context gating (a `NIF` keyword) is left to the caller to keep recall on free text.
export function nationalIdPtValidator(): (candidate: string) => boolean {
  const re = /^\d{9}$/;
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || !re.test(candidate)) return false;
    const body = candidate.slice(0, 8);
    const check = Number.parseInt(candidate.slice(8), 10);
    return computePtNifCheckDigit(body) === check;
  };
}

// HMRC prefix rules: first letter not D F I Q U V, second not D F I O Q U V, suffix A–D. Reserved prefixes
// (BG GB NK KN TN NT ZZ) pass — the threat model is leakage, not issuance.
const UK_NINO_PREFIX_1 = /[ABCEGHJKLMNOPRSTWXYZ]/;
const UK_NINO_PREFIX_2 = /[ABCEGHJKLMNPRSTWXYZ]/;
const UK_NINO_SUFFIX = /[A-D]/;

// Spaces are stripped before the shape test, so `AB 12 34 56 C` and `AB123456C` validate alike; tabs and newlines
// are not stripped and fail the shape test. No check digit exists.
export function nationalIdUkValidator(): (candidate: string) => boolean {
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    const compact = candidate.replace(/ /g, '');
    if (!/^[A-Z]{2}\d{6}[A-Z]$/.test(compact)) return false;
    if (!UK_NINO_PREFIX_1.test(compact[0]!)) return false;
    if (!UK_NINO_PREFIX_2.test(compact[1]!)) return false;
    if (!UK_NINO_SUFFIX.test(compact[8]!)) return false;
    return true;
  };
}

// `BigInt` because a 13-digit body exceeds `Number` precision. Corsican NIRs (`2A`/`2B` département) are not
// converted before the mod 97 and fail the key — a recorded gap (R10-residual).
export function computeFrNirCheckKey(body: string): string {
  if (!/^\d{13}$/.test(body)) return '';
  const n = BigInt(body);
  const rem = Number(n % 97n);
  const key = 97 - rem;
  return String(key).padStart(2, '0');
}

// First digit 1 or 2 only; month and département are not gated — the check key catches malformed bodies.
export function nationalIdFrValidator(): (candidate: string) => boolean {
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    const compact = candidate.replace(/ /g, '');
    if (!/^\d{15}$/.test(compact)) return false;
    const sex = compact[0]!;
    if (sex !== '1' && sex !== '2') return false;
    const body = compact.slice(0, 13);
    const key = compact.slice(13);
    return computeFrNirCheckKey(body) === key;
  };
}

// Odd-position values (D.M. 23/12/1976, Allegato 2).
const IT_CF_ODD: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9,
  '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

// Even-position values: digits 0–9, letters A–Z as 0–25.
const IT_CF_EVEN: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18,
  T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

// `A–Z[sum mod 26]` over the position tables; empty string on a wrong-length body or an unknown character.
// Omocodia substitutions are not handled (R10-residual).
export function computeItCodiceFiscaleCheckLetter(body: string): string {
  if (body.length !== 15) return '';
  const up = body.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    const ch = up[i]!;
    const oddOneIndexed = (i + 1) % 2 === 1;
    const table = oddOneIndexed ? IT_CF_ODD : IT_CF_EVEN;
    const v = table[ch];
    if (v === undefined) return '';
    sum += v;
  }
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[sum % 26] ?? '';
}

// Month letter restricted to `ABCDEHLMPRST`; the municipality slot accepts `[A-Z0-9]{4}`.
export function nationalIdItValidator(): (candidate: string) => boolean {
  const re = /^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z0-9]{4}[A-Z]$/;
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string') return false;
    const up = candidate.toUpperCase();
    if (!re.test(up)) return false;
    const body = up.slice(0, 15);
    const check = up.slice(15);
    return computeItCodiceFiscaleCheckLetter(body) === check;
  };
}

// DE (Steuer-ID, Rentenversicherungsnummer) is not covered.
export const nationalIdByLocale = {
  uk: nationalIdUkValidator,
  fr: nationalIdFrValidator,
  it: nationalIdItValidator,
  es: nationalIdEsValidator,
  pt: nationalIdPtValidator,
} as const;

export type NationalIdLocale = keyof typeof nationalIdByLocale;

// Extraction regexes are exported so the ReDoS scan enumerates every regex that runs over user input (R7); they
// are loose on shape and the validators tighten.
export function nationalIdUkExtractionPattern(): RegExp {
  return /\b[A-Z]{2}(?:\s?\d{2}\s?\d{2}\s?\d{2}|\d{6})\s?[A-Z]\b/g;
}

export function nationalIdFrExtractionPattern(): RegExp {
  return /\b[12](?:\s?\d{2}\s?\d{2}\s?\d{5}\s?\d{3}\s?\d{2}|\d{14})\b/g;
}

export function nationalIdItExtractionPattern(): RegExp {
  return /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z0-9]{4}[A-Z]\b/g;
}

export function nationalIdEsExtractionPattern(): RegExp {
  return /\b\d{8}[A-Z]\b/g;
}

export function nationalIdPtExtractionPattern(): RegExp {
  // `\b` keeps a 9-digit run inside a longer digit run or word out (S3).
  return /\b\d{9}\b/g;
}
