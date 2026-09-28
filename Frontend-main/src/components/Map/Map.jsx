import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import Map, {
    Marker,
} from "react-map-gl";

import "mapbox-gl/dist/mapbox-gl.css";
import "./Map.css";


/* ==================================================
   DEFAULT MAP SETTINGS
================================================== */

const DEFAULT_ZOOM = 15.8;

const CLOSE_ZOOM = 16.4;

const JITTER_THRESHOLD_METERS = 6;


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

    showMarker = true,

    live = false,

    trackGps = true,

    draggableMarker = true,

    markerSize = 72,

    onLocationChange,

    onRecenterReady,

    onPermissionDenied,

}) {


    const mapRef =
        useRef(null);


    const watchIdRef =
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


    const [
        hasLiveLocation,
        setHasLiveLocation
    ] =
        useState(
            () => live
        );


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


        previousLongitudeRef.current =
            longitude;


        previousLatitudeRef.current =
            latitude;


        previousLiveRef.current =
            live;


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


                    if (
                        !movedEnough
                    ) {

                        return;

                    }


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
       RECENTER VISIBILITY
    ================================================== */

    const showRecenterButton =
        hasLiveLocation &&
        !isFollowingUser;


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
                    true
                }

                scrollZoom={
                    true
                }

                doubleClickZoom={
                    true
                }

                touchZoomRotate={
                    true
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

                        </div>

                    </Marker>

                )}


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