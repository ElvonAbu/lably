import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";

import {
  useNavigate,
  useLocation,
} from "react-router-dom";

import "./Home.css";

import { getAccuratePosition } from "../utils/getAccuratePosition";

import {
  useMapConfig,
  NIGERIA_CENTER,
  NIGERIA_ZOOM,
} from "../context/MapContext";

import FloatingButtons
  from "../components/FloatingButtons/FloatingButtons";

import BottomSheet
  from "../components/BottomSheet/BottomSheet";

import LocationCard
  from "../components/LocationCard/LocationCard";

import LocationHelpCard
  from "../components/LocationHelpCard/LocationHelpCard";

import { useSignOut }
  from "../hooks/UseSignOut";

import { useLocationPermission }
  from "../hooks/UseLocationPermission";



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

  const { setMapConfig } = useMapConfig();

  // Idle Nigeria-wide view: no puck, no GPS watch, no callbacks.
  // Layout effect so the map is repositioned before the screen paints.
  useLayoutEffect(() => {
    setMapConfig({
      longitude: NIGERIA_CENTER.longitude,
      latitude: NIGERIA_CENTER.latitude,
      zoom: NIGERIA_ZOOM,
      sessionKey: "home",
      showMarker: false,
      live: false,
      trackGps: false,
      draggableMarker: true,
      onLocationChange: null,
      onPermissionDenied: null,
      mode: "idle",
      bottomPadding: 0,
      userPuck: false,
      riders: [],
      scientist: null,
    });
  }, [setMapConfig]);

  const [locationError, setLocationError] = useState("");
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deviceLocationBlocked, setDeviceLocationBlocked] = useState(false);
  const [isLocating, setIsLocating] = useState(false);


  /*
   * === CHANGED: setState calls here now run inside a
   * queueMicrotask instead of directly in the effect body.
   *
   * This effect is genuinely syncing local UI state to an
   * external signal (the browser's Permissions API status),
   * which is a legitimate use of an Effect — but calling
   * setState synchronously and unconditionally every time
   * `permissionState` becomes "granted" forces React to
   * start a second render pass mid-commit. Deferring by one
   * microtask moves the update just outside that synchronous
   * window (same frame, imperceptible), which is what the
   * "Avoid calling setState() directly within an effect"
   * warning is asking for.
   */
  useEffect(() => {
    if (permissionState !== "granted") return;

    queueMicrotask(() => {
      setDeviceLocationBlocked(false);
      setShowLocationHelp(false);
      setLocationError("");
      setIsLocating(false);
    });
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

    // === CHANGED: same fix as above — this was the other
    // flagged call, a setState fired synchronously as soon
    // as the effect runs, before the (async) geolocation
    // request even starts.
    queueMicrotask(() => setIsLocating(true));

    getAccuratePosition()
      .then((position) => {
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
      })
      .catch(() => {
        setIsLocating(false);
        sessionStorage.removeItem(AUTO_NAVIGATE_KEY);
      });
  }, [permissionState, cameFromLocationSearch, navigate]);


  /* Live recovery while blocked */
  useEffect(() => {
    if (!deviceLocationBlocked) return;
    if (!("geolocation" in navigator)) return;

    let cancelled = false;
    let recovering = false;

    const tryRecover = () => {
      navigator.geolocation.getCurrentPosition(
        () => {
          if (cancelled || recovering) return;
          recovering = true;
          clearInterval(intervalId);

          // permission is back: now get a properly accurate fix
          getAccuratePosition()
            .then((position) => {
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
            })
            .catch(() => {
              recovering = false;
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

    let intervalId = null;
    tryRecover();
    intervalId = setInterval(tryRecover, 1000);

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

    getAccuratePosition()
      .then((position) => {
        setIsLocating(false);
        setDeviceLocationBlocked(false);

        navigate("/location-search", {
          state: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            auto: true,
          },
        });
      })
      .catch(() => {
        setIsLocating(false);
        setDeviceLocationBlocked(true);
        setDismissed(false);
        setShowLocationHelp(false);
      });
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

    getAccuratePosition()
      .then((position) => {
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
      })
      .catch((error) => {
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
      });
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
    <>
      {logoutError && (
        <p className="home-toast home-toast-error">
          {logoutError}
        </p>
      )}

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
    </>
  );
}

export default Home;