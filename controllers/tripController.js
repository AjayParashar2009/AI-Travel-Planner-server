const { GoogleGenAI } = require("@google/genai");
const Trip = require("../models/Trip");
const { v4: uuidV4 } = require("uuid");
const mongoose = require("mongoose");
const axios = require("axios"); // Added for Weather API

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// --- WEATHER HELPERS ---

// Helper to get lat/lon from a city name
async function getCoordinates(destination) {
  try {
    const res = await axios.get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`,
    );
    if (res.data.results && res.data.results.length > 0) {
      return {
        lat: res.data.results[0].latitude,
        lon: res.data.results[0].longitude,
        name: res.data.results[0].name,
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding failed:", error.message);
    return null;
  }
}

// Helper to fetch the weather forecast
async function getWeatherForecast(lat, lon, startDate, endDate) {
  try {
    const res = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&start_date=${startDate}&end_date=${endDate}`,
    );
    return res.data.daily;
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

    // 1. Check dates and fetch weather if within 15 days
    let weatherData = null;
    let weatherContext = "";

    if (inputs.startDate && inputs.endDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tripStart = new Date(inputs.startDate);
      const daysUntilTrip = Math.ceil(
        (tripStart - today) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilTrip >= 0 && daysUntilTrip <= 15) {
        const coords = await getCoordinates(destination);
        if (coords) {
          weatherData = await getWeatherForecast(
            coords.lat,
            coords.lon,
            inputs.startDate,
            inputs.endDate,
          );

          if (weatherData) {
            weatherContext = `
            REAL WEATHER FORECAST for ${coords.name}:
            ${weatherData.time
              .map(
                (date, i) =>
                  `${date}: Min ${weatherData.temperature_2m_min[i]}°C, Max ${weatherData.temperature_2m_max[i]}°C, Rain probability ${weatherData.precipitation_probability_max[i]}%`,
              )
              .join("\n")}
            
            IMPORTANT: If it is going to rain heavily, suggest indoor activities for those days.`;
          }
        }
      } else {
        weatherContext =
          "Weather forecast is not available yet (trip is more than 15 days away).";
      }
    }

    // 2. Create the prompt with weather context
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
        "morning": {
          "activity": "",
          "description": "",
          "location": "",
          "estimatedCost": 20,
          "tips": ""
        },
        "afternoon": {
          "activity": "",
          "description": "",
          "location": "",
          "estimatedCost": 50,
          "tips": ""
        },
        "evening": {
          "activity": "",
          "description": "",
          "location": "",
          "estimatedCost": 50,
          "tips": ""
        }
      }
    ]
  },
  "insights": [
    {
      "title": "",
      "content": ""
    }
  ],
  "packingList": {
    "essentials": [],
    "clothing": [],
    "gear": [],
    "documents": []
  }
}
`;

    const result = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `You are a travel expert. Return ONLY valid JSON. ${prompt}`,
    });

    let text = result.text.trim();
    text = text.replace(/^```json\s*/, "");
    text = text.replace(/```$/, "");

    const aiData = JSON.parse(text);

    // 3. Save trip including the weather data
    const newTrip = new Trip({
      userId: req.user?._id || req.user?.id,
      destination,
      inputs: { ...inputs, duration, numTravelers: travelers },
      itinerary: aiData.itinerary,
      insights: aiData.insights,
      packingList: aiData.packingList,
      weather: weatherData, // <--- Save weather here
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

// --- OTHER ROUTES ---

exports.getHistory = async (req, res) => {
  try {
    const trips = await Trip.find({
      userId: new mongoose.Types.ObjectId(req.user._id),
    });
    res.json({ trips: trips });
  } catch (error) {
    console.error("failed to fetch trip history");
    res.status(500).json({ error: "failed to fetch trip history" });
  }
};

exports.getTripById = async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return; // Added return to stop execution
    }
    res.json({ trip });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch trip history" });
  }
};

exports.toggleShare = async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return; // Added return to stop execution
    }

    trip.isPublic = !trip.isPublic;
    if (!trip.sharedId) trip.sharedId = uuidV4();

    await trip.save();

    res.json({ isPublic: trip.isPublic, sharedId: trip.sharedId });
  } catch (error) {
    res.status(500).json({ error: "failed to fetch trip history" });
  }
};

exports.deleteTrip = async (req, res) => {
  try {
    const result = await Trip.findOneAndDelete({
      _id: req.params._id, // Fixed: was "id" instead of "_id"
      userId: req.user._id,
    });

    if (!result)
      return res
        .status(404)
        .json({ error: "Trip is not found or unauthorized" });

    res.json({ message: "Trip is deleted Successfully" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch id" });
  }
};

exports.getSharedTrip = async (req, res) => {
  try {
    const trip = await Trip.findOne({
      sharedId: req.params.sharedId,
      isPublic: true,
    });

    if (!trip)
      return res
        .status(404)
        .json({ message: "Trip is not public or trip doesn't exist" });

    res.json({ trip });
  } catch (error) {
    return res.status(500).json({ error: "something went wrong" });
  }
};
