import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('README.md link checker', () => {
  it('should have valid links', async () => {
    const readmePath = path.join(process.cwd(), 'README.md');
    const readmeContent = await fs.readFile(readmePath, 'utf-8');

    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
    let match;
    const links = [];
    while ((match = linkRegex.exec(readmeContent)) !== null) {
      links.push(match[2]);
    }

    const linkPromises = links.map(async (link) => {
      try {
        const response = await fetch(link, { method: 'HEAD' });
        return { link, status: response.status, ok: response.ok };
      } catch (error) {
        return { link, status: 'error', ok: false, error: error.message };
      }
    });

    const results = await Promise.all(linkPromises);
    const brokenLinks = results.filter(result => !result.ok);

    if (brokenLinks.length > 0) {
      console.error('Broken links found:', brokenLinks);
    }

    expect(brokenLinks.length, `Found ${brokenLinks.length} broken links`).toBe(0);
  }, 30000); // 30 second timeout for all requests
});
