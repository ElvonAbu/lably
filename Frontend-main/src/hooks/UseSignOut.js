import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

const supabaseurl =
    import.meta.env.VITE_supabaseurl;

const supabasekey =
    import.meta.env.VITE_supabasekey;

const supabase =
    createClient(
        supabaseurl,
        supabasekey
    );

// Page-flow data that must not survive a logout.
const FLOW_KEYS = [
    "signup_email",
    "otp_purpose",
    "signup_draft_email",
];

/* ==================================================
   SHARED SIGN OUT
   One place for every "Log out" / "Sign out" button.

   beforeSignOut (optional, async): runs first, e.g. to
   cancel a request that is still being searched. It can
   never block the logout: errors are ignored.

   If Supabase cannot be reached, the local session is
   still cleared so the person is never stuck logged in.
================================================== */
export function useSignOut({ beforeSignOut } = {}) {
    const navigate = useNavigate();

    const [isSigningOut, setIsSigningOut] = useState(false);

    const [logoutError, setLogoutError] = useState("");

    const handleSignOut = async () => {
        if (isSigningOut) {
            return;
        }

        setLogoutError("");
        setIsSigningOut(true);

        try {
            await beforeSignOut?.();
        } catch (error) {
            console.warn("LABLY beforeSignOut failed:", error);
        }

        let { error } = await supabase.auth.signOut();

        if (error) {
            // Server unreachable: at least drop the session on this device.
            ({ error } = await supabase.auth.signOut({ scope: "local" }));
        }

        setIsSigningOut(false);

        if (error) {
            console.log(`Error from signing out ${error}`);
            setLogoutError(
                error.message ||
                "Unable to sign out. Please try again."
            );
            return;
        }

        FLOW_KEYS.forEach((key) => sessionStorage.removeItem(key));

        navigate("/login", { replace: true });
    };

    return { handleSignOut, isSigningOut, logoutError };
}
