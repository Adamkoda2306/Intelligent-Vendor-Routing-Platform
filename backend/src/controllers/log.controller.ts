import { Request, Response } from "express";
import { logService } from "../services/log.service";
import { sendSuccess } from "../utils/apiResponse";

export const logController = {
  async getRoutingLogs(req: Request, res: Response) {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const logs = await logService.getLogs(limit);
    sendSuccess(res, logs, "Routing logs fetched successfully");
  },
};
