/**
 * @file Utility functions for XML manipulation.
 */

/**
 * Escapes special characters in a string for use in XML content.
 * Handles cases where input is not a string by warning and returning an empty string.
 *
 * @param {*} unsafe The input value to escape. Expected to be a string.
 * @returns {string} The escaped string, or an empty string if input was not a string.
 */
export function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') {
    console.warn("escapeXml called with non-string value:", unsafe);
    return ''; // Or handle as appropriate, e.g., return String(unsafe) after escaping
  }
  return unsafe.replace(/[<>&"']/g, function (match) {
    switch (match) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return match;
    }
  });
}
