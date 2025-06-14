/**
 * @file Utility functions for detecting web crawlers.
 */

/**
 * Checks if the current request is from a known web crawler based on its User-Agent string.
 *
 * @param {Request} request The incoming HTTP Request object.
 * @returns {boolean} True if the User-Agent matches a known crawler pattern, false otherwise.
 */
export function isCrawler(request) {
  const userAgent = request.headers.get("User-Agent") || "";
  const crawlerRegex = /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebot|facebookexternalhit/i;
  return crawlerRegex.test(userAgent);
}
