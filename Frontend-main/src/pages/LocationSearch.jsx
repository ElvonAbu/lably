import "./LocationSearch.css";

import ChooseTestCard from "../components/ChooseTestCard/ChooseTestCard";
import TestPackageCard from "../components/TestPackageCard/TestPackageCard";
import SymptomsCard from "../components/SymptomsCard/SymptomsCard";
import PersonalInfoCard from "../components/PersonalInfoCard/PersonalInfoCard";
import RequestStatusCard from "../components/RequestStatusCard/RequestStatusCard";
import PuckLocationBadge from "../components/PuckLocationBadge/PuckLocationBadge";
import ChangeLocationConfirm from "../components/ChangeLocationConfirm/ChangeLocationConfirm";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MapPin, Search, FlaskConical, X, Trash2 } from "lucide-react";

import Map from "../components/Map/Map";
import FloatingButtons from "../components/FloatingButtons/FloatingButtons";
import { useDebounce } from "../hooks/UseDebounce";
import { useSignOut } from "../hooks/UseSignOut";
import { saveUserLocation } from "../api/locationApi";
import { useLocationPermission } from "../hooks/UseLocationPermission";
import TestChoiceCard from "../components/TestChoiceCard/TestChoiceCard";

/* ==================================================
   FALLBACK LOCATION
================================================== */

const FALLBACK_CENTER = {
  lat: 6.5244,
  lng: 3.3792,
};

const SAVED_ADDRESSES_KEY = "lably_saved_addresses";
const MAX_SAVED_ADDRESSES = 10;

/* ==================================================
   SESSION TOKEN
================================================== */

function generateSessionToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ==================================================
   LOAD SAVED ADDRESSES
================================================== */

