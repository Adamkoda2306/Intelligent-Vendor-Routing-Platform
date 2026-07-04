import { Router } from "express";
import { routeController } from "../controllers/route.controller";
import { asyncHandler } from "../utils/asyncHandler";
import { validateBody } from "../middlewares/validateRequest.middleware";

const router = Router();

router.post("/", validateBody(["capability", "payload"]), asyncHandler(routeController.route));

export default router;
