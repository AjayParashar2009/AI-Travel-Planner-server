const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
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

    // 1. Create the user
    const user = await User.create({
      name,
      email,
      password,
      country,
    });

    // 2. Generate verification token
    const verifyToken = crypto.randomBytes(20).toString("hex");
    user.verificationToken = verifyToken;
    await user.save();

    // 3. Create the verification URL
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${verifyToken}`;

    // 4. Send the email
    try {
      await sendEmail({
        email: user.email,
        subject: "Welcome to YatraAI - Please Verify Your Email",
        html: `
          <h2>Welcome to YatraAI, ${name}!</h2>
          <p>Please click the link below to verify your account:</p>
          <a href="${verifyUrl}" style="padding: 10px 20px; background: #2563EB; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
        `,
      });
    } catch (emailError) {
      console.error("Verification email failed to send:", emailError);
    }

    // 5. DO NOT generate a JWT token here. Just return success.
    return res.status(201).json({
      success: true,
      message:
        "Registration successful. Please check your email to verify your account.",
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

// Login function
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

    // Check if verified
    if (!user.isVerified) {
      return res.status(401).json({
        error:
          "Please verify your email address before logging in. Check your inbox.",
      });
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

// Get me function
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

// Logout function
exports.logout = (req, res) => {
  return res
    .status(200)
    .json({ success: true, message: "Logout successfully" });
};

// Google Login
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
      user = await User.create({
        name,
        email,
        password: Math.random().toString(36).slice(-10) + "Aa1!",
        country: "India",
        isVerified: true, // Google already verified their email
      });
    }

    // 4. Generate YOUR app's token
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

// Verify Email
exports.verifyEmail = async (req, res) => {
  try {
    const user = await User.findOne({ verificationToken: req.params.token });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    user.isVerified = true;
    user.verificationToken = undefined; // Clear the token
    await user.save();

    // Generate the JWT token right here
    const token = signToken(user._id);

    res.json({
      success: true,
      message: "Email verified successfully",
      token,
      user: filterUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set expire (10 minutes)
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    try {
      await sendEmail({
        email: user.email,
        subject: "YatraAI Password Reset Request",
        html: `
          <h2>You requested a password reset</h2>
          <p>Click the link below to reset your password. This link expires in 10 minutes.</p>
          <a href="${resetUrl}" style="padding: 10px 20px; background: #2563EB; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
        `,
      });
      res.status(200).json({ success: true, message: "Email sent" });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      return res.status(500).json({ error: "Email could not be sent" });
    }
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    // Get hashed token from URL
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }, // Check if token is not expired
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    // Set new password (model pre-save hook will hash it)
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
