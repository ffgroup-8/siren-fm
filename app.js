// ========================================
// dreamlayer — tune into the night
// ========================================

// --- Scanner feed data ---
// type: 'stream' = direct Broadcastify CDN stream
// type: 'openmhz' = OpenMHz call-based feed (plays recorded calls sequentially)
const SCANNER_FEEDS = [
    { city: 'Dallas',         state: 'TX', desc: 'Police & Fire',  type: 'openmhz', system: 'ntirnd1' },
    { city: 'San Francisco',  state: 'CA', desc: 'Police',         type: 'openmhz', system: 'sfp25'   },
    { city: 'Washington',     state: 'DC', desc: 'Fire & EMS',     type: 'openmhz', system: 'dcfd'    },
];

// --- SoundCloud playlists per listening mode ---
// Each mode can have multiple playlists; one is chosen at random on load/switch
const MODE_PLAYLISTS = {
    ambient: [
        'https://soundcloud.com/apple_fish/sets/deep-space-ambient',
        'https://soundcloud.com/worldbeatjeremy/sets/space-dreams-ambient-drone',
    ],
    synthwave: [
        'https://soundcloud.com/chinosynth/sets/chino-synthwave-selection',
    ],
    zen: [
        'https://soundcloud.com/naklea/sets/deep-ambient-zen-garden',
    ],
};

function pickPlaylist(mode) {
    const list = MODE_PLAYLISTS[mode];
    return list[Math.floor(Math.random() * list.length)];
}

