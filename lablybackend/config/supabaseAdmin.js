import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.subapaseprojurl,
  process.env.supabasekey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

export default supabaseAdmin;