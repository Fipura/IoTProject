"use strict";
/* global require */
require("dotenv").config(); // Load environment variables at the top
const express = require("express");
const session = require("express-session");
const http = require("http");
const passport = require("passport");
const axios = require("axios");
const bodyParser = require("body-parser");

require("./auth");

const app = express();

let isConnectedToMqtt = false;

app.use(session({ 
  secret: "Oauth", 
  resave: false, 
  saveUninitialized: false 
}));
console.log('Session middleware initialized.');
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());

// Serve static files with a route prefix to avoid conflicts
app.use('/public', express.static('public'));

let ledState = "OFF";
const data = [];
let lastValuetemp = 0;
let lastValuehum = 0;
let lastValuepress = 0;

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

let mqttClient;

const MQTT_USERNAME = "Pedro";
const MQTT_PASSWORD = "test";

const WORLD_WEATHER_API_KEY = "cc662c28a9fc4fef967134528241006";

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

async function sendWeatherData() {
  const weatherData = await getWeather();
  if (weatherData) {
    io.emit("weatherData", weatherData);
  }
}

function connectToMqttBroker(mqttBroker, mqttPort) {
  return new Promise((resolve, reject) => {
    mqttClient = mqtt.connect(`mqtt://${mqttBroker}`, {
      port: mqttPort,
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      reconnect: false
    });

    mqttClient.on("connect", () => {
      console.log("Connected to MQTT broker");
      mqttClient.subscribe("test", (err) => {
        if (err) {
          console.error("Error subscribing to MQTT topic:", err);
          reject(err);
        } else {
          isConnectedToMqtt = true;
          resolve();
        }
      });
    });

    mqttClient.on("error", (err) => {
      console.error("MQTT connection error:", err);
      reject(err);
      mqttClient.end();
    });

    mqttClient.on("message", function (topic, message) {
      console.log("Received message:", message.toString());
      const parts = message.toString().split("/");
      const temperature = parseFloat(parts[0]);
      const humidity = parseFloat(parts[1]);
      const pressure = parseFloat(parts[2]);
      const receivedLedState  = parts[3];

      if (!isNaN(temperature) && !isNaN(humidity) && !isNaN(pressure)) {
        lastValuetemp = temperature; // Update lastValue to temperature
        lastValuehum = humidity; // Update lastValue to temperature
        lastValuepress = pressure; // Update lastValue to temperature
        ledState = receivedLedState;
        data.push([humidity, temperature, pressure]); // Push an array with humidity, temperature, and pressure
        console.log(
          "Temperature:",
          temperature,
          "Humidity:",
          humidity,
          "Pressure:",
          pressure
        );
        io.emit("data", data);
        io.emit("mqttData", { temperature, humidity, pressure, ledState });
      }
    });
  });
}

io.on("connection", (socket) => {
  console.log("A user connected");

  sendWeatherData();
  socket.emit("data", data);
  socket.emit("mqttData", { moistureValue: lastValuehum });
  socket.emit("mqttData", { temperatureValue: lastValuetemp });
  socket.emit("mqttData", { pressureValue: lastValuepress });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  console.log('User not authenticated, redirecting to login page');
  /*res.redirect('/');*/
  return res.sendFile(__dirname + "/public/unauthorized.html");
}

function ensureConnection(req, res, next) {
  if (isConnectedToMqtt) {
    return next();
  }
  return res.sendFile(__dirname + "/public/connectmqtt.html");
}


app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/auth/google", (req, res) => {
  passport.authenticate("google", { scope: ["email", "profile"] })(req, res);
});

app.get("/auth/google/callback", (req, res) => {
  passport.authenticate("google", {
    successRedirect: "/connectmqtt.html",
    failureRedirect: "/auth/failure",
  })(req, res, () => {
    res.redirect("/dashboard.html");
  });
});

app.get("/auth/failure", (req, res) => {
  res.sendFile(__dirname + "/public/failure.html");
});

// Place the protected routes after the middleware setup
app.get("/dashboard.html", ensureAuthenticated, ensureConnection, (req, res) => {
  console.log("DASHBOARD");
  res.sendFile(__dirname + "/public/dashboard.html");
});

app.get("/connectmqtt.html", ensureAuthenticated, (req, res) => {
  res.sendFile(__dirname + "/public/connectmqtt.html");
});

app.get("/about.html", ensureAuthenticated, ensureConnection, (req, res) => {
  res.sendFile(__dirname + "/public/about.html");
});

app.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
    req.session.destroy();
    if(mqttClient){
      console.log("Closing MQTT connection");
      mqttClient.end();
      mqttClient = null;
    }
  });
});

app.get("/api/user", (req, res) => {
  if (req.user) {
    res.json({ displayName: req.user.displayName });
  } else {
    res.status(401).json({ error: "User not authenticated" });
  }
});

app.get("/api/humidity", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ humidity: lastValuehum });
  } else {
    return res.sendFile(__dirname + "/public/unauthorized.html");
  }
});

app.get("/api/temperature", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ temperature: lastValuetemp });
  } else {
    return res.sendFile(__dirname + "/public/unauthorized.html");
  }
});

app.get("/api/pressure", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ pressure: lastValuepress });
  } else {
    return res.sendFile(__dirname + "/public/unauthorized.html");
  }
});

app.get("/api/ledState", (req, res) => {
  console.log("LEDSTATE");
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
    await connectToMqttBroker(mqttBroker, mqttPort);
    res.json({ connected: true });
  } catch (error) {
    console.error("Error connecting to MQTT broker:", error);
    res.status(500).json({ connected: false, error: "Failed to connect to MQTT broker" });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
