import {
    useState,
    useEffect,
    useRef,
    useCallback,
} from "react";


export function useLocationPermission() {

    const [
        permissionState,
        setPermissionState
    ] =
        useState("prompt");


    const [
        supported,
        setSupported
    ] =
        useState(true);


    const permissionStatusRef =
        useRef(null);


    const pollRef =
        useRef(null);


    const checkingRef =
        useRef(false);


    const permissionStateRef =
        useRef(permissionState);


    useEffect(() => {

        permissionStateRef.current =
            permissionState;

    }, [
        permissionState,
    ]);


    // === ADDED (Claude): tracks whether the component has actually
    // unmounted, shared by both the original mount-time permission query
    // and the new foreground re-query below — replaces the local
    // "ignore" variable that used to only protect the mount effect.
    const isUnmountedRef =
        useRef(false);


    useEffect(() => {

        return () => {

            isUnmountedRef.current =
                true;

        };

    }, []);


    // === ADDED (Claude): pulled the actual permissions.query() call out
    // so it can ALSO run every time the tab comes back to the
    // foreground, not just once at page load — this is the actual fix.
    // See the mechanism explained in chat: getCurrentPosition alone
    // (what checkRealLocation uses) can't tell "permission is now
    // undetermined again" from "permission is truly denied," since it
    // only reacts to the PERMISSION_DENIED error code specifically.
    // Re-asking the Permissions API directly is the authoritative source
    // that doesn't have that gap.
    const queryPermissionFresh =
        useCallback(async () => {

            if (
                !navigator.permissions
            ) {

                return;

            }


            try {

                const status =
                    await navigator.permissions.query({

                        name:
                            "geolocation",

                    });


                if (
                    isUnmountedRef.current
                ) {

                    return;

                }


                permissionStatusRef.current =
                    status;


                setPermissionState(
                    status.state
                );


                status.onchange = () => {

                    if (
                        !isUnmountedRef.current
                    ) {

                        setPermissionState(
                            status.state
                        );

                    }

                };

            } catch (
                error
            ) {

                console.warn(
                    "LABLY permission detection unavailable:",
                    error
                );


                if (
                    !isUnmountedRef.current
                ) {

                    setSupported(
                        false
                    );

                }

            }

        }, []);


    const checkRealLocation =
        useCallback(() => {

            if (
                checkingRef.current
            ) {

                return;

            }


            if (
                !(
                    "geolocation"
                    in navigator
                )
            ) {

                return;

            }


            if (
                permissionStateRef.current ===
                "prompt"
            ) {

                return;

            }


            checkingRef.current =
                true;


            const safetyTimer =
                setTimeout(() => {

                    checkingRef.current =
                        false;

                }, 4000);


            navigator.geolocation.getCurrentPosition(

                () => {

                    clearTimeout(
                        safetyTimer
                    );


                    checkingRef.current =
                        false;


                    setPermissionState(
                        "granted"
                    );

                },


                (error) => {

                    clearTimeout(
                        safetyTimer
                    );


                    checkingRef.current =
                        false;


                    if (
                        error.code ===
                        error.PERMISSION_DENIED
                    ) {

                        setPermissionState(
                            "denied"
                        );

                    }

                },


                {

                    enableHighAccuracy:
                        false,

                    timeout:
                        3000,

                    maximumAge:
                        0,

                }

            );

        }, []);


    useEffect(() => {

        let ignore = false;


        async function initPermission() {

            if (
                !(
                    "geolocation"
                    in navigator
                )
            ) {

                if (!ignore) {

                    setSupported(
                        false
                    );


                    setPermissionState(
                        "denied"
                    );

                }


                return;

            }


            if (
                !navigator.permissions
            ) {

                if (!ignore) {

                    setSupported(
                        false
                    );

                }


                return;

            }


            try {

                const status =
                    await navigator.permissions.query({

                        name:
                            "geolocation",

                    });


                if (
                    ignore
                ) {

                    return;

                }


                permissionStatusRef.current =
                    status;


                setPermissionState(
                    status.state
                );


                status.onchange = () => {

                    if (
                        !ignore
                    ) {

                        setPermissionState(
                            status.state
                        );

                    }

                };

            } catch (
                error
            ) {

                console.warn(
                    "LABLY permission detection unavailable:",
                    error
                );


                if (
                    !ignore
                ) {

                    setSupported(
                        false
                    );

                }

            }

        }


        initPermission();


        return () => {

            ignore = true;


            if (
                permissionStatusRef.current
            ) {

                permissionStatusRef.current
                    .onchange = null;


                permissionStatusRef.current =
                    null;

            }

        };

    }, []);


    useEffect(() => {

        if (
            pollRef.current
        ) {

            clearInterval(
                pollRef.current
            );


            pollRef.current =
                null;

        }


        if (
            !(
                "geolocation"
                in navigator
            )
        ) {

            return;

        }


        if (
            permissionState ===
            "prompt"
        ) {

            return;

        }


        checkRealLocation();


        /*
         * Poll faster while denied so OFF → ON is
         * picked up without a reload.
         */
        const intervalMs =
            permissionState === "denied"
                ? 800
                : 2000;


        pollRef.current =
            setInterval(
                checkRealLocation,
                intervalMs
            );


        return () => {

            if (
                pollRef.current
            ) {

                clearInterval(
                    pollRef.current
                );


                pollRef.current =
                    null;

            }

        };

    }, [
        permissionState,
        checkRealLocation,
    ]);


    useEffect(() => {

        const recheckWhenVisible =
            () => {

                if (
                    document.visibilityState !==
                    "visible"
                ) {

                    return;

                }


                if (
                    !(
                        "geolocation"
                        in navigator
                    )
                ) {

                    return;

                }


                checkingRef.current =
                    false;


                // === ADDED (Claude): re-asks the Permissions API
                // directly first — this is the authoritative source,
                // and doesn't depend on onchange having fired (which
                // WebKit doesn't reliably do for changes made via the
                // Settings app while backgrounded) or on
                // checkRealLocation's getCurrentPosition happening to
                // fail with exactly PERMISSION_DENIED. checkRealLocation
                // below is left running too — it still does the
                // separate, real job of confirming GPS actually works,
                // not just that permission theoretically allows it.
                queryPermissionFresh();


                checkRealLocation();

            };


        document.addEventListener(
            "visibilitychange",
            recheckWhenVisible
        );


        window.addEventListener(
            "pageshow",
            recheckWhenVisible
        );


        window.addEventListener(
            "focus",
            recheckWhenVisible
        );


        return () => {

            document.removeEventListener(
                "visibilitychange",
                recheckWhenVisible
            );


            window.removeEventListener(
                "pageshow",
                recheckWhenVisible
            );


            window.removeEventListener(
                "focus",
                recheckWhenVisible
            );

        };

    }, [
        checkRealLocation,
        queryPermissionFresh,
    ]);


    return {

        permissionState,

        supported,

    };

}