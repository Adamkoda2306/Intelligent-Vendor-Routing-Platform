import { Schema, model, Document } from "mongoose";
import { IVendor } from "../types/vendor.types";

export interface VendorDocument extends IVendor, Document {}

const vendorSchema = new Schema<VendorDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    priority: { type: Number, required: true, default: 10 },
    weight: { type: Number, required: true, default: 50, min: 0, max: 100 },
    cost: { type: Number, required: true, min: 0 },
    avgLatencyMs: { type: Number, required: true, min: 0 },
    rateLimitPerMin: { type: Number, required: true, default: 60 },
    capabilities: { type: [String], required: true, default: [] },
    healthStatus: {
      type: String,
      enum: ["HEALTHY", "WARNING", "OFFLINE"],
      default: "HEALTHY",
    },
    enabled: { type: Boolean, default: true },
    failureRate: { type: Number, default: 0.05, min: 0, max: 1 },
  },
  { timestamps: true }
);

export const Vendor = model<VendorDocument>("Vendor", vendorSchema);
