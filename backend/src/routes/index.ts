import { Router } from "express";
import vendorRoutes from "./vendor.routes";
import routeRoutes from "./route.routes";
import metricsRoutes from "./metrics.routes";
import logRoutes from "./log.routes";
import healthRoutes from "./health.routes";
import aiRoutes from "./ai.routes";

const router = Router();

router.use("/vendors", vendorRoutes);
router.use("/route", routeRoutes);
router.use("/vendor-metrics", metricsRoutes);
router.use("/routing-logs", logRoutes);
router.use("/health", healthRoutes);
router.use("/ai", aiRoutes);

export default router;
