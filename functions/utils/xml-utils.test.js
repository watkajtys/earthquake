import { describe, it, expect } from 'vitest';
import { escapeXml } from './xml-utils.js'; // Assuming test file in same dir

describe('escapeXml', () => {
  it('should return an empty string for non-string inputs', () => {
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
    expect(escapeXml(123)).toBe('');
    expect(escapeXml({})).toBe('');
    expect(escapeXml([])).toBe('');
    expect(escapeXml(true)).toBe('');
    expect(escapeXml(() => {})).toBe('');
  });

  it('should return an empty string for an empty string input', () => {
    expect(escapeXml('')).toBe('');
  });

  it('should not change a string with no special XML characters', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });

  it('should escape "&" to "&amp;"', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
  });

  it('should escape "<" to "&lt;"', () => {
    expect(escapeXml('a < b')).toBe('a &lt; b');
  });

  it('should escape ">" to "&gt;"', () => {
    expect(escapeXml('a > b')).toBe('a &gt; b');
  });

  it('should escape \'"\' to "&quot;"', () => {
    expect(escapeXml('a " b')).toBe('a &quot; b');
  });

  it('should escape "\'" to "&apos;"', () => {
    expect(escapeXml("a ' b")).toBe("a &apos; b");
  });

  it('should escape all special characters in a mixed string', () => {
    expect(escapeXml("<test&name value=\"user's choice\">")).toBe('&lt;test&amp;name value=&quot;user&apos;s choice&quot;&gt;');
  });

  it('should handle multiple occurrences of the same character', () => {
    expect(escapeXml('<<&&>>')).toBe('&lt;&lt;&amp;&amp;&gt;&gt;');
  });

  it('should handle special characters at the beginning and end of the string', () => {
    expect(escapeXml('&text<')).toBe('&amp;text&lt;');
  });
});
