import dotenv from "dotenv";

dotenv.config();

/**
 * Central place for all environment variables.
 * Throws early if a required variable is missing so failures are obvious at boot.
 */
function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGO_URI: required("MONGO_URI", ""),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "*",
};
