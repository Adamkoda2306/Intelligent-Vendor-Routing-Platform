import { Router } from "express";
import { logController } from "../controllers/log.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(logController.getRoutingLogs));

export default router;