function shuffleIndices(count) {
    const indices = Array.from({ length: count }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
}

// ========================================
// Visualizer
// ========================================

function createVisualizer(container, barCount, accentClass) {
    container.innerHTML = '';
    for (let i = 0; i < barCount; i++) {
        const bar = document.createElement('div');
        bar.className = 'viz-bar';
        const minH = 4 + Math.random() * 4;
        const maxH = 16 + Math.random() * 28;
        const speed = 0.6 + Math.random() * 0.8;
        bar.style.setProperty('--min-h', minH + 'px');
        bar.style.setProperty('--max-h', maxH + 'px');
        bar.style.setProperty('--speed', speed + 's');
        bar.style.height = minH + 'px';
        bar.style.animationDelay = (Math.random() * speed) + 's';
        container.appendChild(bar);
    }
}

function setVisualizerActive(container, active) {
    container.querySelectorAll('.viz-bar').forEach(bar => {
        bar.classList.toggle('active', active);
        if (!active) {
            bar.style.height = bar.style.getPropertyValue('--min-h') || '4px';
        }
    });
}

// ========================================
// Scanner Player
// ========================================

class ScannerPlayer {
    constructor() {
        this.audio = document.getElementById('scanner-audio');
        this.select = document.getElementById('feed-select');
        this.playBtn = document.getElementById('scanner-play');
        this.volumeSlider = document.getElementById('scanner-volume');
        this.panel = document.querySelector('.scanner-panel');
        this.liveBadge = document.getElementById('scanner-live');
        this.statusEl = document.getElementById('scanner-status');
        this.vizContainer = document.getElementById('scanner-viz');

        this.isPlaying = false;
        this.currentFeed = null;

        // OpenMHz state
        this.callQueue = [];
        this.pollTimer = null;
        this.lastCallTime = null;

        this.populateFeeds();
        createVisualizer(this.vizContainer, 32, 'scanner');
        this.bindEvents();

        this.audio.volume = parseInt(this.volumeSlider.value) / 100;
    }

    populateFeeds() {
        SCANNER_FEEDS.forEach((feed, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `${feed.city}, ${feed.state}`;
            this.select.appendChild(opt);
        });
    }

    bindEvents() {
        this.select.addEventListener('change', () => this.onFeedChange());
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.volumeSlider.addEventListener('input', () => this.onVolume());
        this.volumeSlider.addEventListener('change', () => this.onVolume());

        this.audio.addEventListener('playing', () => {
            this.liveBadge.classList.remove('hidden');
            this.panel.classList.add('active');
            setVisualizerActive(this.vizContainer, true);
        });

        this.audio.addEventListener('waiting', () => {
            this.setStatus('Buffering...');
        });

        this.audio.addEventListener('error', () => {
            // For OpenMHz, try the next call in queue instead of giving up
            if (this.currentFeed && this.currentFeed.type === 'openmhz') {
                this.playNextCall();
                return;
            }
            this.setStatus('Stream unavailable — try another city');
            this.liveBadge.classList.add('hidden');
            this.panel.classList.remove('active');
            setVisualizerActive(this.vizContainer, false);
            this.isPlaying = false;
            this.playBtn.classList.remove('playing');
        });

        this.audio.addEventListener('pause', () => {
            // Don't deactivate UI for brief pauses between OpenMHz calls
            if (this.currentFeed && this.currentFeed.type === 'openmhz' && this.isPlaying) return;
            this.panel.classList.remove('active');
            this.liveBadge.classList.add('hidden');
            setVisualizerActive(this.vizContainer, false);
        });

        // When an OpenMHz call ends, play the next one
        this.audio.addEventListener('ended', () => {
            if (this.currentFeed && this.currentFeed.type === 'openmhz' && this.isPlaying) {
                this.playNextCall();
            }
        });
    }

    // Fully tear down any current playback
    resetAudio() {
        this.stopOpenMHz();
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
    }

    onFeedChange() {
        this.resetAudio();
        const idx = parseInt(this.select.value);
        this.currentFeed = SCANNER_FEEDS[idx];
        this.playBtn.disabled = false;
        this.setStatus(this.currentFeed.desc);

        if (this.currentFeed.type === 'openmhz') {
            this.startOpenMHz();
        } else {
            this.audio.src = this.currentFeed.url;
            this.audio.load();
            this.audio.play().catch(() => {});
        }
        this.isPlaying = true;
        this.playBtn.classList.add('playing');
    }

    togglePlay() {
        if (!this.currentFeed) return;

        if (this.isPlaying) {
            if (this.currentFeed.type === 'openmhz') {
                this.stopOpenMHz();
            }
            this.audio.pause();
            this.isPlaying = false;
            this.playBtn.classList.remove('playing');
            this.panel.classList.remove('active');
            this.liveBadge.classList.add('hidden');
            setVisualizerActive(this.vizContainer, false);
        } else {
            this.isPlaying = true;
            this.playBtn.classList.add('playing');
            if (this.currentFeed.type === 'openmhz') {
                this.startOpenMHz();
            } else {
                // Fresh connection for live streams
                this.audio.removeAttribute('src');
                this.audio.load();
                this.audio.src = this.currentFeed.url;
                this.audio.load();
                this.audio.play().catch(() => {});
            }
        }
    }

    // --- OpenMHz integration ---

    async startOpenMHz() {
        this.callQueue = [];
        // Start with calls from the last 2 minutes
        this.lastCallTime = Date.now() - 120000;
        this.setStatus('Connecting...');
        this.liveBadge.classList.remove('hidden');
        this.panel.classList.add('active');
        setVisualizerActive(this.vizContainer, true);
        await this.fetchCalls();
        this.pollTimer = setInterval(() => this.fetchCalls(), 8000);
    }

    stopOpenMHz() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.callQueue = [];
    }

    async fetchCalls() {
        if (!this.currentFeed || this.currentFeed.type !== 'openmhz') return;

        try {
            // OpenMHz time format: unix seconds with 3 decimal digits appended (no dot)
            const timeParam = Math.floor(this.lastCallTime);
            const apiUrl = `https://api.openmhz.com/${this.currentFeed.system}/calls/newer?time=${timeParam}`;

            const resp = await fetch(apiUrl);
            if (!resp.ok) throw new Error(`API ${resp.status}`);

            const data = await resp.json();
            const calls = data.calls || [];

            if (calls.length > 0) {
                // Filter out very short calls (< 1 sec) and add to queue
                const newCalls = calls.filter(c => c.len > 1);
                this.callQueue.push(...newCalls);

                // Update lastCallTime to the most recent call
                const newest = calls[calls.length - 1];
                if (newest && newest.time) {
                    this.lastCallTime = new Date(newest.time).getTime() + 1;
                }
            }

            // If audio isn't currently playing a call, start the next one
            if (this.isPlaying && (this.audio.paused || this.audio.ended)) {
                this.playNextCall();
            }

            if (this.callQueue.length === 0 && this.audio.paused) {
                this.setStatus('Listening for calls...');
            }
        } catch (err) {
            console.warn('OpenMHz fetch error:', err);
            this.setStatus('Listening for calls...');
        }
    }

    playNextCall() {
        if (this.callQueue.length === 0) {
            this.setStatus('Listening for calls...');
            return;
        }

        const call = this.callQueue.shift();
        const audioUrl = call.url || call.filename;

        if (!audioUrl) {
            // Skip calls with no audio, try next
            this.playNextCall();
            return;
        }

        this.setStatus(this.currentFeed.desc);
        this.audio.src = audioUrl;
        this.audio.load();
        this.audio.play().catch(() => {
            // If playback fails, try the next call
            setTimeout(() => this.playNextCall(), 300);
        });
    }

    onVolume() {
        this.audio.volume = parseInt(this.volumeSlider.value) / 100;
    }

    setStatus(text) {
        this.statusEl.querySelector('.status-text').textContent = text;
    }
}

