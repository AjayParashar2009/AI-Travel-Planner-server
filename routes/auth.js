const express = require("express");
const { body, validationResult } = require("express-validator");

const authController = require("../controllers/authController");
const auth = require("../middleware/auth");

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  next();
};

const registerValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be 2-50 characters"),

  body("email")
    .isEmail()
    .withMessage("Provide a valid email address")
    .normalizeEmail(),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),

  body("country").notEmpty().withMessage("Country is required"),
];

const loginValidation = [
  body("email").isEmail().withMessage("Valid email required"),

  body("password").notEmpty().withMessage("Password cannot be empty"),
];

router.post("/register", registerValidation, validate, authController.register);

router.post("/login", loginValidation, validate, authController.login);

router.get("/me", auth, authController.getMe);
router.post("/logout", authController.logout);

module.exports = router;
