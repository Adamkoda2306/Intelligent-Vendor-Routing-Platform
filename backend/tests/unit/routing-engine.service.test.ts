import { routingEngineService } from "../../src/services/routingEngine.service";
import { VendorDocument } from "../../src/models/Vendor.model";
import {
  eligibleMockVendors,
  mockVendorA,
  mockVendorB,
  mockVendorC,
} from "../fixtures/mockData";

// The routing engine only reads plain fields, so plain objects cast to
// VendorDocument are enough — no DB required for these unit tests.
const vendors = eligibleMockVendors as unknown as VendorDocument[];

describe("routingEngineService.selectVendor", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws when the vendor pool is empty", () => {
    expect(() => routingEngineService.selectVendor([], {})).toThrow(
      "No eligible vendors available to route this request."
    );
  });

  describe("PRIORITY strategy", () => {
    it("picks the vendor with the lowest priority number", () => {
      const result = routingEngineService.selectVendor(vendors, {
        strategy: "PRIORITY",
      });

      expect(result.vendorName).toBe(mockVendorA.name);
      expect(result.vendorId).toBe(String(mockVendorA._id));
      expect(result.strategyUsed).toBe("PRIORITY");
      expect(result.reason).toContain("priority=1");
    });

    it("is used as the default when no strategy or flags are given", () => {
      const result = routingEngineService.selectVendor(vendors);
      expect(result.strategyUsed).toBe("PRIORITY");
      expect(result.vendorName).toBe(mockVendorA.name);
    });

    it("does not mutate the input array while sorting", () => {
      const copy = [...vendors];
      routingEngineService.selectVendor(vendors, { strategy: "PRIORITY" });
      expect(vendors).toEqual(copy);
    });
  });

  describe("LOWEST_COST strategy", () => {
    it("picks the cheapest vendor", () => {
      const result = routingEngineService.selectVendor(vendors, {
        strategy: "LOWEST_COST",
      });

      expect(result.vendorName).toBe(mockVendorC.name); // cost = 1
      expect(result.strategyUsed).toBe("LOWEST_COST");
      expect(result.reason).toContain("lowest cost");
    });

    it("is auto-selected when requirements.preferLowCost is true", () => {
      const result = routingEngineService.selectVendor(vendors, {
        preferLowCost: true,
      });
      expect(result.strategyUsed).toBe("LOWEST_COST");
      expect(result.vendorName).toBe(mockVendorC.name);
    });
  });

  describe("LOWEST_LATENCY strategy", () => {
    it("picks the fastest vendor", () => {
      const result = routingEngineService.selectVendor(vendors, {
        strategy: "LOWEST_LATENCY",
      });

      expect(result.vendorName).toBe(mockVendorA.name); // 120ms
      expect(result.strategyUsed).toBe("LOWEST_LATENCY");
    });

    it("respects maxLatency by filtering slower vendors out", () => {
      // Only Vendor A (120ms) fits under 200ms
      const result = routingEngineService.selectVendor(vendors, {
        strategy: "LOWEST_LATENCY",
        maxLatency: 200,
      });

      expect(result.vendorName).toBe(mockVendorA.name);
      expect(result.reason).toContain("200ms requirement");
    });

    it("falls back to the full pool when maxLatency filters everyone out", () => {
      const result = routingEngineService.selectVendor(vendors, {
        strategy: "LOWEST_LATENCY",
        maxLatency: 10, // nobody is this fast
      });

      // Fallback: fastest of the full pool
      expect(result.vendorName).toBe(mockVendorA.name);
    });

    it("is auto-selected when requirements.preferLowLatency is true", () => {
      const result = routingEngineService.selectVendor(vendors, {
        preferLowLatency: true,
      });
      expect(result.strategyUsed).toBe("LOWEST_LATENCY");
    });

    it("is auto-selected when only maxLatency is provided", () => {
      const result = routingEngineService.selectVendor(vendors, {
        maxLatency: 500,
      });
      expect(result.strategyUsed).toBe("LOWEST_LATENCY");
    });
  });

  describe("WEIGHTED strategy", () => {
    it("picks the first vendor when the random roll lands in its weight band", () => {
      // total weight = 70 + 20 + 10 = 100; roll of 0.1 * 100 = 10 <= 70 -> Vendor A
      jest.spyOn(Math, "random").mockReturnValue(0.1);

      const result = routingEngineService.selectVendor(vendors, {
        strategy: "WEIGHTED",
      });

      expect(result.vendorName).toBe(mockVendorA.name);
      expect(result.strategyUsed).toBe("WEIGHTED");
    });

    it("picks a later vendor when the roll lands past earlier weight bands", () => {
      // roll of 0.75 * 100 = 75 -> past A's 70, within B's band (70..90)
      jest.spyOn(Math, "random").mockReturnValue(0.75);

      const result = routingEngineService.selectVendor(vendors, {
        strategy: "WEIGHTED",
      });

      expect(result.vendorName).toBe(mockVendorB.name);
    });

    it("roughly follows the weight distribution over many rolls", () => {
      const counts: Record<string, number> = {};
      const iterations = 5000;

      for (let i = 0; i < iterations; i++) {
        const result = routingEngineService.selectVendor(vendors, {
          strategy: "WEIGHTED",
        });
        counts[result.vendorName] = (counts[result.vendorName] || 0) + 1;
      }

      const shareA = counts[mockVendorA.name] / iterations;
      const shareB = counts[mockVendorB.name] / iterations;
      const shareC = counts[mockVendorC.name] / iterations;

      // Generous tolerance so this never flakes
      expect(shareA).toBeGreaterThan(0.6);
      expect(shareA).toBeLessThan(0.8);
      expect(shareB).toBeGreaterThan(0.12);
      expect(shareB).toBeLessThan(0.28);
      expect(shareC).toBeGreaterThan(0.04);
      expect(shareC).toBeLessThan(0.16);
    });
  });
});

describe("routingEngineService.nextFailoverVendor", () => {
  it("returns the highest-priority vendor not yet attempted", () => {
    const result = routingEngineService.nextFailoverVendor(vendors, [
      String(mockVendorA._id),
    ]);

    expect(result).not.toBeNull();
    expect(result!.vendorName).toBe(mockVendorB.name);
    expect(result!.strategyUsed).toBe("FAILOVER");
    expect(result!.reason).toContain("Failover triggered");
  });

  it("skips multiple attempted vendors", () => {
    const result = routingEngineService.nextFailoverVendor(vendors, [
      String(mockVendorA._id),
      String(mockVendorB._id),
    ]);

    expect(result!.vendorName).toBe(mockVendorC.name);
  });

  it("returns null when every vendor has been attempted", () => {
    const result = routingEngineService.nextFailoverVendor(
      vendors,
      vendors.map((v) => String(v._id))
    );

    expect(result).toBeNull();
  });
});