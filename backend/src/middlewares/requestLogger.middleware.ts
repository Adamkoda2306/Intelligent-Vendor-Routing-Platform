import { Request, Response, NextFunction } from "express";

/**
 * Lightweight console logger for every incoming HTTP request.
 * Not to be confused with routing logs stored in MongoDB.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
}
