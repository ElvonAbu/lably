import {
  useState,
  useEffect,
  useCallback,
} from "react";

import {
  useNavigate,
  useLocation,
} from "react-router-dom";

import "./Home.css";

import Map from "../components/Map/Map";

import FloatingButtons
  from "../components/FloatingButtons/FloatingButtons";

import BottomSheet
  from "../components/BottomSheet/BottomSheet";

import LocationCard
  from "../components/LocationCard/LocationCard";

import LocationHelpCard
  from "../components/LocationHelpCard/LocationHelpCard";

import { useSignOut }
  from "../hooks/useSignOut";

import { useLocationPermission }
  from "../hooks/UseLocationPermission";


const NIGERIA_CENTER = {
  longitude: 8.6753,
  latitude: 9.0820,
};

const NIGERIA_ZOOM = 5.4;

const GPS_TIMEOUT_MS = 3000;

const AUTO_NAVIGATE_KEY = "lably_auto_navigate_done";


const isMobileDevice = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    ||
    (
      navigator.maxTouchPoints > 1 &&
      /Mac/i.test(navigator.platform)
    )
  );
};


function Home() {

  const navigate = useNavigate();
  const location = useLocation();

  const cameFromLocationSearch =
    location.state?.cameFromLocationSearch === true;

  const {
    handleSignOut,
    isSigningOut,
    logoutError,
  } = useSignOut();

  const { permissionState } = useLocationPermission();

  const [locationError, setLocationError] = useState("");
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deviceLocationBlocked, setDeviceLocationBlocked] = useState(false);
  const [isLocating, setIsLocating] = useState(false);


  useEffect(() => {
    if (permissionState === "granted") {
      setDeviceLocationBlocked(false);
      setShowLocationHelp(false);
      setLocationError("");
      setIsLocating(false);
    }
  }, [permissionState]);


  useEffect(() => {
    if (
      permissionState === "prompt" ||
      permissionState === "denied"
    ) {
      sessionStorage.removeItem(AUTO_NAVIGATE_KEY);
    }
  }, [permissionState]);


  /* AUTO → Location Search when granted (no backend save) */
  useEffect(() => {
    if (cameFromLocationSearch) return;
    if (permissionState !== "granted") return;
    if (sessionStorage.getItem(AUTO_NAVIGATE_KEY)) return;
    if (!("geolocation" in navigator)) return;

    sessionStorage.setItem(AUTO_NAVIGATE_KEY, "1");
    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        setDeviceLocationBlocked(false);
        setShowLocationHelp(false);
        setLocationError("");

        navigate("/location-search", {
          state: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            auto: true,
          },
        });
      },
      () => {
        setIsLocating(false);
        sessionStorage.removeItem(AUTO_NAVIGATE_KEY);
      },
      {
        enableHighAccuracy: false,
        timeout: GPS_TIMEOUT_MS,
        maximumAge: 0,
      }
    );
  }, [permissionState, cameFromLocationSearch, navigate]);


  /* Live recovery while blocked */
  useEffect(() => {
    if (!deviceLocationBlocked) return;
    if (!("geolocation" in navigator)) return;

    let cancelled = false;

    const tryRecover = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;

          setDeviceLocationBlocked(false);
          setShowLocationHelp(false);
          setLocationError("");
          setIsLocating(false);
          setDismissed(false);
          sessionStorage.setItem(AUTO_NAVIGATE_KEY, "1");

          navigate("/location-search", {
            state: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              auto: true,
            },
          });
        },
        () => {},
        {
          enableHighAccuracy: false,
          timeout: 2500,
          maximumAge: 0,
        }
      );
    };

    tryRecover();
    const intervalId = setInterval(tryRecover, 1000);

    const onForeground = () => {
      if (document.visibilityState === "visible") {
        tryRecover();
      }
    };

    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    window.addEventListener("pageshow", onForeground);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
      window.removeEventListener("pageshow", onForeground);
    };
  }, [deviceLocationBlocked, navigate]);


  const showLocationCard =
    !dismissed &&
    (
      deviceLocationBlocked ||
      permissionState === "denied" ||
      permissionState === "prompt"
    );


  const handleBottomSheetClick = useCallback(() => {
    if (isLocating) return;

    setLocationError("");
    setShowLocationHelp(false);

    if (!("geolocation" in navigator)) {
      setDeviceLocationBlocked(true);
      setDismissed(false);
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        setDeviceLocationBlocked(false);

        navigate("/location-search", {
          state: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            auto: true,
          },
        });
      },
      () => {
        setIsLocating(false);
        setDeviceLocationBlocked(true);
        setDismissed(false);
        setShowLocationHelp(false);
      },
      {
        enableHighAccuracy: false,
        timeout: GPS_TIMEOUT_MS,
        maximumAge: 0,
      }
    );
  }, [navigate, isLocating]);


  const handleUseMyLocation = useCallback(() => {
    if (isLocating) return;

    setLocationError("");

    if (deviceLocationBlocked) {
      setShowLocationHelp(true);
      return;
    }

    if (!("geolocation" in navigator)) {
      setShowLocationHelp(true);
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        setDeviceLocationBlocked(false);
        setShowLocationHelp(false);
        setLocationError("");

        navigate("/location-search", {
          state: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            auto: true,
          },
        });
      },
      (error) => {
        console.log("LABLY Use My Location:", error);
        setIsLocating(false);

        if (
          error.code === error.PERMISSION_DENIED ||
          error.code === error.TIMEOUT
        ) {
          setDeviceLocationBlocked(true);
          setDismissed(false);
          setShowLocationHelp(true);
          return;
        }

        setLocationError(
          "Couldn't detect your location right now. Try again, or skip for now."
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  }, [navigate, isLocating, deviceLocationBlocked]);


  const handleSkip = () => {
    setShowLocationHelp(false);
    setLocationError("");
    setIsLocating(false);
    navigate("/location-search");
  };


  const menuItems = [
    {
      label: "Sign out",
      loadingLabel: "Signing out...",
      onClick: handleSignOut,
      disabled: isSigningOut,
    },
  ];


  return (
    <div className="home">
      {logoutError && (
        <p className="home-toast home-toast-error">
          {logoutError}
        </p>
      )}

      <Map
        showMarker={false}
        longitude={NIGERIA_CENTER.longitude}
        latitude={NIGERIA_CENTER.latitude}
        zoom={NIGERIA_ZOOM}
        trackGps={false}
      />

      <FloatingButtons
        variant="home"
        menuItems={menuItems}
      />

      {showLocationCard ? (
        <LocationCard
          onClose={() => setDismissed(true)}
          onUseLocation={handleUseMyLocation}
          onSkip={handleSkip}
          errorMessage={locationError}
        />
      ) : (
        <BottomSheet
          onClick={handleBottomSheetClick}
          loading={isLocating}
        />
      )}

      {showLocationHelp && (
        <LocationHelpCard
          isMobile={isMobileDevice()}
          onClose={() => setShowLocationHelp(false)}
        />
      )}
    </div>
  );
}

export default Home;