require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");
const { default: axios } = require("axios");
const Budget = require("../models/Budget");
const EXCHANGE_API_KEY = process.env.EXCHANGE_API_KEY;
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const COST_MULTIPLIERS = {
  accommodation: {
    hostel: 35,
    "budget-hotel": 85,
    "mid-range": 160,
    boutique: 240,
    luxury: 450,
    airbnb: 130,
  },
  food: {
    "street-food": 28,
    casual: 50,
    mix: 80,
    restaurant: 120,
    "fine-dining": 250,
  },
};

const SEASON_FACTORS = { peak: 1.5, shoulder: 1.0, "off-peak": 0.75 };

const getExchangeRate = async (userCurrency) => {
  const currencyCode = (userCurrency || "INR").toUpperCase();

  if (!EXCHANGE_API_KEY) {
    console.warn(
      "EXCHANGE_API_KEY is missing. Using fallback exchange rate 1.",
    );
    return 1;
  }

  try {
    const rateRes = await axios.get(
      `https://v6.exchangerate-api.com/v6/${EXCHANGE_API_KEY}/latest/INR`,
      { timeout: 10000 },
    );

    return rateRes.data?.conversion_rates?.[currencyCode] ?? 1;
  } catch (error) {
    console.error(
      "Currency API failed:",
      error.response?.data || error.message,
    );
    return 1;
  }
};

exports.getExchangeRate = getExchangeRate;

exports.calculateBudget = async (req, res) => {
  try {
    const { destination, inputs = {} } = req.body;

    if (!destination)
      return res.status(400).json({ error: "destination is require" });

    //sanitizing inputs
    const duration = Math.max(1, parseInt(inputs.duration) || 1);
    const numTravelers = Math.max(1, parseInt(inputs.numTravelers) || 1);
    const accommodationType = inputs.accommodationType || "mid-range";
    const dailyFoodPreference = inputs.dailyFoodPreference || "mix";
    const travelSeason = inputs.travelSeason || "shoulder";
    const userCurrency = (inputs.userCurrency || "INR").toUpperCase();

    //Currency fetching
    const exchangeRate = await getExchangeRate(userCurrency);

    const seasonMult = SEASON_FACTORS[travelSeason] || 1;

    const baseAccommodation =
      (COST_MULTIPLIERS.accommodation[accommodationType] || 160) * seasonMult;

    const baseFood =
      (COST_MULTIPLIERS.food[dailyFoodPreference] || 80) * seasonMult;

    const breakdown = {
      accommodation: Math.round(baseAccommodation * duration * exchangeRate),
      food: Math.round(baseFood * duration * numTravelers * exchangeRate),
      transport: Math.round(25 * numTravelers * duration * exchangeRate),
      insurance: Math.round(25 * numTravelers * duration * exchangeRate),
    };

    const subtotal = Object.values(breakdown).reduce((a, b) => a + b, 0);

    const miscellaneous = Math.round(subtotal * 0.1);
    const emergencyBuffer = Math.round((subtotal + miscellaneous) * 0.15);
    const total = subtotal + miscellaneous + emergencyBuffer;

    const budget = await Budget.create({
      userId: req.user._id,
      destination,
      currency: userCurrency,
      inputs: {
        duration,
        numTravelers,
        accommodationType,
        travelSeason,
        dailyFoodPreference,
        userCurrency,
      },
      breakdown: {
        ...breakdown,
        miscellaneous,
        emergencyBuffer,
        total,
        perPerson: Math.round(total / numTravelers),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Budget calculated successfully",
      budget,
    });
  } catch (error) {
    console.error("Budget calc error:", error.message);
    return res
      .status(500)
      .json({ error: "Budget calculation error", detail: error.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const budgets = await Budget.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      success: true,
      count: budgets.length,
      budgets,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to retrieve budget history",
    });
  }
};

exports.getAIInsight = async function (req, res) {
  try {
    const { budgetId } = req.body;

    if (!budgetId)
      return res.status(400).json({ error: "Budget id is required" });

    const budget = await Budget.findOne({
      _id: budgetId,
      userId: req.user._id,
    });

    if (!budget)
      return res.status(400).json({ error: "Budget record not found" });

    console.log(budget);

    const prompt = `Travel Budget Auditor: Analyze this trip to ${budget.destination}. Total Budget: ${budget.breakdown.total} ${budget.currency}. Duration: ${budget.inputs.duration} days. Travelers: ${budget.inputs.numTravelers}. Provide a verdict on if this is realistic, 3 money-saving tips, 2 hidden costs to watch for, and a local price example (e.g. coffee or tea price).`;

    const result = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `
      You are a senior travel financial consultant.
      Return ONLY valid JSON.

      {
        "verdict":"String",
        "moneySavingTips":["array of strings"],
        "hiddenCosts":["array of strings"],
        "localPriceExample":"String"
      }

      ${prompt}
      `,
    });

    let text = result.text.trim();

    text = text.replace(/^```json\s*/, "");
    text = text.replace(/```$/, "");

    const aiRaw = JSON.parse(text);

    budget.aiInsights = {
      verdict: aiRaw.verdict,
      moneySavingTips: aiRaw.moneySavingTips,
      hiddenCosts: aiRaw.hiddenCosts,
      localPriceExample: aiRaw.localPriceExample,
    };

    await budget.save();

    return res.status(201).json({
      aiInsights: budget.aiInsights,
    });
  } catch (error) {
    console.error("AI insight error", error);
    return res.status(500).json({
      error: "Failed to generate ai insights",
    });
  }
};
