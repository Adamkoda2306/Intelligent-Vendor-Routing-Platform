import { metricsService } from "../../src/services/metrics.service";
import { Metrics } from "../../src/models/Metrics.model";
import { VendorDocument } from "../../src/models/Vendor.model";
import { mockVendorA, mockMetricsA } from "../fixtures/mock-data";

// Fully mock the Mongoose model — no DB involved in unit tests
jest.mock("../../src/models/Metrics.model", () => ({
  Metrics: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  },
}));

const mockedMetrics = Metrics as jest.Mocked<typeof Metrics>;
const vendorA = mockVendorA as unknown as VendorDocument;

describe("metricsService.recordResult", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a fresh metrics doc on the first ever request (upsert)", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue(null);
    (mockedMetrics.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await metricsService.recordResult(vendorA, true, 150);

    expect(mockedMetrics.findOneAndUpdate).toHaveBeenCalledWith(
      { vendorId: vendorA._id },
      expect.objectContaining({
        vendorName: vendorA.name,
        totalRequests: 1,
        successfulRequests: 1,
        failedRequests: 0,
        totalLatencyMs: 150,
        avgLatencyMs: 150,
        errorRate: 0,
        availability: 100,
      }),
      { upsert: true, new: true }
    );
  });

  it("increments counters and recomputes averages on subsequent successes", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue({
      totalRequests: 9,
      successfulRequests: 8,
      failedRequests: 1,
      totalLatencyMs: 900,
    });
    (mockedMetrics.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await metricsService.recordResult(vendorA, true, 100);

    expect(mockedMetrics.findOneAndUpdate).toHaveBeenCalledWith(
      { vendorId: vendorA._id },
      expect.objectContaining({
        totalRequests: 10,
        successfulRequests: 9,
        failedRequests: 1,
        totalLatencyMs: 1000,
        avgLatencyMs: 100,
        errorRate: 0.1,
        availability: 90,
      }),
      { upsert: true, new: true }
    );
  });

  it("increments failedRequests and errorRate on a failure", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue({
      totalRequests: 3,
      successfulRequests: 3,
      failedRequests: 0,
      totalLatencyMs: 300,
    });
    (mockedMetrics.findOneAndUpdate as jest.Mock).mockResolvedValue({});

    await metricsService.recordResult(vendorA, false, 500);

    const update = (mockedMetrics.findOneAndUpdate as jest.Mock).mock
      .calls[0][1];

    expect(update.totalRequests).toBe(4);
    expect(update.successfulRequests).toBe(3);
    expect(update.failedRequests).toBe(1);
    expect(update.errorRate).toBe(0.25);
    expect(update.availability).toBe(75);
    expect(update.avgLatencyMs).toBe(200); // (300 + 500) / 4
  });
});

describe("metricsService.getMetricsSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("aggregates totals across all vendors", async () => {
    (mockedMetrics.find as jest.Mock).mockResolvedValue([
      { ...mockMetricsA },
      {
        ...mockMetricsA,
        vendorName: "Vendor B",
        totalRequests: 50,
        successfulRequests: 40,
        failedRequests: 10,
        avgLatencyMs: 300,
      },
    ]);

    const summary = await metricsService.getMetricsSummary();

    expect(summary.totalRequests).toBe(150);
    expect(summary.successfulRequests).toBe(135);
    expect(summary.failedRequests).toBe(15);
    expect(summary.avgLatencyMs).toBe(210); // (120 + 300) / 2
    expect(summary.errorRate).toBe(0.1); // 15 / 150
    expect(summary.vendors).toHaveLength(2);
  });

  it("returns zeros when no metrics exist yet", async () => {
    (mockedMetrics.find as jest.Mock).mockResolvedValue([]);

    const summary = await metricsService.getMetricsSummary();

    expect(summary).toMatchObject({
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgLatencyMs: 0,
      errorRate: 0,
    });
    expect(summary.vendors).toEqual([]);
  });
});