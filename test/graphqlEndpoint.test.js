import { describe, it, expect } from 'vitest';
import { isGraphQLQueryUrl } from '../src/lib/graphqlEndpoint.js';

describe('isGraphQLQueryUrl', () => {
  it('matches the original /graphql/query endpoint', () => {
    expect(isGraphQLQueryUrl('/graphql/query')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/graphql/query')).toBe(true);
  });

  it('matches the newer /api/graphql endpoint', () => {
    expect(isGraphQLQueryUrl('/api/graphql')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphql')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphql/?foo=1')).toBe(true);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphql?foo=1')).toBe(true);
  });

  it('rejects other endpoints and non-strings', () => {
    expect(isGraphQLQueryUrl('https://www.threads.com/ajax/bulk-route-definitions/')).toBe(false);
    expect(isGraphQLQueryUrl('https://www.threads.com/api/graphqlbatch')).toBe(false);
    expect(isGraphQLQueryUrl(undefined)).toBe(false);
    expect(isGraphQLQueryUrl(null)).toBe(false);
  });
});
