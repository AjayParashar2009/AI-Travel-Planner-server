require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = require("./app");
const mongoose = require("mongoose");

const port = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Mongodb connection successfully");
  })
  .catch((err) => {
    console.error("Mongodb connection fails:", err);
  });

app.listen(port, () => {
  console.log("Server is running on port:", port);
});
