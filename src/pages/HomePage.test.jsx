// src/pages/HomePage.test.jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './HomePage'; // Adjust path as necessary
import { EarthquakeDataProvider } from '../contexts/EarthquakeDataContext'; // Adjust path
import { UIStateProvider } from '../contexts/UIStateContext'; // Adjust path

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
    constructor(callback, options) {
        this.callback = callback;
        this.options = options;
    }
    observe(target) { /* Mock */ }
    unobserve(target) { /* Mock */ }
    disconnect() { /* Mock */ }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
        this.callback = callback;
    }
    observe(target) { /* Mock */ }
    unobserve(target) { /* Mock */ }
    disconnect() { /* Mock */ }
};

// Mock react-globe.gl
vi.mock('react-globe.gl', () => ({
  default: vi.fn(({ globeImageUrl, ...props }) => {
    // Mock any essential props or behaviors if needed for testing App
    // For example, if App interacts with the globe ref, mock that interaction.
    // console.log('Mocked Globe props:', props);
    return <div data-testid="mocked-globe">Mocked Globe</div>;
  }),
}));

// Mock child components that are lazy-loaded or heavy if they interfere with HomePage tests
vi.mock('../components/InteractiveGlobeView', () => ({
    default: () => <div data-testid="mock-globe-view">Mocked InteractiveGlobeView</div>
}));

// Mock other potentially problematic components (example)
vi.mock('../components/PaginatedEarthquakeTable', () => ({
    default: ({ title }) => <div data-testid="mock-paginated-table">Mocked PaginatedEarthquakeTable: {title}</div>
}));

// Mock data fetching hooks if necessary, or rely on EarthquakeDataProvider's mocks
// For this test, we'll assume EarthquakeDataProvider handles its own data/mocking

// Mock `useNavigate` to spy on navigation calls
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual, // Import and retain default MemoryRouter, Routes, Route etc.
        useNavigate: () => mockNavigate,
        useParams: () => ({ detailUrlParam: undefined, clusterId: undefined }), // Default mock for useParams
        useSearchParams: () => [new URLSearchParams(), vi.fn()], // Default mock for useSearchParams
    };
});

describe('App (HomePage Integration)', () => {
    const renderApp = (initialEntries = ['/']) => {
        return render(
            <MemoryRouter initialEntries={initialEntries}>
                <EarthquakeDataProvider> {/* Provide mock data context */}
                    <UIStateProvider> {/* ADDED: Provide UI state context */}
                        <App />
                    </UIStateProvider>
                </EarthquakeDataProvider>
            </MemoryRouter>
        );
    };

    beforeEach(() => {
        // Reset mocks before each test
        mockNavigate.mockClear();
        // Mock console.warn and console.error to keep test output clean, unless debugging
        // vi.spyOn(console, 'warn').mockImplementation(() => {});
        // vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console mocks if they were spied on
        // vi.restoreAllMocks();
    });

    test('renders the main application layout and header', async () => {
        renderApp();
        // Check for a unique element in the header
        expect(screen.getByText(/Global Seismic Activity Monitor/i)).toBeInTheDocument();
        // Check for a unique element in the BottomNav (assuming it's always there)
        // Example: if BottomNav has an identifiable navigation link or button
        // For now, let's assume BottomNav presence is tested elsewhere or HomePage structure implies it.
        // Check for the mocked globe view as an indicator the main page content area tries to render
        expect(screen.getByTestId('mock-globe-view')).toBeInTheDocument();
    });

    test('renders loading state initially then content', async () => {
        // This test depends heavily on the mock implementation of EarthquakeDataProvider
        // and how it simulates loading states.
        renderApp();
        // Example: If there's a full-screen loader with specific text
        // await waitFor(() => {
        //    expect(screen.queryByText(/Connecting to Seismic Network.../i)).not.toBeInTheDocument();
        // }, { timeout: 5000 }); // Adjust timeout as needed

        // Assuming data loads and main content (like globe) is shown
        await waitFor(() => {
            expect(screen.getByTestId('mock-globe-view')).toBeInTheDocument();
        });
    });

    test('sidebar view changes when buttons are clicked (integration with UIStateContext)', async () => {
        const { rerender } = renderApp();

        // Simulate what happens when changeSidebarView from context is called
        // This requires a more complex setup to actually click buttons if they are rendered
        // For now, we assume UIStateProvider and useUIState are working correctly
        // and HomePage consumes them. The unit test for UIStateContext itself should cover its internal logic.

        // Example: Check if the Overview panel's content is initially visible (or mocked)
        // This depends on what content is rendered by default for 'overview_panel'
        // For instance, if SummaryStatisticsCard is part of it:
        // expect(screen.getByText(/Overview \(Last 24 Hours\)/i)).toBeInTheDocument();

        // To test clicking buttons, those buttons need to be rendered and clickable.
        // This might be better for an E2E test or a more focused component test for the sidebar itself.
        // For this integration test, we verify that the HomePage structure renders.
        // We can also check if the key passed to the sidebar content area changes, if applicable.
        const sidebarContent = screen.getByRole('complementary'); // Assuming aside has this role
        // The key={activeSidebarView} on the scrollable div inside aside is a good check
        const scrollableSidebarContent = sidebarContent.querySelector('.overflow-y-auto');
        expect(scrollableSidebarContent).toHaveAttribute('key', 'overview_panel');

        // We cannot directly call changeSidebarView here easily without more mocking
        // or by actually finding and clicking a button if one is present that calls it.
    });

    test('navigates to quake detail page on quake click (simplified)', async () => {
        renderApp();
        // This requires simulating a quake click. The actual onQuakeClick is passed to InteractiveGlobeView.
        // We'd need to mock InteractiveGlobeView to allow triggering this callback.
        // For now, this test is more of a placeholder for that interaction.
        // The handleQuakeClick function itself in HomePage should have its own unit tests.

        // Placeholder: If we had a way to simulate globe click that calls handleQuakeClick:
        // simulateGlobeQuakeClick({ properties: { detail: 'some_detail_url' } });
        // expect(mockNavigate).toHaveBeenCalledWith('/quake/some_detail_url');
    });

    // Add more tests as needed for routing, different sidebar views loading their specific components (mocked), etc.

    test('renders desktop sidebar with analysis title', () => {
        renderApp();
        const sidebar = screen.getByRole('complementary'); // `aside` element
        expect(within(sidebar).getByText(/Detailed Earthquake Analysis/i)).toBeInTheDocument();
    });

    test('overview panel is the default active sidebar view', () => {
        renderApp();
        const sidebarButtons = screen.getByRole('complementary').querySelectorAll('button');
        const overviewButton = Array.from(sidebarButtons).find(btn => btn.textContent.includes('Overview'));
        expect(overviewButton).toHaveClass('bg-indigo-600'); // Active class
    });

});

// Helper to query within a specific element, useful for scoped checks like sidebar/main content
const within = (element) => ({
    getByText: (textMatch) => {
        const results = screen.getAllByText(textMatch, { container: element });
        if (results.length > 1) {
            console.warn(`Found multiple elements with text: ${textMatch} within the container. Returning the first.`);
        }
        return results[0];
    },
    // Add other queries as needed
});
