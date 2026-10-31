import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import Map, {
    Marker,
} from "react-map-gl";

import RiderMarker from "./RiderMarker";
import PuckPin from "./PuckPin";

import "mapbox-gl/dist/mapbox-gl.css";
import "./Map.css";


/* ==================================================
   DEFAULT MAP SETTINGS
================================================== */

const DEFAULT_ZOOM = 15.8;

const CLOSE_ZOOM = 16.4;

const JITTER_THRESHOLD_METERS = 6;


/* ==================================================
   REQUEST CAMERA (searching for a scientist)

   mode "idle"      → normal map behaviour
   mode "searching" → street-level zoom, then a slow,
                      linear zoom-out for the whole
                      search time (inDrive style)
   mode "found"     → camera fits puck + scientist
================================================== */

const SEARCH_START_ZOOM = 16.2;

const SEARCH_END_ZOOM = 14.3;

// When the matching distance is known, the search zoom-out ends wide enough to
// show all of it (never wider than this).
const SEARCH_MIN_ZOOM = 10.5;

function metersBetween(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

// Keep the farthest reachable scientist at least this far from the screen edge (px).
const SEARCH_EDGE_PX = 36;

/*
 * Zoom at which a circle of `radiusM` metres around `lat` fits inside the
 * visible area (the smaller of its half-width / half-height).
 * Mapbox: metres per pixel = 40075016.686 * cos(lat) / (512 * 2^zoom).
 */
function zoomToFitRadius(radiusM, lat, halfWidthPx, halfHeightPx) {
    const halfPx =
        Math.min(halfWidthPx, halfHeightPx) -
        SEARCH_EDGE_PX;

    if (!(radiusM > 0) || !(halfPx > 0)) {
        return null;
    }

    const metersPerPixel =
        radiusM / halfPx;

    return Math.log2(
        (40075016.686 *
            Math.cos(lat * Math.PI / 180)) /
        (512 * metersPerPixel)
    );
}

const SEARCH_INTRO_MS = 700;


const FOUND_MAX_ZOOM = 16.5;

// Never zoom out further than this when fitting the scientist, so a bad
// position can never send the map out to the world / globe view.
// Fixes less accurate than this (metres) are ignored: they come from the
// IP address and can put you in the wrong city.
const MAX_USABLE_ACCURACY_M = 1500;

const FOUND_MIN_ZOOM = 14.2;

// Zoom the camera hands back at when a request ends.
const RESTORE_MIN_ZOOM = 15;

const ZERO_PADDING = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
};

const EMPTY_RIDERS = [];

const linear = (t) => t;

function toMercator(lng, lat) {

    const x = (lng + 180) / 360;

    const sin = Math.sin(
        lat * Math.PI / 180
    );

    const y =
        0.5 -
        Math.log((1 + sin) / (1 - sin)) /
        (4 * Math.PI);

    return { x, y };
}

/*
 * Highest zoom at which `other` is still on screen when `centre` sits
 * in the middle of the visible area (Mapbox world size = 512 * 2^zoom).
 */
function zoomToContain(
    centre,
    other,
    halfWidthPx,
    halfHeightPx
) {

    const a = toMercator(centre.lng, centre.lat);

    const b = toMercator(other.lng, other.lat);

    const dx = Math.abs(a.x - b.x);

    const dy = Math.abs(a.y - b.y);

    const zx =
        dx > 0
            ? Math.log2(halfWidthPx / (512 * dx))
            : Infinity;

    const zy =
        dy > 0
            ? Math.log2(halfHeightPx / (512 * dy))
            : Infinity;

    const fit = Math.min(zx, zy, FOUND_MAX_ZOOM);

    return Number.isFinite(fit)
        ? Math.max(fit, FOUND_MIN_ZOOM)
        : FOUND_MAX_ZOOM;
}


/* ==================================================
   DISTANCE HELPER
================================================== */

