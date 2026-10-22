const mongoose = require("mongoose");

const Room = require("../models/Room");
const Tenant = require("../models/Tenant");
const Rental = require("../models/Rental");

const {
  buildPaymentStatusMessage,
  getPaymentStatusReport,
  reportPaymentStatus,
} = require("../services/paymentReport");

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

describe("buildPaymentStatusMessage", () => {
  it("formats overdue and pending rooms", () => {
    const text = buildPaymentStatusMessage({
      overdue: [{ room: "1", dueDate: new Date(2026, 7, 1) }],
      pending: [{ room: "2", dueDate: new Date(2026, 7, 7) }],
    });

    expect(text).toContain("Room Payment Status Alert:");
    expect(text).toContain("==== Overdue ====");
    expect(text).toContain("-Room 1 [01 Aug, 2026]");
    expect(text).toContain("==== Pending ====");
    expect(text).toContain("-Room 2 [07 Aug, 2026]");
    expect(text).toContain("More Details: https://admin.monnykapin.com");
  });

  it("omits sections that have no items", () => {
    const text = buildPaymentStatusMessage({ overdue: [], pending: [] });
    expect(text).not.toContain("Overdue");
    expect(text).not.toContain("Pending");
    expect(text).toContain("More Details:");
  });
});

describe("getPaymentStatusReport", () => {
  it("groups pending (3 days, 2 days, 1 day, today) and overdue rentals by room", async () => {
    const room = await Room.create({ number: "401" });
    const tenant = await Tenant.create({ name: "Carol" });

    // Overdue (5 days ago) -> should be included in overdue
    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 500,
      dueDate: daysFromNow(-5),
      paymentStatus: "overdue",
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Due in 3 days -> should be included in pending
    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 400,
      dueDate: daysFromNow(3),
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Due in 2 days -> should be included in pending
    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 300,
      dueDate: daysFromNow(2),
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Due in 1 day -> should be included in pending
    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 350,
      dueDate: daysFromNow(1),
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Due today (0 days) -> should be included in pending
    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 320,
      dueDate: daysFromNow(0),
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Due in 4 days -> should NOT be included in pending (> 3 days)
    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 350,
      dueDate: daysFromNow(4),
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Already paid -> should NOT be included
    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 450,
      dueDate: daysFromNow(3),
      paymentDate: daysFromNow(-1),
      paymentStatus: "paid",
      createdBy: new mongoose.Types.ObjectId(),
    });

    const report = await getPaymentStatusReport();

    expect(report.overdue).toHaveLength(1);
    expect(report.pending).toHaveLength(4);
    expect(report.overdue[0].room).toBe("401");
    expect(report.pending.map((p) => p.room)).toEqual([
      "401",
      "401",
      "401",
      "401",
    ]);
  });
});

describe("reportPaymentStatus", () => {
  const ORIGINAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const ORIGINAL_CHAT = process.env.TELEGRAM_CHAT_ID;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123456";
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = ORIGINAL_TOKEN;
    if (ORIGINAL_CHAT === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = ORIGINAL_CHAT;
    global.fetch = ORIGINAL_FETCH;
  });

  it("sends a Telegram message when there are pending/overdue rooms", async () => {
    const room = await Room.create({ number: "501" });
    const tenant = await Tenant.create({ name: "Dan" });

    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 500,
      dueDate: daysFromNow(-5), // overdue
      paymentStatus: "overdue",
      createdBy: new mongoose.Types.ObjectId(),
    });

    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    const result = await reportPaymentStatus();

    expect(result.sent).toBe(true);
    expect(result.overdue).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    const body = JSON.parse(options.body);
    expect(body.chat_id).toBe("123456");
    expect(body.text).toContain("Room Payment Status Alert:");
    expect(body.text).toContain("-Room 501");
    expect(body.text).toContain("More Details: https://admin.monnykapin.com");
  });

  it("skips when there is nothing to report", async () => {
    global.fetch = jest.fn();

    const result = await reportPaymentStatus();

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("no pending or overdue rooms");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("skips when Telegram is not configured", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const room = await Room.create({ number: "502" });
    const tenant = await Tenant.create({ name: "Eve" });

    await Rental.create({
      roomId: room._id,
      tenantId: tenant._id,
      moveInDate: daysFromNow(-30),
      rentAmount: 500,
      dueDate: daysFromNow(-5),
      paymentStatus: "overdue",
      createdBy: new mongoose.Types.ObjectId(),
    });

    global.fetch = jest.fn();

    const result = await reportPaymentStatus();

    expect(result.sent).toBe(false);
    expect(result.reason).toContain("not set");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
