import { connectDB } from "../config/db";
import { Vendor } from "../models/Vendor.model";
import mongoose from "mongoose";

/**
 * Seeds the three mock vendors described in the project spec:
 * Vendor A - fast, high cost, reliable
 * Vendor B - medium speed, medium cost, reliable
 * Vendor C - cheap, slow, less reliable
 *
 * Run with: npm run seed
 */
const mockVendors = [
  {
    name: "Vendor A",
    priority: 1,
    weight: 70,
    cost: 10,
    avgLatencyMs: 300,
    rateLimitPerMin: 100,
    capabilities: ["PAN_VERIFICATION", "OCR", "KYC"],
    healthStatus: "HEALTHY" as const,
    enabled: true,
    failureRate: 0.02,
  },
  {
    name: "Vendor B",
    priority: 2,
    weight: 30,
    cost: 6,
    avgLatencyMs: 700,
    rateLimitPerMin: 80,
    capabilities: ["PAN_VERIFICATION", "OCR", "SMS"],
    healthStatus: "HEALTHY" as const,
    enabled: true,
    failureRate: 0.05,
  },
  {
    name: "Vendor C",
    priority: 3,
    weight: 10,
    cost: 2,
    avgLatencyMs: 1500,
    rateLimitPerMin: 50,
    capabilities: ["PAN_VERIFICATION", "SMS", "KYC"],
    healthStatus: "HEALTHY" as const,
    enabled: true,
    failureRate: 0.2,
  },
];

async function seed() {
  await connectDB();
  await Vendor.deleteMany({});
  await Vendor.insertMany(mockVendors);
  console.log("[SEED] Inserted mock vendors A, B, C");
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("[SEED] Failed:", err);
  process.exit(1);
});
