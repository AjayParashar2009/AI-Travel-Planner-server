const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer")) {
      return res.status(401).json({
        error: "Access denied, please provide valid authentication token",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const targetID = decoded.userId || decoded.id;

    if (!targetID) {
      console.error("Auth error, token payload missing user id");
      return res.status(401).json({ error: "Invalid token structure" });
    }

    const user = await User.findById(targetID).select("-password");

    if (!user) {
      return res
        .status(401)
        .json({ error: "Authentication failed, User Account cannot found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error.message);

    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError"
    ) {
      return res.status(401).json({
        error: "Invalid or expired token, please login again",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};
