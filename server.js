require("dotenv").config();
const app = require("./app");
const mongoose = require("mongoose");

const port = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Mongodb connection successfully");
  })
  .catch((err) => {
    console.log("Mongodb connection fails", err);
    process.exit(1);
  });

app.listen(port, () => {
  console.log("Server is running on port: ", port);
});
