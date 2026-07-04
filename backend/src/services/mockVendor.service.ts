import { VendorDocument } from "../models/Vendor.model";
import { MockVendorCallResult } from "../types/routing.types";

/**
 * Simulates calling a real third-party vendor.
 * Latency is randomized around the vendor's avgLatencyMs, and failures
 * are randomized based on the vendor's failureRate.
 */
function simulateLatency(avgLatencyMs: number): number {
  // +/- 40% jitter around the average latency
  const jitter = avgLatencyMs * 0.4;
  const min = Math.max(50, avgLatencyMs - jitter);
  const max = avgLatencyMs + jitter;
  return Math.round(min + Math.random() * (max - min));
}

function simulateFailure(failureRate: number): boolean {
  return Math.random() < failureRate;
}

export const mockVendorService = {
  /**
   * Simulates an actual network call to a vendor for a given capability + payload.
   * Waits for the simulated latency before resolving, mimicking real network delay.
   */
  async simulateCall(
    vendor: VendorDocument,
    capability: string,
    payload: Record<string, unknown>
  ): Promise<MockVendorCallResult> {
    const latencyMs = simulateLatency(vendor.avgLatencyMs);

    await new Promise((resolve) => setTimeout(resolve, Math.min(latencyMs, 2000)));

    const failed = simulateFailure(vendor.failureRate);

    if (failed) {
      return {
        success: false,
        latencyMs,
        errorMessage: `${vendor.name} failed to process ${capability} request (simulated failure)`,
      };
    }

    return {
      success: true,
      latencyMs,
      data: {
        vendor: vendor.name,
        capability,
        verified: true,
        echo: payload,
        processedAt: new Date().toISOString(),
      },
    };
  },
};
