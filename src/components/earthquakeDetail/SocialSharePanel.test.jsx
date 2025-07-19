import React from 'react';
import { render, screen } from '@testing-library/react';
import SocialSharePanel from './SocialSharePanel';

describe('SocialSharePanel', () => {
  const mockProperties = {
    mag: 5.5,
    place: 'Test Location',
  };

  it('renders share buttons with correct links', () => {
    render(
      <SocialSharePanel
        properties={mockProperties}
        exhibitPanelClass="panel"
        exhibitTitleClass="title"
      />
    );

    const twitterLink = screen.getByText('Share on Twitter');
    const facebookLink = screen.getByText('Share on Facebook');

    expect(twitterLink).toBeInTheDocument();
    expect(facebookLink).toBeInTheDocument();

    const pageUrl = encodeURIComponent(window.location.href);
    const text = encodeURIComponent('Check out this M 5.5 earthquake that happened Test Location!');

    expect(twitterLink.href).toBe(`https://twitter.com/intent/tweet?url=${pageUrl}&text=${text}`);
    expect(facebookLink.href).toBe(`https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`);
  });
});
