import express, { Application } from "express";
import type { RequestHandler } from "express";
import cors from "cors";
import { env } from "./config/env";
import apiRoutes from "./routes/index";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.middleware";
import { dashboardRouter } from "logsave-hub";

const app: Application = express();

// Core middlewares
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());
app.use(requestLogger);

// Root health check
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Intelligent Vendor Routing Platform API is running",
  });
});

// Dashboard for Backend Logs
app.use("/logsave-hub", dashboardRouter as unknown as RequestHandler);

// API routes (mounted at root to match spec: /vendors, /route, /health, etc.)
app.use("/api/v1/", apiRoutes);

// 404 + error handling (must be registered last)
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
export default app;
