require("dotenv").config();
const connectDB = require("./config/db");
const app = require("./app");
const {startOverDueTaskJob} = require("./cron/checkOverdueTasks")

connectDB()
startOverDueTaskJob()

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
