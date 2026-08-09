const { GoogleGenAI } = require("@google/genai");
const Trip = require("../models/Trip");
const { v4: uuidV4 } = require("uuid");
const mongoose = require("mongoose");
const { response } = require("../app");
const { json } = require("express");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

//generate trip
exports.generateTrips = async (req, res) => {
  try {
    const { destination, inputs = {} } = req.body;
    const duration = parseInt(inputs.duration) || 3;
    const travelers = parseInt(inputs.numTravelers) || 1;

    const prompt = `
Create a ${duration}-day travel itinerary for ${destination}.

Number of travelers: ${travelers}

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
      contents: `
    You are a travel expert.
    Return ONLY valid JSON.
    ${prompt}`,
    });

    let text = result.text.trim();

    text = text.replace(/^```json\s*/, "");
    text = text.replace(/```$/, "");

    const aiData = JSON.parse(text);

    const newTrip = new Trip({
      userId: req.user?._id || req.user?.id,
      destination,
      inputs: { ...inputs, duration, numTravelers: travelers },
      itinerary: aiData.itinerary,
      insights: aiData.insights,
      packingList: aiData.packingList,
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

// get trips history
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

// get trip by id
exports.getTripById = async (req, res) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
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
      id: req.params._id,
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
