import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Spins up an in-memory MongoDB for integration tests.
 * No local mongod or Atlas cluster required — completely isolated per run.
 *
 * Usage in a test file:
 *
 *   beforeAll(connectTestDb);
 *   afterEach(clearTestDb);
 *   afterAll(disconnectTestDb);
 */
let mongoServer: MongoMemoryServer;

export async function connectTestDb(): Promise<void> {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

export async function clearTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

export async function disconnectTestDb(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongoServer.stop();
}