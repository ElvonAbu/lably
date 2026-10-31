import { Suspense } from "react";
import { Outlet } from "react-router-dom";

import {
  MapProvider,
  useMapConfigValue,
} from "../context/MapContext";

import Map from "../components/Map/Map";

import "./MapLayout.css";

// Reads the shared config and renders the one real map.
function PersistentMap() {
  const mapConfig = useMapConfigValue();

  // Do not mount the map until the first page has said where to look,
  // so the very first frame (e.g. after a refresh on /location-search)
  // already starts at the right place, like the old per-page map did.
  if (!mapConfig) {
    return null;
  }

  return <Map {...mapConfig} />;
}

// Mounted once as a parent route (see App.jsx). It stays mounted while
// the user moves between /home and /location-search, so the Mapbox GL
// instance is never destroyed, only reconfigured by the active page.
function MapLayout() {
  return (
    <MapProvider>
      <div className="map-layout">
        <PersistentMap />

        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </div>
    </MapProvider>
  );
}

export default MapLayout;
