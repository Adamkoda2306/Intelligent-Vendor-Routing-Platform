import { Router } from "express";
import { metricsController } from "../controllers/metrics.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(metricsController.getVendorMetrics));

export default router;
