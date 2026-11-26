/**
 * Threads serves Relay GraphQL queries from two endpoints and has been
 * migrating queries between them one at a time:
 * - /graphql/query (original)
 * - /api/graphql   (the followers/following dialog moved here in Nov 2026)
 * Match both so an endpoint move doesn't silently stop interception.
 */
const GRAPHQL_PATHS = ['/graphql/query', '/api/graphql'];

/**
 * @param {string} url - Request URL (absolute or relative)
 * @returns {boolean} Whether the URL is a Threads GraphQL query endpoint
 */
export function isGraphQLQueryUrl(url) {
  if (typeof url !== 'string') return false;
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '');
  return GRAPHQL_PATHS.some(p => path.endsWith(p));
}
