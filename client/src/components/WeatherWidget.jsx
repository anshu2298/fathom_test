import { useState, useEffect } from "react";
import { FiCloud, FiSun, FiCloudRain, FiCloudSnow, FiWind } from "react-icons/fi";
import "./WeatherWidget.css";

function WeatherWidget() {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    // Get user's current location
    const getLocation = () => {
      if (!navigator.geolocation) {
        setError("Geolocation is not supported by your browser");
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (err) => {
          console.error("Geolocation error:", err);
          setError("Unable to get your location");
          setLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // Cache for 5 minutes
        }
      );
    };

    getLocation();
  }, []);

  useEffect(() => {
    if (!location) return;

    const fetchWeather = async () => {
      try {
        const res = await fetch(
          `/api/weather?lat=${location.lat}&lon=${location.lon}`,
          {
            credentials: "include",
          }
        );

        if (!res.ok) {
          throw new Error("Failed to fetch weather");
        }

        const data = await res.json();
        setWeather(data);
        setError(null);
      } catch (error) {
        console.error("Weather fetch error:", error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    // Refresh weather every 30 minutes
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location]);

  const getWeatherIcon = (condition) => {
    const conditionLower = condition?.toLowerCase() || "";
    
    if (conditionLower.includes("rain") || conditionLower.includes("drizzle")) {
      return <FiCloudRain />;
    } else if (conditionLower.includes("snow")) {
      return <FiCloudSnow />;
    } else if (conditionLower.includes("cloud")) {
      return <FiCloud />;
    } else if (conditionLower.includes("wind")) {
      return <FiWind />;
    } else {
      return <FiSun />;
    }
  };

  if (loading) {
    return (
      <div className="weather-widget">
        <div className="weather-loading">Loading...</div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="weather-widget">
        <div className="weather-error">—</div>
      </div>
    );
  }

  return (
    <div className="weather-widget">
      <div className="weather-icon">
        {getWeatherIcon(weather.condition)}
      </div>
      <div className="weather-info">
        <div className="weather-temp">{Math.round(weather.temperature)}°</div>
        <div className="weather-location">{weather.location || "Unknown"}</div>
      </div>
    </div>
  );
}

export default WeatherWidget;

