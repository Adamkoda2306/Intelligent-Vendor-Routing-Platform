import { Request, Response } from "express";
import { metricsService } from "../services/metrics.service";
import { sendSuccess } from "../utils/apiResponse";

export const metricsController = {
  async getVendorMetrics(_req: Request, res: Response) {
    const summary = await metricsService.getMetricsSummary();
    sendSuccess(res, summary, "Vendor metrics fetched successfully");
  },
};
