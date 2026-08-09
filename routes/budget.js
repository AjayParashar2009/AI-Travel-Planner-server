const express = require("express");
const budgetController = require("../controllers/budgetController");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const rateLimiter = require("express-rate-limit");
const router = express.Router();

const aiLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: {
    error:
      "AI generation quote is reached, please wait an hour for next request",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

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

const calValidator = [
  body("destination").trim().notEmpty().withMessage("Destination is required"),

  body("inputs.duration")
    .isInt({ min: 1 })
    .withMessage("Duration must be at least 1 day"),

  body("inputs.numTravelers").optional().isInt({ min: 1 }),

  body("inputs.userCurrency")
    .optional()
    .isString()
    .isLength({ min: 3, max: 3 })
    .withMessage("Currency must be a 3-letter code (e.g. INR)"),

  body("inputs.accommodationType")
    .notEmpty()
    .withMessage("Accommodation is required"),
  body("inputs.travelSeason")
    .notEmpty()
    .withMessage("Travel season is required"),

  body("inputs.dailyFoodPreference")
    .notEmpty()
    .withMessage("Food preference is required"),
];

const AiValidation = [
  body("budgetId").isMongoId().withMessage("A valid budget id is required"),
];

router.use(auth);

router.get("/history", budgetController.getHistory);

router.post(
  "/calculate",
  aiLimiter,
  calValidator,
  validate,
  budgetController.calculateBudget,
);

// get ai Insight
router.post(
  "/ai-insights",
  aiLimiter,
  AiValidation,
  budgetController.getAIInsight,
);
module.exports = router;
