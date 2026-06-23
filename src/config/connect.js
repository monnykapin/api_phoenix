const mongoose = require("mongoose");
mongoose.set("strictQuery", false);
require("dotenv").config();

const connectDB = async (url) => {
  try {
    console.log("=== Environment Variables Check ===");
    console.log("DBNAME:", process.env.DBNAME);
    console.log("DBUSER:", process.env.DBUSER);
    console.log("DBAUTHMECHANISM:", process.env.DBAUTHMECHANISM);
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("===================================");
    const options = {
      dbName: process.env.DBNAME,
      user: process.env.DBUSER,
      pass: process.env.DBPASS,
      authMechanism: process.env.DBAUTHMECHANISM,
    };
    mongoose.connect(url, options);
    console.log("Connected to database successfully");
  } catch (err) {
    console.error("Error connecting to database:", err);
    process.exit(1);
  }
};

module.exports = connectDB;
