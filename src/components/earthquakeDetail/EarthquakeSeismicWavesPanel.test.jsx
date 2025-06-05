import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EarthquakeSeismicWavesPanel from './EarthquakeSeismicWavesPanel';
import * as seismicUtils from '../../utils/seismicUtils.js';

// Mock the seismicUtils module using Vitest's vi
vi.mock('../../utils/seismicUtils.js', () => ({
    calculatePWaveTravelTime: vi.fn(),
    calculateSWaveTravelTime: vi.fn(),
}));

describe('EarthquakeSeismicWavesPanel', () => {
    const P_WAVE_VELOCITY = 6.5; // km/s, as defined in component
    const S_WAVE_VELOCITY = 3.75; // km/s, as defined in component

    beforeEach(() => {
        vi.clearAllMocks();
        seismicUtils.calculatePWaveTravelTime.mockReset();
        seismicUtils.calculateSWaveTravelTime.mockReset();
        seismicUtils.calculatePWaveTravelTime.mockImplementation((distance, velocity) => distance / (velocity || P_WAVE_VELOCITY));
        seismicUtils.calculateSWaveTravelTime.mockImplementation((distance, velocity) => distance / (velocity || S_WAVE_VELOCITY));
    });

    const getExpectedTimes = (distance) => {
        const pTime = distance / P_WAVE_VELOCITY;
        const sTime = distance / S_WAVE_VELOCITY;
        const spGap = sTime - pTime;
        return { pTime, sTime, spGap };
    };

    const getInteractiveSvgContainer = () => {
        const heading = screen.getByText('Interactive P & S Wave Travel');
        const interactiveSectionDiv = heading.parentElement;
        const svgContainer = interactiveSectionDiv.querySelector('div[class^="relative bg-gray-100"]');
        return svgContainer;
    };

    test('renders initial state correctly with default distance', () => {
        const defaultDistance = 100;
        const { pTime, sTime, spGap } = getExpectedTimes(defaultDistance);
        render(<EarthquakeSeismicWavesPanel exhibitPanelClass="" exhibitTitleClass="" captionClass="" />);

        const slider = screen.getByLabelText(/Epicenter Distance:/i);
        expect(slider).toBeInTheDocument();
        expect(slider).toHaveValue(defaultDistance.toString());
        expect(screen.getByText(`${defaultDistance} km`)).toBeInTheDocument();

        const pWaveArrivalLabel = screen.getByText('P-Wave Arrival');
        expect(pWaveArrivalLabel.nextElementSibling).toHaveTextContent(`${pTime.toFixed(1)} s`);
        const sWaveArrivalLabel = screen.getByText('S-Wave Arrival');
        expect(sWaveArrivalLabel.nextElementSibling).toHaveTextContent(`${sTime.toFixed(1)} s`);
        const spGapLabel = screen.getByText('S-P Gap');
        expect(spGapLabel.nextElementSibling).toHaveTextContent(`${spGap.toFixed(1)} s`);

        expect(seismicUtils.calculatePWaveTravelTime).toHaveBeenCalledWith(defaultDistance, P_WAVE_VELOCITY);
        expect(seismicUtils.calculateSWaveTravelTime).toHaveBeenCalledWith(defaultDistance, S_WAVE_VELOCITY);

        const svgContainer = getInteractiveSvgContainer();
        expect(svgContainer).toBeInTheDocument();
        const svgElement = svgContainer.querySelector('svg');
        expect(svgElement).toBeInTheDocument();

        expect(svgElement.querySelector('text[x="50"]')).toHaveTextContent('Station');
        expect(svgElement.querySelector('text[fill="#e11d48"]')).toHaveTextContent(`Epicenter (${defaultDistance} km)`);

        const circles = svgElement.querySelectorAll('circle');
        expect(circles.length).toBe(3); // Station, P-wave, S-wave circles
    });

    test('updates displayed times and SVG when distance slider changes', () => {
        const initialDistance = 100;
        const newDistance = 250;
        const { pTime: initialPTime, sTime: initialSTime } = getExpectedTimes(initialDistance);
        const { pTime: newPTime, sTime: newSTime, spGap: newSPGap } = getExpectedTimes(newDistance);
        render(<EarthquakeSeismicWavesPanel exhibitPanelClass="" exhibitTitleClass="" captionClass="" />);

        const initialPWaveArrivalLabel = screen.getByText('P-Wave Arrival');
        expect(initialPWaveArrivalLabel.nextElementSibling).toHaveTextContent(`${initialPTime.toFixed(1)} s`);
        const initialSWaveArrivalLabel = screen.getByText('S-Wave Arrival');
        expect(initialSWaveArrivalLabel.nextElementSibling).toHaveTextContent(`${initialSTime.toFixed(1)} s`);

        const slider = screen.getByLabelText(/Epicenter Distance:/i);
        fireEvent.change(slider, { target: { value: newDistance.toString() } });

        const updatedSvgContainer = getInteractiveSvgContainer();

        expect(screen.getByText(`${newDistance} km`)).toBeInTheDocument();
        expect(slider).toHaveValue(newDistance.toString());

        expect(seismicUtils.calculatePWaveTravelTime).toHaveBeenCalledWith(newDistance, P_WAVE_VELOCITY);
        expect(seismicUtils.calculateSWaveTravelTime).toHaveBeenCalledWith(newDistance, S_WAVE_VELOCITY);

        const pWaveArrivalLabel = screen.getByText('P-Wave Arrival');
        expect(pWaveArrivalLabel.nextElementSibling).toHaveTextContent(`${newPTime.toFixed(1)} s`);
        const sWaveArrivalLabel = screen.getByText('S-Wave Arrival');
        expect(sWaveArrivalLabel.nextElementSibling).toHaveTextContent(`${newSTime.toFixed(1)} s`);
        const spGapLabel = screen.getByText('S-P Gap');
        expect(spGapLabel.nextElementSibling).toHaveTextContent(`${newSPGap.toFixed(1)} s`);

        expect(updatedSvgContainer.querySelector('text[fill="#e11d48"]')).toHaveTextContent(`Epicenter (${newDistance} km)`);
    });

    test('displays correct times for minimum and maximum slider distances', () => {
        const minDistance = 10;
        const maxDistance = 400;
        const { pTime: minP, sTime: minS, spGap: minSP } = getExpectedTimes(minDistance);
        const { pTime: maxP, sTime: maxS, spGap: maxSP } = getExpectedTimes(maxDistance);
        render(<EarthquakeSeismicWavesPanel exhibitPanelClass="" exhibitTitleClass="" captionClass="" />);
        const slider = screen.getByLabelText(/Epicenter Distance:/i);

        fireEvent.change(slider, { target: { value: minDistance.toString() } });
        let updatedSvgContainer = getInteractiveSvgContainer();
        expect(screen.getByText(`${minDistance} km`)).toBeInTheDocument();
        expect(screen.getByText('P-Wave Arrival').nextElementSibling).toHaveTextContent(`${minP.toFixed(1)} s`);
        expect(screen.getByText('S-Wave Arrival').nextElementSibling).toHaveTextContent(`${minS.toFixed(1)} s`);
        expect(screen.getByText('S-P Gap').nextElementSibling).toHaveTextContent(`${minSP.toFixed(1)} s`);
        expect(updatedSvgContainer.querySelector('text[fill="#e11d48"]')).toHaveTextContent(`Epicenter (${minDistance} km)`);

        fireEvent.change(slider, { target: { value: maxDistance.toString() } });
        updatedSvgContainer = getInteractiveSvgContainer();
        expect(screen.getByText(`${maxDistance} km`)).toBeInTheDocument();
        expect(screen.getByText('P-Wave Arrival').nextElementSibling).toHaveTextContent(`${maxP.toFixed(1)} s`);
        expect(screen.getByText('S-Wave Arrival').nextElementSibling).toHaveTextContent(`${maxS.toFixed(1)} s`);
        expect(screen.getByText('S-P Gap').nextElementSibling).toHaveTextContent(`${maxSP.toFixed(1)} s`);
        expect(updatedSvgContainer.querySelector('text[fill="#e11d48"]')).toHaveTextContent(`Epicenter (${maxDistance} km)`);
    });

    test('SVG structure contains expected elements for wave animation', () => {
        render(<EarthquakeSeismicWavesPanel />);
        const svgContainer = getInteractiveSvgContainer();
        expect(svgContainer).toBeInTheDocument();
        const svg = svgContainer.querySelector('svg');
        expect(svg).toBeInTheDocument();

        // Check for station marker circle
        const stationCircle = svg.querySelector('circle[cx="50"][fill="#3b82f6"]');
        expect(stationCircle).toBeInTheDocument();

        // Check for epicenter line marker
        const epicenterLine = svg.querySelector('line[stroke="#e11d48"]');
        expect(epicenterLine).toBeInTheDocument();

        // Check for wave path line
        const wavePathLine = svg.querySelector('line[stroke="#a5b4fc"]');
        expect(wavePathLine).toBeInTheDocument();

        // Check for P-Wave circle (represents the animated P-wave)
        // fill="#3b82f6" is shared with station, so use r="8" (waveRadius) to distinguish
        const pWaveCircle = svg.querySelector('circle[fill="#3b82f6"][r="8"]');
        expect(pWaveCircle).toBeInTheDocument();
        // Note: Testing for the <animate> tag itself is unreliable in JSDOM.
        // Its presence is implicitly covered by the component logic if the circle is there.

        // Check for S-Wave circle (represents the animated S-wave)
        const sWaveCircle = svg.querySelector('circle[fill="#ef4444"][r="8"]');
        expect(sWaveCircle).toBeInTheDocument();
        // Note: Testing for the <animate> tag itself is unreliable in JSDOM.
    });
});
