import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/apiResponse";

/**
 * Centralized error handler. Any error passed to next() lands here.
 * Keeps controllers free of repetitive try/catch response formatting.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error("[ERROR]", err.message);
  sendError(res, err.message || "Internal Server Error", 500);
}

/**
 * Catches requests to routes that don't exist.
 */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
}
