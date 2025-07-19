import React from 'react';
import PropTypes from 'prop-types';

const SocialSharePanel = ({ properties, exhibitPanelClass, exhibitTitleClass }) => {
  const pageUrl = window.location.href;
  const text = `Check out this M ${properties.mag} earthquake that happened ${properties.place}!`;

  const twitterShareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;

  return (
    <div className={exhibitPanelClass}>
      <h3 className={exhibitTitleClass}>Share this Event</h3>
      <div className="flex justify-center space-x-4">
        <a href={twitterShareUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-400 text-white font-bold py-2 px-4 rounded">
          Share on Twitter
        </a>
        <a href={facebookShareUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-600 text-white font-bold py-2 px-4 rounded">
          Share on Facebook
        </a>
      </div>
    </div>
  );
};

SocialSharePanel.propTypes = {
  properties: PropTypes.object.isRequired,
  exhibitPanelClass: PropTypes.string.isRequired,
  exhibitTitleClass: PropTypes.string.isRequired,
};

export default SocialSharePanel;
