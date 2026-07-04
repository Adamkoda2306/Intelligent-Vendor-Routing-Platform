import mongoose from "mongoose";
import { env } from "./env";

/**
 * Connects to MongoDB using Mongoose.
 * Exits the process on failure since the app cannot function without a DB.
 */
export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGO_URI);
    // console.log(`[DB] Connected to MongoDB at ${env.MONGO_URI}`);
    console.log(`[DB] Connected to MongoDB`);
  } catch (error) {
    console.error("[DB] Connection failed:", error);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("[DB] MongoDB disconnected");
});
