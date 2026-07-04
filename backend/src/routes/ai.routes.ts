import { Router } from "express";
import { aiController } from "../controllers/ai.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { validateBody } from "../middlewares/validateRequest.middleware";

const router = Router();

router.post(
  "/generate-config",
  validateBody(["instruction"]),
  asyncHandler(aiController.generateConfig)
);
router.post("/explain-route", asyncHandler(aiController.explainRoute));

export default router;
