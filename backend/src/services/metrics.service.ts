import { Metrics } from "../models/Metrics.model";
import { VendorDocument } from "../models/Vendor.model";

/**
 * Maintains a running per-vendor metrics document, updated after every
 * routed request (success or failure).
 */
export const metricsService = {
  async recordResult(vendor: VendorDocument, success: boolean, latencyMs: number): Promise<void> {
    const existing = await Metrics.findOne({ vendorId: vendor._id });

    const totalRequests = (existing?.totalRequests || 0) + 1;
    const successfulRequests = (existing?.successfulRequests || 0) + (success ? 1 : 0);
    const failedRequests = (existing?.failedRequests || 0) + (success ? 0 : 1);
    const totalLatencyMs = (existing?.totalLatencyMs || 0) + latencyMs;
    const avgLatencyMs = Math.round(totalLatencyMs / totalRequests);
    const errorRate = Number((failedRequests / totalRequests).toFixed(4));
    const availability = Number((100 - errorRate * 100).toFixed(2));

    await Metrics.findOneAndUpdate(
      { vendorId: vendor._id },
      {
        vendorId: vendor._id,
        vendorName: vendor.name,
        totalRequests,
        successfulRequests,
        failedRequests,
        totalLatencyMs,
        avgLatencyMs,
        errorRate,
        availability,
        lastUpdated: new Date(),
      },
      { upsert: true, new: true }
    );
  },

  async getAllMetrics() {
    return Metrics.find().sort({ vendorName: 1 });
  },

  async getMetricsSummary() {
    const all = await Metrics.find();
    const totalRequests = all.reduce((sum, m) => sum + m.totalRequests, 0);
    const successfulRequests = all.reduce((sum, m) => sum + m.successfulRequests, 0);
    const failedRequests = all.reduce((sum, m) => sum + m.failedRequests, 0);
    const avgLatencyMs = all.length
      ? Math.round(all.reduce((sum, m) => sum + m.avgLatencyMs, 0) / all.length)
      : 0;
    const errorRate = totalRequests > 0 ? Number((failedRequests / totalRequests).toFixed(4)) : 0;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      avgLatencyMs,
      errorRate,
      vendors: all,
    };
  },
};
