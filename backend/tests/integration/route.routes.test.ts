import request from "supertest";
import app from "../../src/app";
import { Vendor } from "../../src/models/Vendor.model";
import { Metrics } from "../../src/models/Metrics.model";
import { RoutingLog } from "../../src/models/RoutingLog.model";
import { mockVendorService } from "../../src/services/mockVendor.service";
import {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} from "../setup.db";
import {
  mockVendorA,
  mockVendorB,
  mockVendorC,
  mockVendorDisabled,
  mockVendorOffline,
  mockRoutePayload,
} from "../fixtures/mockData";

const BASE = "/api/v1/route";

const strip = ({ _id, ...rest }: Record<string, unknown>) => rest;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

afterEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
});

async function seedVendors() {
  await Vendor.create([
    strip(mockVendorA),
    strip(mockVendorB),
    strip(mockVendorC),
    strip(mockVendorDisabled),
    strip(mockVendorOffline),
  ]);
}

/** Forces the simulated vendor call to succeed/fail deterministically */
function mockVendorCall(results: Array<{ success: boolean }>) {
  const spy = jest.spyOn(mockVendorService, "simulateCall");
  results.forEach((r) => {
    spy.mockResolvedValueOnce(
      r.success
        ? {
            success: true,
            latencyMs: 100,
            data: { verified: true },
          }
        : {
            success: false,
            latencyMs: 100,
            errorMessage: "simulated failure",
          }
    );
  });
  return spy;
}

describe(`POST ${BASE}`, () => {
  it("routes to the highest-priority vendor by default and logs the decision", async () => {
    await seedVendors();
    mockVendorCall([{ success: true }]);

    const res = await request(app).post(BASE).send(mockRoutePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      strategyUsed: "PRIORITY",
      vendorSelected: "Vendor A",
      attemptedVendors: ["Vendor A"],
      status: "SUCCESS",
    });

    // The decision must be persisted as a routing log
    const logs = await RoutingLog.find();
    expect(logs).toHaveLength(1);
    expect(logs[0].vendorSelected).toBe("Vendor A");
    expect(logs[0].status).toBe("SUCCESS");

    // And metrics must be recorded for the attempted vendor
    const metrics = await Metrics.findOne({ vendorName: "Vendor A" });
    expect(metrics).not.toBeNull();
    expect(metrics!.totalRequests).toBe(1);
    expect(metrics!.successfulRequests).toBe(1);
  });

  it("uses LOWEST_COST strategy when requested", async () => {
    await seedVendors();
    mockVendorCall([{ success: true }]);

    const res = await request(app)
      .post(BASE)
      .send({
        ...mockRoutePayload,
        requirements: { strategy: "LOWEST_COST" },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.strategyUsed).toBe("LOWEST_COST");
    expect(res.body.data.vendorSelected).toBe("Vendor C"); // cost = 1
  });

  it("uses LOWEST_LATENCY strategy when preferLowLatency is set", async () => {
    await seedVendors();
    mockVendorCall([{ success: true }]);

    const res = await request(app)
      .post(BASE)
      .send({
        ...mockRoutePayload,
        requirements: { preferLowLatency: true },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.strategyUsed).toBe("LOWEST_LATENCY");
    expect(res.body.data.vendorSelected).toBe("Vendor A"); // 120ms
  });

  it("fails over to the next vendor when the first call fails", async () => {
    await seedVendors();
    // Vendor A fails, failover to Vendor B succeeds
    mockVendorCall([{ success: false }, { success: true }]);

    const res = await request(app).post(BASE).send(mockRoutePayload);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      strategyUsed: "FAILOVER",
      vendorSelected: "Vendor B",
      attemptedVendors: ["Vendor A", "Vendor B"],
      status: "SUCCESS",
    });

    // Metrics recorded for BOTH attempted vendors
    const metricsA = await Metrics.findOne({ vendorName: "Vendor A" });
    const metricsB = await Metrics.findOne({ vendorName: "Vendor B" });
    expect(metricsA!.failedRequests).toBe(1);
    expect(metricsB!.successfulRequests).toBe(1);
  });

  it("returns 502 with a FAILED log when every eligible vendor fails", async () => {
    await seedVendors();
    mockVendorCall([
      { success: false },
      { success: false },
      { success: false },
    ]);

    const res = await request(app).post(BASE).send(mockRoutePayload);

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);

    const logs = await RoutingLog.find();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("FAILED");
    expect(logs[0].attemptedVendors).toEqual([
      "Vendor A",
      "Vendor B",
      "Vendor C",
    ]);
  });

  it("never routes to disabled or OFFLINE vendors", async () => {
    // Only the disabled + offline vendors support this capability
    await Vendor.create([strip(mockVendorDisabled), strip(mockVendorOffline)]);

    const res = await request(app).post(BASE).send(mockRoutePayload);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message || res.body.error).toContain(
      "No eligible vendors"
    );
  });

  it("returns 404 for a capability no vendor supports", async () => {
    await seedVendors();

    const res = await request(app)
      .post(BASE)
      .send({ ...mockRoutePayload, capability: "FACE_MATCH" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});