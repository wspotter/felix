"""
Built-in datetime tools for the voice agent.
"""
from datetime import datetime, timedelta
import zoneinfo
from typing import Optional

from ..registry import tool_registry


@tool_registry.register(
    description="Get the current date and time",
)
async def get_current_time(
    timezone: str = "local",
    format: str = "natural"
) -> str:
    """
    Get the current date and time.
    
    Args:
        timezone: Timezone name (e.g., 'America/New_York', 'UTC', or 'local')
        format: Output format - 'natural' for human readable, 'iso' for ISO format
        
    Returns:
        Current date and time string
    """
    if timezone == "local":
        now = datetime.now()
    else:
        try:
            tz = zoneinfo.ZoneInfo(timezone)
            now = datetime.now(tz)
        except Exception:
            now = datetime.now()
    
    if format == "iso":
        return now.isoformat()
    else:
        # Natural format
        return now.strftime("%A, %B %d, %Y at %I:%M %p")


@tool_registry.register(
    description="Get just the current date",
)
async def get_current_date(
    timezone: str = "local",
) -> str:
    """
    Get today's date.
    
    Args:
        timezone: Timezone name
        
    Returns:
        Current date string
    """
    if timezone == "local":
        now = datetime.now()
    else:
        try:
            tz = zoneinfo.ZoneInfo(timezone)
            now = datetime.now(tz)
        except Exception:
            now = datetime.now()
    
    return now.strftime("%A, %B %d, %Y")


@tool_registry.register(
    description="Calculate a date in the future or past",
)
async def calculate_date(
    days: int = 0,
    weeks: int = 0,
    months: int = 0,
    direction: str = "future"
) -> str:
    """
    Calculate a date relative to today.
    
    Args:
        days: Number of days to add/subtract
        weeks: Number of weeks to add/subtract
        months: Number of months to add/subtract (approximated as 30 days)
        direction: 'future' or 'past'
        
    Returns:
        The calculated date
    """
    now = datetime.now()
    
    total_days = days + (weeks * 7) + (months * 30)
    
    if direction == "past":
        total_days = -total_days
    
    target = now + timedelta(days=total_days)
    
    return target.strftime("%A, %B %d, %Y")


@tool_registry.register(
    description="Get the day of the week for a date",
)
async def get_day_of_week(
    date_str: Optional[str] = None,
) -> str:
    """
    Get the day of the week for a given date.
    
    Args:
        date_str: Date in YYYY-MM-DD format, or None for today
        
    Returns:
        Day of the week
    """
    if date_str:
        try:
            date = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            return f"Invalid date format: {date_str}. Use YYYY-MM-DD."
    else:
        date = datetime.now()
    
    return date.strftime("%A")


@tool_registry.register(
    description="Calculate time until a future date",
)
async def time_until(
    date_str: str,
) -> str:
    """
    Calculate time remaining until a future date.
    
    Args:
        date_str: Target date in YYYY-MM-DD format
        
    Returns:
        Time remaining description
    """
    try:
        target = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return f"Invalid date format: {date_str}. Use YYYY-MM-DD."
    
    now = datetime.now()
    target = target.replace(hour=0, minute=0, second=0)
    now = now.replace(hour=0, minute=0, second=0)
    
    diff = target - now
    
    if diff.days < 0:
        return f"That date was {abs(diff.days)} days ago"
    elif diff.days == 0:
        return "That's today!"
    elif diff.days == 1:
        return "That's tomorrow!"
    elif diff.days < 7:
        return f"{diff.days} days from now"
    elif diff.days < 30:
        weeks = diff.days // 7
        days = diff.days % 7
        if days:
            return f"{weeks} weeks and {days} days from now"
        return f"{weeks} weeks from now"
    else:
        months = diff.days // 30
        return f"About {months} months from now ({diff.days} days)"
