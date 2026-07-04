/**
 * Shared mock data for unit + integration tests.
 * Field values mirror the seeded Vendor A / B / C from the spec:
 *   A: fast / expensive / reliable
 *   B: medium
 *   C: cheap / slow / unreliable
 */

export const mockVendorA = {
  _id: "64f000000000000000000001",
  name: "Vendor A",
  priority: 1,
  weight: 70,
  cost: 5,
  avgLatencyMs: 120,
  rateLimitPerMin: 100,
  capabilities: ["PAN_VERIFICATION", "KYC"],
  healthStatus: "HEALTHY",
  enabled: true,
  failureRate: 0.05,
};

export const mockVendorB = {
  _id: "64f000000000000000000002",
  name: "Vendor B",
  priority: 2,
  weight: 20,
  cost: 3,
  avgLatencyMs: 300,
  rateLimitPerMin: 60,
  capabilities: ["PAN_VERIFICATION", "OCR"],
  healthStatus: "HEALTHY",
  enabled: true,
  failureRate: 0.15,
};

export const mockVendorC = {
  _id: "64f000000000000000000003",
  name: "Vendor C",
  priority: 3,
  weight: 10,
  cost: 1,
  avgLatencyMs: 800,
  rateLimitPerMin: 30,
  capabilities: ["PAN_VERIFICATION", "SMS"],
  healthStatus: "WARNING",
  enabled: true,
  failureRate: 0.4,
};

/** Disabled vendor — must never be eligible for routing */
export const mockVendorDisabled = {
  _id: "64f000000000000000000004",
  name: "Vendor D (disabled)",
  priority: 1,
  weight: 50,
  cost: 2,
  avgLatencyMs: 100,
  rateLimitPerMin: 100,
  capabilities: ["PAN_VERIFICATION"],
  healthStatus: "HEALTHY",
  enabled: false,
  failureRate: 0,
};

/** Offline vendor — must never be eligible for routing */
export const mockVendorOffline = {
  _id: "64f000000000000000000005",
  name: "Vendor E (offline)",
  priority: 1,
  weight: 50,
  cost: 2,
  avgLatencyMs: 100,
  rateLimitPerMin: 100,
  capabilities: ["PAN_VERIFICATION"],
  healthStatus: "OFFLINE",
  enabled: true,
  failureRate: 1,
};

export const allMockVendors = [
  mockVendorA,
  mockVendorB,
  mockVendorC,
  mockVendorDisabled,
  mockVendorOffline,
];

/** The three vendors the routing engine should actually consider */
export const eligibleMockVendors = [mockVendorA, mockVendorB, mockVendorC];

export const mockRoutePayload = {
  capability: "PAN_VERIFICATION",
  payload: { panNumber: "ABCDE1234F", name: "Test User" },
  requirements: {},
};

export const mockRoutingLog = {
  capability: "PAN_VERIFICATION",
  strategyUsed: "PRIORITY",
  vendorSelected: "Vendor A",
  vendorId: "64f000000000000000000001",
  attemptedVendors: ["Vendor A"],
  reason:
    "Selected Vendor A because it has the highest priority (priority=1) among eligible vendors.",
  latencyMs: 132,
  status: "SUCCESS",
  errorMessage: null,
  requestPayload: { panNumber: "ABCDE1234F" },
  responsePayload: { vendor: "Vendor A", verified: true },
};

export const mockFailoverRoutingLog = {
  capability: "PAN_VERIFICATION",
  strategyUsed: "FAILOVER",
  vendorSelected: "Vendor B",
  vendorId: "64f000000000000000000002",
  attemptedVendors: ["Vendor A", "Vendor B"],
  reason:
    "Failover triggered. Selected next available vendor Vendor B (priority=2).",
  latencyMs: 340,
  status: "SUCCESS",
  errorMessage: null,
  requestPayload: { panNumber: "ABCDE1234F" },
  responsePayload: { vendor: "Vendor B", verified: true },
};

export const mockGeminiConfigResponse = {
  strategy: "WEIGHTED",
  vendorWeights: { "Vendor A": 70, "Vendor B": 30 },
  maxLatencyMs: null,
  notes: "Split traffic 70/30 between Vendor A and Vendor B.",
};

export const mockMetricsA = {
  vendorId: "64f000000000000000000001",
  vendorName: "Vendor A",
  totalRequests: 100,
  successfulRequests: 95,
  failedRequests: 5,
  totalLatencyMs: 12000,
  avgLatencyMs: 120,
  errorRate: 0.05,
  availability: 95,
  lastUpdated: new Date("2026-07-01T10:00:00Z"),
};