import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseAdmin = createClient(
  process.env.subapaseprojurl,
  process.env.supabasekey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export default async function verifySupabaseAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Access denied. No token provided.",
    });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user?.email) {
      return res.status(403).json({
        message: "Invalid or expired token.",
      });
    }

    req.user = data.user;
    req.email = data.user.email.trim().toLowerCase();
    next();
  } catch (err) {
    return res.status(403).json({
      message: "Invalid or expired token.",
      error: err.message,
    });
  }
}