/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  // Sets env vars BEFORE any module (including src/config/env.ts) loads
  setupFiles: ["<rootDir>/src/config/env.ts"],
  // Integration tests spin up an in-memory Mongo — give them headroom
  testTimeout: 30000,
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/server.ts",
    "!src/utils/seed*.ts",
  ],
  coverageDirectory: "coverage",
  verbose: true,
};