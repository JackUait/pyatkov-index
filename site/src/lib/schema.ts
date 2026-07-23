/** A single scored fact about a country, rendered as a schema.org PropertyValue. */
export interface Measure {
  /** Stable machine handle. Both country pages describe the same country, so a bare
   *  `name` is the only thing a consumer can merge two graphs on — and the passport
   *  page's count rank is not the destination page's. */
  propertyID?: string;
  name: string;
  value: number;
  minValue?: number;
  maxValue?: number;
}

export interface CountryNodeInput {
  /** pageId(pathname, 'country') — the @id the WebPage points its mainEntity at. */
  id: string;
  name: string;
  iso3: string;
  iso2: string;
  measures: Measure[];
}

/** The Country node a passport or destination page is about.
 *
 *  Two properties are deliberately NOT here, both because the vocabulary forbids them on
 *  a Place:
 *  - `subjectOf` rangeIncludes CreativeWork and Event, so a PropertyValue under it is a
 *    range violation. `additionalProperty` is the property that fits — domainIncludes
 *    Place (Country -> AdministrativeArea -> Place), rangeIncludes PropertyValue — and it
 *    is what carries the score, rank and delta below.
 *  - `isBasedOn` domainIncludes CreativeWork only. The link to the Dataset is emitted on
 *    the page's WebPage node instead (Base.astro's basedOnId prop), which IS a
 *    CreativeWork, so the provenance is still stated — just on a node that can hold it. */
// Destinations in the upstream matrix that are not countries. schema.org Country is a
// GeopoliticalEntity and these two are administrative regions of China, so they get the
// direct parent type instead — AdministrativeArea carries identifier and
// additionalProperty just the same, so nothing is lost. Kept to the uncontroversial pair:
// TWN, XKX and VAT are contested or unusual, not clearly non-countries.
const NOT_A_COUNTRY = new Set(['HKG', 'MAC']);

export function countryNode(input: CountryNodeInput) {
  return {
    '@type': NOT_A_COUNTRY.has(input.iso3) ? ('AdministrativeArea' as const) : ('Country' as const),
    '@id': input.id,
    name: input.name,
    identifier: [
      { '@type': 'PropertyValue' as const, propertyID: 'ISO 3166-1 alpha-3', value: input.iso3 },
      { '@type': 'PropertyValue' as const, propertyID: 'ISO 3166-1 alpha-2', value: input.iso2 },
    ],
    additionalProperty: input.measures.map((m) => ({
      '@type': 'PropertyValue' as const,
      ...(m.propertyID === undefined ? {} : { propertyID: m.propertyID }),
      name: m.name,
      value: m.value,
      // Bounds are meaningful on a 0-100 score and meaningless on a rank, so they are
      // only emitted when supplied rather than defaulted.
      ...(m.minValue === undefined ? {} : { minValue: m.minValue }),
      ...(m.maxValue === undefined ? {} : { maxValue: m.maxValue }),
    })),
  };
}
