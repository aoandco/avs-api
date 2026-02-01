require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");
const { startOverDueTaskJob } = require("./cron/checkOverdueTasks");

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    console.log("Starting server...");

    await connectDB();
    console.log("Database connected");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Start background jobs AFTER server is alive
    startOverDueTaskJob();
    console.log("Cron job started");

  } catch (err) {
    console.error("Startup failure:", err);
    process.exit(1); // forces clear crash log instead of silent failure
  }
};

startServer();

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

