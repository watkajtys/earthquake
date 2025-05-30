// src/SeoMetadata.jsx
import React from 'react';
import PropTypes from 'prop-types';

/**
 * A React component that dynamically updates SEO-related meta tags in the document's head
 * using React 19's built-in support for <title> and <meta> tags.
 * It manages title, description, keywords, and Open Graph / Twitter card metadata.
 * @param {object} props - The component's props.
 * @param {string} props.title - The title of the page, used for `<title>` and `og:title`, `twitter:title`.
 * @param {string} props.description - The meta description, used for `description`, `og:description`, `twitter:description`.
 * @param {string} [props.imageUrl] - URL of an image for `og:image` and `twitter:image`.
 * @param {string} [props.pageUrl] - The canonical URL of the page for `og:url` and `twitter:url`. Defaults to `window.location.href` if not provided.
 * @param {string} [props.type="website"] - The Open Graph type (e.g., "website", "article").
 * @param {string} [props.publishedTime] - Publication time for articles (ISO 8601 format), used for `article:published_time`.
 * @param {string} [props.modifiedTime] - Modification time for articles (ISO 8601 format), used for `article:modified_time`.
 * @param {string} [props.keywords] - Comma-separated keywords for the `keywords` meta tag.
 * @returns {JSX.Element} A React fragment containing title and meta tags.
 */
const SeoMetadata = ({ title, description, imageUrl, pageUrl, type = 'website', publishedTime, modifiedTime, keywords }) => {
  const effectivePageUrl = pageUrl || (typeof window !== 'undefined' ? window.location.href : '');

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Open Graph Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      {effectivePageUrl && <meta property="og:url" content={effectivePageUrl} />}
      {imageUrl && <meta property="og:image" content={imageUrl} />}

      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {effectivePageUrl && <meta name="twitter:url" content={effectivePageUrl} />}
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}
    </>
  );
};

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
