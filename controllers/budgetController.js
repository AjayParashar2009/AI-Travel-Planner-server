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
    hostel: 800,
    "budget-hotel": 2500,
    "mid-range": 6000,
    boutique: 12000,
    luxury: 30000,
    airbnb: 5000,
  },
  food: {
    "street-food": 400,
    casual: 800,
    mix: 1500,
    restaurant: 2500,
    "fine-dining": 6000,
  },
};

const SEASON_FACTORS = { peak: 1.5, shoulder: 1.0, "off-peak": 0.75 };

const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

const generateWithRetry = async (prompt, maxRetries = 3) => {
  let lastError;

  for (const model of GEMINI_MODELS) {
    let delay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents: prompt,
        });
      } catch (error) {
        lastError = error;

        if (error.status === 503 || error.status === 429) {
          if (attempt === maxRetries) break;
          const jitter = Math.random() * 1000;
          console.warn(
            `${model} attempt ${attempt} failed (${error.status}). Retrying in ${delay + jitter}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay + jitter));
          delay *= 2;
        } else {
          throw error;
        }
      }
    }

    console.warn(`${model} exhausted. Trying next model...`);
  }

  throw lastError;
};

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

const safeJsonParse = (text) => {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned);
};

const estimateLocalCosts = async ({
  destination,
  accommodationType,
  dailyFoodPreference,
  travelSeason,
}) => {
  const prompt = `
You are a real-time travel cost analyst. Return ONLY valid JSON, no markdown, no commentary.

Estimate typical on-ground costs for a single traveler in ${destination}.
Accommodation tier: ${accommodationType}
Food preference: ${dailyFoodPreference}
Season: ${travelSeason}

Use current realistic market rates in the local currency. Consider that the tier describes the standard of stay (hostel/budget/mid-range/boutique/luxury/airbnb) and food style (street-food/casual/mix/restaurant/fine-dining).

Return:
{
  "currency": "3-letter ISO code of the local currency, e.g. USD, EUR, INR, EGP, AED",
  "accommodationPerNight": number,
  "foodPerPersonPerDay": number,
  "localTransportPerPersonPerDay": number,
  "insurancePerPersonPerDay": number,
  "notes": "one short sentence on what drove these numbers"
}
  `.trim();

  const result = await generateWithRetry(prompt);
  const parsed = safeJsonParse(result.text);
  return parsed;
};

const fallbackLocalCosts = (accommodationType, dailyFoodPreference) => ({
  currency: "INR",
  accommodationPerNight:
    COST_MULTIPLIERS.accommodation[accommodationType] || 6000,
  foodPerPersonPerDay: COST_MULTIPLIERS.food[dailyFoodPreference] || 1500,
  localTransportPerPersonPerDay: 500,
  insurancePerPersonPerDay: 300,
  notes: "Fallback estimate using static baseline multipliers.",
});

exports.calculateBudget = async (req, res) => {
  try {
    const { destination, inputs = {} } = req.body;

    if (!destination)
      return res.status(400).json({ error: "destination is required" });

    const duration = Math.max(1, parseInt(inputs.duration) || 1);
    const numTravelers = Math.max(1, parseInt(inputs.numTravelers) || 1);
    const accommodationType = inputs.accommodationType || "mid-range";
    const dailyFoodPreference = inputs.dailyFoodPreference || "mix";
    const travelSeason = inputs.travelSeason || "shoulder";
    const userCurrency = (inputs.userCurrency || "INR").toUpperCase();

    const seasonMult = SEASON_FACTORS[travelSeason] || 1;

    let localCosts;
    let costSource = "ai";
    let aiCurrency = "INR";

    try {
      localCosts = await estimateLocalCosts({
        destination,
        accommodationType,
        dailyFoodPreference,
        travelSeason,
      });
      aiCurrency = (localCosts.currency || "INR").toUpperCase();
    } catch (err) {
      console.warn("AI cost estimation failed, using fallback:", err.message);
      localCosts = fallbackLocalCosts(accommodationType, dailyFoodPreference);
      aiCurrency = "INR";
      costSource = "fallback";
    }

    const aiToInrRate = await getExchangeRate(aiCurrency);
    const inrToUserRate = await getExchangeRate(userCurrency);
    const aiToUserRate = inrToUserRate / aiToInrRate;

    const perNightAccommodation =
      (Number(localCosts.accommodationPerNight) || 0) * seasonMult;
    const perDayFood = Number(localCosts.foodPerPersonPerDay) || 0;
    const perDayTransport =
      Number(localCosts.localTransportPerPersonPerDay) || 0;
    const perDayInsurance = Number(localCosts.insurancePerPersonPerDay) || 0;

    const accommodationLocal = perNightAccommodation * duration;
    const foodLocal = perDayFood * duration * numTravelers;
    const transportLocal = perDayTransport * duration * numTravelers;
    const insuranceLocal = perDayInsurance * duration * numTravelers;

    const breakdown = {
      accommodation: Math.round(accommodationLocal * aiToUserRate),
      food: Math.round(foodLocal * aiToUserRate),
      transport: Math.round(transportLocal * aiToUserRate),
      insurance: Math.round(insuranceLocal * aiToUserRate),
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
      costSource,
      costNotes: localCosts.notes,
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

    const prompt = `Travel Budget Auditor: Analyze this trip to ${budget.destination}. Total Budget: ${budget.breakdown.total} ${budget.currency}. Duration: ${budget.inputs.duration} days. Travelers: ${budget.inputs.numTravelers}. Accommodation: ${budget.inputs.accommodationType}. Food style: ${budget.inputs.dailyFoodPreference}. Provide a verdict on if this is realistic, 3 money-saving tips, 2 hidden costs to watch for, 3 cheaper alternatives, and a local price example (e.g. coffee or tea price).`;

    const result = await generateWithRetry(`
      You are a senior travel financial consultant.
      Return ONLY valid JSON with no markdown fences.

      {
        "verdict": "String",
        "moneySavingTips": ["array of strings"],
        "hiddenCosts": ["array of strings"],
        "cheaperAlternatives": ["array of strings"],
        "localPriceExample": "String"
      }

      ${prompt}
    `);

    const aiRaw = safeJsonParse(result.text);

    budget.aiInsights = {
      verdict: aiRaw.verdict,
      moneySavingTips: aiRaw.moneySavingTips || [],
      hiddenCosts: aiRaw.hiddenCosts || [],
      cheaperAlternatives: aiRaw.cheaperAlternatives || [],
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
      detail: error.message,
    });
  }
};
