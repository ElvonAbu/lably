import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// Nigeria-wide idle view (moved here from Home.jsx)
export const NIGERIA_CENTER = {
  longitude: 8.6753,
  latitude: 9.0820,
};

export const NIGERIA_ZOOM = 5.4;

const DEFAULT_MAP_CONFIG = {
  longitude: NIGERIA_CENTER.longitude,
  latitude: NIGERIA_CENTER.latitude,
  zoom: NIGERIA_ZOOM,
  sessionKey: "home",
  locationZoom: 16.4,
  markerSize: 72,
  showMarker: false,
  live: false,
  trackGps: false,
  draggableMarker: true,
  onLocationChange: null,
  onPermissionDenied: null,
  // Request camera (see Map.jsx "REQUEST CAMERA DIRECTOR")
  mode: "idle",
  bottomPadding: 0,
  searchDurationMs: 60000,
  userPuck: false,
    riders: [],
  searchRadiusM: 0,
  scientist: null,
};

// undefined = no provider; null = provider present but no page has
// pushed a config yet (the map is not mounted until one does).
const MapConfigContext = createContext(undefined);
const MapActionsContext = createContext(null);

export function MapProvider({ children }) {
  const [mapConfig, setMapConfigState] = useState(null);

  // Merges partial updates. Returns the previous object when nothing
  // actually changed, so identical updates cause no extra map render.
  const setMapConfig = useCallback((partial) => {
    setMapConfigState((prev) => {
      const base = prev || DEFAULT_MAP_CONFIG;
      const next = { ...base, ...partial };
      const unchanged =
        prev !== null &&
        Object.keys(next).every((key) => prev[key] === next[key]);
      return unchanged ? prev : next;
    });
  }, []);

  const actions = useMemo(() => ({ setMapConfig }), [setMapConfig]);

  return (
    <MapActionsContext.Provider value={actions}>
      <MapConfigContext.Provider value={mapConfig}>
        {children}
      </MapConfigContext.Provider>
    </MapActionsContext.Provider>
  );
}

// For pages (Home, LocationSearch): returns { setMapConfig }
export function useMapConfig() {
  const ctx = useContext(MapActionsContext);

  if (!ctx) {
    throw new Error("useMapConfig must be used inside <MapProvider>");
  }

  return ctx;
}

// For MapLayout only: returns the current config object
export function useMapConfigValue() {
  const ctx = useContext(MapConfigContext);

  if (ctx === undefined) {
    throw new Error("useMapConfigValue must be used inside <MapProvider>");
  }

  return ctx;
}
