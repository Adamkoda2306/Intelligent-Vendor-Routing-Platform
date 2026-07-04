import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/apiResponse";

/**
 * Validates that all required top-level fields exist on req.body.
 * Simple, dependency-free validation suitable for this project's scope.
 */
export function validateBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = requiredFields.filter((field) => {
      const value = req.body?.[field];
      return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
      sendError(res, `Missing required field(s): ${missing.join(", ")}`, 400);
      return;
    }

    next();
  };
}
