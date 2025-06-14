// src/components/simplifiedDepthProfileUtils.js

export const DEPTH_COMPARISONS = [
  { name: "Burj Khalifa", depth: 0.828 },
  { name: "Krubera Cave (deepest cave)", depth: 2.197 },
  { name: "Grand Canyon (average depth)", depth: 1.83 },
  { name: "Challenger Deep (ocean deepest)", depth: 10.935 },
  { name: "Average Continental Crust", depth: 35 },
  { name: "Height of Mount Everest", depth: 8.848, isHeight: true },
  { name: "Typical Commercial Flight Altitude", depth: 10.6, isHeight: true },
  { name: "Depth of Titanic Wreckage", depth: 3.8 },
  { name: "Deepest Gold Mine (Mponeng, South Africa)", depth: 4.0 },
  { name: "Average Ocean Depth", depth: 3.7 },
  { name: "Kola Superdeep Borehole (deepest artificial point)", depth: 12.262 },
  { name: "Deepest Point in the Arctic Ocean (Molloy Deep)", depth: 5.55 },
  { name: "Deepest Point in the Atlantic Ocean (Puerto Rico Trench)", depth: 8.376 },
  { name: "Deepest Point in the Indian Ocean (Java Trench)", depth: 7.725 },
  { name: "Typical Geothermal Well Depth", depth: 2.0 },
  { name: "Depth of Lake Baikal (deepest lake)", depth: 1.642 },
  { name: "Panama Canal Max Depth", depth: 0.018 },
  { name: "Suez Canal Max Depth", depth: 0.024 },
  { name: "Shallow Focus Earthquakes (Upper Limit)", depth: 70 },
  { name: "Intermediate Focus Earthquakes (Upper Limit)", depth: 300 },
  { name: "Deep Focus Earthquakes (Upper Limit)", depth: 700 },
];

export function getDynamicContextualComparisons(currentDepth, comparisonsList) {
  const RELATABLE_OBJECTS = [
    { name: "Eiffel Towers", height: 0.3, singular: "Eiffel Tower" },
  ];

  const depth = parseFloat(currentDepth);
  if (isNaN(depth)) {
    return ["Depth information is currently unavailable."];
  }

  const userFriendlyBenchmarks = comparisonsList
    .filter(c => !c.isHeight && !c.name.includes("Focus Earthquakes"))
    .sort((a, b) => a.depth - b.depth);

  for (const benchmark of userFriendlyBenchmarks) {
    const difference = Math.abs(depth - benchmark.depth);
    let isClose = false;
    if (benchmark.depth > 1) {
      isClose = difference <= benchmark.depth * 0.10;
    } else {
      isClose = difference <= 0.1;
    }

    if (isClose) {
      return [`${depth.toFixed(1)} km is nearly as deep as the ${benchmark.name} (${benchmark.depth.toFixed(1)} km)!`];
    }
  }

  const significantBenchmarks = userFriendlyBenchmarks.filter(b =>
    b.name === "Kola Superdeep Borehole (deepest artificial point)" ||
    b.name === "Challenger Deep (ocean deepest)" ||
    b.name === "Average Continental Crust" ||
    b.name === "Deepest Gold Mine (Mponeng, South Africa)"
  ).sort((a, b) => b.depth - a.depth);

  for (const benchmark of significantBenchmarks) {
    if (depth > benchmark.depth && depth < benchmark.depth * 3) {
      return [`That's incredibly deep! It's even further down than the ${benchmark.name} (${benchmark.depth.toFixed(1)} km)!`];
    }
  }

  let analogyMessage = "";

  const mountEverest = comparisonsList.find(c => c.name === "Height of Mount Everest");
  const burjKhalifa = comparisonsList.find(c => c.name === "Burj Khalifa");

  if (depth > 5 && mountEverest) {
      const numObjects = Math.round(depth / mountEverest.depth);
      if (numObjects > 1) {
        analogyMessage = `Wow, ${depth.toFixed(1)} km is a long way down – that's like stacking about ${numObjects} Mount Everests on top of each other!`;
      } else if (numObjects === 1) {
        analogyMessage = `Wow, ${depth.toFixed(1)} km is a long way down – that's about as deep as Mount Everest is tall!`;
      }
  } else if (depth > 1 && burjKhalifa) {
      const numObjects = Math.round(depth / burjKhalifa.depth);
       if (numObjects > 1) {
        analogyMessage = `That's quite deep! ${depth.toFixed(1)} km is like stacking about ${numObjects} Burj Khalifas!`;
      } else if (numObjects === 1 && depth > burjKhalifa.depth * 1.1) {
         analogyMessage = `That's quite deep! ${depth.toFixed(1)} km is like stacking about ${numObjects} Burj Khalifas!`;
      } else if (numObjects === 1 ) {
         analogyMessage = `That's quite deep! ${depth.toFixed(1)} km is about the height of the Burj Khalifa!`;
      }
  } else if (depth > 0.5) {
      const eiffelTower = RELATABLE_OBJECTS.find(r => r.name === "Eiffel Towers");
      const numObjects = Math.round(depth / eiffelTower.height);
      if (numObjects >=1) {
          analogyMessage = `That's pretty deep! ${depth.toFixed(1)} km is like stacking ${numObjects} ${numObjects === 1 ? eiffelTower.singular : eiffelTower.name}!`;
      }
  }

  if (analogyMessage) {
    return [analogyMessage];
  }

  if (depth === 0) {
    return ["This earthquake was right at the surface!"];
  }
  if (depth < 0.1 && depth > 0) {
    return [`${depth.toFixed(2)} km is very close to the surface!`];
  }
  if (depth > 700) {
      return [`Whoa, ${depth.toFixed(0)} km is incredibly deep, way down into the Earth's mantle!`];
  }
  if (depth > 300) {
      return [`That's a very deep earthquake, ${depth.toFixed(0)} km down!`];
  }
   if (depth > 70) {
      return [`That's a deep earthquake, ${depth.toFixed(0)} km down!`];
  }

  return [`That's an earthquake at ${depth.toFixed(1)} km deep.`];
}
