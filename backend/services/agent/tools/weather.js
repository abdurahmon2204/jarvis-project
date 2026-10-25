import { getJson } from "../net.js";

const WMO = {
  0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "light showers", 81: "showers", 82: "violent showers", 85: "snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with heavy hail",
};
const desc = (c) => WMO[c] ?? "unsettled weather";
const r = (n) => Math.round(Number(n));

export default {
  name: "get_weather",
  kind: "server",
  webOk: true,
  usage: 'get_weather {"city":"Tashkent","days":2}  -> current weather and a 1-3 day forecast (days optional, default 2)',
  async run(args) {
    const city = typeof args.city === "string" ? args.city.trim().slice(0, 80) : "";
    if (!city) return { error: "city is required. Use the user's saved city, or ask which city they mean." };

    const geo = await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    const g = geo.results?.[0];
    if (!g) return { error: `I couldn't find a place called "${city}".` };

    const days = Math.min(3, Math.max(1, parseInt(args.days, 10) || 2));
    const w = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=${days}`
    );
    const c = w.current;
    if (!c) return { error: "the weather service returned no data." };

    const names = ["Today", "Tomorrow"];
    const daily = (w.daily?.time || []).map((date, i) => {
      const rain = w.daily.precipitation_probability_max?.[i];
      return `${names[i] ?? date}: ${r(w.daily.temperature_2m_min[i])} to ${r(w.daily.temperature_2m_max[i])}°C, ${desc(w.daily.weather_code[i])}` +
        (Number.isFinite(rain) ? `, rain chance ${rain}%` : "");
    });
    const place = [g.name, g.country].filter(Boolean).join(", ");
    return {
      text:
        `${place}: now ${r(c.temperature_2m)}°C (feels like ${r(c.apparent_temperature)}°C), ${desc(c.weather_code)}, ` +
        `humidity ${r(c.relative_humidity_2m)}%, wind ${r(c.wind_speed_10m)} km/h. ${daily.join(". ")}.`,
    };
  },
};