function loadSavedAddresses() {
  try {
    const raw = localStorage.getItem(SAVED_ADDRESSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/* ==================================================
   LOCATION SEARCH
================================================== */

function LocationSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state;

  /* ==================================================
     SIGN OUT
  ================================================== */

  const { handleSignOut, isSigningOut, logoutError } = useSignOut();

  /* ==================================================
     LOCATION PERMISSION
  ================================================== */

  const { permissionState } = useLocationPermission();

  const [deniedFallback, setDeniedFallback] = useState(false);

  const [isLiveTracking, setIsLiveTracking] = useState(() =>
    Boolean(routeState?.auto)
  );

  const wasBlockedRef = useRef(false);

  const isLocationBlocked =
    permissionState === "denied" ||
    (deniedFallback && permissionState !== "granted");

  useEffect(() => {
    if (isLocationBlocked) {
      wasBlockedRef.current = true;
      return;
    }

    if (wasBlockedRef.current && permissionState === "granted") {
      wasBlockedRef.current = false;
      setDeniedFallback(false);
      setIsLiveTracking(true);
    }
  }, [isLocationBlocked, permissionState]);

  const handlePermissionDenied = useCallback(() => {
    setDeniedFallback(true);
  }, []);

  /* ==================================================
     SEARCH STATE
  ================================================== */

  const searchSessionTokenRef = useRef(generateSessionToken());

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [activePanel, setActivePanel] = useState(null);

  /* ==================================================
     ACTIVE OVERLAY

     Controls:
     - ChooseTestCard        ("test")
     - SymptomsCard          ("symptoms")
     - TestPackageCard       ("testpackage")
     - PersonalInfoCard      ("personalinfo")
     - RequestStatusCard     ("requeststatus")
  ================================================== */

  const [activeOverlay, setActiveOverlay] = useState(null);

  /*
   * Which of the three "how would you like to proceed"
   * choices this request started from — needed so
   * RequestStatusCard knows whether "Add test" applies,
   * and where it should route back to.
   */

  const [requestOrigin, setRequestOrigin] = useState(null);

  /*
   * Selected tests from ChooseTestCard, and the personal
   * details from PersonalInfoCard — both need to survive
   * closing/reopening those cards (e.g. "Add test" from
   * RequestStatusCard reopens ChooseTestCard, and it
   * should come back with whatever was already picked).
   */

  const [selectedTests, setSelectedTests] = useState([]);
  const [personalInfo, setPersonalInfo] = useState(null);

  const [showChangeLocationConfirm, setShowChangeLocationConfirm] =
    useState(false);

  const [showTestChoice, setShowTestChoice] = useState(false);

  /*
   * Whenever any part of the post-"Get Tested" flow is
   * active, the top search box/pills and the footer
   * button should be hidden — they belong to the
   * "pick a location" phase, not what comes after.
   */

  const isInFlow = showTestChoice || activeOverlay !== null;

  /* ==================================================
     SAVED ADDRESSES
  ================================================== */

  const [savedAddresses, setSavedAddresses] = useState(() =>
    loadSavedAddresses()
  );

  /* ==================================================
     SELECTED PLACE
  ================================================== */

  const [selectedPlace, setSelectedPlace] = useState(null);

  const debouncedQuery = useDebounce(query, 400);

  const suggestionBoxRef = useRef(null);

  /* ==================================================
     SEARCH INPUT
  ================================================== */

  const handleInputChange = (event) => {
    const value = event.target.value;

    setQuery(value);
    setSelectedPlace(null);

    if (value.trim()) {
      setActivePanel("suggestions");
    } else {
      setActivePanel(null);
      setSuggestions([]);
    }
  };

  /* ==================================================
     REVERSE GEOCODING
  ================================================== */

  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
      );

      if (!response.ok) {
        throw new Error("Reverse geocoding failed");
      }

      const data = await response.json();

      if (data.status !== "OK") {
        throw new Error(`Google geocoding status: ${data.status}`);
      }

      const place = data.results?.[0];

      return place?.formatted_address || "Current Location";
    } catch (error) {
      console.error("LABLY reverse geocoding error:", error);
      return "Current Location";
    }
  }, []);

  /* ==================================================
     MAP LOCATION CHANGE
  ================================================== */

  const handleMapLocationChange = useCallback(
    async (coords, meta = {}) => {
      const { lat, lng } = coords;

      const address = await reverseGeocode(lat, lng);

      setQuery(address);

      setSelectedPlace({ lat, lng, address });

      if (meta.source === "manual") {
        setIsLiveTracking(false);
      }

      if (meta.source === "gps") {
        setDeniedFallback(false);
      }

      if (meta.source === "recenter") {
        setDeniedFallback(false);
      }

      setSuggestions([]);
      setActivePanel(null);
    },
    [reverseGeocode]
  );

  /* ==================================================
     LOAD ADDRESS FROM ROUTE STATE
  ================================================== */

  useEffect(() => {
    if (routeState?.lat == null || routeState?.lng == null) {
      return;
    }

    let ignore = false;

    async function loadAddress() {
      const address = await reverseGeocode(routeState.lat, routeState.lng);

      if (ignore) {
        return;
      }

      setQuery(address);

      setSelectedPlace({
        lat: routeState.lat,
        lng: routeState.lng,
        address,
      });
    }

    loadAddress();

    return () => {
      ignore = true;
    };
  }, [routeState, reverseGeocode]);

  /* ==================================================
     ADDRESS SUGGESTIONS
  ================================================== */

  useEffect(() => {
    let ignore = false;

    if (!debouncedQuery) {
      Promise.resolve().then(() => {
        if (!ignore) {
          setSuggestions([]);
          setLoadingSuggestions(false);
        }
      });

      return () => {
        ignore = true;
      };
    }

    if (selectedPlace && debouncedQuery === selectedPlace.address) {
      return;
    }

    async function fetchSuggestions() {
      setLoadingSuggestions(true);

      try {
        const response = await fetch(
          "https://places.googleapis.com/v1/places:autocomplete",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
            },
            body: JSON.stringify({
              input: debouncedQuery,
              includedRegionCodes: ["ng"],
              languageCode: "en",
              sessionToken: searchSessionTokenRef.current,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Address search failed");
        }

        const data = await response.json();

        if (!ignore) {
          setSuggestions(
            (data.suggestions || [])
              .map((s) => s.placePrediction)
              .filter(Boolean)
              .map((prediction) => ({
                id: prediction.placeId,
                name:
                  prediction.structuredFormat?.mainText?.text ||
                  prediction.text?.text ||
                  "",
                context:
                  prediction.structuredFormat?.secondaryText?.text || "",
              }))
          );
        }
      } catch (error) {
        console.error("LABLY address search error:", error);

        if (!ignore) {
          setSuggestions([]);
        }
      } finally {
        if (!ignore) {
          setLoadingSuggestions(false);
        }
      }
    }

    fetchSuggestions();

    return () => {
      ignore = true;
    };
  }, [debouncedQuery, selectedPlace]);

  /* ==================================================
     SELECT SUGGESTED ADDRESS
  ================================================== */

  const handleSelectSuggestion = async (suggestion) => {
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${suggestion.id}?fields=id,displayName,formattedAddress,location&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch place details");
      }

      const data = await response.json();

      const lat = data.location?.latitude;
      const lng = data.location?.longitude;

      if (lat == null || lng == null) {
        return;
      }

      const address = data.formattedAddress || suggestion.name;

      setQuery(address);

      setSelectedPlace({ lat, lng, address });

      setSuggestions([]);
      setActivePanel(null);
      setIsLiveTracking(false);
    } catch (error) {
      console.error("LABLY place selection error:", error);
    }
  };

  /* ==================================================
     SELECT SAVED ADDRESS
  ================================================== */

  const handleSelectSaved = (item) => {
    setQuery(item.address);

    setSelectedPlace({
      lat: item.lat,
      lng: item.lng,
      address: item.address,
    });

    setActivePanel(null);
    setIsLiveTracking(false);
  };

  /* ==================================================
     SAVE ADDRESS
  ================================================== */

  const persistSavedAddress = (place) => {
    if (!place) {
      return;
    }

    const current = loadSavedAddresses();

    const exists = current.some(
      (item) => item.lat === place.lat && item.lng === place.lng
    );

    if (exists) {
      return;
    }

    const next = [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        lat: place.lat,
        lng: place.lng,
        address: place.address,
      },
      ...current,
    ].slice(0, MAX_SAVED_ADDRESSES);

    localStorage.setItem(SAVED_ADDRESSES_KEY, JSON.stringify(next));

    setSavedAddresses(next);
  };

  /* ==================================================
     DELETE ALL SAVED ADDRESSES
  ================================================== */

  const handleDeleteAllSaved = () => {
    localStorage.removeItem(SAVED_ADDRESSES_KEY);
    setSavedAddresses([]);
  };

  /* ==================================================
     MAP CENTER
  ================================================== */

  const mapCenter = selectedPlace
    ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
    : routeState?.lat != null && routeState?.lng != null
    ? { lat: routeState.lat, lng: routeState.lng }
    : FALLBACK_CENTER;

  const isLocationConfirmed = Boolean(selectedPlace);

  const mapTrackGps = isLiveTracking && permissionState === "granted";

  /*
   * The puck can only be dragged during the normal
   * "pick a location" phase. Once the request-status
   * screen is showing, the location is locked in.
   */

  const isPuckDraggable = activeOverlay !== "requeststatus";

  /* ==================================================
     GET TESTED
  ================================================== */

  const handleGetTested = async () => {
    if (!isLocationConfirmed) {
      return;
    }

    persistSavedAddress(selectedPlace);

    try {
      await saveUserLocation(selectedPlace.lat, selectedPlace.lng);
    } catch (error) {
      console.warn("LABLY save location failed:", error);
    }

    setShowTestChoice(true);
  };

  /* ==================================================
     TEST CHOICE NEXT
  ================================================== */

  const handleTestChoiceNext = (selectedOption) => {
    setShowTestChoice(false);

    if (selectedOption === "test") {
      setRequestOrigin("test");
      setActiveOverlay("test");
      return;
    }

    if (selectedOption === "symptoms") {
      setRequestOrigin("symptoms");
      setActiveOverlay("symptoms");
      return;
    }

    if (selectedOption === "checkup") {
      setRequestOrigin("testpackage");
      setActiveOverlay("testpackage");
      return;
    }

    console.warn("LABLY: unknown test choice:", selectedOption);
  };

  /* ==================================================
     ANY OF THE THREE "PROCEED" CARDS → PERSONAL INFO
  ================================================== */

  const handleProceedToPersonalInfo = () => {
    setActiveOverlay("personalinfo");
  };

  const handlePersonalInfoNext = (data) => {
    setPersonalInfo(data);
    setActiveOverlay("requeststatus");
  };

  /* ==================================================
     REQUEST STATUS ACTIONS
  ================================================== */

  const handleAddTestFromStatus = () => {
    if (requestOrigin === "test") {
      setActiveOverlay("test");
    }
  };

  const handleCancelRequest = () => {
    setActiveOverlay(null);
    setRequestOrigin(null);
    setSelectedTests([]);
    setPersonalInfo(null);
  };

  const handleConfirmChangeLocation = () => {
    setSelectedPlace(null);
    setQuery("");
    setActiveOverlay(null);
    setRequestOrigin(null);
    setSelectedTests([]);
    setPersonalInfo(null);
    setShowChangeLocationConfirm(false);
  };

  /* ==================================================
     BACK BUTTON

     Normally goes to Home. While viewing the request
     status screen, it should step back to the info
     form instead of leaving the flow entirely.
  ================================================== */

  const handleBack = () => {
    if (activeOverlay === "requeststatus") {
      setActiveOverlay("personalinfo");
      return;
    }

    navigate("/home", {
      state: {
        cameFromLocationSearch: true,
      },
    });
  };

  /* ==================================================
     MENU
  ================================================== */

  const menuItems = [
    {
      label: "Help",
      onClick: () => console.log("LABLY: help clicked"),
    },
    {
      label: "Sign out",
      loadingLabel: "Signing out...",
      onClick: handleSignOut,
      disabled: isSigningOut,
    },
  ];

  /* ==================================================
     RENDER
  ================================================== */

  return (
    <div className="location-search-page">
      {logoutError && (
        <p className="home-toast home-toast-error">{logoutError}</p>
      )}

      <Map
        longitude={mapCenter.lng}
        latitude={mapCenter.lat}
        zoom={isLiveTracking ? 16.4 : 10}
        locationZoom={16.4}
        markerSize={50}
        showMarker={isLocationConfirmed}
        live={isLiveTracking}
        trackGps={mapTrackGps}
        draggableMarker={isPuckDraggable}
        onLocationChange={handleMapLocationChange}
        onPermissionDenied={handlePermissionDenied}
      />

      <FloatingButtons
        variant="search"
        onBack={handleBack}
        menuItems={menuItems}
      />

      {!isInFlow && (
        <div className="location-search-overlay" ref={suggestionBoxRef}>
          <div className="location-search-box">
            <div className="location-search-input-wrapper">
              <MapPin size={20} className="location-search-pin" />

              <input
                type="text"
                placeholder="Enter your address"
                value={query}
                onChange={handleInputChange}
                onFocus={() => {
                  if (query) {
                    setActivePanel("suggestions");
                  }
                }}
                className="location-search-input"
              />

              {isLiveTracking && !isLocationBlocked && (
                <span className="location-live-badge">Live</span>
              )}

              {query.length > 0 && (
                <button
                  type="button"
                  className="location-clear-btn"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    setSelectedPlace(null);
                    setSuggestions([]);
                    setActivePanel(null);
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {activePanel === "suggestions" && (
              <div className="location-panel">
                <div className="location-panel-header">
                  <span>Suggested locations</span>
                </div>

                <div className="location-panel-body">
                  {!loadingSuggestions && suggestions.length === 0 && (
                    <p className="location-suggestions-empty">
                      No suggestions found.
                    </p>
                  )}

                  {suggestions.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion.id}
                      className="location-suggestion-item"
                      onClick={() => handleSelectSuggestion(suggestion)}
                    >
                      <MapPin size={16} />

                      <span className="location-suggestion-text">
                        <span className="location-suggestion-name">
                          {suggestion.name}
                        </span>

                        {suggestion.context && (
                          <span className="location-suggestion-context">
                            {suggestion.context}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activePanel === "saved" && (
              <div className="location-panel">
                <div className="location-panel-header">
                  <span>Saved addresses</span>

                  <div className="location-panel-header-actions">
                    {savedAddresses.length > 0 && (
                      <button
                        type="button"
                        className="location-panel-delete-all"
                        onClick={handleDeleteAllSaved}
                      >
                        <Trash2 size={14} />
                        Delete all
                      </button>
                    )}

                    <button
                      type="button"
                      className="location-panel-close"
                      aria-label="Close saved addresses"
                      onClick={() => setActivePanel(null)}
                    />
                  </div>
                </div>

                <div className="location-panel-body">
                  {savedAddresses.length === 0 && (
                    <p className="location-suggestions-empty">
                      No saved addresses yet.
                    </p>
                  )}

                  {savedAddresses.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className="location-suggestion-item"
                      onClick={() => handleSelectSaved(item)}
                    >
                      <MapPin size={16} />

                      <span className="location-suggestion-text">
                        <span className="location-suggestion-name">
                          {item.address}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="location-pills">
            <button
              type="button"
              className={
                activePanel === "suggestions"
                  ? "location-pill location-pill-suggested location-pill-active"
                  : "location-pill location-pill-suggested"
              }
              onClick={() =>
                setActivePanel((prev) =>
                  prev === "suggestions" ? null : "suggestions"
                )
              }
            >
              Suggested
            </button>

            <button
              type="button"
              className={
                activePanel === "saved"
                  ? "location-pill location-pill-saved location-pill-active"
                  : "location-pill location-pill-saved"
              }
              onClick={() =>
                setActivePanel((prev) => (prev === "saved" ? null : "saved"))
              }
            >
              Saved
            </button>
          </div>
        </div>
      )}

      {!isInFlow && activePanel === null && (
        <div className="location-search-footer">
          <button
            type="button"
            className="get-tested-btn"
            disabled={!isLocationConfirmed}
            onClick={handleGetTested}
          >
            <Search size={20} />
            <span>Get Tested</span>
            <FlaskConical size={20} />
          </button>
        </div>
      )}

      {/* ==================================================
         TEST CHOICE CARD
      ================================================== */}

      {showTestChoice && (
        <TestChoiceCard
          onNext={handleTestChoiceNext}
          onClose={() => setShowTestChoice(false)}
        />
      )}

      {/* ==================================================
         CHOOSE TEST CARD
      ================================================== */}

      {activeOverlay === "test" && (
        <ChooseTestCard
          initialSelected={selectedTests}
          onGetTested={(list) => {
            console.log("LABLY: tests selected:", list);
            setSelectedTests(list);
            handleProceedToPersonalInfo();
          }}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {/* ==================================================
         SYMPTOMS CARD
      ================================================== */}

      {activeOverlay === "symptoms" && (
        <SymptomsCard
          onGetTested={(list) => {
            console.log("LABLY: symptoms selected:", list);
            handleProceedToPersonalInfo();
          }}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {/* ==================================================
         TEST PACKAGE CARD
      ================================================== */}

      {activeOverlay === "testpackage" && (
        <TestPackageCard
          onNext={(pkg) => {
            console.log("LABLY: package selected:", pkg);
            handleProceedToPersonalInfo();
          }}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {/* ==================================================
         PERSONAL INFO CARD
      ================================================== */}

      {activeOverlay === "personalinfo" && (
        <PersonalInfoCard
          initialValues={personalInfo}
          onNext={handlePersonalInfoNext}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {/* ==================================================
         REQUEST STATUS — puck badge + bottom sheet,
         map and floating buttons stay visible/usable.
      ================================================== */}

      {activeOverlay === "requeststatus" && (
        <div className="request-status-root">
          <PuckLocationBadge
            address={selectedPlace?.address}
            onChangeLocation={() => setShowChangeLocationConfirm(true)}
          />

          <RequestStatusCard
            address={selectedPlace?.address}
            canAddTest={requestOrigin === "test"}
            onAddTest={handleAddTestFromStatus}
            onCancel={handleCancelRequest}
          />
        </div>
      )}

      {showChangeLocationConfirm && (
        <ChangeLocationConfirm
          onConfirm={handleConfirmChangeLocation}
          onCancel={() => setShowChangeLocationConfirm(false)}
        />
      )}
    </div>
  );
}

export default LocationSearch;