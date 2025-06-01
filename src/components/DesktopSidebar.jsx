// src/components/DesktopSidebar.jsx
import React, { useState, Suspense, lazy } from 'react'; // Added lazy
import { useEarthquakeDataState } from '../context/EarthquakeDataContext.jsx';

// Lazy load panel components for better initial load performance
const OverviewPanel = lazy(() => import('./sidebar/OverviewPanel.jsx'));
const Details1hrPanel = lazy(() => import('./sidebar/Details1hrPanel.jsx'));
const Details24hrPanel = lazy(() => import('./sidebar/Details24hrPanel.jsx'));
const Details7dayPanel = lazy(() => import('./sidebar/Details7dayPanel.jsx'));
const Details14dayPanel = lazy(() => import('./sidebar/Details14dayPanel.jsx'));
const Details30dayPanel = lazy(() => import('./sidebar/Details30dayPanel.jsx'));
const LearnMorePanel = lazy(() => import('./sidebar/LearnMorePanel.jsx'));


const ChartLoadingFallback = ({ message = "Loading panel..." }) => (
    <div className="p-4 text-center text-slate-400">{message}</div>
);

const DesktopSidebar = ({ topActiveRegionsOverview, overviewClusters /* other props from HomePage if any */ }) => {
    const [activeSidebarView, setActiveSidebarView] = useState('overview_panel');
    // Removed useSearchParams here, view state is internal to DesktopSidebar
    // If URL sync is desired, it should be passed as a prop from HomePage or handled via a dedicated routing solution for sidebar state

    const {
        hasAttemptedMonthlyLoad,
        isLoadingMonthly,
        allEarthquakes,
        loadMonthlyData // For the "Load Full Analysis" button
    } = useEarthquakeDataState();

    const changeSidebarView = (view) => setActiveSidebarView(view);

    let panelContent = null;
    switch (activeSidebarView) {
        case 'overview_panel':
            panelContent = <OverviewPanel topActiveRegionsOverview={topActiveRegionsOverview} overviewClusters={overviewClusters} />;
            break;
        case 'details_1hr':
            panelContent = <Details1hrPanel />;
            break;
        case 'details_24hr':
            panelContent = <Details24hrPanel />;
            break;
        case 'details_7day':
            panelContent = <Details7dayPanel />;
            break;
        case 'details_14day':
            // Only render if monthly data has been attempted and is available
            if (hasAttemptedMonthlyLoad && allEarthquakes && allEarthquakes.length > 0) {
                panelContent = <Details14dayPanel />;
            } else if (hasAttemptedMonthlyLoad && isLoadingMonthly) {
                panelContent = <ChartLoadingFallback message="Loading 14-day data..." />;
            } else if (hasAttemptedMonthlyLoad && (!allEarthquakes || allEarthquakes.length === 0 )) {
                 panelContent = <div className="p-4 text-center text-slate-400">No 14-day data available. Try loading full analysis.</div>;
            }
            else {
                 panelContent = <div className="p-4 text-center text-slate-400">Load extended data to view this panel.</div>;
            }
            break;
        case 'details_30day':
            if (hasAttemptedMonthlyLoad && allEarthquakes && allEarthquakes.length > 0) {
                panelContent = <Details30dayPanel />;
            } else if (hasAttemptedMonthlyLoad && isLoadingMonthly) {
                panelContent = <ChartLoadingFallback message="Loading 30-day data..." />;
            } else if (hasAttemptedMonthlyLoad && (!allEarthquakes || allEarthquakes.length === 0 )) {
                 panelContent = <div className="p-4 text-center text-slate-400">No 30-day data available. Try loading full analysis.</div>;
            }
             else {
                 panelContent = <div className="p-4 text-center text-slate-400">Load extended data to view this panel.</div>;
            }
            break;
        case 'learn_more':
            panelContent = <LearnMorePanel />;
            break;
        default:
            panelContent = <OverviewPanel />;
    }

    const showMonthlyButtons = hasAttemptedMonthlyLoad && !isLoadingMonthly && allEarthquakes && allEarthquakes.length > 0;

    return (
        <aside className="hidden lg:flex w-[480px] bg-slate-800 p-0 flex-col border-l border-slate-700 shadow-2xl z-20">
            <div className="p-3 border-b border-slate-700">
                <h2 className="text-md font-semibold text-indigo-400">Detailed Earthquake Analysis</h2>
            </div>
            <div className="flex-shrink-0 p-2 space-x-1 border-b border-slate-700 whitespace-nowrap overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-700">
                <button onClick={() => changeSidebarView('overview_panel')} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'overview_panel' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Overview</button>
                <button onClick={() => changeSidebarView('details_1hr')} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_1hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last Hour</button>
                <button onClick={() => changeSidebarView('details_24hr')} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_24hr' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 24hr</button>
                <button onClick={() => changeSidebarView('details_7day')} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_7day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Last 7day</button>
                {showMonthlyButtons && (
                    <>
                        <button onClick={() => changeSidebarView('details_14day')} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_14day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>14-Day</button>
                        <button onClick={() => changeSidebarView('details_30day')} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'details_30day' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>30-Day</button>
                    </>
                )}
                <button onClick={() => changeSidebarView('learn_more')} className={`px-2 py-1 text-xs rounded-md ${activeSidebarView === 'learn_more' ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}>Learn</button>
            </div>
            <div className="flex-1 p-2 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800" key={activeSidebarView}>
                <Suspense fallback={<ChartLoadingFallback />}>
                    {panelContent}
                </Suspense>
                 {/* Button to load monthly data if not yet attempted */}
                {activeSidebarView !== 'overview_panel' && activeSidebarView !== 'learn_more' && !hasAttemptedMonthlyLoad && (
                    <div className="text-center py-3 mt-3 border-t border-slate-700">
                        <button
                            onClick={loadMonthlyData}
                            disabled={isLoadingMonthly}
                            className="w-full bg-teal-600 hover:bg-teal-500 p-2.5 rounded-md text-white font-semibold transition-colors text-xs shadow-md disabled:opacity-60"
                        >
                            {isLoadingMonthly ? 'Loading Historical Data...' : 'Load Full 14 & 30-Day Analysis'}
                        </button>
                    </div>
                )}
                 {hasAttemptedMonthlyLoad && isLoadingMonthly && (activeSidebarView === 'details_14day' || activeSidebarView === 'details_30day') && (
                    <p className="text-xs text-slate-400 text-center py-3 animate-pulse">Loading extended data archives...</p>
                )}
            </div>
            <footer className="p-1.5 text-center border-t border-slate-700 mt-auto">
                <p className="text-[10px] text-slate-500">&copy; {new Date().getFullYear()} Built By Vibes | Data: USGS</p>
            </footer>
        </aside>
    );
};

export default DesktopSidebar;
