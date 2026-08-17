const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

const Room = require("../models/Room");
const Tenant = require("../models/Tenant");
const Rental = require("../models/Rental");

const roomRoutes = require("../routes/room");
const errorHandlerMiddleware = require("../middleware/error-handler");
const { syncAllRoomsStatus } = require("../services/roomStatus");
const db = require("./db");

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.disconnect();
});

afterEach(async () => {
  await db.cleanup();
});

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { userId: new mongoose.Types.ObjectId(), name: "Test User" };
    next();
  });
  app.use("/api/v1/rooms", roomRoutes);
  app.use(errorHandlerMiddleware);
  return app;
};

describe("Room Controller", () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  it("marks a room rented when it has an active rental", async () => {
    const room = await Room.create({ number: "401" });
    const tenant = await Tenant.create({ name: "Renter" });

    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: new Date(Date.now() - 30 * DAY_MS),
      rentAmount: 500,
      dueDate: new Date(Date.now() + 5 * DAY_MS),
      createdBy: new mongoose.Types.ObjectId(),
    });

    const res = await request(app).get("/api/v1/rooms").expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.rooms[0].status).toBe("rented");
  });

  it("marks a room available when it has no active rental", async () => {
    await Room.create({ number: "402" });

    const res = await request(app).get("/api/v1/rooms").expect(200);

    expect(res.body.rooms[0].status).toBe("available");
  });

  it("filters rooms by status", async () => {
    const rentedRoom = await Room.create({ number: "403" });
    await Room.create({ number: "404" });
    const tenant = await Tenant.create({ name: "Renter" });

    await Rental.create({
      roomId: rentedRoom._id,
      tenantId: tenant._id,
      moveInDate: new Date(Date.now() - 30 * DAY_MS),
      rentAmount: 500,
      dueDate: new Date(Date.now() + 5 * DAY_MS),
      createdBy: new mongoose.Types.ObjectId(),
    });

    const rented = await request(app)
      .get("/api/v1/rooms?status=rented")
      .expect(200);
    expect(rented.body.total).toBe(1);
    expect(rented.body.rooms[0].number).toBe("403");

    const available = await request(app)
      .get("/api/v1/rooms?status=available")
      .expect(200);
    expect(available.body.total).toBe(1);
    expect(available.body.rooms[0].number).toBe("404");
  });

  it("computes status per selected month", async () => {
    const room = await Room.create({ number: "405" });
    const tenant = await Tenant.create({ name: "Renter" });

    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: new Date(2026, 0, 5),
      moveOutDate: new Date(2026, 0, 28),
      rentAmount: 500,
      dueDate: new Date(2026, 0, 1),
      createdBy: new mongoose.Types.ObjectId(),
    });

    const january = await request(app)
      .get("/api/v1/rooms?month=2026-01")
      .expect(200);
    expect(january.body.rooms[0].status).toBe("rented");

    const march = await request(app)
      .get("/api/v1/rooms?month=2026-03")
      .expect(200);
    expect(march.body.rooms[0].status).toBe("available");
  });

  it("returns 400 for an invalid month or status", async () => {
    await request(app).get("/api/v1/rooms?month=2026-13").expect(400);
    await request(app).get("/api/v1/rooms?month=not-a-month").expect(400);
    await request(app).get("/api/v1/rooms?status=nope").expect(400);
  });

  describe("POST /api/v1/rooms", () => {
    it("creates a room with default available status", async () => {
      const res = await request(app)
        .post("/api/v1/rooms")
        .send({ number: "501", description: "Room 501" })
        .expect(201);

      expect(res.body.room.number).toBe("501");
      expect(res.body.room.description).toBe("Room 501");
      expect(res.body.room.status).toBe("available");
    });

    it("returns 400 when number is missing", async () => {
      await request(app)
        .post("/api/v1/rooms")
        .send({ description: "no number" })
        .expect(400);
    });
  });

  describe("PUT /api/v1/rooms/:id", () => {
    it("updates a room's number and description", async () => {
      const room = await Room.create({ number: "601" });

      const res = await request(app)
        .put(`/api/v1/rooms/${room._id}`)
        .send({ number: "602", description: "Updated" })
        .expect(200);

      expect(res.body.room.number).toBe("602");
      expect(res.body.room.description).toBe("Updated");
    });

    it("does not allow updating the derived status", async () => {
      const room = await Room.create({ number: "603" });

      const res = await request(app)
        .put(`/api/v1/rooms/${room._id}`)
        .send({ status: "rented" })
        .expect(200);

      expect(res.body.room.status).toBe("available");
    });

    it("returns 404 for a non-existent room", async () => {
      const id = new mongoose.Types.ObjectId();
      await request(app)
        .put(`/api/v1/rooms/${id}`)
        .send({ number: "604" })
        .expect(404);
    });
  });

  describe("DELETE /api/v1/rooms/:id", () => {
    it("deletes a room", async () => {
      const room = await Room.create({ number: "701" });

      await request(app).delete(`/api/v1/rooms/${room._id}`).expect(200);

      const found = await Room.findById(room._id);
      expect(found).toBeNull();
    });

    it("returns 404 for a non-existent room", async () => {
      const id = new mongoose.Types.ObjectId();
      await request(app).delete(`/api/v1/rooms/${id}`).expect(404);
    });
  });

  describe("syncAllRoomsStatus", () => {
    it("flips a room to available once its rental's move-out date has passed", async () => {
      const room = await Room.create({ number: "801", status: "rented" });
      const tenant = await Tenant.create({ name: "Renter" });

      await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: new Date(Date.now() - 60 * DAY_MS),
        moveOutDate: new Date(Date.now() - 1 * DAY_MS),
        rentAmount: 500,
        dueDate: new Date(Date.now() - 30 * DAY_MS),
        createdBy: new mongoose.Types.ObjectId(),
      });

      const changed = await syncAllRoomsStatus();
      expect(changed).toBe(1);

      const updated = await Room.findById(room._id);
      expect(updated.status).toBe("available");
    });

    it("keeps a room rented while a rental is still active", async () => {
      const room = await Room.create({ number: "802", status: "rented" });
      const tenant = await Tenant.create({ name: "Renter" });

      await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: new Date(Date.now() - 30 * DAY_MS),
        rentAmount: 500,
        dueDate: new Date(Date.now() + 5 * DAY_MS),
        createdBy: new mongoose.Types.ObjectId(),
      });

      const changed = await syncAllRoomsStatus();
      expect(changed).toBe(0);

      const updated = await Room.findById(room._id);
      expect(updated.status).toBe("rented");
    });
  });
});
