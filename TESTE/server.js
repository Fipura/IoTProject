"use strict";
/* global require */
const express = require("express");
const session = require("express-session");
const http = require("http");
const passport = require("passport");
const axios = require("axios");
const bodyParser = require("body-parser"); // Adicionar o body-parser

require("./auth");
require("dotenv").config();

const app = express();

app.use(session({ secret: "Oauth" }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static("public")); // Servir arquivos estáticos da pasta "public"
app.use(bodyParser.json()); // Analisar corpo das requisições como JSON

let ledState = "OFF";
const data = [];
let lastValue = 0;
const credentials = [
  {
    username: process.env.USER1_username,
    password: process.env.USER1_password,
  },
  {
    username: process.env.USER2_username,
    password: process.env.USER2_password,
  },
];

const server = http.createServer(app);
const io = require("socket.io")(server);
const mqtt = require("mqtt");

let mqttClient; // Declarar o mqttClient como uma variável global

const MQTT_USERNAME = "Pedro";
const MQTT_PASSWORD = "test";

const WORLD_WEATHER_API_KEY = "011c301b18824f948eb184443240605";

async function getWeather() {
  try {
    const response = await axios.get(
      "https://api.worldweatheronline.com/premium/v1/weather.ashx",
      {
        params: {
          key: WORLD_WEATHER_API_KEY,
          q: "Tomar, Portugal",
          format: "json",
          num_of_days: 1,
          tp: 24,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return null;
  }
}

// Function to send weather data to clients
async function sendWeatherData() {
  const weatherData = await getWeather();
  if (weatherData) {
    io.emit("weatherData", weatherData);
  }
}

function connectToMqttBroker(mqttBroker, mqttPort) {
  mqttClient = mqtt.connect(`mqtt://${mqttBroker}`, {
    port: mqttPort,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
  });

  mqttClient.on("connect", function () {
    console.log("Connected to MQTT broker");
    mqttClient.subscribe("test", function (err) {
      if (err) {
        console.error("Error subscribing to MQTT topic:", err);
      }
    });
  });

  mqttClient.on("message", function (topic, message) {
    console.log("Received message:", message.toString());
    const parts = message.toString().split("%");
    const moistureValue = parseFloat(parts[0]);
    if (!isNaN(moistureValue)) {
      lastValue = moistureValue;
      data.push(moistureValue);
      console.log("moistureValue:", moistureValue);
      ledState = parts[1];
      io.emit("data", data);
      io.emit("mqttData", { moistureValue });
    }
  });
}

io.on("connection", (socket) => {
  console.log("A user connected");

  // Send weather data to newly connected clients
  sendWeatherData();
  socket.emit("data", data);
  socket.emit("mqttData", { moistureValue: lastValue });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

function isLoggedIn(req, res, next) {
  if (req.user) {
    next();
  } else {
    res.sendFile(__dirname + "/public/unauthorized.html");
  }
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/auth/google", (req, res) => {
  passport.authenticate("google", { scope: ["email", "profile"] })(req, res);
});

app.get("/auth/google/callback", (req, res) => {
  passport.authenticate("google", {
    successRedirect: "/connectmqtt.html", // Redirecionar para connectmqtt.html após login bem-sucedido
    failureRedirect: "/auth/failure",
  })(req, res, () => {
    res.redirect("/dashboard.html");
  });
});

app.get("/auth/failure", (req, res) => {
  res.sendFile(__dirname + "/public/failure.html");
});

app.get("/connectmqtt.html", isLoggedIn, (req, res) => {
  res.sendFile(__dirname + "/public/connectmqtt.html");
});

app.get("/dashboard.html", isLoggedIn, (req, res) => {
  res.sendFile(__dirname + "/public/dashboard.html");
});

app.get("/about.html", isLoggedIn, (req, res) => {
  res.sendFile(__dirname + "/public/about.html");
});

app.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.get("/api/user", (req, res) => {
  if (req.user) {
    res.json({ displayName: req.user.displayName });
  } else {
    res.status(401).json({ error: "User not authenticated" });
  }
});

app.get("/api/moisture", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ moisture: lastValue });
  } else {
    return res.sendFile(__dirname + "/public/unauthorized.html");
  }
});

app.get("/api/ledState", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ ledState });
  } else {
    return res.sendFile(__dirname + "/public/unauthorized.html");
  }
});

app.post("/api/led", (req, res) => {
  if (req.isAuthenticated()) {
    ledState = ledState === "OFF" ? "ON" : "OFF";
    mqttClient.publish("test", ledState);
    res.json({ ledState });
  } else {
    return res.sendFile(__dirname + "/public/unauthorized.html");
  }
});

app.post("/connect-mqtt", async (req, res) => {
  const { mqttBroker, mqttPort } = req.body;

  try {
    connectToMqttBroker(mqttBroker, mqttPort);
    // Respond with success
    res.json({ connected: true });
  } catch (error) {
    console.error("Error connecting to MQTT broker:", error);
    // Respond with failure
    res.status(500).json({ connected: false, error: "Failed to connect to MQTT broker" });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});