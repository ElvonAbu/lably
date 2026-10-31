import { createClient } from "@supabase/supabase-js";

const API_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`;

const supabase = createClient(
  import.meta.env.VITE_supabaseurl,
  import.meta.env.VITE_supabasekey
);

/* ==================================================
   LABLY API CLIENT
================================================== */

export async function apiClient(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    /* no session */
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type");

  let data;

  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    let message = "Server Error";

    if (typeof data === "object" && data?.message) {
      message = data.message;
    } else if (typeof data === "string" && data.trim()) {
      message = data;
    }

    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}