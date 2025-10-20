// functions/utils/earthquake-processor.js
import { getMagnitudeColor } from '../../src/utils/utils.js';
import { MAJOR_QUAKE_THRESHOLD, ALERT_LEVELS } from '../../src/constants/appConstants';

// --- Helper Function Definitions (migrated from earthquakeDataContextUtils.js) ---
const filterByTime = (data, hoursAgoStart, hoursAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - hoursAgoStart * 36e5;
    const endTime = now - hoursAgoEnd * 36e5;
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

const filterMonthlyByTime = (data, daysAgoStart, daysAgoEnd = 0, now = Date.now()) => {
    if (!Array.isArray(data)) return [];
    const startTime = now - (daysAgoStart * 24 * 36e5);
    const endTime = now - (daysAgoEnd * 24 * 36e5);
    return data.filter(q => q.properties.time >= startTime && q.properties.time < endTime);
};

const consolidateMajorQuakesLogic = (majorQuakes) => {
    const consolidated = [...majorQuakes]
        .sort((a, b) => b.properties.time - a.properties.time)
        .filter((quake, index, self) => index === self.findIndex(q => q.id === quake.id));

    const newLastMajor = consolidated.length > 0 ? consolidated[0] : null;
    const newPreviousMajor = consolidated.length > 1 ? consolidated[1] : null;
    const newTimeBetween = newLastMajor && newPreviousMajor ? newLastMajor.properties.time - newPreviousMajor.properties.time : null;

    return {
        lastMajorQuake: newLastMajor,
        previousMajorQuake: newPreviousMajor,
        timeBetweenPreviousMajorQuakes: newTimeBetween
    };
};

const sampleArray = (array, sampleSize) => {
    if (!Array.isArray(array) || array.length === 0) return [];
    if (sampleSize >= array.length) return [...array];

    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, sampleSize);
};

function sampleArrayWithPriority(fullArray, sampleSize, priorityMagnitudeThreshold) {
    if (!fullArray || fullArray.length === 0) {
        return [];
    }
    if (sampleSize <= 0) {
        return [];
    }

    const priorityQuakes = fullArray.filter(
        q => q.properties && typeof q.properties.mag === 'number' && q.properties.mag >= priorityMagnitudeThreshold
    );

    const otherQuakes = fullArray.filter(
        q => !q.properties || typeof q.properties.mag !== 'number' || q.properties.mag < priorityMagnitudeThreshold
    );

    if (priorityQuakes.length >= sampleSize) {
        return sampleArray(priorityQuakes, sampleSize);
    } else {
        const remainingSlots = sampleSize - priorityQuakes.length;
        const sampledOtherQuakes = sampleArray(otherQuakes, remainingSlots);
        return [...priorityQuakes, ...sampledOtherQuakes];
    }
}

const formatDateForTimeline = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getInitialDailyCounts = (numDays, baseTime) => {
    const counts = [];
    for (let i = 0; i < numDays; i++) {
        const date = new Date(baseTime);
        date.setDate(date.getDate() - i);
        counts.push({ dateString: formatDateForTimeline(date.getTime()), count: 0 });
    }
    return counts.reverse();
};

const MAGNITUDE_RANGES = [
    {name: '<1', min: -Infinity, max: 0.99},
    {name : '1-1.9', min : 1, max : 1.99},
    {name: '2-2.9', min: 2, max: 2.99},
    {name : '3-3.9', min : 3, max : 3.99},
    {name: '4-4.9', min: 4, max: 4.99},
    {name : '5-5.9', min : 5, max : 5.99},
    {name: '6-6.9', min: 6, max: 6.99},
    {name : '7+', min : 7, max : Infinity},
];

const calculateMagnitudeDistribution = (earthquakes) => {
    const distribution = MAGNITUDE_RANGES.map(range => ({
        name: range.name,
        count: 0,
        color: getMagnitudeColor(range.min === -Infinity ? 0 : range.min)
    }));

    earthquakes.forEach(quake => {
        const mag = quake.properties.mag;
        if (mag === null || typeof mag !== 'number') return;

        for (const range of distribution) {
            const rangeDetails = MAGNITUDE_RANGES.find(r => r.name === range.name);
            if (mag >= rangeDetails.min && mag <= rangeDetails.max) {
                range.count++;
                break;
            }
        }
    });
    return distribution;
};

const SCATTER_SAMPLING_THRESHOLD_7_DAYS = 300;
const SCATTER_SAMPLING_THRESHOLD_14_DAYS = 500;
const SCATTER_SAMPLING_THRESHOLD_30_DAYS = 700;


