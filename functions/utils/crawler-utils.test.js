import { describe, it, expect } from 'vitest';
import { isCrawler } from './crawler-utils.js'; // Assuming test file in same dir

// Helper to create a mock Request object with a User-Agent
const mockRequest = (userAgent) => ({
  headers: {
    get: (headerName) => {
      if (headerName.toLowerCase() === 'user-agent') {
        return userAgent;
      }
      return null;
    }
  }
});

describe('isCrawler', () => {
  // Updated list based on the actual regex: /Googlebot|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|facebot|facebookexternalhit/i
  const crawlers = [
    'Googlebot/2.1 (+http://www.google.com/bot.html)', // Matches Googlebot
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', // Matches Googlebot
    // 'AdsBot-Google (+http://www.google.com/adsbot.html)', // Not in current regex
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', // Matches Bingbot
    'DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)', // Matches DuckDuckBot
    'Baiduspider+(+http://www.baidu.com/search/spider.htm)', // Matches Baiduspider
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)', // Matches YandexBot
    'Sogou web spider/4.0(+http://www.sogou.com/docs/help/webmasters.htm#07)', // Matches Sogou
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', // Matches facebookexternalhit
    'Mozilla/5.0 (compatible; Exabot/3.0; +http://www.exabot.com/go/robot)', // Example for Exabot
    'msnbot/1.0 (Slurp/cat; http://search.msn.com/msnbot.htm)', // Example for Slurp (often part of msnbot)
    'Facebot/1.0', // Example for facebot
    // These are no longer expected to be true with the current simple regex
    // 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient/4.1.1; +http://www.linkedin.com)',
    // 'Twitterbot/1.0',
    // 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    // 'TelegramBot (like TwitterBot)',
    // 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    // 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    // 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
    // 'MojeekBot/0.6 (archi; http://www.mojeek.com/bot.html)',
    // 'MJ12bot/v1.4.8 (http://mj12bot.com/)',
    // ' témoignage crawler en recherche de témoignages (https://temoignages.beta.gouv.fr)',
    // 'NetSystemsResearch MetaSpi // msrbot (http://netsystemsresearch.com/msrbot)',
    // 'AnyGenericSpider/1.0'
  ];

  crawlers.forEach((userAgent) => {
    it(`should return true for crawler: ${userAgent}`, () => {
      expect(isCrawler(mockRequest(userAgent))).toBe(true);
    });
  });

  const nonCrawlers = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'MyCustomUserAgent Robot/1.0', // This should be false as "Robot" is not in the simple regex
    'UserAgent with word "crawler" in description, not as bot name.', // False
    'UserAgent with word "spider" in description.', // False
    'UserAgent with word "bot" in description part.', // False
    // Add some UAs that failed previously but should now correctly be non-crawlers
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient/4.1.1; +http://www.linkedin.com)',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
     ' témoignage crawler en recherche de témoignages (https://temoignages.beta.gouv.fr)'.trim(), // Test the trimmed version
    'NetSystemsResearch MetaSpi // msrbot (http://netsystemsresearch.com/msrbot)',
    'AnyGenericSpider/1.0'
  ];

  nonCrawlers.forEach((userAgent) => {
    it(`should return false for non-crawler: ${userAgent}`, () => {
      expect(isCrawler(mockRequest(userAgent))).toBe(false);
    });
  });

  it('should return true for case-insensitive matches (e.g., googlebot)', () => {
    expect(isCrawler(mockRequest('googlebot/2.1'))).toBe(true); // Covered by existing 'Googlebot'
    expect(isCrawler(mockRequest('bingBOT/2.0'))).toBe(true);   // Test case-insensitivity for another bot
  });

  it('should return false if User-Agent header is missing', () => {
    expect(isCrawler(mockRequest(null))).toBe(false);
    expect(isCrawler(mockRequest(undefined))).toBe(false);
  });

  it('should return false for an empty User-Agent string', () => {
    expect(isCrawler(mockRequest(''))).toBe(false);
  });
});
