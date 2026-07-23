import { describe, expect, it } from 'vitest';
import { countryNode } from '../schema.ts';

const id = 'https://jackuait.github.io/pyatkov-index/passport/usa/#country';
const node = countryNode({
  id,
  name: 'United States',
  iso3: 'USA',
  iso2: 'US',
  measures: [
    { propertyID: 'pyatkov-score', name: 'Pyatkov score', value: 84.2, minValue: 0, maxValue: 100 },
    { name: 'Rank', value: 25 },
  ],
});

describe('countryNode', () => {
  it('is a Country at the given @id', () => {
    expect(node['@type']).toBe('Country');
    expect(node['@id']).toBe(id);
    expect(node.name).toBe('United States');
  });

  it('carries both ISO codes as identifiers', () => {
    expect(node.identifier).toEqual([
      { '@type': 'PropertyValue', propertyID: 'ISO 3166-1 alpha-3', value: 'USA' },
      { '@type': 'PropertyValue', propertyID: 'ISO 3166-1 alpha-2', value: 'US' },
    ]);
  });

  // additionalProperty is the one property in the vocabulary that fits: domainIncludes
  // Place (Country -> AdministrativeArea -> Place), rangeIncludes PropertyValue.
  it('hangs the measures off additionalProperty', () => {
    expect(node.additionalProperty).toEqual([
      { '@type': 'PropertyValue', propertyID: 'pyatkov-score', name: 'Pyatkov score', value: 84.2, minValue: 0, maxValue: 100 },
      { '@type': 'PropertyValue', name: 'Rank', value: 25 },
    ]);
  });

  // subjectOf rangeIncludes CreativeWork and Event only — a PropertyValue there is a
  // range violation, which is how every measure on all 398 country pages was once typed.
  it('never uses subjectOf for the measures', () => {
    expect(node).not.toHaveProperty('subjectOf');
  });

  // isBasedOn domainIncludes CreativeWork only, and a Country is a Place. The provenance
  // link belongs on the page's WebPage node instead.
  it('never claims isBasedOn on the Country', () => {
    expect(node).not.toHaveProperty('isBasedOn');
  });

  it('omits the bounds on a measure that has none', () => {
    const [, rank] = node.additionalProperty;
    expect(rank).not.toHaveProperty('minValue');
    expect(rank).not.toHaveProperty('maxValue');
  });
});

// The SARs are administrative regions of China, not countries. schema.org Country is a
// GeopoliticalEntity; AdministrativeArea is its direct parent and carries every property
// used here, so it is accurate without weakening the node.
describe('countryNode @type for entities that are not countries', () => {
  const sar = (iso3: string, name: string) =>
    countryNode({ id: `${id}-${iso3}`, name, iso3, iso2: iso3.slice(0, 2), measures: [] });

  it('types the SARs as AdministrativeArea', () => {
    expect(sar('HKG', 'Hong Kong')['@type']).toBe('AdministrativeArea');
    expect(sar('MAC', 'Macao')['@type']).toBe('AdministrativeArea');
  });

  it('leaves sovereign states as Country', () => {
    expect(sar('DEU', 'Germany')['@type']).toBe('Country');
    expect(sar('VAT', 'Vatican')['@type']).toBe('Country');
  });
});

describe('countryNode propertyID', () => {
  it('passes a supplied propertyID through', () => {
    expect(node.additionalProperty[0]).toHaveProperty('propertyID', 'pyatkov-score');
  });

  it('omits propertyID when none is supplied', () => {
    expect(node.additionalProperty[1]).not.toHaveProperty('propertyID');
  });
});
