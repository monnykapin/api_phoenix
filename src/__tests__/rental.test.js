const mongoose = require("mongoose");
const request = require("supertest");
const express = require("express");

const Room = require("../models/Room");
const Tenant = require("../models/Tenant");
const Rental = require("../models/Rental");
const RentalPayment = require("../models/RentalPayment");

const {
  computeRentalStatus,
  daysUntilDue,
  isDueSoon,
  monthKey,
} = require("../utils/rentalStatus");
const { resolveMonthStatuses } = require("../services/paymentStatus");

const rentalRoutes = require("../routes/rental");
const errorHandlerMiddleware = require("../middleware/error-handler");
const db = require("./db");

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.disconnect();
});

afterEach(async () => {
  await db.cleanup();
});

// App factory with mocked auth. Pass a userId so req.user matches test data.
const createApp = (userId) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { userId: userId || new mongoose.Types.ObjectId(), name: "Test User" };
    next();
  });
  app.use("/api/v1/rentals", rentalRoutes);
  app.use(errorHandlerMiddleware);
  return app;
};

describe("rentalStatus util", () => {
  it("returns paid when a payment is recorded on/before due date", () => {
    expect(computeRentalStatus({ paymentDate: daysFromNow(-5), dueDate: daysFromNow(-1) })).toBe("paid");
  });

  it("returns paid for a late payment", () => {
    expect(computeRentalStatus({ paymentDate: daysFromNow(2), dueDate: daysFromNow(-1) })).toBe("paid");
  });

  it("returns overdue when due date passed with no payment", () => {
    expect(computeRentalStatus({ paymentDate: null, dueDate: daysFromNow(-3) })).toBe("overdue");
  });

  it("returns paid (prepaid) when more than 3 days before due with no payment", () => {
    expect(computeRentalStatus({ paymentDate: null, dueDate: daysFromNow(10) })).toBe("paid");
    expect(computeRentalStatus({ paymentDate: null, dueDate: daysFromNow(4) })).toBe("paid");
  });

  it("returns pending within 3 days before the due date", () => {
    expect(computeRentalStatus({ paymentDate: null, dueDate: daysFromNow(3) })).toBe("pending");
    expect(computeRentalStatus({ paymentDate: null, dueDate: daysFromNow(0) })).toBe("pending");
  });

  it("computes daysUntilDue correctly", () => {
    expect(daysUntilDue(daysFromNow(5))).toBe(5);
    expect(daysUntilDue(daysFromNow(-2))).toBe(-2);
    expect(daysUntilDue(daysFromNow(0))).toBe(0);
  });

  it("flags dueSoon only within the 3-day window", () => {
    expect(isDueSoon(daysFromNow(3))).toBe(true);
    expect(isDueSoon(daysFromNow(0))).toBe(true);
    expect(isDueSoon(daysFromNow(4))).toBe(false);
    expect(isDueSoon(daysFromNow(-1))).toBe(false);
  });

  it("formats a date as its YYYY-MM month key", () => {
    expect(monthKey(new Date(2026, 6, 25))).toBe("2026-07");
    expect(monthKey(new Date(2026, 0, 1))).toBe("2026-01");
  });

  describe("resolveMonthStatuses service", () => {
    it("prefers an explicit RentalPayment record for the month", async () => {
      const room = await Room.create({ number: "301" });
      const tenant = await Tenant.create({ name: "Tenant" });
      const userId = new mongoose.Types.ObjectId();
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: new Date(2026, 6, 1),
        rentAmount: 500,
        dueDate: new Date(2026, 6, 25),
        paymentStatus: "unpaid",
        createdBy: userId,
      });
      await RentalPayment.create({
        rentalId: rental._id,
        month: "2026-07",
        status: "paid",
        createdBy: userId,
      });

      const statuses = await resolveMonthStatuses([rental], "2026-07");
      expect(statuses).toEqual([
        { status: "paid", paymentDate: null, amount: null },
      ]);
    });

    it("falls back to paymentDate-in-month, then current status", async () => {
      const room = await Room.create({ number: "302" });
      const tenant = await Tenant.create({ name: "Tenant" });
      const userId = new mongoose.Types.ObjectId();
      const paidInJuly = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: new Date(2026, 6, 1),
        rentAmount: 500,
        dueDate: new Date(2026, 6, 25),
        paymentDate: new Date(2026, 6, 25),
        paymentStatus: "unpaid",
        createdBy: userId,
      });
      const noRecord = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: new Date(2026, 7, 1),
        rentAmount: 500,
        dueDate: new Date(2026, 8, 1),
        paymentStatus: "overdue",
        createdBy: userId,
      });

      const statuses = await resolveMonthStatuses(
        [paidInJuly, noRecord],
        "2026-07"
      );
      expect(statuses).toEqual([
        { status: "paid", paymentDate: paidInJuly.paymentDate, amount: null },
        { status: "overdue", paymentDate: null, amount: null },
      ]);
    });
  });
});

