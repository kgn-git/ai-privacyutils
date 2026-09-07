// COMPLIANCE: these regexes run over free CV text; a match is used only to compute the byte range that is
// replaced, and matched substrings are never logged, returned or stored (match counts may be).
// Record: docs/compliance/redaction-record.md § 1, § 3.

// Every pattern is a factory returning a fresh `/g` RegExp: a shared `/g` instance carries `lastIndex`, so two
// `.test()` calls on it alternate between match and no-match (IMP-1). Regex text is byte-frozen — a change ships
// its fixture first — and every quantifier stays bounded for the ReDoS scan (S5).

// Unicode classes with the `u` flag accept IDN local parts, domains and TLDs; the boundaries are lookarounds
// because `\b` is ASCII-only and would fire inside a Unicode TLD. Local part ≤ 64 and label ≤ 63 per RFC 5321,
// up to 5 labels, TLD 2–24 letters with no digits so `foo.1` does not match.
export function emailPattern(): RegExp {
  return /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]{1,64}@(?:[\p{L}\p{N}-]{1,63}\.){1,5}[\p{L}]{2,24}(?![\p{L}\p{N}-])/gu;
}

// EN number-first form with a closed street-type set; the inner class takes mixed-case and all-caps tokens
// (`McLane`, `LA`).
export function addressPattern(): RegExp {
  return /\b\d{1,6}(?: [A-Z][a-zA-Z]{0,15}){1,5} (?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Terrace|Ter|Highway|Hwy|Parkway|Pkwy)(?: (?:NW|NE|SW|SE|N|S|E|W))?\b/g;
}

// FR number-first form. Each follow-on token is a capitalised word (plain or hyphenated) or a short lowercase
// connector, so the `{1,6}` quantifier cannot absorb free-text words after the street name (`depuis`, `ouvert`).
export function addressFrPattern(): RegExp {
  return /\b\d{1,4}(?:\s+(?:bis|ter|quater))?\s+(?:rue|Rue|RUE|boulevard|Boulevard|BOULEVARD|bd\.|Bd\.|avenue|Avenue|AVENUE|av\.|Av\.|place|Place|PLACE|all[ée]e|All[ée]e|chemin|Chemin|impasse|Impasse|quai|Quai|route|Route|cours|Cours|square|Square)(?:\s+(?:[A-Z\u00C0-\u00DD][A-Za-z\u00C0-\u00FF'-]{0,20}|de|des|du|la|le|les|l'|d'|aux|et|en|[aà])){1,6}\b/g;
}

// DE number-after form with a closed compound-suffix set; multi-word prefixes (`Unter den Linden 5`) are a
// recorded gap (R1-residual).
export function addressDePattern(): RegExp {
  return /\b[A-Z\u00C4\u00D6\u00DC][a-z\u00E4\u00F6\u00FC\u00DF]{1,30}(?:stra(?:\u00DFe|sse)|str\.|platz|weg|allee|gasse|ring|damm)\s+\d{1,4}[a-z]?\b/g;
}

// IT, ES and PT prefix-keyword forms. The trailing house number keeps `Via Lattea visible` out and `Via Lattea 5`
// in — privacy over precision (MIN-1).
export function addressItPattern(): RegExp {
  return /\b(?:Via|Viale|Corso|Piazza|Piazzale|Largo|Vicolo|Strada|Borgo|Contrada|Localit[aà])(?:\s+[A-Za-z\u00C0-\u00FF'][\w\u00C0-\u00FF'-]{0,20}){1,5}\s+\d{1,4}\b/g;
}

export function addressEsPattern(): RegExp {
  return /\b(?:Calle|CALLE|C\/|Avenida|AVENIDA|Av\.|Avda\.|Plaza|PLAZA|Pza\.|Paseo|P\u00BA\.|Ronda|Travesia|Traves[ií]a|Camino|Carrer|Glorieta)(?:\s+[A-Za-z\u00C0-\u00FF'][\w\u00C0-\u00FF'-]{0,20}){1,5}\s+\d{1,4}\b/g;
}

export function addressPtPattern(): RegExp {
  return /\b(?:Rua|R\.|Avenida|AVENIDA|Av\.|Pra\u00E7a|Largo|Travessa|Alameda|Beco|Estrada|Cal\u00E7ada)(?:\s+[A-Za-z\u00C0-\u00FF'][\w\u00C0-\u00FF'-]{0,20}){1,5}\s+\d{1,4}\b/g;
}

// Uppercase outward and inward codes; with PT, the only postcode shape that does not collide with another locale's.
export function postcodeUkPattern(): RegExp {
  return /\b[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}\b/g;
}

// FR, DE, IT and ES share one core — `\d{5}` plus a capitalised city token — and differ only in the accented-letter
// class, so each matches the others' postcodes: the locale key organises the API and is not a precision gate
// (MIN-2). The city token is required so bare 5-digit runs (order numbers, SKUs) are not redacted.
export function postcodeFrPattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30}\b/g;
}

export function postcodeDePattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C4\u00D6\u00DC][a-z\u00E4\u00F6\u00FC\u00DF'-]{2,30}\b/g;
}

