// __mocks__/leaflet.js

// This object will be the default export when 'leaflet' is mocked.
// We will attach vi.fn() spies to its methods in the test file's beforeEach.
const LMock = {
  latLng: () => ({ lat: 0, lng: 0 }), // Return a basic structure
  latLngBounds: () => ({
    pad: () => ({
      _southWest: { lat: 0, lng: 0 },
      _northEast: { lat: 0, lng: 0 }
    })
  }),
  featureGroup: () => ({
    addTo: () => {},
    clearLayers: () => {},
    addLayer: () => {}
  }),
  circleMarker: () => ({
    bindTooltip: () => ({
      addTo: () => {}
    })
  }),
  Icon: {
    Default: {
      prototype: { _getIconUrl: null },
      mergeOptions: () => {},
    }
  },
  DivIcon: () => {},
};

export default LMock;
