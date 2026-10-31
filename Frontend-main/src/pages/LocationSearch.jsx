import "./LocationSearch.css";

import BookingWhoCard from "../components/BookingWhoCard/BookingWhoCard";
import EditHealthDataCard from "../components/EditHealthDataCard/EditHealthDataCard";
import ChooseTestCard from "../components/ChooseTestCard/ChooseTestCard";
import TestPackageCard from "../components/TestPackageCard/TestPackageCard";
import SymptomsCard from "../components/SymptomsCard/SymptomsCard";
import PersonalInfoCard from "../components/PersonalInfoCard/PersonalInfoCard";
import RequestStatusCard from "../components/RequestStatusCard/RequestStatusCard";
import PuckLocationBadge from "../components/PuckLocationBadge/PuckLocationBadge";
import ScientistFoundCard from "../components/ScientistFoundCard/ScientistFoundCard";
import NoScientistFoundCard from "../components/NoScientistFoundCard/NoScientistFoundCard";
import ChangeLocationConfirm from "../components/ChangeLocationConfirm/ChangeLocationConfirm";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MapPin, Search, FlaskConical, X, Trash2 } from "lucide-react";

import { useMapConfig } from "../context/MapContext";
import FloatingButtons from "../components/FloatingButtons/FloatingButtons";
import { useDebounce } from "../hooks/UseDebounce";
import { useLiveRequest } from "../hooks/useLiveRequest";
import { REQUEST_SEARCH_SECONDS } from "../utils/requestSearch";
import { useSignOut } from "../hooks/UseSignOut";
import { saveUserLocation } from "../api/locationApi";
import {
  getMyPatientProfile,
  savePatientDetails,
  updateMyPatientProfile,
  backendPatientToFrontend,
} from "../api/patientApi";
// === NEW: booking API (POST /testrequest) ===
import {
  createTestRequest,
  cancelTestRequest,
  updateTestRequestDetails,
  
} from "../api/testRequestApi";
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

// API responses can wrap the patient record in different levels.
// Normalize the common shapes before reading the patient ID/profile.
function unwrapPatientResponse(response) {
  let value = response?.data ?? response;
  for (let i = 0; i < 4 && value; i += 1) {
    if (value.patient && typeof value.patient === "object") {
      value = value.patient;
      continue;
    }
    if (value.data && typeof value.data === "object" && !Array.isArray(value.data)) {
      value = value.data;
      continue;
    }
    break;
  }
  return value && typeof value === "object" ? value : null;
}

