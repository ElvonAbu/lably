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


/* ==================================================
   SHARED SIGN OUT

   Previously this logic lived only inside Home.jsx,

   which is why LocationSearch's hamburger menu had

   nothing to show — it had no sign-out handler at all.

   Pulling it into one hook lets both pages use the

   exact same Supabase call and error handling instead

   of duplicating it.
================================================== */

export function useSignOut() {

    const navigate = useNavigate();

    const [isSigningOut, setIsSigningOut] = useState(false);

    const [logoutError, setLogoutError] = useState("");


    const handleSignOut = async () => {

        setLogoutError("");

        setIsSigningOut(true);


        const { data, error } = await supabase.auth.signOut();


        setIsSigningOut(false);


        if (error) {

            console.log(`Error from signing out ${error}`);


            setLogoutError(
                error.message ||
                "Unable to sign out. Please try again."
            );


            return;

        }


        console.log(`Logging user out ${data}`);


        navigate("/login");

    };


    return { handleSignOut, isSigningOut, logoutError };

}