describe("Rental Model", () => {
  it("keeps an empty paymentStatus on create", async () => {
    const room = await Room.create({ number: "201" });
    const tenant = await Tenant.create({ name: "Tenant One" });

    const rental = await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 500,
      dueDate: daysFromNow(-1),
      createdBy: new mongoose.Types.ObjectId(),
    });

    // New rentals are not assigned a status until the cron / a payment runs.
    expect(rental.paymentStatus).toBe("");
  });

  it("rejects invalid paymentStatus enum", async () => {
    const room = await Room.create({ number: "202" });
    const tenant = await Tenant.create({ name: "Tenant Two" });

    await expect(
      Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 500,
        dueDate: daysFromNow(1),
        paymentStatus: "bogus",
        createdBy: new mongoose.Types.ObjectId(),
      })
    ).rejects.toThrow();
  });

  it("requires required fields", async () => {
    await expect(Rental.create({})).rejects.toThrow();
  });
});

describe("Rental Controller", () => {
  let app;
  let room;
  let tenant;
  let userId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();
    app = createApp(userId);
    room = await Room.create({ number: "301" });
    tenant = await Tenant.create({ name: "Controller Tenant" });
  });

  describe("POST /api/v1/rentals", () => {
    it("creates a rental with an empty status", async () => {
      const res = await request(app)
        .post("/api/v1/rentals")
        .send({
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: daysFromNow(-30),
          rentAmount: 400,
          dueDate: daysFromNow(-2),
        })
        .expect(201);

      expect(res.body.rental.paymentStatus).toBe("");
      expect(res.body.rental.rentAmount).toBe(400);
    });

    it("returns 400 when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/v1/rentals")
        .send({ rentAmount: 400 })
        .expect(400);

      expect(res.body.msg).toBeDefined();
    });

    it("creates a rental without a tenant", async () => {
      const res = await request(app)
        .post("/api/v1/rentals")
        .send({
          roomId: room._id,
          moveInDate: daysFromNow(-30),
          rentAmount: 400,
          dueDate: daysFromNow(10),
        })
        .expect(201);

      expect(res.body.rental.tenantId).toBeNull();
    });

    it("rejects a new rental when the room already has an active rental", async () => {
      // Existing tenant still occupying (no move-out date).
      await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(10),
        createdBy: userId,
      });

      const res = await request(app)
        .post("/api/v1/rentals")
        .send({
          roomId: room._id,
          moveInDate: daysFromNow(0),
          rentAmount: 500,
          dueDate: daysFromNow(30),
        })
        .expect(409);

      expect(res.body.msg).toContain("not available");
    });

    it("rejects a same-day move-in when the previous tenant moved out today", async () => {
      // Previous tenant moved out today (still occupies today at day granularity).
      await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        moveOutDate: daysFromNow(0),
        rentAmount: 400,
        dueDate: daysFromNow(-1),
        createdBy: userId,
      });

      const res = await request(app)
        .post("/api/v1/rentals")
        .send({
          roomId: room._id,
          moveInDate: daysFromNow(0),
          rentAmount: 500,
          dueDate: daysFromNow(30),
        })
        .expect(409);

      expect(res.body.msg).toContain("not available");
    });

    it("allows a move-in the day after the previous tenant moved out", async () => {
      // Previous tenant moved out today.
      await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        moveOutDate: daysFromNow(0),
        rentAmount: 400,
        dueDate: daysFromNow(-1),
        createdBy: userId,
      });

      const res = await request(app)
        .post("/api/v1/rentals")
        .send({
          roomId: room._id,
          moveInDate: daysFromNow(1),
          rentAmount: 500,
          dueDate: daysFromNow(30),
        })
        .expect(201);

      expect(res.body.rental.paymentStatus).toBe("");
    });

    it("allows a future rental that does not overlap an existing stay", async () => {
      // Existing tenant moves out in 10 days.
      await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        moveOutDate: daysFromNow(10),
        rentAmount: 400,
        dueDate: daysFromNow(-1),
        createdBy: userId,
      });

      const res = await request(app)
        .post("/api/v1/rentals")
        .send({
          roomId: room._id,
          moveInDate: daysFromNow(11),
          rentAmount: 500,
          dueDate: daysFromNow(40),
        })
        .expect(201);

      expect(res.body.rental.rentAmount).toBe(500);
    });

    it("rejects a future rental that overlaps an existing stay", async () => {
      // Existing tenant moves out in 10 days.
      await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        moveOutDate: daysFromNow(10),
        rentAmount: 400,
        dueDate: daysFromNow(-1),
        createdBy: userId,
      });

      const res = await request(app)
        .post("/api/v1/rentals")
        .send({
          roomId: room._id,
          moveInDate: daysFromNow(5),
          rentAmount: 500,
          dueDate: daysFromNow(30),
        })
        .expect(409);

      expect(res.body.msg).toContain("not available");
    });
  });

  describe("GET /api/v1/rentals", () => {
    it("filters by status", async () => {
      await Rental.create([
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: daysFromNow(-30),
          rentAmount: 100,
          dueDate: daysFromNow(-5),
          paymentStatus: "overdue",
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: daysFromNow(-30),
          rentAmount: 200,
          dueDate: daysFromNow(10),
          paymentStatus: "paid",
          createdBy: userId,
        },
      ]);

      const res = await request(app)
        .get("/api/v1/rentals?status=overdue")
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.rentals[0].paymentStatus).toBe("overdue");
    });

    it("returns 400 for an invalid status filter", async () => {
      await request(app).get("/api/v1/rentals?status=nope").expect(400);
    });

    it("filters by month including rentals still active from earlier months", async () => {
      await Rental.create([
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 0, 15), // moved in January, still renting
          rentAmount: 100,
          dueDate: new Date(2026, 1, 15),
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 1, 10), // moved in February
          rentAmount: 200,
          dueDate: new Date(2026, 2, 10),
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 2, 1), // moved in March (not active in Feb)
          rentAmount: 300,
          dueDate: new Date(2026, 3, 1),
          createdBy: userId,
        },
      ]);

      const feb = await request(app)
        .get("/api/v1/rentals?month=2026-02")
        .expect(200);

      // January tenant is still renting, so it should appear in February too.
      expect(feb.body.total).toBe(2);
      expect(feb.body.rentals.map((r) => r.rentAmount).sort()).toEqual([100, 200]);
    });

    it("returns 400 for an invalid month filter", async () => {
      await request(app).get("/api/v1/rentals?month=2026-13").expect(400);
      await request(app).get("/api/v1/rentals?month=bad").expect(400);
    });

    it("includes stats scoped to the same filters", async () => {
      await Rental.create([
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 1, 1),
          rentAmount: 100,
          dueDate: new Date(2026, 2, 1),
          paymentDate: new Date(2026, 1, 20),
          paymentStatus: "paid",
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 1, 10),
          rentAmount: 200,
          dueDate: new Date(2026, 2, 10),
          paymentStatus: "overdue",
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 2, 1),
          rentAmount: 400,
          dueDate: new Date(2026, 3, 1),
          createdBy: userId,
        },
      ]);

      const res = await request(app)
        .get("/api/v1/rentals?month=2026-02")
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.stats.totalRentals).toBe(2);
      expect(res.body.stats.paid).toBe(1);
      expect(res.body.stats.pending).toBe(0);
      expect(res.body.stats.overdue).toBe(1);
      expect(res.body.stats.expectedRent).toBe(300);
      expect(res.body.stats.collectedRent).toBe(100);
      expect(res.body.stats.outstandingRent).toBe(200);
    });

    it("returns allTimeCollect regardless of the month filter", async () => {
      await Rental.create([
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 0, 5),
          rentAmount: 100,
          dueDate: new Date(2026, 0, 1),
          paymentDate: new Date(2026, 0, 2),
          paymentStatus: "paid",
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 1, 5),
          rentAmount: 200,
          dueDate: new Date(2026, 1, 1),
          paymentDate: new Date(2026, 1, 2),
          paymentStatus: "paid",
          createdBy: userId,
        },
      ]);

      const res = await request(app)
        .get("/api/v1/rentals?month=2026-01")
        .expect(200);

      // January-only collected rent is 100, but the all-time total is 300.
      expect(res.body.stats.collectedRent).toBe(100);
      expect(res.body.stats.allTimeCollect).toBe(300);
    });

    it("scopes collectedRent to the current month when no month is selected", async () => {
      const now = new Date();
      const thisMonthPayment = new Date(now.getFullYear(), now.getMonth(), 5);
      const lastMonthPayment = new Date(now.getFullYear(), now.getMonth() - 1, 5);

      await Rental.create([
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: thisMonthPayment,
          rentAmount: 100,
          dueDate: thisMonthPayment,
          paymentDate: thisMonthPayment,
          paymentStatus: "paid",
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: lastMonthPayment,
          rentAmount: 200,
          dueDate: lastMonthPayment,
          paymentDate: lastMonthPayment,
          paymentStatus: "paid",
          createdBy: userId,
        },
      ]);

      const res = await request(app).get("/api/v1/rentals").expect(200);

      // Only payments recorded in the current month count toward collectedRent;
      // the all-time total includes both.
      expect(res.body.stats.collectedRent).toBe(100);
      expect(res.body.stats.allTimeCollect).toBe(300);
    });
  });

  describe("GET /api/v1/rentals/:id/status", () => {
    it("returns real-time status metadata", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 350,
        dueDate: daysFromNow(2),
        createdBy: userId,
      });

      const res = await request(app)
        .get(`/api/v1/rentals/${rental._id}/status`)
        .expect(200);

      expect(res.body.paymentStatus).toBe("pending");
      expect(res.body.daysUntilDue).toBe(2);
      expect(res.body.dueSoon).toBe(true);
    });

    it("returns 404 for unknown rental", async () => {
      const id = new mongoose.Types.ObjectId();
      await request(app).get(`/api/v1/rentals/${id}/status`).expect(404);
    });
  });

  describe("PUT /api/v1/rentals/:id/status", () => {
    it("manually changes an empty status to paid", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      expect(rental.paymentStatus).toBe("");

      const res = await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "paid" })
        .expect(200);

      expect(res.body.rental.paymentStatus).toBe("paid");
    });

    it("manually changes a status to unpaid", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      const res = await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "unpaid" })
        .expect(200);

      expect(res.body.rental.paymentStatus).toBe("unpaid");

      // The manual override must persist (not be recomputed by the save hook).
      const persisted = await Rental.findById(rental._id);
      expect(persisted.paymentStatus).toBe("unpaid");
    });

    it("clears the status back to an empty string", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        paymentStatus: "paid",
        createdBy: userId,
      });

      const res = await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "" })
        .expect(200);

      expect(res.body.rental.paymentStatus).toBe("");
    });

    it("returns 400 for an invalid status", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      const res = await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "bogus" })
        .expect(400);

      expect(res.body.msg).toContain("status must be one of");
    });

    it("returns 400 when no status is provided", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({})
        .expect(400);
    });

    it("returns 404 for unknown rental", async () => {
      const id = new mongoose.Types.ObjectId();
      await request(app)
        .put(`/api/v1/rentals/${id}/status`)
        .send({ status: "paid" })
        .expect(404);
    });
  });

  describe("month-scoped payment status", () => {
    it("keeps July paid after the current month is set to unpaid", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: new Date(2026, 6, 1),
        rentAmount: 500,
        dueDate: new Date(2026, 6, 25),
        createdBy: userId,
      });

      // Tenant pays in July.
      await request(app)
        .post(`/api/v1/rentals/${rental._id}/payments`)
        .send({ amount: 500, paymentDate: new Date(2026, 6, 25) })
        .expect(200);

      // In August the user marks the (next) month unpaid.
      await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "unpaid", month: "2026-08" })
        .expect(200);

      const july = await request(app)
        .get("/api/v1/rentals?month=2026-07")
        .expect(200);
      expect(july.body.rentals[0].paymentStatus).toBe("paid");
      expect(july.body.rentals[0].paymentDate).toBeDefined();
      expect(july.body.rentals[0].paymentAmount).toBe(500);
      expect(july.body.stats.paid).toBe(1);
      expect(july.body.stats.outstandingRent).toBe(0);

      const august = await request(app)
        .get("/api/v1/rentals?month=2026-08")
        .expect(200);
      expect(august.body.rentals[0].paymentStatus).toBe("unpaid");
      expect(august.body.rentals[0].paymentDate).toBeNull();
      expect(august.body.rentals[0].paymentAmount).toBeNull();
    });

    it("defaults a manual status change to the current month", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-60),
        rentAmount: 500,
        dueDate: daysFromNow(10),
        createdBy: userId,
      });

      await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "unpaid" })
        .expect(200);

      const current = `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1
      ).padStart(2, "0")}`;
      const record = await RentalPayment.findOne({
        rentalId: rental._id,
        month: current,
      });
      expect(record).toBeDefined();
      expect(record.status).toBe("unpaid");
    });

    it("keeps a separate payment record for each month", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: new Date(2026, 6, 1),
        rentAmount: 500,
        dueDate: new Date(2026, 6, 25),
        createdBy: userId,
      });

      // Pay in July, then manually set August to unpaid.
      await request(app)
        .post(`/api/v1/rentals/${rental._id}/payments`)
        .send({ amount: 500, paymentDate: new Date(2026, 6, 25) })
        .expect(200);
      await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "unpaid", month: "2026-08" })
        .expect(200);

      const july = await RentalPayment.findOne({
        rentalId: rental._id,
        month: "2026-07",
      });
      const august = await RentalPayment.findOne({
        rentalId: rental._id,
        month: "2026-08",
      });

      expect(july.status).toBe("paid");
      expect(july.paymentDate).toBeDefined();
      expect(july.amount).toBe(500);
      expect(august.status).toBe("unpaid");
      expect(august.paymentDate).toBeNull();
    });

    it("returns 400 for an invalid month on status change", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      await request(app)
        .put(`/api/v1/rentals/${rental._id}/status`)
        .send({ status: "paid", month: "bad" })
        .expect(400);
    });
  });

  describe("PUT /api/v1/rentals/:id", () => {
    it("updates a rental and recomputes status", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      const res = await request(app)
        .put(`/api/v1/rentals/${rental._id}`)
        .send({ rentAmount: 999 })
        .expect(200);

      expect(res.body.rental.rentAmount).toBe(999);
      expect(res.body.rental.paymentStatus).toBe("paid"); // prepaid (due in 5 days)
    });
  });

  describe("POST /api/v1/rentals/:id/payments", () => {
    it("records a payment and marks the rental paid", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      const res = await request(app)
        .post(`/api/v1/rentals/${rental._id}/payments`)
        .send({ amount: 400 })
        .expect(200);

      expect(res.body.rental.paymentStatus).toBe("paid");
      expect(res.body.rental.paymentDate).toBeDefined();
      expect(res.body.amountPaid).toBe(400);
    });

    it("returns 400 for an invalid (non-positive) amount", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      await request(app)
        .post(`/api/v1/rentals/${rental._id}/payments`)
        .send({ amount: 0 })
        .expect(400);

      await request(app)
        .post(`/api/v1/rentals/${rental._id}/payments`)
        .send({ amount: -5 })
        .expect(400);
    });

    it("defaults to the rental's amount when the body is empty", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      const res = await request(app)
        .post(`/api/v1/rentals/${rental._id}/payments`)
        .send({})
        .expect(200);

      expect(res.body.amountPaid).toBe(400);
      expect(res.body.rental.paymentStatus).toBe("paid");
    });

    it("defaults to the rental's amount when amount is null", async () => {
      const rental = await Rental.create({
        roomId: room._id,
        tenantId: tenant._id,
        moveInDate: daysFromNow(-30),
        rentAmount: 400,
        dueDate: daysFromNow(5),
        createdBy: userId,
      });

      const res = await request(app)
        .post(`/api/v1/rentals/${rental._id}/payments`)
        .send({ amount: null })
        .expect(200);

      expect(res.body.amountPaid).toBe(400);
      expect(res.body.rental.paymentStatus).toBe("paid");
    });
  });

  describe("GET /api/v1/rentals/stats", () => {
    it("returns overview statistics", async () => {
      await Rental.create([
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: daysFromNow(-30),
          rentAmount: 100,
          dueDate: daysFromNow(-5),
          paymentDate: daysFromNow(-6),
          paymentStatus: "paid",
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: daysFromNow(-30),
          rentAmount: 200,
          dueDate: daysFromNow(-2),
          paymentStatus: "overdue",
          createdBy: userId,
        },
      ]);

      const res = await request(app).get("/api/v1/rentals/stats").expect(200);

      expect(res.body.totalRentals).toBe(2);
      expect(res.body.paid).toBe(1);
      expect(res.body.overdue).toBe(1);
      expect(res.body.expectedRent).toBe(300);
      expect(res.body.collectedRent).toBe(100);
      expect(res.body.outstandingRent).toBe(200);
    });

    it("scopes stats to a single month", async () => {
      await Rental.create([
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 1, 1),
          rentAmount: 100,
          dueDate: new Date(2026, 2, 1),
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 1, 15),
          rentAmount: 200,
          dueDate: new Date(2026, 2, 15),
          createdBy: userId,
        },
        {
          roomId: room._id,
          tenantId: tenant._id,
          moveInDate: new Date(2026, 2, 1),
          rentAmount: 400,
          dueDate: new Date(2026, 3, 1),
          createdBy: userId,
        },
      ]);

      const res = await request(app)
        .get("/api/v1/rentals/stats?month=2026-02")
        .expect(200);

      expect(res.body.totalRentals).toBe(2);
      expect(res.body.expectedRent).toBe(300);
      expect(res.body.collectedRent).toBe(0);
      expect(res.body.outstandingRent).toBe(300);
    });

    it("returns 400 for an invalid month on stats", async () => {
      await request(app).get("/api/v1/rentals/stats?month=bad").expect(400);
    });
  });
});
