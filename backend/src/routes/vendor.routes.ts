import { Router } from "express";
import { vendorController } from "../controllers/vendor.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { validateBody } from "../middlewares/validateRequest.middleware";

const router = Router();

router.post(
  "/",
  validateBody(["name", "cost", "avgLatencyMs", "capabilities"]),
  asyncHandler(vendorController.create)
);
router.get("/", asyncHandler(vendorController.getAll));
router.put("/:id", asyncHandler(vendorController.update));
router.delete("/:id", asyncHandler(vendorController.remove));

export default router;
