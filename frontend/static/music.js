/**
 * Voice Agent - Music Player Module
 * Handles music playback UI and WebSocket communication with MPD
 */

import { setAvatarState, getAvatarState, AVATAR_STATES } from './avatar.js';

// Music player state
let musicPlayerEl = null;
let isPlaying = false;
let isMuted = false;
let currentVolume = 80;
let previousVolume = 80;  // For ducking
let isDucked = false;
let pollInterval = null;
let sendMessage = null;  // WebSocket send function

// Music info
let currentTrack = {
    title: 'Not Playing',
    artist: '—',
    elapsed: 0,
    duration: 0
};

/**
 * Initialize music player module
 * @param {Function} wsSend - WebSocket send function
 */
export function initMusicPlayer(wsSend) {
    sendMessage = wsSend;
    
    // Cache elements
    musicPlayerEl = document.getElementById('musicPlayer');
    if (!musicPlayerEl) {
        console.warn('Music player element not found');
        return;
    }
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('Music player initialized');
}

/**
 * Setup event listeners for music controls
 */
function setupEventListeners() {
    // Play/Pause button
    const playPauseBtn = document.getElementById('musicPlayPause');
    playPauseBtn?.addEventListener('click', () => {
        if (isPlaying) {
            sendMusicCommand('music_pause');
        } else {
            sendMusicCommand('music_play');
        }
    });
    
    // Previous button
    const prevBtn = document.getElementById('musicPrev');
    prevBtn?.addEventListener('click', () => {
        sendMusicCommand('music_previous');
    });
    
    // Next button
    const nextBtn = document.getElementById('musicNext');
    nextBtn?.addEventListener('click', () => {
        sendMusicCommand('music_next');
    });
    
    // Volume slider
    const volumeSlider = document.getElementById('musicVolumeSlider');
    volumeSlider?.addEventListener('input', (e) => {
        const volume = parseInt(e.target.value);
        setVolume(volume);
    });
    
    // Mute button
    const muteBtn = document.getElementById('musicMute');
    muteBtn?.addEventListener('click', () => {
        toggleMute();
    });
    
    // Close button
    const closeBtn = document.getElementById('musicClose');
    closeBtn?.addEventListener('click', () => {
        hidePlayer();
        sendMusicCommand('music_stop');
    });
}

/**
 * Send a music command via WebSocket
 */
function sendMusicCommand(command, params = {}) {
    if (!sendMessage) {
        console.warn('WebSocket not connected');
        return;
    }
    
    sendMessage({
        type: 'music_command',
        command: command,
        params: params
    });
}

/**
 * Update music player state from server
 * @param {Object} state - Music state from server
 */
export function updateMusicState(state) {
    if (!state) return;
    
    const wasPlaying = isPlaying;
    isPlaying = state.state === 'play';
    
    // Update track info
    if (state.title || state.file) {
        currentTrack.title = state.title || extractFilename(state.file) || 'Unknown Track';
        currentTrack.artist = state.artist || '—';
        currentTrack.elapsed = state.elapsed || 0;
        currentTrack.duration = state.duration || 0;
    }
    
    // Update volume (unless ducked)
    if (state.volume !== undefined && !isDucked) {
        currentVolume = state.volume;
        updateVolumeUI(state.volume);
    }
    
    // Update UI
    updatePlayerUI();
    
    // Show/hide player based on state
    if (isPlaying || state.state === 'pause') {
        showPlayer();
    }
    
    // Update avatar state
    if (isPlaying && !wasPlaying) {
        // Only set grooving if we're idle (don't interrupt speaking/listening)
        const currentAvatarState = getAvatarState();
        if (currentAvatarState === AVATAR_STATES.IDLE) {
            setAvatarState(AVATAR_STATES.GROOVING);
        }
    } else if (!isPlaying && wasPlaying) {
        // Return to idle when music stops (if currently grooving)
        const currentAvatarState = getAvatarState();
        if (currentAvatarState === AVATAR_STATES.GROOVING) {
            setAvatarState(AVATAR_STATES.IDLE);
        }
    }
}

/**
 * Extract filename from path
 */
function extractFilename(path) {
    if (!path) return null;
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    // Remove extension
    return filename.replace(/\.[^/.]+$/, '');
}

/**
 * Update the player UI elements
 */
