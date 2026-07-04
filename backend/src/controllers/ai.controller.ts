import { Request, Response } from "express";
import { geminiService } from "../services/gemini.service";
import { logService } from "../services/log.service";
import { sendSuccess, sendError } from "../utils/apiResponse";

export const aiController = {
  /**
   * POST /ai/generate-config
   * Body: { "instruction": "Use Vendor A for 70% traffic. Vendor B for 30%..." }
   */
  async generateConfig(req: Request, res: Response) {
    const { instruction } = req.body;
    try {
      const config = await geminiService.generateRoutingConfig(instruction);
      sendSuccess(res, config, "Routing configuration generated successfully");
    } catch (error) {
      sendError(res, (error as Error).message, 502);
    }
  },

  /**
   * POST /ai/explain-route
   * Body: { "logId": "<routing log id>" }  OR  { "log": {...routingLogObject} }
   */
  async explainRoute(req: Request, res: Response) {
    try {
      let logData = req.body.log;

      if (!logData && req.body.logId) {
        const log = await logService.getLogById(req.body.logId);
        if (!log) {
          sendError(res, "Routing log not found", 404);
          return;
        }
        logData = log.toObject();
      }

      if (!logData) {
        sendError(res, "Provide either 'log' object or 'logId' in the request body", 400);
        return;
      }

      const explanation = await geminiService.explainRoutingDecision(logData);
      sendSuccess(res, { explanation }, "Routing decision explained successfully");
    } catch (error) {
      sendError(res, (error as Error).message, 502);
    }
  },
};
