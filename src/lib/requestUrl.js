/**
 * Helpers for the URLs seen by the fetch/XHR interceptors in injected.js.
 */

/**
 * Normalize the URL argument of fetch() or XMLHttpRequest.open() to a string.
 * Both accept a URL object (and fetch a Request), so the interceptors must not
 * assume a string: calling .includes() on a URL object would throw inside the
 * patched XHR send() and stop the page's own request from going out.
 * @param {string|URL|Request|*} input
 * @returns {string} The URL as a string, or '' if it can't be determined
 */
export function toUrlString(input) {
  if (typeof input === 'string') return input;
  if (input == null) return '';
  try {
    if (typeof input.url === 'string') return input.url; // Request
    return String(input); // URL (or anything else with a toString)
  } catch (e) {
    return '';
  }
}

/**
 * Threads serves Relay GraphQL queries from two endpoints and has been
 * migrating queries between them one at a time:
 * - /graphql/query (original)
 * - /api/graphql   (the followers/following dialog moved here in Nov 2026,
 *   https://github.com/meettomorrow/lee-su-threads/pull/65)
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
