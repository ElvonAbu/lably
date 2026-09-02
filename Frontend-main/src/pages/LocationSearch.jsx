import "./LocationSearch.css";

import {
    useState,
    useEffect,
    useRef,
    useCallback,
} from "react";

import {
    useNavigate,
    useLocation,
} from "react-router-dom";

import {
    MapPin,
    Search,
    FlaskConical,
    X,
    Trash2,
} from "lucide-react";

import Map from "../components/Map/Map";

import FloatingButtons
    from "../components/FloatingButtons/FloatingButtons";

import { useDebounce }
    from "../hooks/UseDebounce";

import { useSignOut }
    from "../hooks/UseSignOut";


import { saveUserLocation } from "../api/locationApi";

import { useLocationPermission }
    from "../hooks/UseLocationPermission";


/* ==================================================
   FALLBACK LOCATION
================================================== */

const FALLBACK_CENTER = {

    lat:
        6.5244,

    lng:
        3.3792,

};


const SAVED_ADDRESSES_KEY =
    "lably_saved_addresses";


const MAX_SAVED_ADDRESSES = 10;


/* ==================================================
   SESSION TOKEN
================================================== */

function generateSessionToken() {

    if (
        typeof crypto !== "undefined" &&
        crypto.randomUUID
    ) {

        return crypto.randomUUID();

    }


    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;

}


/* ==================================================
   LOAD SAVED ADDRESSES
================================================== */

function loadSavedAddresses() {

    try {

        const raw =
            localStorage.getItem(
                SAVED_ADDRESSES_KEY
            );


        return raw
            ? JSON.parse(raw)
            : [];

    } catch {

        return [];

    }

}


/* ==================================================
   LOCATION SEARCH
================================================== */

