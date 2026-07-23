export const TIERS = ['visa-free', 'visa-on-arrival', 'e-visa', 'visa-required'] as const;

export type Tier = (typeof TIERS)[number];

/** Mirror of CREDIT in pipeline/ingest.ts, which is the source of truth — the scores and
 *  ranks the site renders were computed with those numbers. credit.test.ts asserts the two
 *  tables are equal, so a pipeline change that is not reflected here fails CI. */
export const CREDIT: Record<Tier, number> = {
  'visa-free': 1.0,
  'visa-on-arrival': 1.0,
  'e-visa': 0.2,
  'visa-required': 0,
};

export const LABEL: Record<Tier, string> = {
  'visa-free': 'Visa-free',
  'visa-on-arrival': 'Visa on arrival / eTA',
  'e-visa': 'eVisa',
  'visa-required': 'Visa required',
};
