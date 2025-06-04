import React from 'react';
import SeoMetadata from '../components/SeoMetadata'; // Assuming this path is correct

const FaultsPage = () => {
  return (
    <>
      <SeoMetadata
        title="Fault Mechanics Visualizer"
        description="Interactive visualizations of geological fault mechanics, including normal, reverse, and strike-slip faults."
        // Add other relevant props if needed, like keywords or image
      />
      <div className="container mx-auto p-4">
        <header className="text-center py-8">
          <h1 className="text-4xl font-bold text-gray-800">Fault Mechanics Visualizer</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
          {/* Placeholder for InteractiveGlobeView */}
          <div id="fault-globe-placeholder" className="md:col-span-2 h-96 bg-gray-200 rounded-lg shadow-md flex items-center justify-center">
            <p className="text-gray-500 text-xl">Globe View Placeholder</p>
            {/* Later, <InteractiveGlobeView /> will be placed here */}
          </div>

          {/* Placeholder for Fault Animation Components */}
          <div id="fault-animation-placeholder" className="h-96 bg-gray-100 p-4 rounded-lg shadow-md flex flex-col items-center justify-center">
            <p className="text-gray-500 text-lg mb-4">Fault Animation Placeholder</p>
            {/* Later, fault animation components will be dynamically rendered here */}
            <div className="w-full h-3/4 bg-gray-200 rounded flex items-center justify-center">
                <p className="text-gray-400">Animation Area</p>
            </div>
          </div>
        </div>

        {/* Placeholder for Fault Information */}
        <div id="fault-info-placeholder" className="my-8 p-6 bg-white rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Fault Information</h2>
          <p className="text-gray-600">
            Detailed information about the selected fault or general fault mechanics will be displayed here.
            This section will update based on interactions with the globe or animation controls.
          </p>
          {/* Later, dynamic content related to faults will be shown here */}
        </div>

        {/* Example of how actual animations might be embedded later - not part of this task yet
        <div className="my-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <FaultAnimationNormal isPlaying={true} />
            <FaultAnimationReverse isPlaying={true} />
            <FaultAnimationStrikeSlip isPlaying={true} />
        </div>
        */}

      </div>
    </>
  );
};

export default FaultsPage;
