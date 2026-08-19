/**
 * One-time migration: move per-month status data from the embedded
 * `Rental.monthlyStatus` array into the separate `rentalpayments` collection.
 *
 * Run with:  npm run migrate:monthly-status
 */
require("dotenv").config({ path: "./src/config/.env" });
const mongoose = require("mongoose");

const Rental = require("../models/Rental");
const RentalPayment = require("../models/RentalPayment");

const migrate = async () => {
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

  // Rentals that still carry the old embedded per-month array.
  const rentals = await Rental.find({ "monthlyStatus.0": { $exists: true } });

  let upserted = 0;
  for (const rental of rentals) {
    for (const entry of rental.monthlyStatus || []) {
      if (!entry.month || !entry.status) continue;
      await RentalPayment.updateOne(
        { rentalId: rental._id, month: entry.month },
        {
          $set: {
            status: entry.status,
            createdBy: rental.createdBy,
          },
        },
        { upsert: true }
      );
      upserted += 1;
    }
  }

  // Drop the now-redundant embedded field.
  const cleared = await Rental.updateMany(
    { monthlyStatus: { $exists: true, $ne: [] } },
    { $unset: { monthlyStatus: "" } }
  );

  console.log(
    `Migration complete: ${upserted} month(s) copied to rentalpayments; ` +
      `monthlyStatus field cleared on ${cleared.modifiedCount} rental(s).`
  );

  await mongoose.disconnect();
  console.log("Disconnected");
};

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
