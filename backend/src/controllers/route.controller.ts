import { Request, Response } from "express";
import { vendorService } from "../services/vendor.service";
import { routingEngineService } from "../services/routingEngine.service";
import { mockVendorService } from "../services/mockVendor.service";
import { metricsService } from "../services/metrics.service";
import { healthService } from "../services/health.service";
import { logService } from "../services/log.service";
import { sendSuccess, sendError } from "../utils/apiResponse";
import { RouteOutcome, RouteRequestBody } from "../types/routing.types";
import { VendorDocument } from "../models/Vendor.model";

export const routeController = {
  /**
   * Main routing endpoint. Finds eligible vendors, applies the chosen
   * routing strategy, calls the mock vendor, and fails over automatically
   * if the selected vendor's call fails.
   */
  async route(req: Request, res: Response) {
    const { capability, payload, requirements }: RouteRequestBody = req.body;

    const eligibleVendors = await vendorService.getEligibleVendors(capability);

    if (eligibleVendors.length === 0) {
      sendError(res, `No eligible vendors found for capability: ${capability}`, 404);
      return;
    }

    const attemptedVendors: string[] = [];
    let outcome: RouteOutcome | null = null;
    let currentVendors = eligibleVendors;

    // Initial selection based on requested/derived strategy
    let selection = routingEngineService.selectVendor(currentVendors, requirements);

    // Try vendors with automatic failover until one succeeds or all are exhausted
    while (selection) {
      const vendor = currentVendors.find((v) => String(v._id) === selection!.vendorId) as VendorDocument;
      attemptedVendors.push(vendor.name);

      const callResult = await mockVendorService.simulateCall(vendor, capability, payload);

      // Record metrics + health regardless of outcome
      await metricsService.recordResult(vendor, callResult.success, callResult.latencyMs);
      await healthService.evaluateVendorHealth(String(vendor._id));

      if (callResult.success) {
        outcome = {
          strategyUsed: selection.strategyUsed,
          vendorSelected: vendor.name,
          vendorId: String(vendor._id),
          attemptedVendors,
          reason: selection.reason,
          latencyMs: callResult.latencyMs,
          status: "SUCCESS",
          errorMessage: null,
          responsePayload: callResult.data || null,
        };
        break;
      }

      // Failed - attempt failover to the next vendor
      const failoverSelection = routingEngineService.nextFailoverVendor(currentVendors, attemptedVendors.map(
        (name) => String(currentVendors.find((v) => v.name === name)?._id)
      ));

      if (!failoverSelection) {
        outcome = {
          strategyUsed: "FAILOVER",
          vendorSelected: vendor.name,
          vendorId: String(vendor._id),
          attemptedVendors,
          reason: `All eligible vendors were attempted and failed. Last attempt: ${vendor.name}.`,
          latencyMs: callResult.latencyMs,
          status: "FAILED",
          errorMessage: callResult.errorMessage || "All vendors failed",
          responsePayload: null,
        };
        break;
      }

      selection = failoverSelection;
    }

    if (!outcome) {
      sendError(res, "Routing failed unexpectedly with no outcome produced.", 500);
      return;
    }

    await logService.createRoutingLog(capability, outcome, payload);

    if (outcome.status === "SUCCESS") {
      sendSuccess(res, outcome, "Request routed successfully");
    } else {
      sendError(res, outcome.errorMessage || "Routing failed for all eligible vendors", 502);
    }
  },
};
