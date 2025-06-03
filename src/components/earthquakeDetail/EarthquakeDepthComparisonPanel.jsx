import React from 'react';

const EarthquakeDepthComparisonPanel = ({
  depth,
  exhibitPanelClass,
  exhibitTitleClass,
  highlightClass,
  captionClass,
}) => {
  if (typeof depth !== 'number' || depth === null) {
    return null;
  }

  const comparisons = [
    { name: 'Mariana Trench', value: 11, unit: 'km', type: 'depth' },
    { name: 'Mount Everest', value: 8.8, unit: 'km', type: 'height' },
    { name: 'Cruising Altitude of Jet', value: 10, unit: 'km', type: 'height' },
    { name: 'Length of Manhattan Island', value: 21.6, unit: 'km', type: 'length' },
  ];

  return (
    <div className={exhibitPanelClass}>
      <h2 className={exhibitTitleClass}>How Deep Was It?</h2>
      <p className={highlightClass}>Depth: {depth.toFixed(1)} km</p>
      <div>
        {comparisons.map((item) => (
          <div key={item.name} className={captionClass}>
            <p>
              {item.name}: {item.value} {item.unit}
            </p>
            {/* Basic comparison logic */}
            {depth > item.value && <p>Deeper than {item.name}.</p>}
            {depth < item.value && <p>Shallower than {item.name}.</p>}
            {depth === item.value && <p>As deep as {item.name}.</p>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EarthquakeDepthComparisonPanel;
