import { Server } from "socket.io";
import http from "http";
import enableLogging, { attachDashboard } from "logsave-hub";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import app from "./app";

const server = http.createServer(app);
const io = new Server(server);

// logsave-hub Configuration
attachDashboard(io);

enableLogging({
  override: true,
  outDir: "./logs",
  retention: false
});

async function startServer() {
  await connectDB();
  server.listen(env.PORT, () => {
    console.log(`[SERVER] Running on http://localhost:${env.PORT}`);
    console.log(`[SERVER] Environment: ${env.NODE_ENV}`);
  });
}

startServer();
