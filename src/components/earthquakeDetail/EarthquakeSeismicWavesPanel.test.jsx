import React from 'react';
import { render } from '@testing-library/react';
import EarthquakeSeismicWavesPanel from './EarthquakeSeismicWavesPanel';

describe('EarthquakeSeismicWavesPanel', () => {
    it('renders correctly and matches snapshot', () => {
        const mockProps = {
            exhibitPanelClass: 'custom-panel-class',
            exhibitTitleClass: 'custom-title-class',
            captionClass: 'custom-caption-class',
        };

        const { container } = render(<EarthquakeSeismicWavesPanel {...mockProps} />);
        expect(container).toMatchSnapshot();
    });
});
