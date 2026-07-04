import { RoutingLog, RoutingLogDocument } from "../models/RoutingLog.model";
import { RouteOutcome } from "../types/routing.types";

export const logService = {
  async createRoutingLog(
    capability: string,
    outcome: RouteOutcome,
    requestPayload: Record<string, unknown>
  ): Promise<RoutingLogDocument> {
    return RoutingLog.create({
      capability,
      strategyUsed: outcome.strategyUsed,
      vendorSelected: outcome.vendorSelected,
      vendorId: outcome.vendorId || null,
      attemptedVendors: outcome.attemptedVendors,
      reason: outcome.reason,
      latencyMs: outcome.latencyMs,
      status: outcome.status,
      errorMessage: outcome.errorMessage,
      requestPayload,
      responsePayload: outcome.responsePayload,
    });
  },

  async getLogs(limit = 100): Promise<RoutingLogDocument[]> {
    return RoutingLog.find().sort({ createdAt: -1 }).limit(limit);
  },

  async getLogById(id: string): Promise<RoutingLogDocument | null> {
    return RoutingLog.findById(id);
  },
};