export function postcodeItPattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30}\b/g;
}

export function postcodeEsPattern(): RegExp {
  return /\b\d{5}\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30}\b/g;
}

// NNNN-NNN is distinctive enough that the city is optional.
export function postcodePtPattern(): RegExp {
  return /\b\d{4}-\d{3}(?:\s+[A-Z\u00C0-\u00DC][a-z\u00E0-\u00FF'-]{2,30})?\b/g;
}

// NANP-shape fallbacks kept for compatibility; the locale pass in sanitize-pii.ts runs first.
export function phoneInternationalPattern(): RegExp {
  return /\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
}

export function phoneDomesticPattern(): RegExp {
  return /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
}

// The `min` metadata bundle is enough for validation with an explicit default country.
import { isValidPhoneNumber } from 'libphonenumber-js/min';
import type { CountryCode } from 'libphonenumber-js/min';

// A validator rather than a RegExp: the value is `libphonenumber-js` validation, and no hand-rolled regex means
// nothing new for the ReDoS scan. A fresh closure per call keeps the factory contract of the RegExp exports.
function makePhoneValidator(
  country: CountryCode,
): (candidate: string) => boolean {
  return (candidate: string): boolean => {
    if (typeof candidate !== 'string' || candidate.length === 0) return false;
    try {
      return isValidPhoneNumber(candidate, country);
    } catch {
      return false;
    }
  };
}

export function phoneFrValidator(): (candidate: string) => boolean {
  return makePhoneValidator('FR');
}

export function phoneDeValidator(): (candidate: string) => boolean {
  return makePhoneValidator('DE');
}

/** API key `uk`; `libphonenumber-js` country `GB`. */
export function phoneUkValidator(): (candidate: string) => boolean {
  return makePhoneValidator('GB');
}

export function phoneItValidator(): (candidate: string) => boolean {
  return makePhoneValidator('IT');
}

export function phoneEsValidator(): (candidate: string) => boolean {
  return makePhoneValidator('ES');
}

export function phonePtValidator(): (candidate: string) => boolean {
  return makePhoneValidator('PT');
}

// Validators answer `isValidPhoneNumber` only; `sanitizePii` adds a length floor and a formatting guard, so a
// validator can accept a candidate the sanitiser would not redact. Consumers wanting "what would be redacted"
// call `sanitizePii` (record § 3.5).
export const phoneByLocale = {
  fr: phoneFrValidator,
  de: phoneDeValidator,
  uk: phoneUkValidator,
  it: phoneItValidator,
  es: phoneEsValidator,
  pt: phonePtValidator,
} as const;

// Implemented in patterns-national-id.ts (T5) and re-exported so this file stays the single import surface.
export {
  computeEsDniCheckLetter,
  computePtNifCheckDigit,
  computeFrNirCheckKey,
  computeItCodiceFiscaleCheckLetter,
  nationalIdUkValidator,
  nationalIdFrValidator,
  nationalIdItValidator,
  nationalIdEsValidator,
  nationalIdPtValidator,
  nationalIdByLocale,
  nationalIdUkExtractionPattern,
  nationalIdFrExtractionPattern,
  nationalIdItExtractionPattern,
  nationalIdEsExtractionPattern,
  nationalIdPtExtractionPattern,
} from './patterns-national-id.js';
export type { NationalIdLocale } from './patterns-national-id.js';

import { nationalIdByLocale } from './patterns-national-id.js';

// One list of date shapes shared by `dobPattern` and `dobContextCuePattern`, so the two cannot drift: numeric
// day-first, ISO and hyphenated forms, day-first named months in EN/FR/DE/IT/ES/PT, the US month-first form. A
// bare year or a month-year (`March 1985`) is an employment date and does not match. Every alternative is linear.
const DOB_DATE_SUBPATTERNS: readonly string[] = [
  '\\b\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}\\b',
  '\\b\\d{4}-\\d{1,2}-\\d{1,2}\\b',
  '\\b\\d{1,2}\\.?\\s+(?:' +
    'January|February|March|April|May|June|July|August|September|October|November|December|' +
    'janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre|' +
    'Januar|Februar|M[aä]rz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|' +
    'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|' +
    'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|' +
    'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro' +
    ')(?:\\s+de)?\\s+\\d{4}\\b',
  '\\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s+\\d{4}\\b',
  '\\b\\d{1,2}\\s+de\\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|janeiro|fevereiro|mar[çc]o|maio|junho|julho|setembro|outubro|novembro|dezembro)\\s+de\\s+\\d{4}\\b',
];

export function dobPattern(): RegExp {
  return new RegExp(DOB_DATE_SUBPATTERNS.join('|'), 'g');
}

// Birth cues in the six locales, the longer cue before its prefix (`born on` before `born`) so the fuller cue is
// claimed; literal phrases only, so the alternation is linear. Used by the `'cv'` profile alone.
const DOB_CONTEXT_CUES: readonly string[] = [
  'date of birth',
  'birth ?date',
  'd\\.?o\\.?b\\.?',
  'born on',
  'born',
  'date de naissance',
  'née le',
  'né le',
  'geburtsdatum',
  'geboren am',
  'geboren',
  'data di nascita',
  'nato il',
  'nata il',
  'fecha de nacimiento',
  'nacido el',
  'nacida el',
  'data de nascimento',
  'nascido em',
  'nascida em',
  'nascido a',
  'nascida a',
];

// `(cue)(separator)(date)` with `gi`. The leading `\b` stops `reborn` acting as a cue and the `[\s:]{0,4}`
// separator keeps the cue and the date adjacent; callers replace group 3 only, the cue is not PII.
export function dobContextCuePattern(): RegExp {
  return new RegExp(
    '\\b(' +
      DOB_CONTEXT_CUES.join('|') +
      ')([\\s:]{0,4})(' +
      '(?:' +
      DOB_DATE_SUBPATTERNS.join('|') +
      ')' +
      ')',
    'gi',
  );
}

export const addressByLocale = {
  en: addressPattern,
  fr: addressFrPattern,
  de: addressDePattern,
  it: addressItPattern,
  es: addressEsPattern,
  pt: addressPtPattern,
} as const;

export const postcodeByLocale = {
  uk: postcodeUkPattern,
  fr: postcodeFrPattern,
  de: postcodeDePattern,
  it: postcodeItPattern,
  es: postcodeEsPattern,
  pt: postcodePtPattern,
} as const;

// `address` is the EN factory under its original key.
export const piiPatterns = {
  email: emailPattern,
  address: addressPattern,
  addressByLocale,
  postcodeByLocale,
  phoneByLocale,
  nationalIdByLocale,
  phoneInternational: phoneInternationalPattern,
  phoneDomestic: phoneDomesticPattern,
  dob: dobPattern,
  dobContextCue: dobContextCuePattern,
} as const;

export type PiiPatternName = keyof typeof piiPatterns;
export type AddressLocale = keyof typeof addressByLocale;
export type PostcodeLocale = keyof typeof postcodeByLocale;
export type PhoneLocale = keyof typeof phoneByLocale;
// `NationalIdLocale` is re-exported above; a local declaration would collide with it (TS2484).
