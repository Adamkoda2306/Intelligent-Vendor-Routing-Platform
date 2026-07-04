import { Schema, model, Document, Types } from "mongoose";

export interface MetricsDocument extends Document {
  vendorId: Types.ObjectId;
  vendorName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  errorRate: number;
  availability: number;
  lastUpdated: Date;
}

const metricsSchema = new Schema<MetricsDocument>({
  vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, unique: true },
  vendorName: { type: String, required: true },
  totalRequests: { type: Number, default: 0 },
  successfulRequests: { type: Number, default: 0 },
  failedRequests: { type: Number, default: 0 },
  totalLatencyMs: { type: Number, default: 0 },
  avgLatencyMs: { type: Number, default: 0 },
  errorRate: { type: Number, default: 0 },
  availability: { type: Number, default: 100 },
  lastUpdated: { type: Date, default: Date.now },
});

export const Metrics = model<MetricsDocument>("Metrics", metricsSchema);
