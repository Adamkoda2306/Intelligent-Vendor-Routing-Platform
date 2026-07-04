import { Request, Response } from "express";
import { vendorService } from "../services/vendor.service";
import { sendSuccess, sendError } from "../utils/apiResponse";

export const vendorController = {
  async create(req: Request, res: Response) {
    const vendor = await vendorService.createVendor(req.body);
    sendSuccess(res, vendor, "Vendor created successfully", 201);
  },

  async getAll(_req: Request, res: Response) {
    const vendors = await vendorService.getAllVendors();
    sendSuccess(res, vendors, "Vendors fetched successfully");
  },

  async update(req: Request, res: Response) {
    const vendor = await vendorService.updateVendor(req.params.id, req.body);
    if (!vendor) {
      sendError(res, "Vendor not found", 404);
      return;
    }
    sendSuccess(res, vendor, "Vendor updated successfully");
  },

  async remove(req: Request, res: Response) {
    const vendor = await vendorService.deleteVendor(req.params.id);
    if (!vendor) {
      sendError(res, "Vendor not found", 404);
      return;
    }
    sendSuccess(res, vendor, "Vendor deleted successfully");
  },
};