// ========================================
// Ambient Player (SoundCloud Widget)
// ========================================

class AmbientPlayer {
    constructor() {
        this.iframe = document.getElementById('sc-widget');
        this.playBtn = document.getElementById('ambient-play');
        this.nextBtn = document.getElementById('ambient-next');
        this.prevBtn = document.getElementById('ambient-prev');
        this.volumeSlider = document.getElementById('ambient-volume');
        this.titleEl = document.getElementById('track-title');
        this.artistEl = document.getElementById('track-artist');
        this.panel = document.querySelector('.ambient-panel');
        this.vizContainer = document.getElementById('ambient-viz');
        this.modeLabel = document.getElementById('mode-label');
        this.atmosphere = document.getElementById('atmosphere');

        this.currentMode = 'ambient';
        this.isPlaying = false;
        this.hasBeenPlayed = false; // true once user hits play at least once
        this.switching = false;     // true during mode switch to ignore transient PAUSE events
        this.widget = null;
        this.ready = false;
        this.widgetInitialized = false;
        this.shuffledOrder = [];
        this.shufflePos = 0;
        this.trackCount = 0;

        createVisualizer(this.vizContainer, 32, 'ambient');
        this.panel.classList.add('mode-ambient');
        this.bindEvents();
        this.bootWidget();
    }

