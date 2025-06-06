// src/SeoMetadata.jsx
import React, { useEffect } from 'react';

/**
 * A React component that dynamically updates SEO-related meta tags in the document's head.
 * It manages title, description, keywords, and Open Graph / Twitter card metadata.
 * This component does not render any visible elements to the DOM.
 * @param {object} props - The component's props.
 * @param {string} props.title - The title of the page, used for `<title>` and `og:title`, `twitter:title`.
 * @param {string} props.description - The meta description, used for `description`, `og:description`, `twitter:description`.
 * @param {string} [props.imageUrl] - URL of an image for `og:image` and `twitter:image`.
 * @param {string} [props.pageUrl] - The canonical URL of the page for `og:url` and `twitter:url`. Defaults to `window.location.href`.
 * @param {string} [props.type="website"] - The Open Graph type (e.g., "website", "article").
 * @param {string} [props.locale="en_US"] - The locale for `og:locale`.
 * @param {string} [props.canonicalUrl] - The canonical URL for `<link rel="canonical">`.
 * @param {string} [props.publishedTime] - Publication time for articles (ISO 8601 format), used for `article:published_time`.
 * @param {string} [props.modifiedTime] - Modification time for articles (ISO 8601 format), used for `article:modified_time`.
 * @param {string} [props.keywords] - Comma-separated keywords for the `keywords` meta tag.
 * @param {object} [props.eventJsonLd] - Optional JSON-LD object for event structured data.
 * @returns {null} This component does not render any DOM elements.
 */
const SeoMetadata = ({ title, description, imageUrl, pageUrl, type = 'website', locale = 'en_US', canonicalUrl, publishedTime, modifiedTime, keywords, eventJsonLd }) => {
  useEffect(() => {
    document.title = title;

    const setMetaTag = (attrName, attrValue, content) => {
      let element = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    const removeMetaTag = (attrName, attrValue) => {
        const element = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
        if (element) {
            document.head.removeChild(element);
        }
    };

    // Set description
    setMetaTag('name', 'description', description);

    // Set keywords (optional)
    if (keywords) {
      setMetaTag('name', 'keywords', keywords);
    } else {
      removeMetaTag('name', 'keywords');
    }

    // --- Open Graph Tags ---
    setMetaTag('property', 'og:title', title);
    setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', type);
    setMetaTag('property', 'og:url', pageUrl || window.location.href);
    setMetaTag('property', 'og:locale', locale);

    if (imageUrl) {
      setMetaTag('property', 'og:image', imageUrl);
    } else {
      removeMetaTag('property', 'og:image');
    }

    if (type === 'article') {
      if (publishedTime) {
        setMetaTag('property', 'article:published_time', publishedTime);
      } else {
        removeMetaTag('property', 'article:published_time');
      }
      if (modifiedTime) {
        setMetaTag('property', 'article:modified_time', modifiedTime);
      } else {
        removeMetaTag('property', 'article:modified_time');
      }
    } else {
        removeMetaTag('property', 'article:published_time');
        removeMetaTag('property', 'article:modified_time');
    }

    // --- Twitter Card Tags ---
    setMetaTag('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    setMetaTag('name', 'twitter:title', title);
    setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:url', pageUrl || window.location.href);
    if (imageUrl) {
      setMetaTag('name', 'twitter:image', imageUrl);
    } else {
      removeMetaTag('name', 'twitter:image');
    }

    // Cleanup function to remove tags or reset title if component unmounts (optional, depends on desired behavior)
    // For this app, we might want the tags to persist, or be replaced by the next page's SEO component.
    // If a general cleanup is desired for some tags when no specific SEO component is active, that could be added.
    // For now, let's assume tags are managed by each view having its own SeoMetadata component.

    // Manage Canonical URL
    let canonicalLink = document.head.querySelector('link[rel="canonical"]');
    if (canonicalUrl) {
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', canonicalUrl);
    } else if (canonicalLink) {
      document.head.removeChild(canonicalLink);
    }

    // Manage JSON-LD Structured Data

    // Website JSON-LD
    let websiteJsonLdScript = document.head.querySelector('script#website-json-ld');
    if (!websiteJsonLdScript) {
      websiteJsonLdScript = document.createElement('script');
      websiteJsonLdScript.setAttribute('type', 'application/ld+json');
      websiteJsonLdScript.setAttribute('id', 'website-json-ld');
      document.head.appendChild(websiteJsonLdScript);
    }
    const websiteStructuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
       name: 'Global Seismic Activity Monitor', // This can be a static name or dynamically set
       url: pageUrl || (typeof window !== 'undefined' ? window.location.href : ''),
       description: description,
       // potentialAction: { // Uncomment and adjust if search functionality is available
       //   '@type': 'SearchAction',
       //   target: `https://earthquakeslive.com/search?q={search_term_string}`,
       //   'query-input': 'required name=search_term_string',
       // },
    };
    websiteJsonLdScript.textContent = JSON.stringify(websiteStructuredData, null, 2);

    // Event JSON-LD
    const eventScriptId = 'event-json-ld';
    let eventJsonLdScript = document.head.querySelector(`script#${eventScriptId}`);

    if (eventJsonLd) {
      if (!eventJsonLdScript) {
        eventJsonLdScript = document.createElement('script');
        eventJsonLdScript.setAttribute('type', 'application/ld+json');
        eventJsonLdScript.setAttribute('id', eventScriptId);
        document.head.appendChild(eventJsonLdScript);
      }
      eventJsonLdScript.textContent = JSON.stringify(eventJsonLd, null, 2);
    } else {
      if (eventJsonLdScript) {
        document.head.removeChild(eventJsonLdScript);
      }
    }

    // Cleanup function
    return () => {
      // Website JSON-LD is generally not removed here as it might be managed globally or persist.
      // Remove event-specific JSON-LD script if it was added by this instance and eventJsonLd was provided.
      if (eventJsonLd) {
        const scriptToRemove = document.head.querySelector(`script#${eventScriptId}`);
        if (scriptToRemove) {
          // To be super safe, one could also check if scriptToRemove.textContent matches the eventJsonLd stringified,
          // but relying on the ID and the fact this effect instance managed it should be sufficient.
          document.head.removeChild(scriptToRemove);
        }
      }
    };

  }, [title, description, imageUrl, pageUrl, type, locale, canonicalUrl, publishedTime, modifiedTime, keywords, eventJsonLd]);

  return null; // This component does not render anything to the DOM itself
};

export default SeoMetadata;

/*
Usage Example:

import SeoMetadata from './SeoMetadata';

function MyPage() {
  return (
    <>
      <SeoMetadata
        title="My Awesome Page Title"
        description="This is a great description for my awesome page."
        keywords="awesome, page, react, seo"
        imageUrl="https://example.com/my-awesome-image.jpg"
        pageUrl="https://example.com/my-awesome-page"
        type="website" // or "article"
        // publishedTime="2023-01-01T12:00:00Z" // For articles
        // modifiedTime="2023-01-02T12:00:00Z" // For articles
      />
      <div>
        Page content goes here...
      </div>
    </>
  );
}
*/
