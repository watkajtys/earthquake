import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import GlobalLastMajorQuakeTimer from './GlobalLastMajorQuakeTimer';
import { MAJOR_QUAKE_THRESHOLD } from '../constants/appConstants';
import SkeletonText from './skeletons/SkeletonText'; // Assuming SkeletonText is a direct import

// Mock SkeletonText
vi.mock('./skeletons/SkeletonText', () => ({
    __esModule: true,
    default: vi.fn(({ animated, width, height, className }) => (
        <div data-testid="skeleton-text" className={className} style={{ width, height }}>
            {animated ? 'animated-skeleton' : 'skeleton'}
        </div>
    )),
}));

// Mock formatTimeDuration
const mockFormatTimeDuration = vi.fn();

const MOCKED_NOW = Date.now(); // Fixed point in time for tests

describe('GlobalLastMajorQuakeTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(MOCKED_NOW);
        mockFormatTimeDuration.mockReset();
        // Reset SkeletonText mock calls if needed, though its rendering is what we check
        SkeletonText.mockClear();
    });

    afterEach(() => {
        // Ensure any pending timers that might update state are flushed within act
        act(() => {
            vi.runOnlyPendingTimers();
        });
        vi.useRealTimers();
    });

    test('Scenario 1: Renders correctly with lastMajorQuake present', () => {
        const mockQuake = {
            properties: {
                time: MOCKED_NOW - 3600000, // 1 hour ago
                place: '10km N of Testville',
                mag: 5.2,
            },
            id: 'testquake1',
        };
        mockFormatTimeDuration.mockReturnValue('1h 0m 0s ago');

        render(
            <GlobalLastMajorQuakeTimer
                lastMajorQuake={mockQuake}
                formatTimeDuration={mockFormatTimeDuration}
            />
        );

        // useEffect updates state, advance timers to ensure it runs
        act(() => {
            vi.advanceTimersByTime(1000); // Advance by 1 second for the interval to kick in if needed
        });
        
        expect(screen.getByText('1h 0m 0s ago')).toBeInTheDocument();
        expect(screen.getByText(/M5.2 - 10km N of Testville/)).toBeInTheDocument();
        
        // Use a more robust selector for the main container based on its content
        const container = screen.getByText(/Time Since Last Major/i).closest('div[class*="absolute bottom-2"]');
        expect(container).toBeInTheDocument();
        expect(container).not.toHaveAttribute('role', 'button');
        expect(container).not.toHaveAttribute('tabIndex');
    });

    test('Scenario 2: Renders as clickable button when handleTimerClick is provided', () => {
        const mockQuake = {
            properties: {
                time: MOCKED_NOW - 7200000, // 2 hours ago
                place: '20km S of Testburg',
                mag: 4.8,
            },
            id: 'testquake2',
        };
        const mockHandleTimerClick = vi.fn();
        mockFormatTimeDuration.mockReturnValue('2h 0m 0s ago');

        render(
            <GlobalLastMajorQuakeTimer
                lastMajorQuake={mockQuake}
                formatTimeDuration={mockFormatTimeDuration}
                handleTimerClick={mockHandleTimerClick}
            />
        );
        
        act(() => {
            vi.advanceTimersByTime(1000);
        });

        const container = screen.getByText(/Time Since Last Major/i).closest('div[class*="absolute bottom-2"]');
        expect(container).toBeInTheDocument();
        expect(container).toHaveAttribute('role', 'button');
        expect(container).toHaveAttribute('tabIndex', '0');

        fireEvent.click(container);
        expect(mockHandleTimerClick).toHaveBeenCalledTimes(1);
        expect(mockHandleTimerClick).toHaveBeenCalledWith(mockQuake);

        // Test keyboard accessibility
        fireEvent.keyDown(container, { key: 'Enter', code: 'Enter' });
        expect(mockHandleTimerClick).toHaveBeenCalledTimes(2);
        expect(mockHandleTimerClick).toHaveBeenLastCalledWith(mockQuake);
        
        fireEvent.keyDown(container, { key: ' ', code: 'Space' });
        expect(mockHandleTimerClick).toHaveBeenCalledTimes(3);
        expect(mockHandleTimerClick).toHaveBeenLastCalledWith(mockQuake);
    });

    test('Scenario 3: Renders "Extended period" message when lastMajorQuake is null', () => {
        render(
            <GlobalLastMajorQuakeTimer
                lastMajorQuake={null}
                formatTimeDuration={mockFormatTimeDuration}
            />
        );

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.getByText(`Extended period without M${MAJOR_QUAKE_THRESHOLD}+.`)).toBeInTheDocument();
        
        // Check that specific quake magnitude and place details are not present
        // The text "M4.5" appears in the title and the message, so we need to be more specific.
        // We are looking for a line that would typically be "M<mag> - <place>"
        const quakeDetailsLine = screen.queryByText((content, element) => {
            return element.tagName.toLowerCase() === 'p' && content.match(/^M\d\.\d - /) !== null;
        });
        expect(quakeDetailsLine).not.toBeInTheDocument();

        // Ensure the main container does not render 'null' or similar for place details
        const mainContainer = screen.getByText(/Time Since Last Major/i).closest('div[class*="absolute bottom-2"]');
        expect(mainContainer.textContent).not.toContain('null');
        
        // Also ensure formatTimeDuration wasn't called with invalid time
        expect(mockFormatTimeDuration).not.toHaveBeenCalled();
    });

    test('Scenario 4: Shows SkeletonText initially', async () => {
        const mockQuake = {
            properties: {
                time: MOCKED_NOW - 3600000,
                place: 'Somewhere',
                mag: 5.0,
            },
            id: 'testquake_skeleton',
        };
        
        // Mock for the very first call from useEffect
        mockFormatTimeDuration.mockReturnValueOnce('useEffect_time_string'); 
        // Mock for subsequent calls from setInterval
        mockFormatTimeDuration.mockReturnValue('interval_time_string');

        // Single render call for the test context
        render( 
            <GlobalLastMajorQuakeTimer
                lastMajorQuake={mockQuake}
                formatTimeDuration={mockFormatTimeDuration}
            />
        );

        // We expect SkeletonText to have been instantiated for useState.
        expect(SkeletonText).toHaveBeenCalledTimes(1); 

        // Act: process useEffect. advanceTimersByTime(0) can flush microtasks and initial effects.
        await act(async () => {
            vi.advanceTimersByTime(0); 
        });

        // Check state after initial useEffect has synchronously called update()
        expect(screen.getByText('useEffect_time_string')).toBeInTheDocument();
        expect(mockFormatTimeDuration).toHaveBeenCalledTimes(1); // Ensure it was called by useEffect's initial update()
        expect(screen.queryByTestId('skeleton-text')).not.toBeInTheDocument(); // Skeleton should be gone

        // Now, advance time for the first interval
        await act(async () => {
            vi.advanceTimersByTime(1000); 
        });
        
        expect(screen.getByText('interval_time_string')).toBeInTheDocument();
        expect(mockFormatTimeDuration).toHaveBeenCalledTimes(2); // Called again by the interval
    });

    test('Scenario 4b: Shows SkeletonText initially when lastMajorQuake is null', async () => {
        render(
            <GlobalLastMajorQuakeTimer
                lastMajorQuake={null}
                formatTimeDuration={mockFormatTimeDuration}
            />
        );

        // SkeletonText was instantiated for useState
        expect(SkeletonText).toHaveBeenCalledTimes(1);

        // Act: process useEffect. advanceTimersByTime(0) can flush microtasks and initial effects.
        await act(async () => {
            vi.advanceTimersByTime(0);
        });
        
        // After initial render + useEffect. For null quake, it becomes "Extended period..."
        expect(screen.getByText(`Extended period without M${MAJOR_QUAKE_THRESHOLD}+.`)).toBeInTheDocument();
        expect(screen.queryByTestId('skeleton-text')).not.toBeInTheDocument();
    });
});
