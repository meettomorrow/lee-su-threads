import { describe, it, expect } from 'vitest';
import { isGraphQLQueryUrl, toUrlString } from '../src/lib/requestUrl.js';

describe('isGraphQLQueryUrl', () => {
  it('matches the original /graphql/query endpoint', () => {
    expect(isGraphQLQueryUrl('/graphql/query')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/graphql/query')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/graphql/query/?doc_id=1')).toBe(true);
  });

  it('matches the newer /api/graphql endpoint', () => {
    expect(isGraphQLQueryUrl('/api/graphql')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphql')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphql/?foo=1')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphql?foo=1')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphql#frag')).toBe(true);
  });

  it('rejects other endpoints and non-strings', () => {
    expect(isGraphQLQueryUrl('https://www.threads.com/ajax/bulk-route-definitions/')).toBe(false);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphqlbatch')).toBe(false);
    expect(isGraphQLQueryUrl(undefined)).toBe(false);
    expect(isGraphQLQueryUrl(null)).toBe(false);
  });
});

describe('toUrlString', () => {
  it('returns strings unchanged', () => {
    expect(toUrlString('/api/graphql')).toBe('/api/graphql');
  });

  it('converts URL objects and Requests', () => {
    expect(toUrlString(new URL('https://www.threads.com/api/graphql'))).toBe('https://www.threads.com/api/graphql');
    expect(toUrlString(new Request('https://www.threads.com/graphql/query'))).toBe('https://www.threads.com/graphql/query');
  });

  it('returns an empty string for missing or unconvertible input', () => {
    expect(toUrlString(undefined)).toBe('');
    expect(toUrlString(null)).toBe('');
    expect(toUrlString({ toString() { throw new Error('nope'); } })).toBe('');
  });
});
