import { Schema, model, Document, Types } from "mongoose";
import { RoutingStrategy } from "../types/routing.types";

export interface RoutingLogDocument extends Document {
  capability: string;
  strategyUsed: RoutingStrategy;
  vendorSelected: string;
  vendorId: Types.ObjectId | null;
  attemptedVendors: string[];
  reason: string;
  latencyMs: number;
  status: "SUCCESS" | "FAILED";
  errorMessage: string | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown> | null;
  createdAt: Date;
}

const routingLogSchema = new Schema<RoutingLogDocument>(
  {
    capability: { type: String, required: true },
    strategyUsed: {
      type: String,
      enum: ["PRIORITY", "WEIGHTED", "LOWEST_COST", "LOWEST_LATENCY", "FAILOVER"],
      required: true,
    },
    vendorSelected: { type: String, required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", default: null },
    attemptedVendors: { type: [String], default: [] },
    reason: { type: String, required: true },
    latencyMs: { type: Number, required: true },
    status: { type: String, enum: ["SUCCESS", "FAILED"], required: true },
    errorMessage: { type: String, default: null },
    requestPayload: { type: Schema.Types.Mixed, default: {} },
    responsePayload: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const RoutingLog = model<RoutingLogDocument>("RoutingLog", routingLogSchema);
