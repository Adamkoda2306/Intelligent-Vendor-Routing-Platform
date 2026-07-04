import { Vendor } from "../models/Vendor.model";
import { Metrics } from "../models/Metrics.model";

/**
 * Thresholds used to automatically classify vendor health based on
 * recent error rate. Simple rule-based approach, intentionally not ML-driven.
 */
const WARNING_ERROR_RATE = 0.2; // 20% failures -> WARNING
const OFFLINE_ERROR_RATE = 0.5; // 50% failures -> OFFLINE

export const healthService = {
  /**
   * Recalculates and persists a vendor's health status based on its
   * current error rate in the metrics collection.
   */
  async evaluateVendorHealth(vendorId: string): Promise<void> {
    const metrics = await Metrics.findOne({ vendorId });
    if (!metrics || metrics.totalRequests < 5) {
      // Not enough data yet to judge health reliably
      return;
    }

    let healthStatus: "HEALTHY" | "WARNING" | "OFFLINE" = "HEALTHY";
    if (metrics.errorRate >= OFFLINE_ERROR_RATE) {
      healthStatus = "OFFLINE";
    } else if (metrics.errorRate >= WARNING_ERROR_RATE) {
      healthStatus = "WARNING";
    }

    await Vendor.findByIdAndUpdate(vendorId, { healthStatus });
  },

  async getAllVendorHealth() {
    return Vendor.find().select("name healthStatus enabled priority").sort({ name: 1 });
  },
};
