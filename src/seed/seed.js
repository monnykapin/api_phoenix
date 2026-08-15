/**
 * Sample-data seeder for the Rental feature.
 *
 * Creates a demo owner user, a few rooms/tenants, and rentals that demonstrate
 * all three payment statuses (paid / pending / overdue) using dates relative
 * to "today" so the data is always meaningful.
 *
 * Run with:  npm run seed
 */

require("dotenv").config({ path: "./src/config/.env" });
const mongoose = require("mongoose");

const User = require("../models/User");
const Room = require("../models/Room");
const Tenant = require("../models/Tenant");
const Rental = require("../models/Rental");

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

const seed = async () => {
  const uri = process.env.MONGOURL;
  if (!uri) {
    console.error("MONGOURL is not set. Check src/config/.env");
    process.exit(1);
  }

  await mongoose.connect(uri, {
    dbName: process.env.DBNAME,
    user: process.env.DBUSER,
    pass: process.env.DBPASS,
    authMechanism: process.env.DBAUTHMECHANISM,
  });
  console.log("Connected to database");

  // 1. Demo owner user (createdBy on every rental).
  let owner = await User.findOne({ email: "owner@example.com" });
  if (!owner) {
    owner = await User.create({
      name: "Demo Owner",
      email: "owner@example.com",
      password: "password123",
    });
    console.log("Created demo owner user");
  } else {
    console.log("Demo owner already exists, reusing");
  }

  // 2. Rooms.
  const roomNumbers = ["101", "102", "103"];
  const rooms = {};
  for (const number of roomNumbers) {
    rooms[number] =
      (await Room.findOne({ number })) ||
      (await Room.create({ number, description: `Room ${number}` }));
  }

  // 3. Tenants.
  const tenantSpecs = [
    { name: "Alice Johnson", email: "alice@example.com", phone: "010-111-222" },
    { name: "Bob Smith", email: "bob@example.com", phone: "010-333-444" },
    { name: "Carol Davis", email: "carol@example.com", phone: "010-555-666" },
  ];
  const tenants = [];
  for (const spec of tenantSpecs) {
    tenants.push(
      (await Tenant.findOne({ email: spec.email })) || (await Tenant.create(spec))
    );
  }

  // 4. Rentals demonstrating each status.
  const rentals = [
    {
      roomId: rooms["101"]._id,
      tenantId: tenants[0]._id,
      moveInDate: daysFromNow(-60),
      moveOutDate: null,
      rentAmount: 500,
      dueDate: daysFromNow(-5),
      paymentDate: daysFromNow(-6), // paid on time -> "paid"
      createdBy: owner._id,
    },
    {
      roomId: rooms["102"]._id,
      tenantId: tenants[1]._id,
      moveInDate: daysFromNow(-30),
      moveOutDate: null,
      rentAmount: 450,
      dueDate: daysFromNow(2), // due soon -> "pending" (dueSoon = true)
      paymentDate: null,
      createdBy: owner._id,
    },
    {
      roomId: rooms["103"]._id,
      tenantId: tenants[2]._id,
      moveInDate: daysFromNow(-90),
      moveOutDate: null,
      rentAmount: 600,
      dueDate: daysFromNow(-3), // past due, unpaid -> "overdue"
      paymentDate: null,
      createdBy: owner._id,
    },
  ];

  for (const rental of rentals) {
    await Rental.create(rental);
  }

  const count = await Rental.countDocuments({ createdBy: owner._id });
  console.log(`Seeding complete: ${count} rental(s) for ${owner.email}`);

  await mongoose.disconnect();
  console.log("Disconnected");
};

seed().catch((error) => {
  console.error("Seeding failed:", error);
  process.exit(1);
});
