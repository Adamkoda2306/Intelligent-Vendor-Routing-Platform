import { Request, Response } from "express";
import { healthService } from "../services/health.service";
import { sendSuccess } from "../utils/apiResponse";

export const healthController = {
  async getHealth(_req: Request, res: Response) {
    const vendors = await healthService.getAllVendorHealth();
    sendSuccess(res, vendors, "Vendor health fetched successfully");
  },
};
