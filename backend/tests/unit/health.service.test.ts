import { healthService } from "../../src/services/health.service";
import { Vendor } from "../../src/models/Vendor.model";
import { Metrics } from "../../src/models/Metrics.model";

jest.mock("../../src/models/Vendor.model", () => ({
  Vendor: {
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock("../../src/models/Metrics.model", () => ({
  Metrics: {
    findOne: jest.fn(),
  },
}));

const mockedVendor = Vendor as jest.Mocked<typeof Vendor>;
const mockedMetrics = Metrics as jest.Mocked<typeof Metrics>;

const VENDOR_ID = "64f000000000000000000001";

describe("healthService.evaluateVendorHealth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does nothing when there are no metrics for the vendor", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue(null);

    await healthService.evaluateVendorHealth(VENDOR_ID);

    expect(mockedVendor.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("does nothing with fewer than 5 requests (not enough data)", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue({
      totalRequests: 4,
      errorRate: 1, // even a 100% error rate is ignored with too little data
    });

    await healthService.evaluateVendorHealth(VENDOR_ID);

    expect(mockedVendor.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("marks the vendor HEALTHY below the 20% error threshold", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue({
      totalRequests: 20,
      errorRate: 0.1,
    });

    await healthService.evaluateVendorHealth(VENDOR_ID);

    expect(mockedVendor.findByIdAndUpdate).toHaveBeenCalledWith(VENDOR_ID, {
      healthStatus: "HEALTHY",
    });
  });

  it("marks the vendor WARNING at exactly 20% error rate (boundary)", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue({
      totalRequests: 20,
      errorRate: 0.2,
    });

    await healthService.evaluateVendorHealth(VENDOR_ID);

    expect(mockedVendor.findByIdAndUpdate).toHaveBeenCalledWith(VENDOR_ID, {
      healthStatus: "WARNING",
    });
  });

  it("marks the vendor OFFLINE at exactly 50% error rate (boundary)", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue({
      totalRequests: 20,
      errorRate: 0.5,
    });

    await healthService.evaluateVendorHealth(VENDOR_ID);

    expect(mockedVendor.findByIdAndUpdate).toHaveBeenCalledWith(VENDOR_ID, {
      healthStatus: "OFFLINE",
    });
  });

  it("marks the vendor OFFLINE above 50% error rate", async () => {
    (mockedMetrics.findOne as jest.Mock).mockResolvedValue({
      totalRequests: 100,
      errorRate: 0.9,
    });

    await healthService.evaluateVendorHealth(VENDOR_ID);

    expect(mockedVendor.findByIdAndUpdate).toHaveBeenCalledWith(VENDOR_ID, {
      healthStatus: "OFFLINE",
    });
  });
});

describe("healthService.getAllVendorHealth", () => {
  it("queries vendors with only the health-related fields, sorted by name", async () => {
    const sortMock = jest.fn().mockResolvedValue([]);
    const selectMock = jest.fn().mockReturnValue({ sort: sortMock });
    (mockedVendor.find as jest.Mock).mockReturnValue({ select: selectMock });

    await healthService.getAllVendorHealth();

    expect(mockedVendor.find).toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalledWith(
      "name healthStatus enabled priority"
    );
    expect(sortMock).toHaveBeenCalledWith({ name: 1 });
  });
});