function updatePlayerUI() {
    // Update title and artist
    const titleEl = document.getElementById('musicTitle');
    const artistEl = document.getElementById('musicArtist');
    if (titleEl) titleEl.textContent = currentTrack.title;
    if (artistEl) artistEl.textContent = currentTrack.artist;
    
    // Update play/pause button
    const playIcon = musicPlayerEl?.querySelector('.play-icon');
    const pauseIcon = musicPlayerEl?.querySelector('.pause-icon');
    if (playIcon && pauseIcon) {
        playIcon.style.display = isPlaying ? 'none' : 'block';
        pauseIcon.style.display = isPlaying ? 'block' : 'none';
    }
    
    // Update progress bar
    const progressBar = document.getElementById('musicProgressBar');
    if (progressBar && currentTrack.duration > 0) {
        const progress = (currentTrack.elapsed / currentTrack.duration) * 100;
        progressBar.style.width = `${progress}%`;
    }
    
    // Update paused class for animations
    if (musicPlayerEl) {
        musicPlayerEl.classList.toggle('paused', !isPlaying);
    }
}

/**
 * Update volume UI
 */
function updateVolumeUI(volume) {
    const volumeSlider = document.getElementById('musicVolumeSlider');
    if (volumeSlider) {
        volumeSlider.value = volume;
    }
    
    // Update mute icons
    const volumeIcon = musicPlayerEl?.querySelector('.volume-icon');
    const muteIcon = musicPlayerEl?.querySelector('.mute-icon');
    if (volumeIcon && muteIcon) {
        volumeIcon.style.display = volume > 0 ? 'block' : 'none';
        muteIcon.style.display = volume > 0 ? 'none' : 'block';
    }
}

/**
 * Set volume
 */
function setVolume(volume) {
    currentVolume = volume;
    sendMusicCommand('music_volume', { level: volume });
    updateVolumeUI(volume);
    
    // Update muted state
    isMuted = volume === 0;
}

/**
 * Toggle mute
 */
function toggleMute() {
    if (isMuted) {
        setVolume(previousVolume || 80);
        isMuted = false;
    } else {
        previousVolume = currentVolume;
        setVolume(0);
        isMuted = true;
    }
}

/**
 * Show the music player
 */
export function showPlayer() {
    if (musicPlayerEl) {
        musicPlayerEl.classList.remove('hidden');
    }
}

/**
 * Hide the music player
 */
export function hidePlayer() {
    if (musicPlayerEl) {
        musicPlayerEl.classList.add('hidden');
    }
    
    // Return avatar to idle if grooving
    const currentAvatarState = getAvatarState();
    if (currentAvatarState === AVATAR_STATES.GROOVING) {
        setAvatarState(AVATAR_STATES.IDLE);
    }
}

/**
 * Duck the music volume (when Felix is speaking)
 * @param {number} duckLevel - Volume level to duck to (0-100)
 */
export function duckVolume(duckLevel = 20) {
    if (isDucked || !isPlaying) return;
    
    isDucked = true;
    previousVolume = currentVolume;
    
    // Send duck command
    sendMusicCommand('music_volume', { level: duckLevel });
    
    // Update UI to show ducked state
    if (musicPlayerEl) {
        musicPlayerEl.classList.add('ducked');
    }
    
    console.log(`Music ducked from ${previousVolume}% to ${duckLevel}%`);
}

/**
 * Restore volume after ducking
 */
export function restoreVolume() {
    if (!isDucked) return;
    
    isDucked = false;
    
    // Restore previous volume
    sendMusicCommand('music_volume', { level: previousVolume });
    
    // Remove ducked state
    if (musicPlayerEl) {
        musicPlayerEl.classList.remove('ducked');
    }
    
    console.log(`Music restored to ${previousVolume}%`);
}

/**
 * Check if music is currently playing
 */
export function isMusicPlaying() {
    return isPlaying;
}

/**
 * Get current volume
 */
export function getCurrentVolume() {
    return currentVolume;
}

/**
 * Handle music tool results
 * @param {Object} result - Tool result from server
 */
export function handleMusicToolResult(result) {
    if (!result) return;
    
    // The tool result may contain updated state
    if (result.state !== undefined) {
        updateMusicState(result);
    }
    
    // If it's a play command result, show the player
    if (result.text && result.text.includes('Playing')) {
        showPlayer();
    }
}

/**
 * Start polling for music status
 * @param {number} interval - Poll interval in ms
 */
export function startStatusPolling(interval = 5000) {
    if (pollInterval) return;
    
    pollInterval = setInterval(() => {
        if (isPlaying || !musicPlayerEl?.classList.contains('hidden')) {
            sendMusicCommand('music_now_playing');
        }
    }, interval);
}

/**
 * Stop polling for music status
 */
export function stopStatusPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

/**
 * Cleanup music player
 */
export function destroyMusicPlayer() {
    stopStatusPolling();
    hidePlayer();
    sendMessage = null;
}
