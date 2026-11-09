const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Token required" });

    // 1. Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    // 2. Check if user exists
    let user = await User.findOne({ email });

    if (!user) {
      // 3. Create user if they don't exist
      // Since they use Google, we generate a random password
      user = await User.create({
        name,
        email,
        password: Math.random().toString(36).slice(-10) + "Aa1!", // Guaranteed 13+ chars
        country: "India", // Default or make optional in your DB schema
      });
    }

    // 4. Generate YOUR app's token using your existing signToken function
    const token = signToken(user._id);

    // 5. Return exactly what your normal login returns
    return res.json({
      success: true,
      token,
      user: filterUserResponse(user),
    });
  } catch (error) {
    console.error("Google auth error:", error);
    return res.status(401).json({ error: "Invalid Google token" });
  }
};
