import request from "supertest";
import app from "../../src/app";
import { Vendor } from "../../src/models/Vendor.model";
import {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} from "../setup.db";
import { mockVendorA, mockVendorB } from "../fixtures/mock-data";

// Strip _id so Mongo generates real ObjectIds for created docs
const vendorPayloadA = (({ _id, ...rest }) => rest)(mockVendorA);
const vendorPayloadB = (({ _id, ...rest }) => rest)(mockVendorB);

const BASE = "/api/v1/vendors";

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe(`POST ${BASE}`, () => {
  it("creates a vendor and returns 201 with the saved document", async () => {
    const res = await request(app).post(BASE).send(vendorPayloadA);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      name: "Vendor A",
      priority: 1,
      cost: 5,
      capabilities: expect.arrayContaining(["PAN_VERIFICATION", "KYC"]),
    });
    expect(res.body.data._id).toBeDefined();

    const inDb = await Vendor.findById(res.body.data._id);
    expect(inDb).not.toBeNull();
    expect(inDb!.name).toBe("Vendor A");
  });
});

describe(`GET ${BASE}`, () => {
  it("returns an empty list when no vendors exist", async () => {
    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it("returns all vendors sorted by priority ascending", async () => {
    await Vendor.create(vendorPayloadB); // priority 2
    await Vendor.create(vendorPayloadA); // priority 1

    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toBe("Vendor A");
    expect(res.body.data[1].name).toBe("Vendor B");
  });
});

describe(`PUT ${BASE}/:id`, () => {
  it("updates an existing vendor and returns the new version", async () => {
    const vendor = await Vendor.create(vendorPayloadA);

    const res = await request(app)
      .put(`${BASE}/${vendor._id}`)
      .send({ cost: 9, enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.cost).toBe(9);
    expect(res.body.data.enabled).toBe(false);
    // untouched fields preserved
    expect(res.body.data.name).toBe("Vendor A");
  });

  it("returns 404 for a well-formed but unknown id", async () => {
    const res = await request(app)
      .put(`${BASE}/64f0000000000000000000ff`)
      .send({ cost: 9 });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe(`DELETE ${BASE}/:id`, () => {
  it("deletes an existing vendor", async () => {
    const vendor = await Vendor.create(vendorPayloadA);

    const res = await request(app).delete(`${BASE}/${vendor._id}`);

    expect(res.status).toBe(200);
    expect(await Vendor.findById(vendor._id)).toBeNull();
  });

  it("returns 404 when the vendor does not exist", async () => {
    const res = await request(app).delete(
      `${BASE}/64f0000000000000000000ff`
    );

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});