import { VendorDocument } from "../models/Vendor.model";
import { RouteRequirements, RoutingStrategy, VendorSelectionResult } from "../types/routing.types";

/**
 * Picks the highest priority (lowest priority number) healthy vendor.
 */
function priorityRouting(vendors: VendorDocument[]): VendorSelectionResult {
  const sorted = [...vendors].sort((a, b) => a.priority - b.priority);
  const chosen = sorted[0];
  return {
    vendorId: String(chosen._id),
    vendorName: chosen.name,
    strategyUsed: "PRIORITY",
    reason: `Selected ${chosen.name} because it has the highest priority (priority=${chosen.priority}) among eligible vendors.`,
  };
}

/**
 * Picks a vendor probabilistically based on its weight relative to the total weight.
 * e.g. Vendor A (weight 70) is picked ~70% of the time vs Vendor B (weight 30) ~30%.
 */
function weightedRouting(vendors: VendorDocument[]): VendorSelectionResult {
  const totalWeight = vendors.reduce((sum, v) => sum + v.weight, 0) || 1;
  let roll = Math.random() * totalWeight;

  for (const vendor of vendors) {
    roll -= vendor.weight;
    if (roll <= 0) {
      return {
        vendorId: String(vendor._id),
        vendorName: vendor.name,
        strategyUsed: "WEIGHTED",
        reason: `Selected ${vendor.name} via weighted random distribution (weight=${vendor.weight}/${totalWeight}).`,
      };
    }
  }

  // Fallback: last vendor in list (guards against floating point edge cases)
  const fallback = vendors[vendors.length - 1];
  return {
    vendorId: String(fallback._id),
    vendorName: fallback.name,
    strategyUsed: "WEIGHTED",
    reason: `Selected ${fallback.name} as fallback of weighted distribution.`,
  };
}

/**
 * Picks the cheapest vendor by cost.
 */
function lowestCostRouting(vendors: VendorDocument[]): VendorSelectionResult {
  const sorted = [...vendors].sort((a, b) => a.cost - b.cost);
  const chosen = sorted[0];
  return {
    vendorId: String(chosen._id),
    vendorName: chosen.name,
    strategyUsed: "LOWEST_COST",
    reason: `Selected ${chosen.name} because it has the lowest cost (cost=${chosen.cost}) among eligible vendors.`,
  };
}

/**
 * Picks the fastest vendor by average latency.
 * Optionally filters out vendors exceeding a maxLatency requirement first.
 */
function lowestLatencyRouting(vendors: VendorDocument[], maxLatency?: number): VendorSelectionResult {
  const pool = maxLatency ? vendors.filter((v) => v.avgLatencyMs <= maxLatency) : vendors;
  const eligible = pool.length > 0 ? pool : vendors; // fall back if filter empties the pool

  const sorted = [...eligible].sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
  const chosen = sorted[0];
  return {
    vendorId: String(chosen._id),
    vendorName: chosen.name,
    strategyUsed: "LOWEST_LATENCY",
    reason: `Selected ${chosen.name} because it has the lowest average latency (${chosen.avgLatencyMs}ms)${
      maxLatency ? ` within the ${maxLatency}ms requirement` : ""
    }.`,
  };
}

export const routingEngineService = {
  /**
   * Determines which strategy to apply based on client requirements,
   * then returns the selected vendor plus a human-readable reason.
   */
  selectVendor(vendors: VendorDocument[], requirements?: RouteRequirements): VendorSelectionResult {
    if (vendors.length === 0) {
      throw new Error("No eligible vendors available to route this request.");
    }

    const strategy: RoutingStrategy | undefined = requirements?.strategy;

    if (strategy === "WEIGHTED") return weightedRouting(vendors);
    if (strategy === "LOWEST_COST") return lowestCostRouting(vendors);
    if (strategy === "LOWEST_LATENCY") return lowestLatencyRouting(vendors, requirements?.maxLatency);
    if (strategy === "PRIORITY") return priorityRouting(vendors);

    // Auto-decide strategy based on requirement flags if no explicit strategy given
    if (requirements?.preferLowCost) return lowestCostRouting(vendors);
    if (requirements?.preferLowLatency || requirements?.maxLatency) {
      return lowestLatencyRouting(vendors, requirements?.maxLatency);
    }

    // Default strategy
    return priorityRouting(vendors);
  },

  /**
   * Returns the next-best vendor from the remaining pool, excluding
   * vendors already attempted. Used for failover routing.
   */
  nextFailoverVendor(
    vendors: VendorDocument[],
    attemptedVendorIds: string[]
  ): VendorSelectionResult | null {
    const remaining = vendors.filter((v) => !attemptedVendorIds.includes(String(v._id)));
    if (remaining.length === 0) return null;

    const sorted = [...remaining].sort((a, b) => a.priority - b.priority);
    const chosen = sorted[0];
    return {
      vendorId: String(chosen._id),
      vendorName: chosen.name,
      strategyUsed: "FAILOVER",
      reason: `Failover triggered. Selected next available vendor ${chosen.name} (priority=${chosen.priority}).`,
    };
  },
};
