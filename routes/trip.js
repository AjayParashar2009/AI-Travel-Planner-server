const express = require("express");
const tripController = require("../controllers/tripController");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const rateLimiter = require("express-rate-limit");
const router = express.Router();

// set numbers of requests per hour
const aiLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
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

const registerValidator = [
  body("destination").trim().notEmpty().withMessage("Destination is required"),

  body("inputs.numTravelers")
    .isInt({ min: 1 })
    .withMessage("At least one traveler is required"),

  body("inputs.travelStyle")
    .trim()
    .notEmpty()
    .withMessage("Travel style is required"),

  body("inputs.interest")
    .isArray({ min: 1 })
    .withMessage("Please select at least one interest"),
];


router.get("/share/:sharedId",tripController.getSharedTrip)

router.use(auth);
router.post(
  "/generate",
  registerValidator,
  validate,
  tripController.generateTrips,
);

router.get("/history", tripController.getHistory);
router.get("/:id", tripController.getTripById);
router.patch("/:id/share", tripController.toggleShare);
router.delete("/:id", tripController.deleteTrip);
module.exports = router;