export function processEarthquakeData(dailyFeatures, weeklyFeatures, monthlyFeatures, fetchTime) {
    // Daily processing
    const l24 = filterByTime(dailyFeatures, 24, 0, fetchTime);
    const alertsIn24hr = l24.map(q => q.properties.alert).filter(a => a && a !== 'green' && ALERT_LEVELS[a.toUpperCase()]);
    const currentHighestAlert = alertsIn24hr.length > 0 ? alertsIn24hr.sort((a,b) => ({ 'red':0, 'orange':1, 'yellow':2 }[a] - { 'red':0, 'orange':1, 'yellow':2 }[b]))[0] : null;

    let identifiedTsunamiQuake = null;
    const hasRecentTsunamiWarning = l24.some(q => q.properties.tsunami === 1);
    if (hasRecentTsunamiWarning) {
        const tsunamiQuakes = l24.filter(q => q.properties.tsunami === 1).sort((a, b) => b.properties.time - a.properties.time);
        if (tsunamiQuakes.length > 0) identifiedTsunamiQuake = tsunamiQuakes[0];
    }

    const dailyProcessed = {
        earthquakesLastHour: filterByTime(dailyFeatures, 1, 0, fetchTime),
        earthquakesPriorHour: filterByTime(dailyFeatures, 2, 1, fetchTime),
        earthquakesLast24Hours: l24,
        hasRecentTsunamiWarning,
        tsunamiTriggeringQuake: identifiedTsunamiQuake,
        highestRecentAlert: currentHighestAlert,
        activeAlertTriggeringQuakes: currentHighestAlert ? l24.filter(q => q.properties.alert === currentHighestAlert) : [],
    };

    // Weekly processing
    const last72HoursData = filterByTime(weeklyFeatures, 72, 0, fetchTime);
    const uniqueEarthquakeIds = new Set();
    const deduplicatedLast72HoursData = last72HoursData.filter(quake => {
        if (!uniqueEarthquakeIds.has(quake.id)) {
            uniqueEarthquakeIds.add(quake.id);
            return true;
        }
        return false;
    });

    const currentEarthquakesLast7Days = filterByTime(weeklyFeatures, 7 * 24, 0, fetchTime);

    const dailyCounts7Days = getInitialDailyCounts(7, fetchTime);
    currentEarthquakesLast7Days.forEach(quake => {
        const dateString = formatDateForTimeline(quake.properties.time);
        const dayEntry = dailyCounts7Days.find(d => d.dateString === dateString);
        if (dayEntry) dayEntry.count++;
    });

    const sampledEarthquakesLast7Days = sampleArrayWithPriority(currentEarthquakesLast7Days, SCATTER_SAMPLING_THRESHOLD_7_DAYS, MAJOR_QUAKE_THRESHOLD);
    const magnitudeDistribution7Days = calculateMagnitudeDistribution(currentEarthquakesLast7Days);

    const weeklyProcessed = {
        earthquakesLast72Hours: deduplicatedLast72HoursData,
        prev24HourData: filterByTime(weeklyFeatures, 48, 24, fetchTime),
        earthquakesLast7Days: currentEarthquakesLast7Days,
        globeEarthquakes: [...deduplicatedLast72HoursData].sort((a,b) => (b.properties.mag || 0) - (a.properties.mag || 0)).slice(0, 900),
        dailyCounts7Days,
        sampledEarthquakesLast7Days,
        magnitudeDistribution7Days,
    };

    // Monthly processing
    let monthlyProcessed = {};
    if (monthlyFeatures && monthlyFeatures.length > 0) {
        const dailyCounts30Days = getInitialDailyCounts(30, fetchTime);
        const dailyCounts14Days = getInitialDailyCounts(14, fetchTime);
        const currentEarthquakesLast30Days = filterMonthlyByTime(monthlyFeatures, 30, 0, fetchTime);
        const currentEarthquakesLast14Days = filterMonthlyByTime(monthlyFeatures, 14, 0, fetchTime);
        const magnitudeDistribution30Days = calculateMagnitudeDistribution(currentEarthquakesLast30Days);
        const magnitudeDistribution14Days = calculateMagnitudeDistribution(currentEarthquakesLast14Days);

        currentEarthquakesLast30Days.forEach(quake => {
            const dateString = formatDateForTimeline(quake.properties.time);
            const dayEntry30 = dailyCounts30Days.find(d => d.dateString === dateString);
            if (dayEntry30) dayEntry30.count++;
        });
        currentEarthquakesLast14Days.forEach(quake => {
            const dateString = formatDateForTimeline(quake.properties.time);
            const dayEntry14 = dailyCounts14Days.find(d => d.dateString === dateString);
            if (dayEntry14) dayEntry14.count++;
        });

        monthlyProcessed = {
            allEarthquakes: monthlyFeatures,
            earthquakesLast14Days: currentEarthquakesLast14Days,
            earthquakesLast30Days: currentEarthquakesLast30Days,
            sampledEarthquakesLast14Days: sampleArrayWithPriority(currentEarthquakesLast14Days, SCATTER_SAMPLING_THRESHOLD_14_DAYS, MAJOR_QUAKE_THRESHOLD),
            sampledEarthquakesLast30Days: sampleArrayWithPriority(currentEarthquakesLast30Days, SCATTER_SAMPLING_THRESHOLD_30_DAYS, MAJOR_QUAKE_THRESHOLD),
            dailyCounts14Days,
            dailyCounts30Days,
            magnitudeDistribution14Days,
            magnitudeDistribution30Days,
            prev7DayData: filterMonthlyByTime(monthlyFeatures, 14, 7, fetchTime),
            prev14DayData: filterMonthlyByTime(monthlyFeatures, 28, 14, fetchTime),
        };
    }

    const allQuakes = [
        ...(dailyFeatures || []),
        ...(weeklyFeatures || []),
        ...(monthlyFeatures || [])
    ];

    const uniqueQuakes = allQuakes.filter((quake, index, self) =>
        index === self.findIndex(q => q.id === quake.id)
    );

    const allMajorQuakes = uniqueQuakes.filter(q => q.properties.mag !== null && q.properties.mag >= MAJOR_QUAKE_THRESHOLD);

    const majorQuakeUpdates = consolidateMajorQuakesLogic(allMajorQuakes);

    return {
        ...dailyProcessed,
        ...weeklyProcessed,
        ...monthlyProcessed,
        ...majorQuakeUpdates
    };
}
