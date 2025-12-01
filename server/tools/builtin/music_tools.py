# server/tools/builtin/music_tools.py
"""
Music control tools using MPD (Music Player Daemon).

Features:
- Play/pause/stop/skip controls
- Volume control with ducking support
- Search music library
- Queue and playlist management
- Now playing info
- Music state tracking for UI updates

Requires: MPD running on localhost:6600, mpc command available
"""

import asyncio
import logging
import re
from typing import Optional, Dict, Any
from ..registry import tool_registry

logger = logging.getLogger(__name__)

# Music state tracking (shared with main server for WebSocket updates)
_music_state = {
    "is_playing": False,
    "is_paused": False,
    "current_track": None,
    "artist": None,
    "album": None,
    "duration": None,
    "elapsed": None,
    "volume": 100,
    "repeat": False,
    "random": False,
    "queue_length": 0,
}

# Volume before ducking (for restoration)
_pre_duck_volume: Optional[int] = None
DUCK_VOLUME = 30  # Volume level when ducking


async def _run_mpc(*args: str, timeout: float = 5.0) -> tuple[str, int]:
    """Run mpc command and return (stdout, return_code)."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "mpc", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout
        )
        return stdout.decode().strip(), proc.returncode
    except asyncio.TimeoutError:
        logger.error("mpc_timeout", args=args)
        return "", -1
    except FileNotFoundError:
        logger.error("mpc_not_found")
        return "mpc command not found. Install with: sudo apt install mpc", -1
    except Exception as e:
        logger.error("mpc_error", error=str(e))
        return str(e), -1


async def _update_music_state() -> Dict[str, Any]:
    """Update and return current music state from MPD."""
    global _music_state
    
    output, code = await _run_mpc("status")
    
    if code != 0:
        return _music_state
    
    lines = output.split("\n")
    
    # Parse current track (first line if playing)
    if lines and not lines[0].startswith("volume:"):
        # Format: "Artist - Title" or just filename
        track_info = lines[0]
        if " - " in track_info:
            parts = track_info.split(" - ", 1)
            _music_state["artist"] = parts[0].strip()
            _music_state["current_track"] = parts[1].strip()
        else:
            _music_state["current_track"] = track_info
            _music_state["artist"] = None
    
    # Parse status line: [playing] #1/10   0:45/3:21 (22%)
    for line in lines:
        if line.startswith("[playing]"):
            _music_state["is_playing"] = True
            _music_state["is_paused"] = False
            # Extract position/duration
            match = re.search(r"(\d+:\d+)/(\d+:\d+)", line)
            if match:
                _music_state["elapsed"] = match.group(1)
                _music_state["duration"] = match.group(2)
        elif line.startswith("[paused]"):
            _music_state["is_playing"] = False
            _music_state["is_paused"] = True
        elif line.startswith("volume:"):
            # Parse: volume:100%   repeat: off   random: off   single: off   consume: off
            vol_match = re.search(r"volume:\s*(\d+)%", line)
            if vol_match:
                _music_state["volume"] = int(vol_match.group(1))
            _music_state["repeat"] = "repeat: on" in line
            _music_state["random"] = "random: on" in line
    
    # If no playing/paused line found, we're stopped
    if not any(line.startswith("[") for line in lines):
        _music_state["is_playing"] = False
        _music_state["is_paused"] = False
        _music_state["current_track"] = None
        _music_state["artist"] = None
    
    # Get queue length
    queue_out, _ = await _run_mpc("playlist")
    if queue_out:
        _music_state["queue_length"] = len(queue_out.split("\n"))
    
    return _music_state.copy()


def get_music_state() -> Dict[str, Any]:
    """Get current music state (for WebSocket updates)."""
    return _music_state.copy()


async def duck_volume():
    """Lower music volume for speech (called before TTS)."""
    global _pre_duck_volume
    
    if not _music_state["is_playing"]:
        return
    
    _pre_duck_volume = _music_state["volume"]
    await _run_mpc("volume", str(DUCK_VOLUME))
    _music_state["volume"] = DUCK_VOLUME
    logger.info("music_ducked", from_vol=_pre_duck_volume, to_vol=DUCK_VOLUME)


async def restore_volume():
    """Restore music volume after speech (called after TTS completes)."""
    global _pre_duck_volume
    
    if _pre_duck_volume is not None:
        await _run_mpc("volume", str(_pre_duck_volume))
        _music_state["volume"] = _pre_duck_volume
        logger.info("music_restored", volume=_pre_duck_volume)
        _pre_duck_volume = None


# ============================================
# Tool Implementations
# ============================================

@tool_registry.register(
    description="Play music. Can resume paused playback, play a specific song/artist by searching, or start playing the queue."
)
async def music_play(query: Optional[str] = None) -> str:
    """
    Start or resume music playback.
    
    Args:
        query: Optional search query to find and play specific music (artist, song, album)
    
    Returns:
        What's now playing or error message
    """
    if query:
        # Search and play
        search_out, code = await _run_mpc("search", "any", query)
        if code != 0 or not search_out:
            return f"No music found matching '{query}'. Try a different search term or add music to ~/Music folder."
        
        # Clear queue and add search results
        await _run_mpc("clear")
        
        # Add first 20 results to queue
        tracks = search_out.split("\n")[:20]
        for track in tracks:
            if track.strip():
                await _run_mpc("add", track)
        
        # Start playing
        await _run_mpc("play")
        await _update_music_state()
        
        return f"Playing {len(tracks)} tracks matching '{query}'. Now playing: {_music_state.get('current_track', 'Unknown')}"
    else:
        # Just play/resume
        output, code = await _run_mpc("play")
        await _update_music_state()
        
        if _music_state["current_track"]:
            artist = _music_state.get("artist", "")
            track = _music_state.get("current_track", "Unknown")
            if artist:
                return f"Now playing: {artist} - {track}"
            return f"Now playing: {track}"
        else:
            return "No music in queue. Try: 'play some jazz' or add music to ~/Music folder."


@tool_registry.register(
    description="Pause music playback. Use music_play to resume."
)
async def music_pause() -> str:
    """Pause the currently playing music."""
    await _run_mpc("pause")
    await _update_music_state()
    return "Music paused."


@tool_registry.register(
    description="Stop music playback completely and clear the position."
)
async def music_stop() -> str:
    """Stop music playback."""
    await _run_mpc("stop")
    await _update_music_state()
    return "Music stopped."


@tool_registry.register(
    description="Skip to the next track in the queue."
)
async def music_next() -> str:
    """Skip to next track."""
    await _run_mpc("next")
    await asyncio.sleep(0.3)  # Let MPD update
    await _update_music_state()
    
    if _music_state["current_track"]:
        artist = _music_state.get("artist", "")
        track = _music_state.get("current_track", "Unknown")
        if artist:
            return f"Skipped. Now playing: {artist} - {track}"
        return f"Skipped. Now playing: {track}"
    return "Skipped to next track."


@tool_registry.register(
    description="Go back to the previous track."
)
async def music_previous() -> str:
    """Go to previous track."""
    await _run_mpc("prev")
    await asyncio.sleep(0.3)
    await _update_music_state()
    
    if _music_state["current_track"]:
        artist = _music_state.get("artist", "")
        track = _music_state.get("current_track", "Unknown")
        if artist:
            return f"Previous track: {artist} - {track}"
        return f"Previous track: {track}"
    return "Went to previous track."


@tool_registry.register(
    description="Set music volume. Range 0-100."
)
async def music_volume(level: int) -> str:
    """
    Set music volume.
    
    Args:
        level: Volume level from 0 (mute) to 100 (full)
    
    Returns:
        Confirmation of new volume level
    """
    level = max(0, min(100, level))
    await _run_mpc("volume", str(level))
    _music_state["volume"] = level
    return f"Volume set to {level}%"


@tool_registry.register(
    description="Get information about what's currently playing."
)
async def music_now_playing() -> str:
    """Get current track information."""
    await _update_music_state()
    
    if not _music_state["is_playing"] and not _music_state["is_paused"]:
        return "Nothing is currently playing."
    
    status = "Paused" if _music_state["is_paused"] else "Playing"
    artist = _music_state.get("artist", "Unknown Artist")
    track = _music_state.get("current_track", "Unknown Track")
    elapsed = _music_state.get("elapsed", "0:00")
    duration = _music_state.get("duration", "0:00")
    volume = _music_state.get("volume", 100)
    
    info_lines = [
        f"🎵 {status}: {artist} - {track}",
        f"⏱️ {elapsed} / {duration}",
        f"🔊 Volume: {volume}%",
    ]
    
    if _music_state.get("random"):
        info_lines.append("🔀 Shuffle: On")
    if _music_state.get("repeat"):
        info_lines.append("🔁 Repeat: On")
    
    queue_len = _music_state.get("queue_length", 0)
    if queue_len > 1:
        info_lines.append(f"📋 Queue: {queue_len} tracks")
    
    return "\n".join(info_lines)


@tool_registry.register(
    description="Toggle shuffle (random) mode on or off."
)
async def music_shuffle(enable: Optional[bool] = None) -> str:
    """
    Toggle or set shuffle mode.
    
    Args:
        enable: True to enable, False to disable, None to toggle
    
    Returns:
        New shuffle state
    """
    if enable is None:
        # Toggle
        await _run_mpc("random")
    else:
        await _run_mpc("random", "on" if enable else "off")
    
    await _update_music_state()
    state = "enabled" if _music_state["random"] else "disabled"
    return f"Shuffle {state}."


@tool_registry.register(
    description="Toggle repeat mode on or off."
)
async def music_repeat(enable: Optional[bool] = None) -> str:
    """
    Toggle or set repeat mode.
    
    Args:
        enable: True to enable, False to disable, None to toggle
    
    Returns:
        New repeat state
    """
    if enable is None:
        await _run_mpc("repeat")
    else:
        await _run_mpc("repeat", "on" if enable else "off")
    
    await _update_music_state()
    state = "enabled" if _music_state["repeat"] else "disabled"
    return f"Repeat {state}."


@tool_registry.register(
    description="Search the music library for songs, artists, or albums."
)
async def music_search(query: str, limit: int = 10) -> str:
    """
    Search the music library.
    
    Args:
        query: Search term (matches artist, title, album, etc.)
        limit: Maximum results to return (default 10)
    
    Returns:
        List of matching tracks
    """
    output, code = await _run_mpc("search", "any", query)
    
    if code != 0 or not output:
        return f"No results found for '{query}'. Make sure you have music files in ~/Music."
    
    tracks = output.split("\n")[:limit]
    
    result_lines = [f"Found {len(tracks)} tracks matching '{query}':"]
    for i, track in enumerate(tracks, 1):
        # Shorten long paths
        display = track.split("/")[-1] if "/" in track else track
        # Remove extension
        display = re.sub(r"\.(mp3|flac|ogg|wav|m4a)$", "", display, flags=re.IGNORECASE)
        result_lines.append(f"{i}. {display}")
    
    result_lines.append("\nSay 'play [search term]' to play these results.")
    return "\n".join(result_lines)


@tool_registry.register(
    description="Add a song or search results to the play queue without interrupting current playback."
)
async def music_queue_add(query: str) -> str:
    """
    Add tracks to the queue.
    
    Args:
        query: Search term to find tracks to add
    
    Returns:
        Confirmation of tracks added
    """
    search_out, code = await _run_mpc("search", "any", query)
    
    if code != 0 or not search_out:
        return f"No music found matching '{query}'."
    
    tracks = search_out.split("\n")[:10]
    added = 0
    
    for track in tracks:
        if track.strip():
            await _run_mpc("add", track)
            added += 1
    
    await _update_music_state()
    return f"Added {added} tracks to the queue. Queue now has {_music_state['queue_length']} tracks."


@tool_registry.register(
    description="Clear the music queue."
)
async def music_queue_clear() -> str:
    """Clear all tracks from the queue."""
    await _run_mpc("clear")
    await _update_music_state()
    return "Queue cleared."


@tool_registry.register(
    description="Show the current play queue."
)
async def music_queue_show(limit: int = 10) -> str:
    """
    Show tracks in the queue.
    
    Args:
        limit: Maximum tracks to show
    
    Returns:
        List of queued tracks
    """
    output, code = await _run_mpc("playlist")
    
    if code != 0 or not output:
        return "Queue is empty."
    
    tracks = output.split("\n")[:limit]
    total = len(output.split("\n"))
    
    # Get current track position
    status_out, _ = await _run_mpc("status")
    current_pos = 0
    for line in status_out.split("\n"):
        match = re.search(r"#(\d+)/", line)
        if match:
            current_pos = int(match.group(1))
            break
    
    result_lines = [f"Queue ({total} tracks):"]
    for i, track in enumerate(tracks, 1):
        marker = "▶ " if i == current_pos else "  "
        # Shorten for display
        display = track.split("/")[-1] if "/" in track else track
        display = re.sub(r"\.(mp3|flac|ogg|wav|m4a)$", "", display, flags=re.IGNORECASE)
        result_lines.append(f"{marker}{i}. {display}")
    
    if total > limit:
        result_lines.append(f"  ... and {total - limit} more")
    
    return "\n".join(result_lines)


@tool_registry.register(
    description="List available playlists."
)
async def music_playlists() -> str:
    """List saved playlists."""
    output, code = await _run_mpc("lsplaylists")
    
    if code != 0 or not output:
        return "No playlists found. Create one with 'save playlist [name]'."
    
    playlists = output.split("\n")
    return "Available playlists:\n" + "\n".join(f"• {p}" for p in playlists if p)


@tool_registry.register(
    description="Load and play a saved playlist."
)
async def music_playlist_load(name: str) -> str:
    """
    Load a playlist.
    
    Args:
        name: Name of the playlist to load
    
    Returns:
        Confirmation or error
    """
    await _run_mpc("clear")
    output, code = await _run_mpc("load", name)
    
    if code != 0:
        return f"Playlist '{name}' not found. Use 'list playlists' to see available ones."
    
    await _run_mpc("play")
    await _update_music_state()
    
    return f"Loaded playlist '{name}'. Now playing: {_music_state.get('current_track', 'Unknown')}"


@tool_registry.register(
    description="Save the current queue as a playlist."
)
async def music_playlist_save(name: str) -> str:
    """
    Save current queue as a playlist.
    
    Args:
        name: Name for the new playlist
    
    Returns:
        Confirmation
    """
    # Remove old playlist with same name if exists
    await _run_mpc("rm", name)
    output, code = await _run_mpc("save", name)
    
    if code != 0:
        return f"Failed to save playlist: {output}"
    
    return f"Saved current queue as playlist '{name}'."


@tool_registry.register(
    description="Update the music database by scanning for new files."
)
async def music_update_library() -> str:
    """Scan for new music files and update the database."""
    await _run_mpc("update")
    return "Updating music database. This may take a moment for large libraries."


@tool_registry.register(
    description="Get music library statistics."
)
async def music_stats() -> str:
    """Get library statistics."""
    output, code = await _run_mpc("stats")
    
    if code != 0:
        return "Could not get music statistics."
    
    # Parse stats
    lines = output.split("\n")
    stats = {}
    for line in lines:
        if ":" in line:
            key, val = line.split(":", 1)
            stats[key.strip()] = val.strip()
    
    result = ["🎵 Music Library Stats:"]
    if "Artists" in stats:
        result.append(f"  Artists: {stats['Artists']}")
    if "Albums" in stats:
        result.append(f"  Albums: {stats['Albums']}")
    if "Songs" in stats:
        result.append(f"  Songs: {stats['Songs']}")
    if "Play Time" in stats:
        result.append(f"  Total Play Time: {stats['Play Time']}")
    if "DB Play Time" in stats:
        result.append(f"  Library Duration: {stats['DB Play Time']}")
    
    if len(result) == 1:
        return "Music library is empty. Add files to ~/Music and run 'update music library'."
    
    return "\n".join(result)