    bindEvents() {
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.nextBtn.addEventListener('click', () => this.next());
        this.prevBtn.addEventListener('click', () => this.prev());
        this.volumeSlider.addEventListener('input', () => this.onVolume());
        this.volumeSlider.addEventListener('change', () => this.onVolume());

        // Mode switching — use click instead of change for better iOS gesture handling
        document.querySelectorAll('input[name="mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.switchMode(e.target.value));
        });
    }

    // Boot the widget once with the initial playlist, bind events once
    bootWidget() {
        this.titleEl.textContent = 'Loading playlist...';
        this.artistEl.textContent = '';

        const initialUrl = pickPlaylist(this.currentMode);
        const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(initialUrl)}&auto_play=false&show_artwork=false&show_playcount=false&show_user=true&color=%23a855f7`;
        this.iframe.src = embedUrl;

        this.iframe.onload = () => {
            if (this.widgetInitialized) return;
            this.initWidget();
        };
    }

    initWidget() {
        if (typeof SC === 'undefined' || !SC.Widget) {
            setTimeout(() => this.initWidget(), 200);
            return;
        }

        this.widget = SC.Widget(this.iframe);
        this.widgetInitialized = true;

        this.widget.bind(SC.Widget.Events.READY, () => {
            this.ready = true;
            this.widget.setVolume(parseInt(this.volumeSlider.value));
            this.onPlaylistLoaded();
        });

        this.widget.bind(SC.Widget.Events.PLAY, () => {
            this.isPlaying = true;
            this.hasBeenPlayed = true;
            this.playBtn.classList.add('playing');
            this.panel.classList.add('active');
            setVisualizerActive(this.vizContainer, true);
            this.updateTrackInfo();
        });

        this.widget.bind(SC.Widget.Events.PAUSE, () => {
            // Ignore transient pauses during mode switching
            if (this.switching) return;
            this.isPlaying = false;
            this.playBtn.classList.remove('playing');
            this.panel.classList.remove('active');
            setVisualizerActive(this.vizContainer, false);
        });

        this.widget.bind(SC.Widget.Events.FINISH, () => {
            this.next();
        });

        this.widget.bind(SC.Widget.Events.ERROR, () => {
            this.titleEl.textContent = 'Track unavailable';
            this.artistEl.textContent = 'Skipping...';
            setTimeout(() => this.next(), 1500);
        });
    }

    onPlaylistLoaded() {
        this.widget.getSounds((sounds) => {
            this.trackCount = sounds.length;
            if (this.trackCount > 0) {
                this.shuffledOrder = shuffleIndices(this.trackCount);
                this.shufflePos = 0;

                const targetIndex = this.shuffledOrder[0];

                // Skip to a random track, then play immediately
                // Use a short delay for the widget to register the skip,
                // then bind to PLAY_PROGRESS to confirm playback and update info
                this.widget.skip(targetIndex);

                if (this.isPlaying) {
                    // Call play() repeatedly to overcome mobile autoplay restrictions
                    this.widget.play();
                    setTimeout(() => {
                        this.widget.play();
                        this.switching = false;
                        this.updateTrackInfo();
                    }, 400);
                    setTimeout(() => {
                        this.widget.play();
                        this.updateTrackInfo();
                    }, 1000);
                } else {
                    setTimeout(() => {
                        this.switching = false;
                        this.updateTrackInfo();
                    }, 800);
                }
            } else {
                this.switching = false;
                this.titleEl.textContent = 'No tracks loaded';
                this.artistEl.textContent = '';
            }
        });
    }

    switchMode(mode) {
        if (mode === this.currentMode) return;
        // Auto-play on switch if user has played at any point this session
        const shouldPlay = this.isPlaying || this.hasBeenPlayed;
        this.currentMode = mode;
        this.ready = false;
        this.switching = true;

        // Update header label, background, and panel mode class
        this.modeLabel.textContent = mode.toUpperCase();
        this.atmosphere.dataset.mode = mode;
        this.panel.classList.remove('mode-ambient', 'mode-synthwave', 'mode-zen');
        this.panel.classList.add('mode-' + mode);

        this.titleEl.textContent = 'Loading playlist...';
        this.artistEl.textContent = '';

        // Keep UI active during transition if should auto-play
        if (shouldPlay) {
            this.isPlaying = true;
            this.playBtn.classList.add('playing');
            this.panel.classList.add('active');
            setVisualizerActive(this.vizContainer, true);
        }

        // Use widget.load() to swap playlists without recreating the widget
        if (this.widget) {
            this.widget.load(pickPlaylist(mode), {
                auto_play: shouldPlay,
                show_artwork: false,
                callback: () => {
                    this.ready = true;
                    this.isPlaying = shouldPlay;
                    this.widget.setVolume(parseInt(this.volumeSlider.value));
                    // Immediately call play before onPlaylistLoaded
                    // to maintain user-gesture context on mobile
                    if (shouldPlay) this.widget.play();
                    this.onPlaylistLoaded();
                }
            });
        }
    }

    updateTrackInfo() {
        if (!this.widget) return;
        this.widget.getCurrentSound((sound) => {
            if (sound) {
                this.titleEl.textContent = sound.title || 'Unknown Track';
                this.artistEl.textContent = sound.user ? sound.user.username : '';
            }
        });
    }

    togglePlay() {
        if (!this.widget || !this.ready) return;
        if (this.isPlaying) {
            this.widget.pause();
        } else {
            this.widget.play();
        }
    }

    next() {
        if (!this.widget || !this.ready || this.trackCount === 0) return;
        this.shufflePos = (this.shufflePos + 1) % this.shuffledOrder.length;
        if (this.shufflePos === 0) {
            this.shuffledOrder = shuffleIndices(this.trackCount);
        }
        this.widget.skip(this.shuffledOrder[this.shufflePos]);
        setTimeout(() => {
            this.updateTrackInfo();
            if (this.isPlaying) this.widget.play();
        }, 500);
    }

    prev() {
        if (!this.widget || !this.ready || this.trackCount === 0) return;
        this.shufflePos = (this.shufflePos - 1 + this.shuffledOrder.length) % this.shuffledOrder.length;
        this.widget.skip(this.shuffledOrder[this.shufflePos]);
        setTimeout(() => {
            this.updateTrackInfo();
            if (this.isPlaying) this.widget.play();
        }, 500);
    }

    onVolume() {
        if (this.widget && this.ready) {
            this.widget.setVolume(parseInt(this.volumeSlider.value));
        }
    }
}

// ========================================
// Init
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    new ScannerPlayer();
    new AmbientPlayer();
});
