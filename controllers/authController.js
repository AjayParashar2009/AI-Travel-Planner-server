const User = require("../models/User");
const jwt = require("jsonwebtoken");

const { validationResult } = require("express-validator");

const signToken = (id) => {
  return jwt.sign({ userId: id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE_IN || "7d",
  });
};

const filterUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  country: user.country,
  currency: user.currency,
  plan: user.plan || "free",
});

// Registration
exports.register = async (req, res) => {
  const error = validationResult(req);

  if (!error.isEmpty()) {
    return res.status(400).json({
      errors: error.array(),
    });
  }

  try {
    const { name, email, password, country } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        error: "This email already exists",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      country,
    });

    const token = signToken(user._id);

    return res.status(201).json({
      success: true,
      token,
      user: filterUserResponse(user),
    });
  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

//login function
exports.login = async (req, res) => {
  const error = validationResult(req);

  if (!error.isEmpty()) {
    return res.status(400).json({
      errors: error.array(),
    });
  }

  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken(user._id);

    return res.json({
      success: true,
      token,
      user: filterUserResponse(user),
    });
  } catch (error) {
    console.error("Login error", error);
    return res
      .status(500)
      .json({ error: "Login fails, please try again later" });
  }
};

//get me function
exports.getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(404).json({ error: "User Not Found" });
    }

    return res.json({
      success: true,
      user: filterUserResponse(req.user),
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
};

//logout function
exports.logout = (req, res) => {
  return res
    .status(200)
    .json({ success: true, message: "Logout successfully" });
};
