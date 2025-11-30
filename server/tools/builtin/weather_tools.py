"""
Built-in weather tools for the voice agent.
Uses Open-Meteo API (free, no API key required).
"""
import httpx
from typing import Optional

from ..registry import tool_registry


# Weather code descriptions
WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


async def geocode(location: str) -> Optional[dict]:
    """Look up coordinates for a location name."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={
                "name": location,
                "count": 1,
                "language": "en",
                "format": "json"
            }
        )
        
        if response.status_code != 200:
            return None
        
        data = response.json()
        results = data.get("results", [])
        
        if not results:
            return None
        
        return results[0]


@tool_registry.register(
    description="Get current weather for a location",
)
async def get_weather(
    location: str,
    units: str = "fahrenheit"
) -> str:
    """
    Get current weather for a location.
    
    Args:
        location: City name or location (e.g., "San Francisco" or "London, UK")
        units: Temperature units - 'fahrenheit' or 'celsius'
        
    Returns:
        Current weather description
    """
    # Geocode the location
    geo = await geocode(location)
    if not geo:
        return f"Could not find location: {location}"
    
    lat = geo["latitude"]
    lon = geo["longitude"]
    city = geo.get("name", location)
    country = geo.get("country", "")
    
    # Get weather data
    temp_unit = "fahrenheit" if units == "fahrenheit" else "celsius"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
                "temperature_unit": temp_unit,
                "wind_speed_unit": "mph",
            }
        )
        
        if response.status_code != 200:
            return f"Could not fetch weather for {city}"
        
        data = response.json()
        current = data.get("current", {})
    
    # Format response
    temp = current.get("temperature_2m", "?")
    feels_like = current.get("apparent_temperature", temp)
    humidity = current.get("relative_humidity_2m", "?")
    wind = current.get("wind_speed_10m", "?")
    weather_code = current.get("weather_code", 0)
    conditions = WEATHER_CODES.get(weather_code, "Unknown")
    
    unit_symbol = "°F" if units == "fahrenheit" else "°C"
    
    location_str = f"{city}, {country}" if country else city
    
    return (
        f"Current weather in {location_str}: {conditions}. "
        f"Temperature: {temp}{unit_symbol} (feels like {feels_like}{unit_symbol}). "
        f"Humidity: {humidity}%. Wind: {wind} mph."
    )


@tool_registry.register(
    description="Get weather forecast for upcoming days",
)
async def get_forecast(
    location: str,
    days: int = 3,
    units: str = "fahrenheit"
) -> str:
    """
    Get weather forecast for a location.
    
    Args:
        location: City name or location
        days: Number of days to forecast (1-7)
        units: Temperature units - 'fahrenheit' or 'celsius'
        
    Returns:
        Weather forecast description
    """
    days = min(max(days, 1), 7)  # Clamp to 1-7
    
    # Geocode the location
    geo = await geocode(location)
    if not geo:
        return f"Could not find location: {location}"
    
    lat = geo["latitude"]
    lon = geo["longitude"]
    city = geo.get("name", location)
    
    # Get forecast data
    temp_unit = "fahrenheit" if units == "fahrenheit" else "celsius"
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
                "temperature_unit": temp_unit,
                "timezone": "auto",
                "forecast_days": days,
            }
        )
        
        if response.status_code != 200:
            return f"Could not fetch forecast for {city}"
        
        data = response.json()
        daily = data.get("daily", {})
    
    dates = daily.get("time", [])
    highs = daily.get("temperature_2m_max", [])
    lows = daily.get("temperature_2m_min", [])
    codes = daily.get("weather_code", [])
    rain_chances = daily.get("precipitation_probability_max", [])
    
    unit_symbol = "°F" if units == "fahrenheit" else "°C"
    
    lines = [f"Weather forecast for {city}:"]
    
    for i in range(min(len(dates), days)):
        from datetime import datetime
        date = datetime.strptime(dates[i], "%Y-%m-%d")
        day_name = date.strftime("%A")
        
        conditions = WEATHER_CODES.get(codes[i], "Unknown")
        rain = rain_chances[i] if i < len(rain_chances) else 0
        
        line = f"  {day_name}: {conditions}, High {highs[i]}{unit_symbol}, Low {lows[i]}{unit_symbol}"
        if rain > 20:
            line += f", {rain}% chance of rain"
        
        lines.append(line)
    
    return "\n".join(lines)
