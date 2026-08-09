const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    destination: {
      type: String,
      required: [true, "Destination id required"],
      trim: true,
    },
    input: {
      startDate: String,
      endDate: String,
      duration: {
        type: Number,
        default: 3,
      },
      numTravelers: {
        type: Number,
        default: 1,
      },
      travelStyle: {
        type: String,
        default: "Standard",
      },
      interest: [String],
      budgetMin: Number,
      budgetMax: Number,
    },
    itinerary: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    sharedId: {
      type: String,
      unique: true,
      sparse: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

tripSchema.virtual("formattedDate").get(function () {
  return this.createdAt.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
});

module.exports = mongoose.model("Trip", tripSchema);
