const mongoose = require("mongoose");

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    destination: {
      type: String,
      required: [true, "Destination is required"],
      trim: true,
    },
    destinationImage: {
      type: String,
      default: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
    },
    currency: {
      type: String,
      uppercase: true,
      default: "INR",
    },
    inputs: {
      duration: { type: Number, required: true, min: 1 },
      numTravelers: {
        type: Number,
        default: 1,
        min: 1,
      },
      accommodationType: { type: String, lowercase: true, trim: true },
      travelSeason: {
        type: String,
        lowercase: true,
        trim: true,
      },
      dailyFoodPreference: {
        type: String,
        lowercase: true,
        trim: true,
      },
      userCurrency: {
        type: String,
        default: "INR",
        uppercase: true,
      },
    },
    breakdown: {
      accommodation: { type: Number, default: 0 },
      food: { type: Number, default: 0 },
      flights: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      insurance: { type: Number, default: 0 },
      miscellaneous: { type: Number, default: 0 },
      emergencyBuffer: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      perPerson: { type: Number, default: 0 },
    },
    aiInsights: {
      verdict: String,
      moneySavingTips: [String],
      hiddenCosts: [String],
      localPriceExample: mongoose.Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

//Auto calculate total budget before saving
// note: this to access the document

budgetSchema.pre("save", function () {
  this.currency = this.inputs.userCurrency || "INR";
  const b = this.breakdown || {};
  const total =
    (Number(b.accommodation) || 0) +
    (Number(b.food) || 0) +
    (Number(b.flights) || 0) +
    (Number(b.transport) || 0) +
    (Number(b.insurance) || 0) +
    (Number(b.miscellaneous) || 0) +
    (Number(b.emergencyBuffer) || 0);

  this.breakdown.total = Math.round(total);

  //calculate travelers
  const travelers = Math.max(1, this.inputs.numTravelers || 1);
  this.breakdown.perPerson = Math.round(total / travelers);
});

module.exports = mongoose.model("Budget", budgetSchema);
