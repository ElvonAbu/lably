import "./LocationSearch.css";

import BookingWhoCard from "../components/BookingWhoCard/BookingWhoCard";
import EditHealthDataCard from "../components/EditHealthDataCard/EditHealthDataCard";
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
import {
  getMyPatientProfile,
  savePatientDetails,
  updateMyPatientProfile,
  backendPatientToFrontend,
} from "../api/patientApi";
import { useLocationPermission } from "../hooks/UseLocationPermission";
import TestChoiceCard from "../components/TestChoiceCard/TestChoiceCard";

import {
  loadLastLocation,
  saveLastLocation,
  clearLastLocation,
} from "../utils/locationStore";

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

      queueMicrotask(() => {
        setDeniedFallback(false);
        setIsLiveTracking(true);
      });
    }
  }, [isLocationBlocked, permissionState]);

  const handlePermissionDenied = useCallback(() => {
    setDeniedFallback(true);
  }, []);

  /* ==================================================
     SEARCH STATE
  ================================================== */

  const searchSessionTokenRef = useRef(generateSessionToken());

  const [query, setQuery] = useState(
    () => loadLastLocation()?.address ?? ""
  );

  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [activePanel, setActivePanel] = useState(null);

  /* ==================================================
     ACTIVE OVERLAY
  ================================================== */

  const [activeOverlay, setActiveOverlay] = useState(null);

  const [requestOrigin, setRequestOrigin] = useState(null);

  /*
   * Who THIS booking is for.
   * "myself"  → use/create relationship: "self"
   * "someone" → always create relationship: "other"
   * This is how the app knows which patient type to use.
   */
  const [bookingFor, setBookingFor] = useState(null);

  /*
   * Self profile from backend only (GET /me). Not localStorage.
   * Used for "Use existing info?" when bookingFor === "myself".
   */
  const [myselfInfo, setMyselfInfo] = useState(null);

  /*
   * Patient record for THIS booking (self or other).
   * - personalInfo: form fields for UI
   * - activePatientId: Mongo _id to attach to TestRequest / cart
   */
  const [selectedTests, setSelectedTests] = useState([]);
  const [personalInfo, setPersonalInfo] = useState(null);
  const [activePatientId, setActivePatientId] = useState(null);

  const [showChangeLocationConfirm, setShowChangeLocationConfirm] =
    useState(false);

  const [showTestChoice, setShowTestChoice] = useState(false);
  const [showBookingWho, setShowBookingWho] = useState(false);
  const [showEditCheck, setShowEditCheck] = useState(false);

  const isInFlow =
    showTestChoice ||
    showBookingWho ||
    showEditCheck ||
    activeOverlay !== null;

  /* ==================================================
     SAVED ADDRESSES
  ================================================== */

  const [savedAddresses, setSavedAddresses] = useState(() =>
    loadSavedAddresses()
  );

  const [selectedPlace, setSelectedPlace] = useState(
    () => loadLastLocation()
  );

  useEffect(() => {
    if (selectedPlace) {
      saveLastLocation(selectedPlace);
    }
  }, [selectedPlace]);

  useEffect(() => {
    if (permissionState !== "granted" || selectedPlace) return;

    queueMicrotask(() => setIsLiveTracking(true));
  }, [permissionState, selectedPlace]);

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

  const isPuckDraggable = activeOverlay !== "requeststatus";

  /* ==================================================
     GET TESTED
  ================================================== */

  const handleGetTested = () => {
    if (!isLocationConfirmed) {
      return;
    }

    setShowBookingWho(true);

    persistSavedAddress(selectedPlace);

    saveUserLocation(selectedPlace.lat, selectedPlace.lng).catch((error) => {
      console.warn("LABLY save location failed:", error);
    });
  };

  /* ==================================================
     BOOKING WHO → NEXT

     This is where the app decides self vs other for
     THIS booking. Backend is the only source of truth.
  ================================================== */

  const handleBookingWhoNext = async (choice) => {
    setShowBookingWho(false);
    setBookingFor(choice);
    setActivePatientId(null);
    setPersonalInfo(null);
    setMyselfInfo(null);

    // --- MYSELF: load relationship "self" from API ---
    if (choice === "myself") {
      try {
        const res = await getMyPatientProfile();
        // res.data is the patient document or null
        const fromApi = backendPatientToFrontend(res?.data);

        if (fromApi) {
          setMyselfInfo(fromApi);
          // Keep the Mongo id so "Use existing" can set activePatientId
          setMyselfInfo({
            ...fromApi,
            _id: res.data._id,
          });
          setShowEditCheck(true);
        } else {
          // First time — empty form → will POST relationship: "self"
          setActiveOverlay("personalinfo");
        }
      } catch (error) {
        console.warn("LABLY getMyPatientProfile failed:", error);
        // No localStorage fallback — show form or error
        setActiveOverlay("personalinfo");
      }
      return;
    }

    // --- SOMEONE ELSE: never touch self; always new "other" ---
    setActiveOverlay("personalinfo");
  };

  /* ==================================================
     USE EXISTING DATA — YES / NO
     Only reached when bookingFor === "myself" and
     GET /me already returned a self profile.
  ================================================== */

  const handleUseExistingYes = () => {
    setShowEditCheck(false);
    // This booking uses the self profile
    setPersonalInfo(myselfInfo);
    setActivePatientId(myselfInfo?._id ?? null);
    setShowTestChoice(true);
  };

  const handleUseExistingNo = () => {
    setShowEditCheck(false);
    // Pre-fill form; save will upsert self and refresh activePatientId
    setPersonalInfo(myselfInfo);
    setActiveOverlay("personalinfo");
  };

  /* ==================================================
     PERSONAL INFO → NEXT

     Persist to backend, then lock in activePatientId
     for the rest of THIS booking.
  ================================================== */

  const handlePersonalInfoNext = async (data) => {
    setPersonalInfo(data);

    const relationship = bookingFor === "myself" ? "self" : "other";

    try {
      const res = await savePatientDetails(data, relationship);
      // Backend returns { data: { id, patient } } or similar
      const id = res?.data?.id || res?.data?.patient?._id || res?.data?._id;
      const patient = res?.data?.patient || res?.data;

      setActivePatientId(id ? String(id) : null);

      if (relationship === "self") {
        const mapped = backendPatientToFrontend(patient) || data;
        setMyselfInfo({
          ...mapped,
          _id: id || patient?._id,
        });
      }
    } catch (error) {
      if (relationship === "self" && error?.status === 409) {
        try {
          const res2 = await updateMyPatientProfile(data);
          const patient = res2?.data;
          const id = patient?._id;
          setActivePatientId(id ? String(id) : null);
          const mapped = backendPatientToFrontend(patient) || data;
          setMyselfInfo({ ...mapped, _id: id });
        } catch (e2) {
          console.warn("LABLY updateMyPatientProfile failed:", e2);
        }
      } else {
        console.warn("LABLY savePatientDetails failed:", error);
      }
    }

    setActiveOverlay(null);
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

  const handleProceedToRequestStatus = () => {
    // At this point you have everything for the booking:
    // - activePatientId  → patient document for this booking
    // - bookingFor       → "myself" | "someone"
    // - personalInfo     → display fields
    // - selectedTests    → tests chosen
    // - selectedPlace    → location
    //
    // When you create a TestRequest, send:
    //   patientid: activePatientId
    console.log("LABLY booking patient:", {
      activePatientId,
      bookingFor,
      personalInfo,
      selectedTests,
      selectedPlace,
    });

    setActiveOverlay("requeststatus");
  };

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
    setActivePatientId(null);
    setBookingFor(null);
    setMyselfInfo(null);
  };

  const handleConfirmChangeLocation = () => {
    clearLastLocation();
    setSelectedPlace(null);
    setQuery("");
    setActiveOverlay(null);
    setRequestOrigin(null);
    setSelectedTests([]);
    setPersonalInfo(null);
    setActivePatientId(null);
    setBookingFor(null);
    setMyselfInfo(null);
    setShowChangeLocationConfirm(false);
  };

  const handleBack = () => {
    if (activeOverlay === "requeststatus") {
      setActiveOverlay(requestOrigin || "personalinfo");
      return;
    }

    navigate("/home", {
      state: {
        cameFromLocationSearch: true,
        lat: selectedPlace?.lat,
        lng: selectedPlace?.lng,
        address: selectedPlace?.address,
      },
    });
  };

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
                    clearLastLocation();
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

      {showBookingWho && (
        <BookingWhoCard
          onNext={handleBookingWhoNext}
          onClose={() => setShowBookingWho(false)}
        />
      )}

      {showEditCheck && (
        <EditHealthDataCard
          onYes={handleUseExistingYes}
          onNo={handleUseExistingNo}
          onClose={() => {
            setShowEditCheck(false);
            setBookingFor(null);
            setMyselfInfo(null);
          }}
        />
      )}

      {showTestChoice && (
        <TestChoiceCard
          onNext={handleTestChoiceNext}
          onClose={() => setShowTestChoice(false)}
        />
      )}

      {activeOverlay === "test" && (
        <ChooseTestCard
          initialSelected={selectedTests}
          gender={personalInfo?.gender}
          onGetTested={(list) => {
            console.log("LABLY: tests selected:", list);
            setSelectedTests(list);
            handleProceedToRequestStatus();
          }}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {activeOverlay === "symptoms" && (
        <SymptomsCard
          gender={personalInfo?.gender}
          onGetTested={(list) => {
            console.log("LABLY: symptoms selected:", list);
            handleProceedToRequestStatus();
          }}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {activeOverlay === "testpackage" && (
        <TestPackageCard
          onNext={(pkg) => {
            console.log("LABLY: package selected:", pkg);
            handleProceedToRequestStatus();
          }}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {activeOverlay === "personalinfo" && (
        <PersonalInfoCard
          initialValues={personalInfo}
          bookingFor={bookingFor}
          onNext={handlePersonalInfoNext}
          onClose={() => setActiveOverlay(null)}
        />
      )}

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