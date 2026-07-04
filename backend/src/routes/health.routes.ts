import { Router } from "express";
import { healthController } from "../controllers/health.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/", asyncHandler(healthController.getHealth));

export default router;
