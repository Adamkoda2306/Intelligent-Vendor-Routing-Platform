import { Vendor, VendorDocument } from "../models/Vendor.model";
import { CreateVendorDTO, UpdateVendorDTO } from "../types/vendor.types";

/**
 * Handles all direct database operations for vendors.
 * Controllers should never talk to the Vendor model directly.
 */
export const vendorService = {
  async createVendor(data: CreateVendorDTO): Promise<VendorDocument> {
    return Vendor.create(data);
  },

  async getAllVendors(): Promise<VendorDocument[]> {
    return Vendor.find().sort({ priority: 1 });
  },

  async getVendorById(id: string): Promise<VendorDocument | null> {
    return Vendor.findById(id);
  },

  async updateVendor(id: string, data: UpdateVendorDTO): Promise<VendorDocument | null> {
    return Vendor.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  },

  async deleteVendor(id: string): Promise<VendorDocument | null> {
    return Vendor.findByIdAndDelete(id);
  },

  /**
   * Returns vendors that support a given capability, are enabled,
   * and are not fully OFFLINE. Used by the routing engine.
   */
  async getEligibleVendors(capability: string): Promise<VendorDocument[]> {
    return Vendor.find({
      capabilities: capability,
      enabled: true,
      healthStatus: { $ne: "OFFLINE" },
    });
  },
};