function LocationSearch() {

    const navigate =
        useNavigate();


    const location =
        useLocation();


    const routeState =
        location.state;


    /* ==================================================
       SIGN OUT
    ================================================== */

    const {
        handleSignOut,
        isSigningOut,
        logoutError,
    } = useSignOut();


    /* ==================================================
       LOCATION PERMISSION
    ================================================== */

    const {
        permissionState,
    } = useLocationPermission();


    const [
        deniedFallback,
        setDeniedFallback
    ] =
        useState(false);


    const [
        isLiveTracking,
        setIsLiveTracking
    ] =
        useState(
            () =>
                Boolean(
                    routeState?.auto
                )
        );


    const wasBlockedRef =
        useRef(false);


    /*
     * Location is considered blocked when the browser
     * permission is denied OR when Map.jsx has received
     * a real PERMISSION_DENIED GPS error.
     */

    const isLocationBlocked =
        permissionState === "denied" ||
        (
            deniedFallback &&
            permissionState !== "granted"
        );


    /* ==================================================
       DETECT LOCATION OFF → ON
    ================================================== */

    useEffect(() => {

        if (
            isLocationBlocked
        ) {

            wasBlockedRef.current =
                true;

            return;

        }


        if (
            wasBlockedRef.current &&
            permissionState === "granted"
        ) {

            wasBlockedRef.current =
                false;


            /*
             * Location has become available again.
             *
             * Map.jsx receives trackGps=true below,
             * which causes its GPS watcher to restart.
             */

            setDeniedFallback(
                false
            );


            setIsLiveTracking(
                true
            );

        }

    }, [
        isLocationBlocked,
        permissionState,
    ]);


    /* ==================================================
       PERMISSION DENIED FALLBACK
    ================================================== */

    const handlePermissionDenied =
        useCallback(() => {

            /*
             * Do NOT disable live tracking here.
             *
             * The permission hook will detect the actual
             * unavailable state and LocationSearch will
             * temporarily pass trackGps=false to Map.jsx.
             *
             * The puck itself remains draggable.
             */

            setDeniedFallback(
                true
            );

        }, []);


    /* ==================================================
       SEARCH STATE
    ================================================== */

    const searchSessionTokenRef =
        useRef(
            generateSessionToken()
        );


    const [
        query,
        setQuery
    ] =
        useState("");


    const [
        suggestions,
        setSuggestions
    ] =
        useState([]);


    const [
        loadingSuggestions,
        setLoadingSuggestions
    ] =
        useState(false);


    /* ==================================================
       ACTIVE PANEL
    ================================================== */

    const [
        activePanel,
        setActivePanel
    ] =
        useState(null);


    /* ==================================================
       SAVED ADDRESSES
    ================================================== */

    const [
        savedAddresses,
        setSavedAddresses
    ] =
        useState(
            () =>
                loadSavedAddresses()
        );


    /* ==================================================
       SELECTED PLACE
    ================================================== */

    const [
        selectedPlace,
        setSelectedPlace
    ] =
        useState(null);


    const debouncedQuery =
        useDebounce(
            query,
            400
        );


    const suggestionBoxRef =
        useRef(null);


    /* ==================================================
       REVERSE GEOCODING
    ================================================== */

    const reverseGeocode =
        useCallback(
            async (
                lat,
                lng
            ) => {

                try {

                    const response =
                        await fetch(

                            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`

                        );


                    if (
                        !response.ok
                    ) {

                        throw new Error(
                            "Reverse geocoding failed"
                        );

                    }


                    const data =
                        await response.json();


                    if (
                        data.status !==
                        "OK"
                    ) {

                        throw new Error(
                            `Google geocoding status: ${data.status}`
                        );

                    }


                    const place =
                        data.results?.[0];


                    return (

                        place?.formatted_address ||

                        "Current Location"

                    );

                } catch (
                    error
                ) {

                    console.error(
                        "LABLY reverse geocoding error:",
                        error
                    );


                    return "Current Location";

                }

            },
            []
        );


    /* ==================================================
       MAP LOCATION CHANGE
    ================================================== */

    const handleMapLocationChange =
        useCallback(
            async (
                coords,
                meta = {}
            ) => {

                const {
                    lat,
                    lng,
                } =
                    coords;


                const address =
                    await reverseGeocode(
                        lat,
                        lng
                    );


                setQuery(
                    address
                );


                setSelectedPlace({

                    lat,

                    lng,

                    address,

                });


                /*
                 * Manual movement means the user has
                 * chosen a location themselves.
                 *
                 * This remains allowed even when GPS
                 * is unavailable.
                 */

                if (
                    meta.source ===
                    "manual"
                ) {

                    setIsLiveTracking(
                        false
                    );

                }


                /*
                 * Successful GPS means the fallback
                 * denial flag is no longer useful.
                 */

                if (
                    meta.source ===
                    "gps"
                ) {

                    setDeniedFallback(
                        false
                    );

                }


                /*
                 * Recenter is also a successful GPS
                 * action.
                 */

                if (
                    meta.source ===
                    "recenter"
                ) {

                    setDeniedFallback(
                        false
                    );

                }


                setSuggestions([]);


                setActivePanel(null);

            },
            [
                reverseGeocode,
            ]
        );


    /* ==================================================
       LOAD ADDRESS FROM ROUTE STATE
    ================================================== */

    useEffect(() => {

        if (
            routeState?.lat == null ||
            routeState?.lng == null
        ) {

            return;

        }


        let ignore = false;


        async function loadAddress() {

            const address =
                await reverseGeocode(

                    routeState.lat,

                    routeState.lng

                );


            if (
                ignore
            ) {

                return;

            }


            setQuery(
                address
            );


            setSelectedPlace({

                lat:
                    routeState.lat,

                lng:
                    routeState.lng,

                address,

            });

        }


        loadAddress();


        return () => {

            ignore = true;

        };

    }, [
        routeState,
        reverseGeocode,
    ]);


    /* ==================================================
       ADDRESS SUGGESTIONS
    ================================================== */

    useEffect(() => {

        let ignore = false;


        if (
            !debouncedQuery
        ) {

            Promise.resolve().then(() => {

                if (!ignore) {

                    setSuggestions([]);

                    setLoadingSuggestions(
                        false
                    );

                }

            });


            return () => {

                ignore = true;

            };

        }


        if (
            selectedPlace &&
            debouncedQuery ===
                selectedPlace.address
        ) {

            return;

        }


        async function fetchSuggestions() {

            setLoadingSuggestions(
                true
            );


            try {

                const response =
                    await fetch(

                        "https://places.googleapis.com/v1/places:autocomplete",

                        {

                            method:
                                "POST",

                            headers: {

                                "Content-Type":
                                    "application/json",

                                "X-Goog-Api-Key":
                                    import.meta.env
                                        .VITE_GOOGLE_MAPS_API_KEY,

                            },

                            body:
                                JSON.stringify({

                                    input:
                                        debouncedQuery,

                                    includedRegionCodes:
                                        ["ng"],

                                    languageCode:
                                        "en",

                                    sessionToken:
                                        searchSessionTokenRef
                                            .current,

                                }),

                        }

                    );


                if (
                    !response.ok
                ) {

                    throw new Error(
                        "Address search failed"
                    );

                }


                const data =
                    await response.json();


                if (
                    !ignore
                ) {

                    setSuggestions(

                        (data.suggestions || [])

                            .map(
                                (s) =>
                                    s.placePrediction
                            )

                            .filter(Boolean)

                            .map(
                                (prediction) => ({

                                    id:
                                        prediction.placeId,

                                    name:
                                        prediction
                                            .structuredFormat
                                            ?.mainText
                                            ?.text ||

                                        prediction
                                            .text
                                            ?.text ||

                                        "",

                                    context:
                                        prediction
                                            .structuredFormat
                                            ?.secondaryText
                                            ?.text ||

                                        "",

                                })
                            )

                    );

                }

            } catch (
                error
            ) {

                console.error(
                    "LABLY address search error:",
                    error
                );


                if (
                    !ignore
                ) {

                    setSuggestions([]);

                }

            } finally {

                if (
                    !ignore
                ) {

                    setLoadingSuggestions(
                        false
                    );

                }

            }

        }


        fetchSuggestions();


        return () => {

            ignore = true;

        };

    }, [
        debouncedQuery,
        selectedPlace,
    ]);


    /* ==================================================
       INPUT CHANGE
    ================================================== */

    const handleInputChange =
        (event) => {

            const value =
                event.target.value;


            setQuery(
                value
            );


            setSelectedPlace(
                null
            );


            if (
                isLiveTracking
            ) {

                setIsLiveTracking(
                    false
                );

            }


            if (
                !value
            ) {

                setSuggestions([]);

                setActivePanel(
                    null
                );

            }

            else {

                setActivePanel(
                    "suggestions"
                );

            }

        };


    /* ==================================================
       CLEAR INPUT
    ================================================== */

    const handleClearInput =
        () => {

            setQuery("");

            setSuggestions([]);

            setSelectedPlace(
                null
            );

            setActivePanel(
                null
            );

        };


    /* ==================================================
       SELECT SEARCH SUGGESTION
    ================================================== */

    const handleSelectSuggestion =
        async (
            suggestion
        ) => {

            setQuery(
                suggestion.name
            );


            setSuggestions([]);

            setActivePanel(
                null
            );


            try {

                const response =
                    await fetch(

                        `https://places.googleapis.com/v1/places/${suggestion.id}`,

                        {

                            headers: {

                                "X-Goog-Api-Key":
                                    import.meta.env
                                        .VITE_GOOGLE_MAPS_API_KEY,

                                "X-Goog-FieldMask":
                                    "location,formattedAddress",

                            },

                        }

                    );


                if (
                    !response.ok
                ) {

                    throw new Error(
                        "Failed to retrieve place details"
                    );

                }


                const place =
                    await response.json();


                if (
                    !place.location
                ) {

                    throw new Error(
                        "No location returned from Place Details"
                    );

                }


                const lat =
                    place.location.latitude;


                const lng =
                    place.location.longitude;


                const address =
                    place.formattedAddress ||
                    suggestion.name;


                setSelectedPlace({

                    lat,

                    lng,

                    address,

                });


                setQuery(
                    address
                );


                setIsLiveTracking(
                    false
                );

            } catch (
                error
            ) {

                console.error(
                    "LABLY place details error:",
                    error
                );

            } finally {

                searchSessionTokenRef.current =
                    generateSessionToken();

            }

        };


    /* ==================================================
       SAVED ADDRESSES
    ================================================== */

    const persistSavedAddress =
        (place) => {

            setSavedAddresses(
                (prev) => {

                    const withoutDupe =
                        prev.filter(
                            (item) =>
                                item.address !==
                                place.address
                        );


                    const next = [

                        {

                            ...place,

                            id:
                                `${Date.now()}`,

                        },

                        ...withoutDupe,

                    ].slice(

                        0,

                        MAX_SAVED_ADDRESSES

                    );


                    try {

                        localStorage.setItem(

                            SAVED_ADDRESSES_KEY,

                            JSON.stringify(
                                next
                            )

                        );

                    } catch {

                        // Storage unavailable.

                    }


                    return next;

                }
            );

        };


    const handleSelectSaved =
        (item) => {

            setSelectedPlace({

                lat:
                    item.lat,

                lng:
                    item.lng,

                address:
                    item.address,

            });


            setQuery(
                item.address
            );


            setIsLiveTracking(
                false
            );


            setActivePanel(
                null
            );

        };


    const handleDeleteAllSaved =
        () => {

            setSavedAddresses(
                []
            );


            try {

                localStorage.removeItem(
                    SAVED_ADDRESSES_KEY
                );

            } catch {

                // Ignore.

            }

        };


    /* ==================================================
       CLICK OUTSIDE
    ================================================== */

    useEffect(() => {

        function handleClickOutside(
            event
        ) {

            if (
                suggestionBoxRef.current &&
                !suggestionBoxRef.current.contains(
                    event.target
                )
            ) {

                setActivePanel(
                    null
                );

            }

        }


        document.addEventListener(
            "mousedown",
            handleClickOutside
        );


        return () => {

            document.removeEventListener(
                "mousedown",
                handleClickOutside
            );

        };

    }, []);


    /* ==================================================
       MAP CENTER
    ================================================== */

    const mapCenter =
        selectedPlace

            ?

            {

                lat:
                    selectedPlace.lat,

                lng:
                    selectedPlace.lng,

            }

            :

            routeState?.lat != null &&
            routeState?.lng != null

                ?

                {

                    lat:
                        routeState.lat,

                    lng:
                        routeState.lng,

                }

                :

                FALLBACK_CENTER;


    const isLocationConfirmed =
        Boolean(
            selectedPlace
        );


    /* ==================================================
       GPS TRACKING STATE FOR MAP
    ==================================================

       This is the important change.

       Map only runs its GPS watcher when:

       1. The page wants live tracking.
       2. The device currently reports location
          as available.

       When Location Services are switched OFF,
       permissionState becomes "denied", so the
       watcher stops.

       When Location Services are switched ON,
       permissionState becomes "granted", so the
       watcher starts again automatically.

       The marker remains draggable either way.
    ================================================== */

    const mapTrackGps =
        isLiveTracking &&
        permissionState === "granted";


    /* ==================================================
       GET TESTED
    ================================================== */

        /* ==================================================
       GET TESTED

       User has finished adjusting the map / address.
       Save the final lat/lng to the backend, then continue.
    ================================================== */

       /* ==================================================
       GET TESTED

       User is happy with the pin / address.
       Save final lat/lng to backend, then go to book-test.
    ================================================== */

    const handleGetTested =
        async () => {

            if (
                !isLocationConfirmed
            ) {

                return;

            }


            persistSavedAddress(
                selectedPlace
            );


            try {

                await saveUserLocation(
                    selectedPlace.lat,
                    selectedPlace.lng
                );

            } catch (
                error
            ) {

                console.warn(
                    "LABLY save location failed:",
                    error
                );

            }


            navigate(
                "/book-test",
                {

                    state: {

                        lat:
                            selectedPlace.lat,

                        lng:
                            selectedPlace.lng,

                        address:
                            selectedPlace.address,

                    },

                }
            );

        };

    /* ==================================================
       MENU
    ================================================== */

    const menuItems = [

        {

            label:
                "Sign out",

            loadingLabel:
                "Signing out...",

            onClick:
                handleSignOut,

            disabled:
                isSigningOut,

        },

    ];


    /* ==================================================
       RENDER
    ================================================== */

    return (

        <div className="location-search-page">


            {logoutError && (

                <p className="home-toast home-toast-error">

                    {logoutError}

                </p>

            )}


            <Map

                longitude={
                    mapCenter.lng
                }

                latitude={
                    mapCenter.lat
                }

                zoom={
                    isLiveTracking
                        ? 16.4
                        : 10
                }

                locationZoom={
                    16.4
                }

                markerSize={
                    50
                }

                showMarker={
                    isLocationConfirmed
                }

                live={
                    isLiveTracking
                }

                /*
                 * IMPORTANT:
                 *
                 * GPS tracking now follows the actual
                 * permission/location state.
                 *
                 * This automatically stops the watcher
                 * when Location Services are off and
                 * starts a fresh watcher when they come
                 * back on.
                 */

                trackGps={
                    mapTrackGps
                }

                /*
                 * Keep the puck draggable regardless
                 * of GPS availability.
                 */

                draggableMarker={
                    true
                }

                onLocationChange={
                    handleMapLocationChange
                }

                onPermissionDenied={
                    handlePermissionDenied
                }

            />


            <FloatingButtons

                variant="search"

                onBack={() =>
                    navigate(

                        "/home",

                        {

                            state: {

                                cameFromLocationSearch:
                                    true,

                            },

                        }

                    )
                }

                menuItems={
                    menuItems
                }

            />


            <div
                className="location-search-overlay"
                ref={suggestionBoxRef}
            >


                <div
                    className="location-search-box"
                >


                    <div
                        className=
                            "location-search-input-wrapper"
                    >


                        <MapPin

                            size={
                                20
                            }

                            className=
                                "location-search-pin"

                        />


                        <input

                            type="text"

                            placeholder=
                                "Enter your address"

                            value={
                                query
                            }

                            onChange={
                                handleInputChange
                            }

                            onFocus={() => {

                                if (
                                    query
                                ) {

                                    setActivePanel(
                                        "suggestions"
                                    );

                                }

                            }}

                            className=
                                "location-search-input"

                        />


                        {isLiveTracking &&
                            !isLocationBlocked && (

                                <span
                                    className=
                                        "location-live-badge"
                                >

                                    Live

                                </span>

                            )}


                        {query.length > 0 && (

                            <button

                                type="button"

                                className=
                                    "location-clear-btn"

                                aria-label=
                                    "Clear address"

                                onClick={
                                    handleClearInput
                                }

                            >

                                <X
                                    size={
                                        16
                                    }
                                />

                            </button>

                        )}

                    </div>


                    {activePanel ===
                        "suggestions" && (

                        <div
                            className=
                                "location-panel"
                        >


                            <div
                                className=
                                    "location-panel-header"
                            >

                                <span>
                                    Search results
                                </span>

                            </div>


                            <div
                                className=
                                    "location-panel-body"
                            >


                                {loadingSuggestions && (

                                    <p
                                        className=
                                            "location-suggestions-empty"
                                    >

                                        Searching...

                                    </p>

                                )}


                                {!loadingSuggestions &&
                                    suggestions.length === 0 && (

                                        <p
                                            className=
                                                "location-suggestions-empty"
                                        >

                                            No matches found

                                        </p>

                                    )}


                                {suggestions.map(
                                    (
                                        suggestion
                                    ) => (

                                        <button

                                            type="button"

                                            key={
                                                suggestion.id
                                            }

                                            className=
                                                "location-suggestion-item"

                                            onClick={() =>
                                                handleSelectSuggestion(
                                                    suggestion
                                                )
                                            }

                                        >

                                            <MapPin
                                                size={
                                                    16
                                                }
                                            />


                                            <span
                                                className=
                                                    "location-suggestion-text"
                                            >

                                                <span
                                                    className=
                                                        "location-suggestion-name"
                                                >

                                                    {
                                                        suggestion.name
                                                    }

                                                </span>


                                                {suggestion.context && (

                                                    <span
                                                        className=
                                                            "location-suggestion-context"
                                                    >

                                                        {
                                                            suggestion.context
                                                        }

                                                    </span>

                                                )}

                                            </span>

                                        </button>

                                    )
                                )}

                            </div>

                        </div>

                    )}


                    {activePanel ===
                        "saved" && (

                        <div
                            className=
                                "location-panel"
                        >


                            <div
                                className=
                                    "location-panel-header"
                            >

                                <span>
                                    Saved addresses
                                </span>


                                <div
                                    className=
                                        "location-panel-header-actions"
                                >


                                    {savedAddresses.length > 0 && (

                                        <button

                                            type="button"

                                            className=
                                                "location-panel-delete-all"

                                            onClick={
                                                handleDeleteAllSaved
                                            }

                                        >

                                            <Trash2
                                                size={
                                                    14
                                                }
                                            />

                                            Delete all

                                        </button>

                                    )}


                                    <button

                                        type="button"

                                        className=
                                            "location-panel-close"

                                        aria-label=
                                            "Close saved addresses"

                                        onClick={() =>
                                            setActivePanel(
                                                null
                                            )
                                        }

                                    />

                                </div>

                            </div>


                            <div
                                className=
                                    "location-panel-body"
                            >


                                {savedAddresses.length === 0 && (

                                    <p
                                        className=
                                            "location-suggestions-empty"
                                    >

                                        No saved addresses yet.

                                    </p>

                                )}


                                {savedAddresses.map(
                                    (
                                        item
                                    ) => (

                                        <button

                                            type="button"

                                            key={
                                                item.id
                                            }

                                            className=
                                                "location-suggestion-item"

                                            onClick={() =>
                                                handleSelectSaved(
                                                    item
                                                )
                                            }

                                        >

                                            <MapPin
                                                size={
                                                    16
                                                }
                                            />


                                            <span
                                                className=
                                                    "location-suggestion-text"
                                            >

                                                <span
                                                    className=
                                                        "location-suggestion-name"
                                                >

                                                    {
                                                        item.address
                                                    }

                                                </span>

                                            </span>

                                        </button>

                                    )
                                )}

                            </div>

                        </div>

                    )}

                </div>


                <div
                    className=
                        "location-pills"
                >


                    <button

                        type="button"

                        className={

                            activePanel ===
                            "suggestions"

                                ?

                                "location-pill location-pill-suggested location-pill-active"

                                :

                                "location-pill location-pill-suggested"

                        }

                        onClick={() =>
                            setActivePanel(

                                (prev) =>

                                    prev ===
                                    "suggestions"

                                        ?

                                        null

                                        :

                                        "suggestions"

                            )
                        }

                    >

                        Suggested

                    </button>


                    <button

                        type="button"

                        className={

                            activePanel ===
                            "saved"

                                ?

                                "location-pill location-pill-saved location-pill-active"

                                :

                                "location-pill location-pill-saved"

                        }

                        onClick={() =>
                            setActivePanel(

                                (prev) =>

                                    prev ===
                                    "saved"

                                        ?

                                        null

                                        :

                                        "saved"

                            )
                        }

                    >

                        Saved

                    </button>

                </div>

            </div>


            {activePanel === null && (

                <div
                    className=
                        "location-search-footer"
                >

                    <button

                        type="button"

                        className=
                            "get-tested-btn"

                        disabled={
                            !isLocationConfirmed
                        }

                        onClick={
                            handleGetTested
                        }

                    >

                        <Search
                            size={
                                20
                            }
                        />

                        <span>
                            Get Tested
                        </span>

                        <FlaskConical
                            size={
                                20
                            }
                        />

                    </button>

                </div>

            )}

        </div>

    );

}


export default LocationSearch;