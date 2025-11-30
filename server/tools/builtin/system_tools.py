"""
Built-in system information tools for the voice agent.
"""
import platform
import os
import psutil
from typing import Optional

from ..registry import tool_registry


@tool_registry.register(
    description="Get system information about the computer",
)
async def get_system_info() -> str:
    """
    Get basic system information.
    
    Returns:
        System information summary
    """
    info = [
        f"Operating System: {platform.system()} {platform.release()}",
        f"Hostname: {platform.node()}",
        f"Architecture: {platform.machine()}",
        f"Processor: {platform.processor() or 'Unknown'}",
    ]
    
    # Try to get CPU info
    try:
        cpu_count = psutil.cpu_count(logical=False)
        cpu_threads = psutil.cpu_count(logical=True)
        info.append(f"CPU Cores: {cpu_count} cores, {cpu_threads} threads")
    except:
        pass
    
    # Memory info
    try:
        mem = psutil.virtual_memory()
        total_gb = mem.total / (1024**3)
        info.append(f"Memory: {total_gb:.1f} GB total")
    except:
        pass
    
    return "\n".join(info)


@tool_registry.register(
    description="Get current CPU and memory usage",
)
async def get_resource_usage() -> str:
    """
    Get current system resource usage.
    
    Returns:
        CPU and memory usage statistics
    """
    try:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        
        lines = [
            f"CPU Usage: {cpu_percent}%",
            f"Memory Usage: {mem.percent}% ({mem.used / (1024**3):.1f} GB / {mem.total / (1024**3):.1f} GB)",
            f"Available Memory: {mem.available / (1024**3):.1f} GB",
        ]
        
        # Swap info
        swap = psutil.swap_memory()
        if swap.total > 0:
            lines.append(f"Swap Usage: {swap.percent}% ({swap.used / (1024**3):.1f} GB / {swap.total / (1024**3):.1f} GB)")
        
        return "\n".join(lines)
    except Exception as e:
        return f"Could not get resource usage: {e}"


@tool_registry.register(
    description="Get disk space information",
)
async def get_disk_space(
    path: str = "/"
) -> str:
    """
    Get disk space information for a path.
    
    Args:
        path: Path to check (default: root filesystem)
        
    Returns:
        Disk space statistics
    """
    try:
        usage = psutil.disk_usage(path)
        
        return (
            f"Disk space for {path}:\n"
            f"  Total: {usage.total / (1024**3):.1f} GB\n"
            f"  Used: {usage.used / (1024**3):.1f} GB ({usage.percent}%)\n"
            f"  Free: {usage.free / (1024**3):.1f} GB"
        )
    except Exception as e:
        return f"Could not get disk space for {path}: {e}"


@tool_registry.register(
    description="Get uptime information",
)
async def get_uptime() -> str:
    """
    Get system uptime.
    
    Returns:
        System uptime
    """
    try:
        import datetime
        boot_time = datetime.datetime.fromtimestamp(psutil.boot_time())
        uptime = datetime.datetime.now() - boot_time
        
        days = uptime.days
        hours, remainder = divmod(uptime.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        parts = []
        if days:
            parts.append(f"{days} day{'s' if days != 1 else ''}")
        if hours:
            parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
        if minutes:
            parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
        
        uptime_str = ", ".join(parts) if parts else "Less than a minute"
        
        return f"System uptime: {uptime_str}\nBoot time: {boot_time.strftime('%Y-%m-%d %H:%M:%S')}"
    except Exception as e:
        return f"Could not get uptime: {e}"


@tool_registry.register(
    description="Set a reminder or timer",
)
async def set_reminder(
    message: str,
    seconds: int = 60,
) -> str:
    """
    Set a reminder that will be spoken after a delay.
    Note: This is a placeholder - actual reminder functionality
    would need background task support.
    
    Args:
        message: Reminder message
        seconds: Seconds until reminder (default: 60)
        
    Returns:
        Confirmation message
    """
    minutes = seconds / 60
    
    if minutes < 1:
        time_str = f"{seconds} seconds"
    elif minutes < 60:
        time_str = f"{minutes:.0f} minute{'s' if minutes != 1 else ''}"
    else:
        hours = minutes / 60
        time_str = f"{hours:.1f} hour{'s' if hours != 1 else ''}"
    
    # In a real implementation, this would schedule a background task
    return f"I'll remind you in {time_str}: {message}"


@tool_registry.register(
    description="Get a random joke",
)
async def tell_joke() -> str:
    """
    Get a random joke.
    
    Returns:
        A joke
    """
    import random
    
    jokes = [
        "Why do programmers prefer dark mode? Because light attracts bugs!",
        "Why did the developer go broke? Because he used up all his cache!",
        "Why do Python programmers wear glasses? Because they can't C!",
        "There are only 10 types of people: those who understand binary and those who don't.",
        "Why was the computer cold? It left its Windows open!",
        "How many programmers does it take to change a light bulb? None, that's a hardware problem!",
        "Why did the programmer quit his job? Because he didn't get arrays!",
        "What's a programmer's favorite hangout? Foo Bar!",
        "Why do programmers always mix up Christmas and Halloween? Because Oct 31 equals Dec 25!",
        "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
    ]
    
    return random.choice(jokes)
