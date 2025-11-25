import dotenv from "dotenv";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up)
dotenv.config({ path: join(__dirname, "..", ".env") });

/**
 * Sets up weather routes
 * @param {Express} app - Express application instance
 */
export const setupWeatherRoutes = (app) => {
  // Middleware to ensure user is authenticated
  const requireAuth = (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Get weather data
  app.get("/api/weather", requireAuth, async (req, res) => {
    try {
      const apiKey = process.env.OPENWEATHER_API_KEY;
      const { lat, lon } = req.query;

      // If no API key, return mock data
      if (!apiKey) {
        return res.json({
          temperature: 72,
          condition: "Sunny",
          location: "Unknown",
          humidity: 65,
          windSpeed: 5,
        });
      }

      let weatherUrl;
      
      // Use coordinates if provided, otherwise fallback to default city
      if (lat && lon) {
        // Use geolocation-based API
        weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=imperial`;
      } else {
        // Fallback to city name if coordinates not available
        const defaultCity = process.env.DEFAULT_WEATHER_CITY || "New York";
        const defaultCountry = process.env.DEFAULT_WEATHER_COUNTRY || "US";
        weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${defaultCity},${defaultCountry}&appid=${apiKey}&units=imperial`;
      }
      
      const response = await fetch(weatherUrl);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Weather API error");
      }

      const data = await response.json();

      res.json({
        temperature: Math.round(data.main.temp),
        condition: data.weather[0]?.main || "Clear",
        location: data.name || "Unknown",
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind?.speed || 0),
      });
    } catch (error) {
      console.error("Weather fetch error:", error);
      // Return mock data on error
      res.json({
        temperature: 72,
        condition: "Sunny",
        location: "Unknown",
        humidity: 65,
        windSpeed: 5,
      });
    }
  });
};

