import { mockVendorService } from "../../src/services/mockVendor.service";
import { VendorDocument } from "../../src/models/Vendor.model";
import { mockVendorA } from "../fixtures/mockData";

// Small latency so the (real) awaited setTimeout stays fast in tests
const fastVendor = {
  ...mockVendorA,
  avgLatencyMs: 60,
} as unknown as VendorDocument;

const payload = { panNumber: "ABCDE1234F" };

describe("mockVendorService.simulateCall", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a successful result when the failure roll does not trigger", async () => {
    // First random() call -> latency jitter, second -> failure roll.
    // 0.99 > failureRate(0.05) means "no failure".
    jest
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // latency jitter
      .mockReturnValueOnce(0.99); // failure roll: no failure

    const result = await mockVendorService.simulateCall(
      fastVendor,
      "PAN_VERIFICATION",
      payload
    );

    expect(result.success).toBe(true);
    expect(result.errorMessage).toBeUndefined();
    expect(result.data).toMatchObject({
      vendor: fastVendor.name,
      capability: "PAN_VERIFICATION",
      verified: true,
      echo: payload,
    });
    expect(typeof result.data!.processedAt).toBe("string");
  });

  it("returns a failure result when the failure roll triggers", async () => {
    // 0.0 < failureRate(0.05) means "failure"
    jest
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.5) // latency jitter
      .mockReturnValueOnce(0.0); // failure roll: failure

    const result = await mockVendorService.simulateCall(
      fastVendor,
      "PAN_VERIFICATION",
      payload
    );

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.errorMessage).toContain(fastVendor.name);
    expect(result.errorMessage).toContain("PAN_VERIFICATION");
    expect(result.errorMessage).toContain("simulated failure");
  });

  it("produces latency within +/- 40% jitter of avgLatencyMs (min 50ms)", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.99); // never fail

    const avg = fastVendor.avgLatencyMs; // 60
    const min = Math.max(50, avg - avg * 0.4); // 50
    const max = avg + avg * 0.4; // 84

    for (let i = 0; i < 5; i++) {
      const result = await mockVendorService.simulateCall(
        fastVendor,
        "PAN_VERIFICATION",
        payload
      );
      expect(result.latencyMs).toBeGreaterThanOrEqual(min);
      expect(result.latencyMs).toBeLessThanOrEqual(max);
    }
  });

  it("always fails for a vendor with failureRate = 1", async () => {
    const alwaysFailing = {
      ...mockVendorA,
      avgLatencyMs: 60,
      failureRate: 1,
    } as unknown as VendorDocument;

    const result = await mockVendorService.simulateCall(
      alwaysFailing,
      "KYC",
      payload
    );

    expect(result.success).toBe(false);
  });

  it("never fails for a vendor with failureRate = 0", async () => {
    const neverFailing = {
      ...mockVendorA,
      avgLatencyMs: 60,
      failureRate: 0,
    } as unknown as VendorDocument;

    const result = await mockVendorService.simulateCall(
      neverFailing,
      "KYC",
      payload
    );

    expect(result.success).toBe(true);
  });
});