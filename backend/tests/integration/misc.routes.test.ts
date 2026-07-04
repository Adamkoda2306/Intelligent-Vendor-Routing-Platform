import request from "supertest";
import app from "../../src/app";
import { Vendor } from "../../src/models/Vendor.model";
import { Metrics } from "../../src/models/Metrics.model";
import { RoutingLog } from "../../src/models/RoutingLog.model";
import { geminiService } from "../../src/services/gemini.service";
import {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} from "../setup.db";
import {
  mockVendorA,
  mockVendorB,
  mockMetricsA,
  mockRoutingLog,
  mockFailoverRoutingLog,
  mockGeminiConfigResponse,
} from "../fixtures/mockData";

const strip = ({ _id, ...rest }: Record<string, unknown>) => rest;

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

afterEach(async () => {
  await clearTestDb();
  jest.restoreAllMocks();
});

describe("GET /api/v1/health", () => {
  it("returns every vendor's health status sorted by name", async () => {
    await Vendor.create([strip(mockVendorB), strip(mockVendorA)]);

    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe("Vendor A");
    expect(res.body.data[0]).toMatchObject({
      healthStatus: "HEALTHY",
      enabled: true,
      priority: 1,
    });
    // select() means heavy fields are not returned
    expect(res.body.data[0].capabilities).toBeUndefined();
  });
});

describe("GET /api/v1/vendor-metrics", () => {
  it("returns an aggregated summary plus per-vendor metrics", async () => {
    await Metrics.create([
      strip(mockMetricsA),
      {
        ...strip(mockMetricsA),
        vendorId: "64f000000000000000000002",
        vendorName: "Vendor B",
        totalRequests: 50,
        successfulRequests: 45,
        failedRequests: 5,
        avgLatencyMs: 300,
      },
    ]);

    const res = await request(app).get("/api/v1/vendor-metrics");

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalRequests: 150,
      successfulRequests: 140,
      failedRequests: 10,
      avgLatencyMs: 210,
    });
    expect(res.body.data.vendors).toHaveLength(2);
  });

  it("returns zeros with no traffic yet", async () => {
    const res = await request(app).get("/api/v1/vendor-metrics");

    expect(res.status).toBe(200);
    expect(res.body.data.totalRequests).toBe(0);
    expect(res.body.data.vendors).toEqual([]);
  });
});

describe("GET /api/v1/routing-logs", () => {
  it("returns logs newest-first", async () => {
    await RoutingLog.create(mockRoutingLog);
    await new Promise((r) => setTimeout(r, 20)); // ensure distinct createdAt
    await RoutingLog.create(mockFailoverRoutingLog);

    const res = await request(app).get("/api/v1/routing-logs");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].strategyUsed).toBe("FAILOVER"); // newest first
    expect(res.body.data[1].strategyUsed).toBe("PRIORITY");
  });

  it("respects the ?limit= query param", async () => {
    await RoutingLog.create(mockRoutingLog);
    await RoutingLog.create(mockFailoverRoutingLog);
    await RoutingLog.create(mockRoutingLog);

    const res = await request(app).get("/api/v1/routing-logs?limit=2");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe("POST /api/v1/ai/generate-config", () => {
  it("returns the config produced by the Gemini service (mocked)", async () => {
    jest
      .spyOn(geminiService, "generateRoutingConfig")
      .mockResolvedValue(mockGeminiConfigResponse);

    const res = await request(app)
      .post("/api/v1/ai/generate-config")
      .send({ instruction: "70% to Vendor A, 30% to Vendor B" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(mockGeminiConfigResponse);
    expect(geminiService.generateRoutingConfig).toHaveBeenCalledWith(
      "70% to Vendor A, 30% to Vendor B"
    );
  });

  it("returns 502 when the Gemini service throws", async () => {
    jest
      .spyOn(geminiService, "generateRoutingConfig")
      .mockRejectedValue(new Error("Gemini is unavailable"));

    const res = await request(app)
      .post("/api/v1/ai/generate-config")
      .send({ instruction: "anything" });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/v1/ai/explain-route", () => {
  it("explains a log passed inline as 'log'", async () => {
    jest
      .spyOn(geminiService, "explainRoutingDecision")
      .mockResolvedValue("Vendor A was picked because it had top priority.");

    const res = await request(app)
      .post("/api/v1/ai/explain-route")
      .send({ log: mockRoutingLog });

    expect(res.status).toBe(200);
    expect(res.body.data.explanation).toBe(
      "Vendor A was picked because it had top priority."
    );
  });

  it("looks up the log by 'logId' from the database", async () => {
    const saved = await RoutingLog.create(mockRoutingLog);
    const explainSpy = jest
      .spyOn(geminiService, "explainRoutingDecision")
      .mockResolvedValue("Explained.");

    const res = await request(app)
      .post("/api/v1/ai/explain-route")
      .send({ logId: String(saved._id) });

    expect(res.status).toBe(200);
    expect(explainSpy).toHaveBeenCalledWith(
      expect.objectContaining({ vendorSelected: "Vendor A" })
    );
  });

  it("returns 404 for an unknown logId", async () => {
    const res = await request(app)
      .post("/api/v1/ai/explain-route")
      .send({ logId: "64f0000000000000000000ff" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 when neither 'log' nor 'logId' is provided", async () => {
    const res = await request(app).post("/api/v1/ai/explain-route").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe("GET / (root health check)", () => {
  it("confirms the API is running", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("404 handler", () => {
  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});