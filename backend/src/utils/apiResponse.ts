import { Response } from "express";

/**
 * Sends a consistent success response shape across all endpoints.
 */
export function sendSuccess<T>(res: Response, data: T, message = "Success", statusCode = 200): Response {
  return res.status(statusCode).json({ success: true, data, message });
}

/**
 * Sends a consistent error response shape across all endpoints.
 */
export function sendError(res: Response, error: string, statusCode = 500): Response {
  return res.status(statusCode).json({ success: false, error });
}
