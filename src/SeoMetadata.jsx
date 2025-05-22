// src/SeoMetadata.jsx
import React, { useEffect } from 'react';
import PropTypes from 'prop-types'; // Optional: for prop type validation

const SeoMetadata = ({ title, description, imageUrl, pageUrl, type = 'website', publishedTime, modifiedTime, keywords }) => {
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

  }, [title, description, imageUrl, pageUrl, type, publishedTime, modifiedTime, keywords]);

  return null; // This component does not render anything to the DOM itself
};

// Optional: PropTypes for development-time validation
SeoMetadata.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  imageUrl: PropTypes.string,
  pageUrl: PropTypes.string,
  type: PropTypes.oneOf(['website', 'article']),
  publishedTime: PropTypes.string,
  modifiedTime: PropTypes.string,
  keywords: PropTypes.string,
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