function getPatientId(response) {
  const patient = unwrapPatientResponse(response);
  const id = patient?._id ?? patient?.id ?? response?.data?.patientid ?? response?.data?.patientId;
  return id == null || id === "" ? null : String(id);
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

  const logoutCleanupRef = useRef(null);
  const { handleSignOut, isSigningOut, logoutError } = useSignOut({
    beforeSignOut: () => logoutCleanupRef.current?.(),
  });

  /* ==================================================
     LOCATION PERMISSION
  ================================================== */

  const { permissionState } = useLocationPermission();

  const { setMapConfig } = useMapConfig();

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
   */
  const [bookingFor, setBookingFor] = useState(null);

  /*
   * Self profile from backend only (GET /patientdetails/me).
   */
  const [myselfInfo, setMyselfInfo] = useState(null);

  /*
   * Patient record for THIS booking (self or other).
   * activePatientId = Mongo _id sent as patientid on POST /testrequest
   */
  const [selectedTests, setSelectedTests] = useState([]);

  // Note the user leaves for the scientist (shown on the request status card)
  // TODO(backend): send this with the booking once the API has a note field.
  const [requestNote, setRequestNote] = useState("");
  const [, setSelectedSymptoms] = useState([]);
  const [, setSelectedPackageId] = useState(null);
  const [personalInfo, setPersonalInfo] = useState(null);
  const [activePatientId, setActivePatientId] = useState(null);

  // Set after successful POST /testrequest
  const [activeBookingId, setActiveBookingId] = useState(null);
  const [bookingError, setBookingError] = useState(null);

  // --- speed: do network work in the background, not between cards ---
  // The profile is requested as soon as the page opens, so "Myself" can
  // move straight on instead of waiting for the server.
  const profilePromiseRef = useRef(null);
  // Saving the patient / creating the booking run in the background while the
  // next card is already on screen; later steps wait on these if needed.
  const patientPromiseRef = useRef(null);
  const bookingPromiseRef = useRef(null);
  // true while the person is adding a test to the request that is already running.
  // The search keeps running meanwhile (map, countdown, scientists), so closing the
  // sheet simply resumes it instead of starting over.
  const [isAddingTest, setIsAddingTest] = useState(false);
  // the note text the server already has (so we only save changes)
  const lastSavedNoteRef = useRef("");

  useEffect(() => {
    profilePromiseRef.current = getMyPatientProfile().catch(() => null);
  }, []);

  const [showChangeLocationConfirm, setShowChangeLocationConfirm] =
    useState(false);

  /*
   * Request status screen (phase comes from the REAL booking, see useLiveRequest)
   *   "searching" → puck blinks, map slowly zooms out, riders pop up as the view reaches them
   *   "found"     → a scientist accepted: found screen + fitted map
   *   "not-found" → backend ended the search with NoCoverage: no-scientist card
   */
  const [scientistAddress, setScientistAddress] = useState(null);

  // Height of the request bottom sheet, so the map keeps the puck centred
  // in the part of the map that is still visible above it.
  const [sheetHeight, setSheetHeight] = useState(0);

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

  const isPuckDraggable = activeOverlay !== "requeststatus" && !isAddingTest;

  // The request session stays open while its "Add test" sheet is on top of it.
  const isRequestOpen =
    activeOverlay === "requeststatus" ||
    (isAddingTest && activeOverlay === "test");

  // Real backend state: server-driven search, live scientist positions, match result.
  const live = useLiveRequest({
    bookingId: activeBookingId,
    active: isRequestOpen,
  });

  const requestPhase = live.phase;

  // Logging out while a search or a match is running cancels it (and waits for
  // the server, because the login token stops working right after sign-out).
  // A no-coverage request stays: the patient keeps their waitlist spot.
  useEffect(() => {
    logoutCleanupRef.current = async () => {
      if (requestPhase === "not-found") return;
      const pending = bookingPromiseRef.current;
      const id = activeBookingId || (pending ? await pending.catch(() => null) : null);
      if (id) await cancelTestRequest(id).catch(() => {});
    };
  });

  // Notes are saved on the server (debounced) while the request is open.
  useEffect(() => {
    if (!activeBookingId || !isRequestOpen) return undefined;
    if (requestNote === lastSavedNoteRef.current) return undefined;

    const timer = setTimeout(() => {
      lastSavedNoteRef.current = requestNote;
      updateTestRequestDetails(activeBookingId, { notes: requestNote }).catch((error) => {
        lastSavedNoteRef.current = null; // try again on the next change
        console.warn("LABLY saving the note failed:", error);
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [requestNote, activeBookingId, isRequestOpen]);
  const matchedScientist = live.scientist;
    const riders = live.riders;
  const searchRadiusM = live.radiusM;

  const scientistPosition = live.scientistPosition;

  // Once matched, look up the address of the scientist's position (once per booking).
  const geocodedForRef = useRef(null);
  const scientistLat = scientistPosition?.lat;
  const scientistLng = scientistPosition?.lng;

  useEffect(() => {
    if (requestPhase !== "found" || scientistLat == null || !activeBookingId) return;
    if (geocodedForRef.current === activeBookingId) return;
    geocodedForRef.current = activeBookingId;
    reverseGeocode(scientistLat, scientistLng).then(setScientistAddress);
  }, [requestPhase, scientistLat, scientistLng, activeBookingId, reverseGeocode]);

  // Once the search has ended (found or not-found) the puck stops blinking.
  // "not-found" reuses "found" with no scientist, so the camera just holds.
  const mapMode = !isRequestOpen
    ? "idle"
    : requestPhase === "found" || requestPhase === "not-found"
    ? "found"
    : "searching";

  // Push this page's map settings to the shared, persistent map.
  // Layout effect so the map is repositioned before the screen paints.
  useLayoutEffect(() => {
    setMapConfig({
      longitude: mapCenter.lng,
      latitude: mapCenter.lat,
      zoom: isLiveTracking ? 16.4 : 10,
      sessionKey: "search",
      locationZoom: 16.4,
      markerSize: 50,
      showMarker: isLocationConfirmed,
      live: isLiveTracking,
      trackGps: mapTrackGps,
      draggableMarker: isPuckDraggable,
      onLocationChange: handleMapLocationChange,
      onPermissionDenied: handlePermissionDenied,
      mode: mapMode,
      bottomPadding: isRequestOpen ? sheetHeight : 0,
      searchDurationMs: REQUEST_SEARCH_SECONDS * 1000,
      userPuck: isRequestOpen,
            riders,
      searchRadiusM,
      scientist: scientistPosition,
    });
  }, [
    mapCenter.lng,
    mapCenter.lat,
    isLiveTracking,
    isLocationConfirmed,
    mapTrackGps,
    isPuckDraggable,
    isRequestOpen,
    mapMode,
    sheetHeight,
        riders,
    searchRadiusM,
    scientistPosition,
    handleMapLocationChange,
    handlePermissionDenied,
    setMapConfig,
  ]);

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
     (patient API only — NOT testRequest)
  ================================================== */

  const handleBookingWhoNext = async (choice) => {
    setShowBookingWho(false);
    setBookingFor(choice);
    setActivePatientId(null);
    setPersonalInfo(null);
    setMyselfInfo(null);
    setBookingError(null);

    if (choice === "myself") {
      try {
        // Never make the user stare at a blank map waiting for a slow server:
        // if the profile isn't back within 1.5 s, go to the details form.
        const res = await Promise.race([
          profilePromiseRef.current ?? getMyPatientProfile(),
          new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
        if (!res) throw new Error("No profile");
        const patient = unwrapPatientResponse(res);
        const fromApi = backendPatientToFrontend(patient);
        const patientId = getPatientId(res) ?? patient?._id ?? patient?.id;

        if (fromApi && patientId) {
          setMyselfInfo({
            ...fromApi,
            _id: String(patientId),
          });
          setActivePatientId(String(patientId));
          setShowEditCheck(true);
        } else {
          // A profile without a usable database ID cannot be booked against.
          setActiveOverlay("personalinfo");
        }
      } catch (error) {
        console.warn("LABLY getMyPatientProfile failed:", error);
        setActiveOverlay("personalinfo");
      }
      return;
    }

    // Someone else
    setActiveOverlay("personalinfo");
  };

  /* ==================================================
     USE EXISTING DATA — YES / NO
  ================================================== */

  const handleUseExistingYes = () => {
    setShowEditCheck(false);
    setPersonalInfo(myselfInfo);
    setActivePatientId(myselfInfo?._id ?? null);
    setShowTestChoice(true);
  };

  const handleUseExistingNo = () => {
    setShowEditCheck(false);
    setPersonalInfo(myselfInfo);
    setActiveOverlay("personalinfo");
  };

  /* ==================================================
     PERSONAL INFO → NEXT
     (patient API only — NOT testRequest)
  ================================================== */

  const handlePersonalInfoNext = (data) => {
    setBookingError(null);
    setPersonalInfo(data);

    const relationship = bookingFor === "myself" ? "self" : "other";

    // Save in the background and move to the next card straight away.
    const saving = (async () => {
      let response;
      try {
        response = await savePatientDetails(data, relationship);
      } catch (error) {
        // If the self profile already exists, update it instead of stopping
        // the booking flow on the backend's duplicate-profile response.
        if (relationship !== "self" || error?.status !== 409) throw error;
        response = await updateMyPatientProfile(data);
      }

      const patient = unwrapPatientResponse(response);
      const id = getPatientId(response) ?? patient?._id ?? patient?.id;

      if (!id) {
        console.warn("LABLY: patient details were saved but the response had no patient ID:", response);
        throw new Error("Your details were received, but the patient ID was not returned. Please try again or contact support.");
      }

      const patientId = String(id);
      setActivePatientId(patientId);

      if (relationship === "self") {
        const mapped = backendPatientToFrontend(patient) || data;
        setMyselfInfo({ ...mapped, _id: patientId });
      }

      return patientId;
    })();

    patientPromiseRef.current = saving;

    setActiveOverlay(null);
    setShowTestChoice(true);

    saving.catch((error) => {
      if (patientPromiseRef.current !== saving) return;
      console.warn("LABLY saving patient details failed:", error);
      // Go back to the form so the user can retry.
      setShowTestChoice(false);
      setActiveOverlay("personalinfo");
      setBookingError(error?.message || "Could not save patient information. Please try again.");
    });
  };

  /* ==================================================
     TEST CHOICE NEXT
     (UI only — opens test / symptoms / package overlay)
     testRequest is NOT called here
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
     SUBMIT BOOKING → POST /testrequest

     THIS is the only place createTestRequest (testRequestApi) runs.
     Called when user finishes:
       - ChooseTestCard (proceedMode: "test")
       - SymptomsCard   (proceedMode: "symptoms")
       - TestPackageCard (proceedMode: "checkup")
  ================================================== */

  const submitBooking = async ({
    proceedMode,
    selectedTests: tests = [],
    symptoms = [],
    packageId = null,
  }) => {
    setBookingError(null);

    // "Add test" from the status card: change the request that is already
    // running (POST would start a second search).
    if (isAddingTest && activeBookingId && proceedMode === "test") {
      setIsAddingTest(false);
      setActiveOverlay("requeststatus");
      updateTestRequestDetails(activeBookingId, { selectedTests: tests }).catch((error) => {
        console.warn("LABLY updating the tests failed:", error);
        setBookingError(error.message || "Could not update the tests");
      });
      return;
    }

    // A NEW booking must not show the previous booking's result (that made the
    // old "Oops" flash before the new search appeared).
    setActiveBookingId(null);

    // Show the "looking for a scientist" card IMMEDIATELY. Waiting for the
    // patient to finish saving and for the booking to be created happens in
    // the background (it used to block the card for as long as the server
    // took to answer).
    const returnTo = activeOverlay;

    setScientistAddress(null);
    setActiveOverlay("requeststatus");

    const creating = (async () => {
      let patientId = activePatientId;

      if (!patientId && patientPromiseRef.current) {
        try {
          patientId = await patientPromiseRef.current;
        } catch {
          // the form is re-opened with the error by the patient-save handler
          const silent = new Error("patient-save-failed");
          silent.silent = true;
          throw silent;
        }
      }

      if (!patientId) {
        throw new Error(
          "Patient profile missing. Go back and enter patient info."
        );
      }

      // ========== TESTREQUEST API CALL ==========
      // POST /testrequest
      // Body: patientid, proceedMode, selectedTests | symptoms | packageId, location
      // Backend resolves → resolvedTests (lab codes) and saves Status: Pending
      const res = await createTestRequest({
        patientid: patientId,
        proceedMode,
        selectedTests: tests,
        symptoms,
        packageId,
        location: selectedPlace
          ? {
              lat: selectedPlace.lat,
              lng: selectedPlace.lng,
              address: selectedPlace.address,
            }
          : null,
        notes: requestNote,
      });
      // ========== END TESTREQUEST API CALL ==========

      // res.data.resolvedTests = final list the lab should run
      const id = res?.data?._id || null;
      lastSavedNoteRef.current = requestNote;
      setActiveBookingId(id);
      console.log("LABLY booking saved:", res?.data);
      return id;
    })();

    bookingPromiseRef.current = creating;

    creating.catch((error) => {
      if (bookingPromiseRef.current !== creating) return;
      if (error?.silent) return;
      console.warn("LABLY createTestRequest failed:", error);
      // Put the user back where they were, with the error.
      setActiveOverlay(returnTo || requestOrigin || "personalinfo");
      setBookingError(error.message || "Could not create booking");
    });
  };

  // Remove one test from the request (the card never offers to remove the last)
  // TODO(backend): sync with the booking once there is an "update tests" endpoint.
  const handleRemoveTest = (label) => {
    const next = selectedTests.filter((test) => test !== label);
    setSelectedTests(next);
    if (activeBookingId && next.length > 0) {
      updateTestRequestDetails(activeBookingId, { selectedTests: next }).catch((error) => {
        console.warn("LABLY updating the tests failed:", error);
      });
    }
  };

  const handleAddTestFromStatus = () => {
    if (requestOrigin === "test") {
      setIsAddingTest(true);
      setActiveOverlay("test");
    }
  };

  

  // Tell the backend the booking is cancelled (PATCH /testrequest/:id/cancel).
  // Fire-and-forget: the UI resets either way.
  const cancelBookingOnServer = () => {
    if (!activeBookingId) {
      // The booking may still be being created: cancel it once it exists.
      const pending = bookingPromiseRef.current;
      bookingPromiseRef.current = null;
      if (pending) {
        pending
          .then((id) => (id ? cancelTestRequest(id) : null))
          .catch(() => {});
      }
      return;
    }

    cancelTestRequest(activeBookingId).catch((error) => {
      console.warn("LABLY cancelTestRequest failed:", error);
    });
  };

  const handleCancelRequest = () => {
    setIsAddingTest(false);
    cancelBookingOnServer();
    setScientistAddress(null);
    setActiveOverlay(null);
    setRequestOrigin(null);
    setSelectedTests([]);
    setRequestNote("");
    setSelectedSymptoms([]);
    setSelectedPackageId(null);
    setPersonalInfo(null);
    setActivePatientId(null);
    setActiveBookingId(null);
    setBookingError(null);
    setBookingFor(null);
    setMyselfInfo(null);
  };

  const handleConfirmChangeLocation = () => {
    cancelBookingOnServer();
    setScientistAddress(null);
    clearLastLocation();
    setSelectedPlace(null);
    setQuery("");
    setActiveOverlay(null);
    setRequestOrigin(null);
    setSelectedTests([]);
    setRequestNote("");
    setSelectedSymptoms([]);
    setSelectedPackageId(null);
    setPersonalInfo(null);
    setActivePatientId(null);
    setActiveBookingId(null);
    setBookingError(null);
    setBookingFor(null);
    setMyselfInfo(null);
    setShowChangeLocationConfirm(false);
  };

  const handleBack = () => {
    if (activeOverlay === "requeststatus") {
      // Leaving the search screen cancels the search. (A no-coverage request
      // stays: it is already on the waitlist.)
      if (requestPhase !== "not-found") {
        cancelBookingOnServer();
      }
      setActiveBookingId(null);
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
    <>
      {logoutError && (
        <p className="home-toast home-toast-error">{logoutError}</p>
      )}

      {bookingError && (
        <p className="home-toast home-toast-error">{bookingError}</p>
      )}

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

      {/* ==================================================
         CHOOSE TEST → submitBooking → TESTREQUEST API
         When: user taps Get Tested on ChooseTestCard
      ================================================== */}
      {activeOverlay === "test" && (
        <ChooseTestCard
          initialSelected={selectedTests}
          gender={personalInfo?.gender}
          onGetTested={async (list) => {
            setSelectedTests(list);
            // → submitBooking → createTestRequest (POST /testrequest)
            await submitBooking({
              proceedMode: "test",
              selectedTests: list,
            });
          }}
          mode={isAddingTest ? "add" : "default"}
          onClose={() => {
            // Closing the "Add test" sheet (tap outside, drag down) goes straight
            // back to the running search: nothing restarts.
            if (isAddingTest) {
              setIsAddingTest(false);
              setActiveOverlay("requeststatus");
              return;
            }
            setActiveOverlay(null);
          }}
        />
      )}

      {/* ==================================================
         SYMPTOMS → submitBooking → TESTREQUEST API
         When: user taps Get Tested on SymptomsCard
      ================================================== */}
      {activeOverlay === "symptoms" && (
        <SymptomsCard
          gender={personalInfo?.gender}
          onGetTested={async (list) => {
            setSelectedSymptoms(list);
            // → submitBooking → createTestRequest (POST /testrequest)
            await submitBooking({
              proceedMode: "symptoms",
              symptoms: list,
            });
          }}
          onClose={() => setActiveOverlay(null)}
        />
      )}

      {/* ==================================================
         PACKAGE → submitBooking → TESTREQUEST API
         When: user picks silver / gold / platinum on TestPackageCard
         packageId must be lowercase: "silver" | "gold" | "platinum"
      ================================================== */}
      {activeOverlay === "testpackage" && (
        <TestPackageCard
          onNext={async (pkg) => {
            const packageId = String(pkg).toLowerCase();
            setSelectedPackageId(packageId);
            // → submitBooking → createTestRequest (POST /testrequest)
            await submitBooking({
              proceedMode: "checkup",
              packageId,
            });
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
      {isRequestOpen && (
        <div className="request-status-root">
          {requestPhase !== "not-found" && (
            <PuckLocationBadge
              address={selectedPlace?.address}
              onChangeLocation={() => setShowChangeLocationConfirm(true)}
              bottomInset={sheetHeight}
            />
          )}

          {requestPhase === "not-found" ? (
            <NoScientistFoundCard
                            coverage={live.noCoverage}
              onTryAgain={handleBack}
              onLogout={handleSignOut}
              isLoggingOut={isSigningOut}
              logoutError={logoutError}
            />
          ) : requestPhase === "found" ? (
            <ScientistFoundCard
              scientist={matchedScientist}
              userAddress={selectedPlace?.address}
              scientistAddress={scientistAddress}
              onContact={() => console.log("LABLY: contact scientist")}
              onMessage={() => console.log("LABLY: in-app message")}
              onTimeline={() => console.log("LABLY: booking timeline")}
              onSos={() => console.log("LABLY: SOS emergency")}
              onCheckout={() => console.log("LABLY: proceed to checkout")}
              onCancel={handleCancelRequest}
              onHeightChange={setSheetHeight}
            />
          ) : (
            <RequestStatusCard
              address={selectedPlace?.address}
              canAddTest={requestOrigin === "test"}
              onAddTest={handleAddTestFromStatus}
              onCancel={handleCancelRequest}
              notifiedCount={live.notifiedCount}
              secondsLeft={live.secondsLeft}
              status={live.jobStatus}
              onHeightChange={setSheetHeight}
              note={requestNote}
              onNoteChange={setRequestNote}
              tests={requestOrigin === "test" ? selectedTests : []}
              onRemoveTest={handleRemoveTest}
            />
          )}
        </div>
      )}

      {showChangeLocationConfirm && (
        <ChangeLocationConfirm
          onConfirm={handleConfirmChangeLocation}
          onCancel={() => setShowChangeLocationConfirm(false)}
        />
      )}
    </>
  );
}

export default LocationSearch;