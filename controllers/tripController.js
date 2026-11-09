const { GoogleGenAI } = require("@google/genai");
const Trip = require("../models/Trip");
const { v4: uuidV4 } = require("uuid");
const axios = require("axios");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// --- WEATHER HELPER (Visual Crossing) ---
async function getWeatherForecast(destination, startDate, endDate) {
  try {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) {
      console.log("No WEATHER_API_KEY found in .env");
      return null;
    }

    // Visual Crossing handles geocoding + dates in a single URL
    const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(destination)}/${startDate}/${endDate}?unitGroup=metric&key=${apiKey}&contentType=json`;

    const res = await axios.get(url);
    return res.data.days; // Returns the array of daily forecasts
  } catch (error) {
    console.error("Weather fetch failed:", error.message);
    return null;
  }
}

// --- GENERATE TRIP ---
exports.generateTrips = async (req, res) => {
  try {
    const { destination, inputs = {} } = req.body;
    const duration = parseInt(inputs.duration) || 3;
    const travelers = parseInt(inputs.numTravelers) || 1;

    // 1. Check dates and fetch weather
    let weatherData = null;
    let weatherContext = "";

    if (inputs.startDate && inputs.endDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tripStart = new Date(inputs.startDate);
      const daysUntilTrip = Math.ceil(
        (tripStart - today) / (1000 * 60 * 60 * 24),
      );

      console.log("--- WEATHER DEBUG ---");
      console.log("Days until trip:", daysUntilTrip);

      if (daysUntilTrip >= 0 && daysUntilTrip <= 15) {
        console.log("Within 15 days! Fetching weather for:", destination);

        // Call the correct function with the correct arguments
        weatherData = await getWeatherForecast(
          destination,
          inputs.startDate,
          inputs.endDate,
        );

        console.log(
          "Weather Data result:",
          weatherData
            ? `Success (${weatherData.length} days)`
            : "Failed (null)",
        );

        if (weatherData && weatherData.length > 0) {
          // Map over the Visual Crossing data format
          weatherContext = `
          REAL WEATHER FORECAST for ${destination}:
          ${weatherData
            .map(
              (day) =>
                `${day.datetime}: Min ${day.tempmin}°C, Max ${day.tempmax}°C, Conditions: ${day.conditions}, Rain probability: ${day.precipprob}%`,
            )
            .join("\n")}
          
          IMPORTANT: If it is going to rain heavily, suggest indoor activities for those days.`;
        }
      } else {
        console.log("Trip is too far away or in the past.");
        weatherContext =
          "Weather forecast is not available yet (trip is more than 15 days away).";
      }
    }

    // 2. Create prompt
    const prompt = `
Create a ${duration}-day travel itinerary for ${destination}.
Number of travelers: ${travelers}
${weatherContext}
Return ONLY valid JSON in this format:
{
  "itinerary": {
    "days": [
      {
        "day": 1,
        "theme": "",
        "neighborhood": "",
        "estimatedDailyCost": 150,
        "morning": { "activity": "", "description": "", "location": "", "estimatedCost": 20, "tips": "" },
        "afternoon": { "activity": "", "description": "", "location": "", "estimatedCost": 50, "tips": "" },
        "evening": { "activity": "", "description": "", "location": "", "estimatedCost": 50, "tips": "" }
      }
    ]
  },
  "insights": [{ "title": "", "content": "" }],
  "packingList": { "essentials": [], "clothing": [], "gear": [], "documents": [] }
}`;

    const result = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `You are a travel expert. Return ONLY valid JSON. ${prompt}`,
    });

    let text = result.text.trim();
    text = text.replace(/^```json\s*/, "").replace(/```$/, "");
    const aiData = JSON.parse(text);

    if (aiData.itinerary?.days) {
      aiData.itinerary.days = aiData.itinerary.days.slice(0, duration);
    }

    // 3. Save trip
    const userId = req.user?._id || req.user?.id;
    const newTrip = new Trip({
      userId,
      destination,
      inputs: { ...inputs, duration, numTravelers: travelers },
      itinerary: aiData.itinerary,
      insights: aiData.insights,
      packingList: aiData.packingList,
      weather: weatherData, // Saves the array from Visual Crossing
      sharedId: uuidV4(),
    });

    await newTrip.save();
    res.status(201).json({ Trip: newTrip || [] });
  } catch (error) {
    console.error("Generation error", error);
    res
      .status(400)
      .json({ error: "Generation failed", details: error.message });
  }
};

// --- OTHER ROUTES (Keep these exactly as they are) ---

exports.getHistory = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trips = await Trip.find({ userId: userId });
    res.json({ trips: trips });
  } catch (error) {
    console.error("failed to fetch trip history");
    res.status(500).json({ error: "failed to fetch trip history" });
  }
};

exports.getTripById = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trip = await Trip.findOne({
      _id: req.params.id,
      userId: userId,
    });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    res.json({ trip });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch trip" });
  }
};

exports.toggleShare = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const trip = await Trip.findOne({
      _id: req.params.id,
      userId: userId,
    });

    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }

    trip.isPublic = !trip.isPublic;
    if (!trip.sharedId) trip.sharedId = uuidV4();

    await trip.save();

    res.json({ isPublic: trip.isPublic, sharedId: trip.sharedId });
  } catch (error) {
    res.status(500).json({ error: "failed to toggle share" });
  }
};

exports.deleteTrip = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const result = await Trip.findOneAndDelete({
      _id: req.params.id,
      userId: userId,
    });

    if (!result) {
      return res
        .status(404)
        .json({ error: "Trip is not found or unauthorized" });
    }

    res.json({ message: "Trip is deleted Successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete trip" });
  }
};

exports.getSharedTrip = async (req, res) => {
  try {
    const trip = await Trip.findOne({
      sharedId: req.params.sharedId,
      isPublic: true,
    });

    if (!trip) {
      return res
        .status(404)
        .json({ message: "Trip is not public or trip doesn't exist" });
    }

    res.json({ trip });
  } catch (error) {
    return res.status(500).json({ error: "something went wrong" });
  }
};