function distanceBetweenPoints(
    first,
    second
) {

    if (!first || !second) {
        return Infinity;
    }

    const earthRadius = 6371000;

    const lat1 =
        first.lat *
        Math.PI /
        180;

    const lat2 =
        second.lat *
        Math.PI /
        180;

    const deltaLat =
        (second.lat - first.lat) *
        Math.PI /
        180;

    const deltaLng =
        (second.lng - first.lng) *
        Math.PI /
        180;

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(deltaLng / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return earthRadius * c;
}


/* ==================================================
   MAP COMPONENT
================================================== */

function MapComponent({

    longitude = 3.3792,

    latitude = 6.5244,

    zoom = DEFAULT_ZOOM,

    locationZoom = CLOSE_ZOOM,


    sessionKey,
    showMarker = true,

    live = false,

    trackGps = true,

    draggableMarker = true,

    markerSize = 72,

    mode = "idle",

    bottomPadding = 0,

    searchDurationMs = 60000,

    searchEndZoom = SEARCH_END_ZOOM,

    /* the backend's matching distance (metres); the zoom-out ends wide enough to cover it */
    searchRadiusM = 0,


    userPuck = false,

    riders = EMPTY_RIDERS,

    scientist = null,

    onLocationChange,

    onRecenterReady,

    onPermissionDenied,

}) {


    const mapRef =
        useRef(null);


    const watchIdRef =
        useRef(null);


    /*
     * While a request is open the puck must stay exactly where the user
     * confirmed it. The GPS watcher keeps running (so it never has to be
     * restarted, which used to snap the pin to a coarse first fix), but its
     * fixes are ignored until the request ends.
     */
    const requestActiveRef =
        useRef(mode !== "idle");

    /* Stop the BROWSER from zooming the whole page while the map screen is
       open (pinch on a phone, pinch / ctrl+scroll on a trackpad). The map
       does its own zooming; during a search it is locked on purpose, and in
       that state the gesture used to fall through and zoom the page. */
    useEffect(() => {
        const blockWheelZoom = (event) => {
            if (event.ctrlKey) event.preventDefault();
        };
        const blockGesture = (event) => event.preventDefault();

        document.addEventListener("wheel", blockWheelZoom, { passive: false });
        document.addEventListener("gesturestart", blockGesture);
        document.addEventListener("gesturechange", blockGesture);

        return () => {
            document.removeEventListener("wheel", blockWheelZoom);
            document.removeEventListener("gesturestart", blockGesture);
            document.removeEventListener("gesturechange", blockGesture);
        };
    }, []);

    useEffect(() => {

        requestActiveRef.current =
            mode !== "idle";

    });

    const bestAccuracyRef =
        useRef(null);

    const lastAcceptedAccuracyRef =
        useRef(null);


    const lastAcceptedCoordsRef =
        useRef(null);


    const [
        isFollowingUser,
        setIsFollowingUser
    ] =
        useState(true);


    const isFollowingUserRef =
        useRef(true);


    const [
        liveCoords,
        setLiveCoords
    ] =
        useState(null);


    const [
        selectedCoords,
        setSelectedCoords
    ] =
        useState({

            lng:
                longitude,

            lat:
                latitude,

        });


    const [
        accuracy,
        setAccuracy
    ] =
        useState(null);


    /*
     * The request camera needs a ready map. Re-runs when the
     * map finishes loading, in case a request was already open.
     */
    const [
        mapLoaded,
        setMapLoaded
    ] =
        useState(false);


    const [
        hasLiveLocation,
        setHasLiveLocation
    ] =
        useState(
            () => live
        );


    /* ==================================================
       PERSISTENT MAP: RESET PER PAGE

       When one Map instance is shared between pages, its
       live-GPS state would otherwise leak from one page to
       the next (e.g. the re-center button showing on Home).
       When `sessionKey` changes, reset to exactly what a
       fresh mount would have given.
    ================================================== */
    const [
        prevSessionKey,
        setPrevSessionKey
    ] =
        useState(
            sessionKey
        );

    if (
        sessionKey !==
        prevSessionKey
    ) {
        setPrevSessionKey(
            sessionKey
        );

        setLiveCoords(
            null
        );

        setAccuracy(
            null
        );

        setSelectedCoords({
            lng:
                longitude,
            lat:
                latitude,
        });

        setHasLiveLocation(
            live
        );

        setIsFollowingUser(
            true
        );
    }


    /* ==================================================
       RESIZE ON LOAD + WINDOW RESIZE
    ================================================== */

    const handleMapLoad =
        () => {

            if (
                mapRef.current
            ) {

                mapRef.current.resize();

            }

            setMapLoaded(
                true
            );

        };


    useEffect(() => {

        function handleWindowResize() {

            if (
                mapRef.current
            ) {

                mapRef.current.resize();

            }

        }


        window.addEventListener(
            "resize",
            handleWindowResize
        );


        window.addEventListener(
            "orientationchange",
            handleWindowResize
        );


        return () => {

            window.removeEventListener(
                "resize",
                handleWindowResize
            );


            window.removeEventListener(
                "orientationchange",
                handleWindowResize
            );

        };

    }, []);


    useEffect(() => {

        isFollowingUserRef.current =
            isFollowingUser;

    }, [
        isFollowingUser,
    ]);


    /* ==================================================
       PARENT COORDINATE CHANGES
    ================================================== */

    const previousLongitudeRef =
        useRef(longitude);


    const previousLatitudeRef =
        useRef(latitude);


    const previousLiveRef =
        useRef(live);



    const previousFlySessionKeyRef =
        useRef(sessionKey);

    /* ==================================================
       PERSISTENT MAP: SNAP CAMERA ON PAGE CHANGE

       A fresh mount used to start the camera exactly
       where the page wanted it (initialViewState). With a
       shared map we must do the same: jump (no animation)
       to the new page's view BEFORE the browser paints,
       so there is no fly-across-the-country, no puck
       appearing before the camera arrives, and no wait for
       the first GPS fix on slow phones.
    ================================================== */
    const previousJumpSessionKeyRef =
        useRef(sessionKey);

    useLayoutEffect(() => {

        if (
            previousJumpSessionKeyRef.current ===
            sessionKey
        ) {
            return;
        }

        previousJumpSessionKeyRef.current =
            sessionKey;

        if (
            !mapRef.current ||
            longitude == null ||
            latitude == null
        ) {
            return;
        }

        mapRef.current.jumpTo({
            center: [
                longitude,
                latitude,
            ],
            zoom,
        });

    }, [
        sessionKey,
        longitude,
        latitude,
        zoom,
    ]);

    useEffect(() => {

        const longitudeChanged =
            previousLongitudeRef.current !==
            longitude;


        const latitudeChanged =
            previousLatitudeRef.current !==
            latitude;


        const liveChanged =
            previousLiveRef.current !==
            live;


        const sessionChanged =
            previousFlySessionKeyRef.current !==
            sessionKey;

        previousFlySessionKeyRef.current =
            sessionKey;


        previousLongitudeRef.current =
            longitude;


        previousLatitudeRef.current =
            latitude;


        previousLiveRef.current =
            live;

        /* Page switch: the camera was already snapped
           by the layout effect above. Do not also fly. */
        if (
            sessionChanged
        ) {
            return;
        }


        if (
            live ||
            longitude == null ||
            latitude == null
        ) {

            return;

        }


        if (
            !longitudeChanged &&
            !latitudeChanged &&
            !liveChanged
        ) {

            return;

        }


        setSelectedCoords({

            lng:
                longitude,

            lat:
                latitude,

        });


        setIsFollowingUser(
            false
        );


        isFollowingUserRef.current =
            false;


        if (
            !mapRef.current
        ) {

            return;

        }


        mapRef.current.flyTo({

            center: [

                longitude,

                latitude,

            ],

            zoom:
                DEFAULT_ZOOM,

            duration:
                650,

            essential:
                true,

        });

    }, [
        longitude,
        latitude,
        live,
        sessionKey,
    ]);


    /* ==================================================
       GPS TRACKING
    ==================================================

       trackGps is the actual switch controlling the
       browser GPS watcher.

       When trackGps becomes false:

           watcher is immediately cleared.

       When trackGps becomes true:

           a completely new watcher is created.

       The marker is NOT affected by this.

       Therefore the marker can still be dragged while
       GPS is unavailable.
    ================================================== */

    useEffect(() => {

        /*
         * Always clear the previous watcher first.
         *
         * This is especially important on iPhone/Safari
         * when Location Services are switched off/on.
         */

        if (
            watchIdRef.current !== null
        ) {

            navigator.geolocation.clearWatch(
                watchIdRef.current
            );


            watchIdRef.current =
                null;

        }


        /*
         * If GPS tracking is currently disabled,
         * simply leave the marker/map available.
         */

        if (
            !trackGps ||
            !(
                "geolocation"
                in navigator
            )
        ) {

            return;

        }


        /*
         * Starting a fresh GPS session.
         */

        lastAcceptedCoordsRef.current =
            null;

        bestAccuracyRef.current =
            null;

        lastAcceptedAccuracyRef.current =
            null;


        isFollowingUserRef.current =
            true;


        /*
         * Do not immediately change React state here.
         *
         * The actual GPS callback will confirm that
         * a real location is available.
         */

        watchIdRef.current =
            navigator.geolocation.watchPosition(

                (position) => {

                    const coords = {

                        lng:
                            position.coords.longitude,

                        lat:
                            position.coords.latitude,

                    };


                    const gpsAccuracy =
                        position.coords.accuracy;


                    /* Request open: keep the pin where it is. */
                    if (
                        requestActiveRef.current
                    ) {

                        return;

                    }


                    /*
                     * A very rough fix (IP address / cell tower, often in
                     * another city or country) is never used — not even as
                     * the first fix. Keep waiting for a real one.
                     */
                    if (
                        !Number.isFinite(gpsAccuracy) ||
                        gpsAccuracy > MAX_USABLE_ACCURACY_M
                    ) {

                        return;

                    }


                    /*
                     * Ignore a coarse (Wi-Fi / IP based) fix that arrives
                     * after a precise one — it would drag the pin away.
                     */
                    const bestAccuracy =
                        bestAccuracyRef.current;

                    if (
                        bestAccuracy !== null &&
                        gpsAccuracy >
                            Math.max(
                                150,
                                bestAccuracy * 3
                            )
                    ) {

                        return;

                    }

                    bestAccuracyRef.current =
                        bestAccuracy === null
                            ? gpsAccuracy
                            : Math.min(
                                bestAccuracy,
                                gpsAccuracy
                            );


                    setAccuracy(
                        gpsAccuracy
                    );


                    setLiveCoords(
                        coords
                    );


                    setHasLiveLocation(
                        true
                    );


                    /*
                     * GPS is working again.
                     */

                    if (
                        !isFollowingUserRef.current
                    ) {

                        return;

                    }


                    setIsFollowingUser(
                        true
                    );


                    const movedEnough =
                        distanceBetweenPoints(

                            lastAcceptedCoordsRef.current,

                            coords

                        ) >=
                        JITTER_THRESHOLD_METERS;


                    /* A clearly more accurate fix is worth applying even if
                       the point barely moved. */
                    const betterFix =
                        lastAcceptedAccuracyRef.current !== null &&
                        gpsAccuracy <
                            lastAcceptedAccuracyRef.current * 0.7;

                    if (
                        !movedEnough &&
                        !betterFix
                    ) {

                        return;

                    }


                    lastAcceptedAccuracyRef.current =
                        gpsAccuracy;

                    lastAcceptedCoordsRef.current =
                        coords;


                    setSelectedCoords(
                        coords
                    );


                    if (
                        mapRef.current
                    ) {

                        mapRef.current.easeTo({

                            center: [

                                coords.lng,

                                coords.lat,

                            ],

                            zoom:
                                locationZoom,

                            duration:
                                700,

                            essential:
                                true,

                        });

                    }


                    if (
                        onLocationChange
                    ) {

                        onLocationChange(

                            coords,

                            {

                                source:
                                    "gps",

                                accuracy:
                                    gpsAccuracy,

                            }

                        );

                    }

                },


                (error) => {

                    console.error(
                        "LABLY live location error:",
                        error
                    );


                    /*
                     * Do NOT disable marker dragging.
                     *
                     * The parent permission hook handles
                     * the unavailable GPS state.
                     */

                    if (
                        error.code ===
                            error.PERMISSION_DENIED &&
                        onPermissionDenied
                    ) {

                        onPermissionDenied();

                    }

                },


                {

                    enableHighAccuracy:
                        true,

                    maximumAge:
                        0,

                    timeout:
                        10000,

                }

            );


        /*
         * Cleanup when trackGps changes or component
         * unmounts.
         */

        return () => {

            if (
                watchIdRef.current !==
                null
            ) {

                navigator.geolocation.clearWatch(
                    watchIdRef.current
                );


                watchIdRef.current =
                    null;

            }

        };

    }, [
        trackGps,
        locationZoom,
        onLocationChange,
        onPermissionDenied,
    ]);


    /* ==================================================
       MAP MANUAL MOVEMENT
    ================================================== */

    const handleMapDragStart =
        useCallback(() => {

            setIsFollowingUser(
                false
            );


            isFollowingUserRef.current =
                false;

        }, []);


    const handleMapZoomStart =
        useCallback(() => {

            setIsFollowingUser(
                false
            );


            isFollowingUserRef.current =
                false;

        }, []);


    /* ==================================================
       RECENTER USER
    ================================================== */

    const recenterToUser =
        useCallback(() => {

            if (
                !liveCoords ||
                !mapRef.current
            ) {

                return;

            }


            setIsFollowingUser(
                true
            );


            isFollowingUserRef.current =
                true;


            setSelectedCoords(
                liveCoords
            );


            lastAcceptedCoordsRef.current =
                liveCoords;


            mapRef.current.easeTo({

                center: [

                    liveCoords.lng,

                    liveCoords.lat,

                ],

                zoom:
                    locationZoom,

                duration:
                    800,

                essential:
                    true,

            });


            if (
                onLocationChange
            ) {

                onLocationChange(

                    liveCoords,

                    {

                        source:
                            "recenter",

                        accuracy,

                    }

                );

            }

        }, [

            liveCoords,

            locationZoom,

            onLocationChange,

            accuracy,

        ]);


    useEffect(() => {

        if (
            onRecenterReady
        ) {

            onRecenterReady(
                recenterToUser
            );

        }

    }, [
        onRecenterReady,
        recenterToUser,
    ]);


    /* ==================================================
       MARKER DRAG
    ================================================== */

    const handleMarkerDragStart =
        useCallback(() => {

            setIsFollowingUser(
                false
            );


            isFollowingUserRef.current =
                false;

        }, []);


    const handleMarkerDragEnd =
    useCallback(

        (event) => {

            const {
                lng,
                lat,
            } =
                event.lngLat;


            const coords = {

                lng,

                lat,

            };


            setSelectedCoords(
                coords
            );


            /*
             * FIX: previously the marker moved to the

             * dropped position but the camera stayed

             * put — nothing here ever called flyTo/easeTo

             * after a drag. This centers the camera on

             * the puck's new position, matching how GPS

             * updates and recenter already behave.
             */

            if (
                mapRef.current
            ) {

                mapRef.current.easeTo({

                    center: [

                        coords.lng,

                        coords.lat,

                    ],

                    duration:
                        500,

                    essential:
                        true,

                });

            }


            if (
                onLocationChange
            ) {

                onLocationChange(

                    coords,

                    {

                        source:
                            "manual",

                        accuracy:
                            null,

                    }

                );

            }

        },

        [
            onLocationChange,
        ]

    );


    const activeCoords =
        selectedCoords || {

            lng:
                longitude,

            lat:
                latitude,

        };


    const markerStyle =
        useMemo(

            () => ({

                "--marker-size":
                    `${markerSize}px`,

            }),

            [
                markerSize,
            ]

        );


    /* ==================================================
       REQUEST CAMERA DIRECTOR

       Drives the camera while a request is open. The puck
       stays fixed in the middle of the visible map (the
       part not covered by the bottom sheet) while:

         searching → zoom to street level, then ease out
                     linearly over `searchDurationMs`
         found     → zoom so puck + scientist both fit
         idle      → hand the camera back at the zoom the
                     user had before the request

       Re-runs when the sheet height changes (e.g. the notes
       box opens). In "searching" it continues the same
       zoom-out for the time that is left, so it never
       restarts or visibly jumps.
    ================================================== */

    const scientistRef =
        useRef(scientist);

    useEffect(() => {

        scientistRef.current =
            scientist;

    });


    const previousModeRef =
        useRef("idle");

    const restoreZoomRef =
        useRef(null);

    const searchStartedAtRef =
        useRef(null);

    const puckLng =
        activeCoords.lng;

    const puckLat =
        activeCoords.lat;

    // How far the farthest scientist is from the pin (rounded up to 50 m steps, so the camera
    // only re-plans when this really changes, not on every poll).
    const farthestRiderM =
        useMemo(() => {

            let farthest = 0;

            for (const rider of riders) {
                farthest = Math.max(
                    farthest,
                    metersBetween(puckLat, puckLng, rider.lat, rider.lng)
                );
            }

            return Math.ceil(farthest / 50) * 50;

        }, [riders, puckLat, puckLng]);


    useEffect(() => {

        const map =
            mapRef.current;

        if (!map) {
            return undefined;
        }


        const previousMode =
            previousModeRef.current;

        previousModeRef.current =
            mode;


        if (mode === "idle") {

            if (previousMode !== "idle") {

                map.easeTo({

                    zoom:
                        Math.max(
                            restoreZoomRef.current ??
                                map.getZoom(),
                            RESTORE_MIN_ZOOM
                        ),

                    padding:
                        ZERO_PADDING,

                    duration:
                        600,

                    essential:
                        true,

                });

                searchStartedAtRef.current =
                    null;

            }

            return undefined;

        }


        if (previousMode === "idle") {

            restoreZoomRef.current =
                map.getZoom();

            searchStartedAtRef.current =
                performance.now();

        }


        const padding = {

            top: 0,

            right: 0,

            left: 0,

            bottom:
                bottomPadding,

        };

        const center = [
            puckLng,
            puckLat,
        ];


                /*
         * Where the (original, slow, linear) zoom-out ends: wide enough to show
         * everything the matching logic can reach. Until the radius is known
         * it falls back to `searchEndZoom`.
         */
        const canvasEl =
            map.getCanvas();

        const halfWidthPx =
            canvasEl.clientWidth / 2;

        const halfHeightPx =
            (canvasEl.clientHeight - bottomPadding) / 2;

        const fitZoom =
            zoomToFitRadius(
                searchRadiusM,
                puckLat,
                halfWidthPx,
                halfHeightPx
            );

        const fullEndZoom =
            fitZoom === null
                ? searchEndZoom
                : Math.min(
                    SEARCH_START_ZOOM - 0.6,
                    Math.max(SEARCH_MIN_ZOOM, fitZoom)
                );

        // NO MORE SCIENTISTS, NO MORE ZOOMING: once the farthest scientist is in view the
        // zoom-out ends there instead of going on to the full matching distance.
        const scientistsFitZoom =
            farthestRiderM > 0
                ? zoomToFitRadius(
                    farthestRiderM * 1.15,
                    puckLat,
                    halfWidthPx,
                    halfHeightPx
                )
                : null;

        const endZoom =
            scientistsFitZoom === null
                ? fullEndZoom
                : Math.min(
                    SEARCH_START_ZOOM - 0.6,
                    Math.max(fullEndZoom, scientistsFitZoom)
                );

        // zoom levels per millisecond of the normal zoom-out (start -> full matching distance)
        const zoomSpeed =
            (SEARCH_START_ZOOM - fullEndZoom) /
            searchDurationMs;

        if (mode === "searching") {


            let timer = null;

            const startedAt =
                searchStartedAtRef.current ??
                performance.now();

            const drift = () => {
                const remainingZoom =
                    map.getZoom() - endZoom;

                // already wide enough to show every scientist: stay here
                if (
                    scientistsFitZoom !== null &&
                    remainingZoom < 0.02
                ) {
                    return;
                }

                const spent =
                    Math.max(
                        performance.now() - startedAt,
                        SEARCH_INTRO_MS
                    );

                map.easeTo({

                    center,

                    zoom:
                        endZoom,

                    padding,

                    duration:
                        scientistsFitZoom === null
                            ? Math.max(
                                1000,
                                searchDurationMs - spent
                            )
                            : Math.max(
                                1000,
                                remainingZoom / zoomSpeed
                            ),

                    easing:
                        linear,

                    essential:
                        true,

                });

            };

            if (
                performance.now() - startedAt >=
                SEARCH_INTRO_MS
            ) {

                drift();

            } else {

                map.easeTo({

                    center,

                    zoom:
                        SEARCH_START_ZOOM,

                    padding,

                    duration:
                        SEARCH_INTRO_MS,

                    essential:
                        true,

                });

                timer =
                    setTimeout(
                        drift,
                        SEARCH_INTRO_MS
                    );

            }

            return () => {

                if (timer !== null) {
                    clearTimeout(timer);
                }

            };

        }


        if (mode === "found") {

            const rider =
                scientistRef.current;

            if (!rider) {
                return undefined;
            }

            const container =
                map.getContainer();

            const halfWidth =
                Math.max(
                    container.clientWidth / 2 - 56,
                    60
                );

            const halfHeight =
                Math.max(
                    (container.clientHeight - bottomPadding) / 2 - 64,
                    60
                );

            map.easeTo({

                center,

                zoom:
                    zoomToContain(
                        { lng: puckLng, lat: puckLat },
                        rider,
                        halfWidth,
                        halfHeight
                    ),

                padding,

                duration:
                    1400,

                essential:
                    true,

            });

        }

        return undefined;

    }, [
        mode,
        mapLoaded,
        bottomPadding,
        puckLng,
        puckLat,
        searchDurationMs,
                searchEndZoom,
        searchRadiusM,
        farthestRiderM,
    ]);



    const isRequestActive =
        mode !== "idle";

    const isSearching =
        mode === "searching";

    /*
     * Searching: every nearby rider. Found: only the scientist who
     * accepted — same id as their searching marker, so it keeps gliding
     * instead of being re-created.
     */
    const visibleRiders =
        isSearching
            ? riders
            : mode === "found" && scientist
                ? [scientist]
                : EMPTY_RIDERS;


    /* ==================================================
       RECENTER VISIBILITY
    ================================================== */

    const showRecenterButton =
        hasLiveLocation &&
        !isFollowingUser &&
        !isRequestActive;


    return (

        <div className="map-shell">

            <Map

                ref={
                    mapRef
                }

                mapboxAccessToken={
                    import.meta.env
                        .VITE_MAPBOX_TOKEN
                }


                initialViewState={{

                    longitude:
                        activeCoords.lng,

                    latitude:
                        activeCoords.lat,

                    zoom,

                }}


                mapStyle=
                    "mapbox://styles/mapbox/streets-v12"


                className="map-container"


                dragPan={
                    !isSearching
                }

                scrollZoom={
                    !isSearching
                }

                doubleClickZoom={
                    !isSearching
                }

                touchZoomRotate={
                    !isSearching
                }


                onDragStart={
                    handleMapDragStart
                }


                onZoomStart={
                    handleMapZoomStart
                }


                onLoad={
                    handleMapLoad
                }

            >


                {showMarker && (

                    <Marker

                        longitude={
                            activeCoords.lng
                        }

                        latitude={
                            activeCoords.lat
                        }

                        anchor="center"

                        /*
                         * ALWAYS draggable.
                         *
                         * GPS availability does not
                         * control marker dragging.
                         */

                        draggable={
                            draggableMarker
                        }

                        onDragStart={
                            handleMarkerDragStart
                        }

                        onDragEnd={
                            handleMarkerDragEnd
                        }

                    >

                        <div

                            className={

                                draggableMarker

                                    ?

                                    "marker-wrapper"

                                    :

                                    "marker-wrapper marker-locked"

                            }

                            style={
                                markerStyle
                            }

                        >

                            {userPuck ? (

                                /*
                                 * Request puck: a realistic location dot (purple
                                 * core, white ring, soft shadow) with radar ripples.
                                 */

                                <div
                                    className={
                                        isSearching
                                            ? "user-pin user-pin-searching"
                                            : "user-pin"
                                    }
                                >

                                    <span className="user-pin-ripple" />

                                    <span className="user-pin-ripple user-pin-ripple-delay" />

                                    <PuckPin />

                                </div>

                            ) : (

                                <>

                                    <div
                                        className="marker-halo"
                                    />

                                    <div
                                        className="marker-sonar"
                                    />

                                    <div
                                        className=
                                            "marker-sonar marker-sonar-delay"
                                    />

                                    <div

                                        className={

                                            hasLiveLocation

                                                ?

                                                "custom-marker custom-marker-live"

                                                :

                                                "custom-marker"

                                        }

                                    />

                                </>

                            )}

                        </div>

                    </Marker>

                )}


                {visibleRiders.map((rider) => (

                    <RiderMarker
                        key={rider.id}
                        lng={rider.lng}
                        lat={rider.lat}
                        glideMs={2800}
                        distanceM={rider.distanceM}
                    />

                ))}


            </Map>


            {showRecenterButton && (

                <button

                    type="button"

                    className=
                        "map-recenter-button"

                    aria-label=
                        "Re-center on my location"

                    onClick={
                        recenterToUser
                    }

                >

                    <span
                        className=
                            "map-recenter-icon"
                    />

                </button>

            )}


        </div>

    );

}


export default MapComponent;