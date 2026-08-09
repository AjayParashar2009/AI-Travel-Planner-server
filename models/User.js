const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please use valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    country: {
      type: String,
      required: [true, "Country is required"],
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

//encryption
userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      console.log("Error hashing password", error);
    }
  }

  if (this.isModified("country")) {
    const currencyMap = {
      IND: "INR",
      USA: "USD",
      GBR: "GBP",
      JPN: "JPY",
      CAN: "CAD",
      AUS: "AUD",
    };

    this.currency = currencyMap[this.country.toUpperCase()] || "USD";
  }
});

// password compare function

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
