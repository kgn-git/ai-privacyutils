// COMPLIANCE: readable tokens are byte-identical across releases — changing one is a major-version change.
// Every pattern except email requires a digit and email requires an `@`; no token contains either, so a second
// pass in either format is a no-op. Record: docs/compliance/redaction-record.md § 3.9.

/** `'sentinel'` exists because readable tokens collide with authored text such as `the [email] form`. */
export type TokenFormat = 'readable' | 'sentinel';

export type TokenKind =
  | 'email'
  | 'address'
  | 'postcode'
  | 'phone'
  | 'dob'
  | 'nationalId'
  | 'person';

/** `Record<TokenKind, string>` per format, so every kind has a value in every format. */
export const TOKEN_FORMATS: Readonly<
  Record<TokenFormat, Readonly<Record<TokenKind, string>>>
> = {
  readable: {
    email: '[email]',
    address: '[address]',
    postcode: '[postcode]',
    phone: '[phone]',
    dob: '[dob]',
    nationalId: '[nationalId]',
    person: '[person]',
  },
  sentinel: {
    email: '<<REDACTED_EMAIL>>',
    address: '<<REDACTED_ADDRESS>>',
    postcode: '<<REDACTED_POSTCODE>>',
    phone: '<<REDACTED_PHONE>>',
    dob: '<<REDACTED_DOB>>',
    nationalId: '<<REDACTED_NATIONALID>>',
    person: '<<REDACTED_PERSON>>',
  },
} as const;

/** `undefined` resolves to `'readable'`. */
export function tokensFor(
  format: TokenFormat | undefined,
): Readonly<Record<TokenKind, string>> {
  return TOKEN_FORMATS[format ?? 'readable'];
}
