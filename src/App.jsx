import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import BottomNav from './components/BottomNav.jsx'; // Corrected path
import './App.css';
import { EarthquakeDataProvider, useEarthquakeDataState } from './context/EarthquakeDataContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx'; // Import ErrorBoundary

const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const OverviewPage = lazy(() => import('./pages/OverviewPage.jsx'));
const LearnPage = lazy(() => import('./pages/LearnPage.jsx'));
const FeedsPageLayoutComponent = lazy(() => import('./components/FeedsPageLayout.jsx'));
const EarthquakeDetailModalComponent = lazy(() => import('./components/EarthquakeDetailModalComponent.jsx'));
const ClusterDetailModalWrapper = lazy(() => import('./components/ClusterDetailModalWrapper.jsx'));


const RouteLoadingFallback = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#111827', color: 'white' }}>
        <p>Loading Page...</p>
    </div>
);

// Header component that consumes context
const AppHeader = () => {
    const { headerTimeDisplay } = useEarthquakeDataState(); // Consume context
    return (
        <header className="bg-slate-800 text-white pt-4 pb-2 px-2 shadow-lg z-40 border-b border-slate-700">
            <div className="mx-auto flex flex-col sm:flex-row justify-between items-center px-3">
                <h1 className="text-lg md:text-xl font-bold text-indigo-400">Global Seismic Activity Monitor</h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5 sm:mt-0" role="status" aria-live="polite">
                    {headerTimeDisplay}
                </p>
            </div>
        </header>
    );
};

function App() {
    return (
        <EarthquakeDataProvider> {/* Wrap with provider */}
            <BrowserRouter>
                <div className="flex flex-col h-[100svh] font-sans bg-slate-900 text-slate-100 antialiased">
                    <AppHeader /> {/* Use new Header component */}
                    <main className="flex flex-1 overflow-y-auto pb-16 lg:pb-0"> {/* Ensure main takes up space */}
                        <Suspense fallback={<RouteLoadingFallback />}>
                            <Routes>
                                <Route path="/" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
                                <Route path="/overview" element={<ErrorBoundary><OverviewPage /></ErrorBoundary>} />
                                <Route path="/feeds" element={<ErrorBoundary><FeedsPageLayoutComponent /></ErrorBoundary>} />
                                <Route path="/learn" element={<ErrorBoundary><LearnPage /></ErrorBoundary>} />
                                <Route path="/quake/:detailUrlParam" element={<ErrorBoundary><EarthquakeDetailModalComponent /></ErrorBoundary>} />
                                <Route path="/cluster/:clusterId" element={<ErrorBoundary><ClusterDetailModalWrapper /></ErrorBoundary>} />
                                {/* Fallback route for 404 - Optional */}
                                <Route path="*" element={
                                    <ErrorBoundary>
                                        <div className="p-4 text-center text-slate-300">
                                            <h1 className="text-2xl font-bold">404 - Not Found</h1>
                                            <p>Sorry, the page you are looking for does not exist.</p>
                                        </div>
                                    </ErrorBoundary>
                                } />
                            </Routes>
                        </Suspense>
                    </main>
                    <BottomNav />
                </div>
            </BrowserRouter>
        </EarthquakeDataProvider>
    );
}
export default App;
