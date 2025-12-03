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

Requires: MPD server running (localhost:6600 by default)
Uses: python-mpd2 for cross-platform compatibility
"""

import asyncio
import logging
from typing import Optional, Dict, Any
from mpd.asyncio import MPDClient
from ..registry import tool_registry

logger = logging.getLogger(__name__)

# MPD connection settings
MPD_HOST = "localhost"
MPD_PORT = 6600
MPD_TIMEOUT = 5

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


async def _get_client() -> MPDClient:
    """Create and connect MPD client."""
    client = MPDClient()
    try:
        await asyncio.wait_for(
            client.connect(MPD_HOST, MPD_PORT),
            timeout=MPD_TIMEOUT
        )
        return client
    except (ConnectionRefusedError, OSError) as e:
        logger.error("mpd_connection_failed", error=str(e))
        raise ConnectionError(f"Could not connect to MPD at {MPD_HOST}:{MPD_PORT}. Is MPD running?")
    except asyncio.TimeoutError:
        logger.error("mpd_timeout")
        raise ConnectionError(f"MPD connection timeout")


async def _disconnect_client(client: MPDClient):
    """Safely disconnect MPD client."""
    try:
        client.disconnect()
    except:
        pass


async def _update_music_state() -> Dict[str, Any]:
    """Update and return current music state from MPD."""
    global _music_state
    
    try:
        client = await _get_client()
        
        try:
            # Get current status
            status = await client.status()
            
            # Parse state
            state = status.get('state', 'stop')
            _music_state["is_playing"] = (state == 'play')
            _music_state["is_paused"] = (state == 'pause')
            
            # Parse volume
            volume = status.get('volume', '100')
            _music_state["volume"] = int(volume)
            
            # Parse repeat/random
            _music_state["repeat"] = (status.get('repeat', '0') == '1')
            _music_state["random"] = (status.get('random', '0') == '1')
            
            # Parse time
            if 'time' in status:
                elapsed, duration = status['time'].split(':')
                _music_state["elapsed"] = f"{int(elapsed) // 60}:{int(elapsed) % 60:02d}"
                _music_state["duration"] = f"{int(duration) // 60}:{int(duration) % 60:02d}"
            
            # Get current song
            if state != 'stop':
                currentsong = await client.currentsong()
                _music_state["artist"] = currentsong.get('artist', None)
                _music_state["current_track"] = currentsong.get('title', currentsong.get('file', 'Unknown'))
                _music_state["album"] = currentsong.get('album', None)
            else:
                _music_state["current_track"] = None
                _music_state["artist"] = None
                _music_state["album"] = None
            
            # Get queue length
            playlist_info = await client.playlistinfo()
            _music_state["queue_length"] = len(playlist_info)
            
        finally:
            await _disconnect_client(client)
            
    except ConnectionError as e:
        logger.debug("mpd_unavailable", error=str(e))
        # Return current state even if connection fails
    except Exception as e:
        logger.error("update_state_error", error=str(e))
    
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
    
    try:
        client = await _get_client()
        try:
            await client.setvol(DUCK_VOLUME)
            _music_state["volume"] = DUCK_VOLUME
            logger.info("music_ducked", from_vol=_pre_duck_volume, to_vol=DUCK_VOLUME)
        finally:
            await _disconnect_client(client)
    except Exception as e:
        logger.error("duck_volume_error", error=str(e))


async def restore_volume():
    """Restore music volume after speech (called after TTS completes)."""
    global _pre_duck_volume
    
    if _pre_duck_volume is not None:
        try:
            client = await _get_client()
            try:
                await client.setvol(_pre_duck_volume)
                _music_state["volume"] = _pre_duck_volume
                logger.info("music_restored", volume=_pre_duck_volume)
            finally:
                await _disconnect_client(client)
        except Exception as e:
            logger.error("restore_volume_error", error=str(e))
        finally:
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
    try:
        client = await _get_client()
        
        try:
            if query:
                # Search and play
                search_results = await client.search('any', query)
                
                if not search_results:
                    return f"No music found matching '{query}'. Try a different search term or add music to ~/Music folder."
                
                # Clear queue and add search results (limit to 20)
                await client.clear()
                
                count = 0
                for song in search_results[:20]:
                    file = song.get('file')
                    if file:
                        await client.add(file)
                        count += 1
                
                # Start playing
                await client.play(0)
                await _update_music_state()
                
                return f"Playing {count} tracks matching '{query}'. Now playing: {_music_state.get('current_track', 'Unknown')}"
            else:
                # Just play/resume
                await client.play()
                await _update_music_state()
                
                if _music_state["current_track"]:
                    artist = _music_state.get("artist", "")
                    track = _music_state.get("current_track", "Unknown")
                    if artist:
                        return f"Now playing: {artist} - {track}"
                    return f"Now playing: {track}"
                else:
                    return "No music in queue. Try: 'play some jazz' or add music to ~/Music folder."
        finally:
            await _disconnect_client(client)
            
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_play_error", error=str(e))
        return f"Error playing music: {e}"


@tool_registry.register(
    description="Pause music playback. Use music_play to resume."
)
async def music_pause() -> str:
    """Pause the currently playing music."""
    try:
        client = await _get_client()
        try:
            await client.pause(1)
            await _update_music_state()
            return "Music paused."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_pause_error", error=str(e))
        return f"Error pausing music: {e}"


@tool_registry.register(
    description="Stop music playback completely and clear the position."
)
async def music_stop() -> str:
    """Stop music playback."""
    try:
        client = await _get_client()
        try:
            await client.stop()
            await _update_music_state()
            return "Music stopped."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_stop_error", error=str(e))
        return f"Error stopping music: {e}"


@tool_registry.register(
    description="Skip to the next track in the queue."
)
async def music_next() -> str:
    """Skip to next track."""
    try:
        client = await _get_client()
        try:
            await client.next()
            await asyncio.sleep(0.3)  # Let MPD update
            await _update_music_state()
            
            if _music_state["current_track"]:
                artist = _music_state.get("artist", "")
                track = _music_state.get("current_track", "Unknown")
                if artist:
                    return f"Skipped. Now playing: {artist} - {track}"
                return f"Skipped. Now playing: {track}"
            return "Skipped to next track."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_next_error", error=str(e))
        return f"Error skipping track: {e}"


@tool_registry.register(
    description="Go back to the previous track."
)
async def music_previous() -> str:
    """Go to previous track."""
    try:
        client = await _get_client()
        try:
            await client.previous()
            await asyncio.sleep(0.3)
            await _update_music_state()
            
            if _music_state["current_track"]:
                artist = _music_state.get("artist", "")
                track = _music_state.get("current_track", "Unknown")
                if artist:
                    return f"Previous track: {artist} - {track}"
                return f"Previous track: {track}"
            return "Went to previous track."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_previous_error", error=str(e))
        return f"Error going to previous track: {e}"


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
    
    try:
        client = await _get_client()
        try:
            await client.setvol(level)
            _music_state["volume"] = level
            return f"Volume set to {level}%"
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_volume_error", error=str(e))
        return f"Error setting volume: {e}"


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
    try:
        client = await _get_client()
        try:
            if enable is None:
                # Toggle
                status = await client.status()
                current = status.get('random', '0') == '1'
                await client.random(0 if current else 1)
            else:
                await client.random(1 if enable else 0)
            
            await _update_music_state()
            state = "enabled" if _music_state["random"] else "disabled"
            return f"Shuffle {state}."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_shuffle_error", error=str(e))
        return f"Error setting shuffle: {e}"


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
    try:
        client = await _get_client()
        try:
            if enable is None:
                # Toggle
                status = await client.status()
                current = status.get('repeat', '0') == '1'
                await client.repeat(0 if current else 1)
            else:
                await client.repeat(1 if enable else 0)
            
            await _update_music_state()
            state = "enabled" if _music_state["repeat"] else "disabled"
            return f"Repeat {state}."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_repeat_error", error=str(e))
        return f"Error setting repeat: {e}"


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
    try:
        client = await _get_client()
        try:
            search_results = await client.search('any', query)
            
            if not search_results:
                return f"No results found for '{query}'. Make sure you have music files in ~/Music."
            
            results = search_results[:limit]
            
            result_lines = [f"Found {len(search_results)} tracks matching '{query}' (showing {len(results)}):"]
            for i, song in enumerate(results, 1):
                artist = song.get('artist', 'Unknown Artist')
                title = song.get('title', song.get('file', 'Unknown').split('/')[-1])
                result_lines.append(f"{i}. {artist} - {title}")
            
            result_lines.append("\nSay 'play [search term]' to play these results.")
            return "\n".join(result_lines)
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_search_error", error=str(e))
        return f"Error searching music: {e}"


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
    try:
        client = await _get_client()
        try:
            search_results = await client.search('any', query)
            
            if not search_results:
                return f"No music found matching '{query}'."
            
            added = 0
            for song in search_results[:10]:
                file = song.get('file')
                if file:
                    await client.add(file)
                    added += 1
            
            await _update_music_state()
            return f"Added {added} tracks to the queue. Queue now has {_music_state['queue_length']} tracks."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_queue_add_error", error=str(e))
        return f"Error adding to queue: {e}"


@tool_registry.register(
    description="Clear the music queue."
)
async def music_queue_clear() -> str:
    """Clear all tracks from the queue."""
    try:
        client = await _get_client()
        try:
            await client.clear()
            await _update_music_state()
            return "Queue cleared."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_queue_clear_error", error=str(e))
        return f"Error clearing queue: {e}"


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
    try:
        client = await _get_client()
        try:
            playlist = await client.playlistinfo()
            
            if not playlist:
                return "Queue is empty."
            
            total = len(playlist)
            
            # Get current track position
            status = await client.status()
            current_pos = int(status.get('song', -1))
            
            result_lines = [f"Queue ({total} tracks):"]
            for i, song in enumerate(playlist[:limit]):
                marker = "▶ " if i == current_pos else "  "
                artist = song.get('artist', 'Unknown Artist')
                title = song.get('title', song.get('file', 'Unknown').split('/')[-1])
                result_lines.append(f"{marker}{i+1}. {artist} - {title}")
            
            if total > limit:
                result_lines.append(f"  ... and {total - limit} more")
            
            return "\n".join(result_lines)
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_queue_show_error", error=str(e))
        return f"Error showing queue: {e}"


@tool_registry.register(
    description="List available playlists."
)
async def music_playlists() -> str:
    """List saved playlists."""
    try:
        client = await _get_client()
        try:
            playlists = await client.listplaylists()
            
            if not playlists:
                return "No playlists found. Create one with 'save playlist [name]'."
            
            return "Available playlists:\n" + "\n".join(f"• {p['playlist']}" for p in playlists)
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_playlists_error", error=str(e))
        return f"Error listing playlists: {e}"


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
    try:
        client = await _get_client()
        try:
            await client.clear()
            await client.load(name)
            await client.play(0)
            await _update_music_state()
            
            return f"Loaded playlist '{name}'. Now playing: {_music_state.get('current_track', 'Unknown')}"
        finally:
            await _disconnect_client(client)
    except Exception as e:
        if "No such playlist" in str(e) or "doesn't exist" in str(e):
            return f"Playlist '{name}' not found. Use 'list playlists' to see available ones."
        logger.error("music_playlist_load_error", error=str(e))
        return f"Error loading playlist: {e}"


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
    try:
        client = await _get_client()
        try:
            # Remove old playlist with same name if exists
            try:
                await client.rm(name)
            except:
                pass  # Playlist doesn't exist, that's fine
            
            await client.save(name)
            return f"Saved current queue as playlist '{name}'."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_playlist_save_error", error=str(e))
        return f"Error saving playlist: {e}"


@tool_registry.register(
    description="Update the music database by scanning for new files."
)
async def music_update_library() -> str:
    """Scan for new music files and update the database."""
    try:
        client = await _get_client()
        try:
            await client.update()
            return "Updating music database. This may take a moment for large libraries."
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_update_error", error=str(e))
        return f"Error updating library: {e}"


@tool_registry.register(
    description="Get music library statistics."
)
async def music_stats() -> str:
    """Get library statistics."""
    try:
        client = await _get_client()
        try:
            stats = await client.stats()
            
            result = ["🎵 Music Library Stats:"]
            
            artists = stats.get('artists', '0')
            albums = stats.get('albums', '0')
            songs = stats.get('songs', '0')
            
            result.append(f"  Artists: {artists}")
            result.append(f"  Albums: {albums}")
            result.append(f"  Songs: {songs}")
            
            # Format play time
            playtime = int(stats.get('playtime', 0))
            if playtime > 0:
                hours = playtime // 3600
                minutes = (playtime % 3600) // 60
                result.append(f"  Total Play Time: {hours}h {minutes}m")
            
            db_playtime = int(stats.get('db_playtime', 0))
            if db_playtime > 0:
                hours = db_playtime // 3600
                minutes = (db_playtime % 3600) // 60
                days = hours // 24
                hours = hours % 24
                if days > 0:
                    result.append(f"  Library Duration: {days}d {hours}h {minutes}m")
                else:
                    result.append(f"  Library Duration: {hours}h {minutes}m")
            
            if songs == '0':
                return "Music library is empty. Add files to ~/Music and run 'update music library'."
            
            return "\n".join(result)
        finally:
            await _disconnect_client(client)
    except ConnectionError as e:
        return str(e)
    except Exception as e:
        logger.error("music_stats_error", error=str(e))
        return f"Error getting stats: {e}"
