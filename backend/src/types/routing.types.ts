export type RoutingStrategy =
  | "PRIORITY"
  | "WEIGHTED"
  | "LOWEST_COST"
  | "LOWEST_LATENCY"
  | "FAILOVER";

export interface RouteRequirements {
  preferLowCost?: boolean;
  preferLowLatency?: boolean;
  maxLatency?: number;
  strategy?: RoutingStrategy;
}

export interface RouteRequestBody {
  capability: string;
  payload: Record<string, unknown>;
  requirements?: RouteRequirements;
}

export interface VendorSelectionResult {
  vendorId: string;
  vendorName: string;
  strategyUsed: RoutingStrategy;
  reason: string;
}

export interface MockVendorCallResult {
  success: boolean;
  latencyMs: number;
  data?: Record<string, unknown>;
  errorMessage?: string;
}

export interface RouteOutcome {
  strategyUsed: RoutingStrategy;
  vendorSelected: string;
  vendorId: string;
  attemptedVendors: string[];
  reason: string;
  latencyMs: number;
  status: "SUCCESS" | "FAILED";
  errorMessage: string | null;
  responsePayload: Record<string, unknown> | null;
}
