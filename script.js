class CuckooAudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.volume = 0.8;
        this.tickEnabled = false;
        this.enabled = false;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.setValueAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime);
                this.masterGain.connect(this.ctx.destination);
            }
        }
    }

    // True only when the context is actually running (audio can play)
    isRunning() {
        return !!(this.ctx && this.ctx.state === 'running');
    }

    // Create/resume the AudioContext. Must be called from a user gesture,
    // because browsers block audio until the page receives one (autoplay policy).
    activate() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Turn sound ON and restore the master volume
    enableAudio() {
        this.enabled = true;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        }
    }

    toggleAudio() {
        this.activate();
        // While the browser still has audio blocked (context suspended),
        // treat clicks as activation gestures: enable sound instead of toggling.
        if (!this.isRunning()) {
            this.enabled = true;
            return this.enabled;
        }
        this.enabled = !this.enabled;
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setValueAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime);
        }
        return this.enabled;
    }

    setVolume(val) {
        this.volume = val;
        if (this.masterGain && this.ctx && this.enabled) {
            this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        }
    }

    playTickTock(isTick) {
        if (!this.enabled || !this.tickEnabled || !this.ctx || this.ctx.state !== 'running') return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(isTick ? 1200 : 800, now);
        filter.Q.setValueAtTime(3, now);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isTick ? 600 : 450, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.03);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.035);
    }

    playCuckooNote(freq, startTime, duration) {
        if (!this.ctx || !this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.96, startTime + duration);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, startTime);

        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.03);
        gain.gain.setValueAtTime(0.4, startTime + duration - 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    playCuckooCall(onComplete) {
        const totalDurationMs = (0.22 + 0.05 + 0.38 + 0.1) * 1000;

        if (!this.ctx || !this.enabled) {
            setTimeout(() => {
                if (onComplete) onComplete();
            }, totalDurationMs);
            return;
        }

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const now = this.ctx.currentTime;
        const note1Freq = 659.25; // E5
        const note2Freq = 523.25; // C5

        const note1Duration = 0.22;
        const note2Duration = 0.38;
        const gap = 0.05;

        this.playCuckooNote(note1Freq, now, note1Duration);
        this.playCuckooNote(note2Freq, now + note1Duration + gap, note2Duration);

        setTimeout(() => {
            if (onComplete) onComplete();
        }, totalDurationMs);
    }
}

// Global App State
const audio = new CuckooAudioEngine();
let isRealTimeMode = true;
let autoChimeEnabled = true;
let autoRewindEnabled = true;
let isCuckooActive = false;
let currentSimTime = new Date();
let speedMultiplier = 1;
let weightDropAmount = 0;
let lastSecond = -1;
let lastTickSide = false;
let busScheduleEnabled = false; // Bus schedule panel ON/OFF (Settings toggle)
let learnPanelEnabled = false; // Learning panel (Math -> Addition) ON/OFF
// Unified Read-Aloud (TTS) mode: 'off' | 'auto' | 'browser' | 'google'.
// 'off' == muted; 'auto' == browser with Google fallback; 'browser'/'google'
// are exclusive with no fallback (silent on failure). Default 'auto'.
let ttsMode = 'auto';
// Derived mirrors kept for the Learn-iframe bridge + legacy settings:
let ttsEnabled = true;         // ttsMode !== 'off'
let ttsEngine = 'auto';        // effective engine sent to the iframe

// Below this width the bus + learn panels would crowd out the clock,
// so only one left-docked panel is allowed at a time (opening one
// auto-collapses the other). Above it they coexist side by side.
const PANEL_COEXIST_MIN_WIDTH = 960;

// DOM Elements
const hourHandGroup = document.getElementById('hourHandGroup');
const minuteHandGroup = document.getElementById('minuteHandGroup');
const secondHandGroup = document.getElementById('secondHandGroup');
const digitalClock = document.getElementById('digitalClock');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const digitalTimeOverlay = document.getElementById('digitalTimeOverlay');
const digitalTimeText = document.getElementById('digitalTimeText');
const digitalTimeToggle = document.getElementById('digitalTimeToggle');
const cuckooHouse = document.getElementById('cuckooHouse');
const dancingBalcony = document.getElementById('dancingBalcony');
const enableAudioBtn = document.getElementById('enableAudioBtn');
const audioBtnText = document.getElementById('audioBtnText');
const triggerCuckooBtn = document.getElementById('triggerCuckooBtn');
const toggleTimeModeBtn = document.getElementById('toggleTimeModeBtn');
const timeModeText = document.getElementById('timeModeText');
const manualControls = document.getElementById('manualControls');
const hourSlider = document.getElementById('hourSlider');
const manualHourVal = document.getElementById('manualHourVal');
const speedSlider = document.getElementById('speedSlider');
const speedVal = document.getElementById('speedVal');
const tickTockToggle = document.getElementById('tickTockToggle');
const autoChimeToggle = document.getElementById('autoChimeToggle');
const autoRewindToggle = document.getElementById('autoRewindToggle');
const volumeSlider = document.getElementById('volumeSlider');
const volumeVal = document.getElementById('volumeVal');

// Quick-access bus route shortcuts rendered into the RIGHT-side
// sidebar. The list starts EMPTY and is fully user-managed via
// Settings -> "Bus Route Shortcuts" (add / update / delete),
// persisted in localStorage. No routes are hardcoded here.
const BUS_ROUTES_STORAGE_KEY = 'clock.busRoutes';
const BUS_HOME_URL = 'https://hkbus.app/zh';
let currentBusUrl = BUS_HOME_URL; // last URL loaded into the embed
let activeRouteUrl = null; // shortcut currently highlighted, if any
let editingRouteIndex = -1; // -1 = adding a new route, >= 0 = editing

// Read the shortcut list from localStorage. Starts empty when
// nothing (valid) is stored; malformed entries are dropped so
// corrupt storage can never break the page.
function loadBusRoutes() {
    try {
        const raw = localStorage.getItem(BUS_ROUTES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((r) => r && typeof r.label === 'string' && typeof r.url === 'string'
                && r.label.trim() && /^https?:\/\//i.test(r.url.trim()))
            .map((r) => ({ label: r.label.trim(), url: r.url.trim() }));
    } catch (err) {
        return [];
    }
}

function saveBusRoutes() {
    try {
        localStorage.setItem(BUS_ROUTES_STORAGE_KEY, JSON.stringify(busRoutes));
    } catch (err) {
        // Storage unavailable (private mode etc.): shortcuts still
        // work for this session, they just won't persist.
    }
}

let busRoutes = loadBusRoutes(); // current shortcut list [{label,url}]

// ===== All Settings Persistence =====
const SETTINGS_STORAGE_KEY = 'clock.settings';

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        return parsed;
    } catch (err) {
        return null;
    }
}

function saveSettings() {
    try {
        const settings = {
            isRealTimeMode,
            autoChimeEnabled,
            autoRewindEnabled,
            busScheduleEnabled,
            learnPanelEnabled,
            ttsMode,
            ttsEnabled,
            ttsEngine,
            speedMultiplier,
            currentBusUrl,
            activeRouteUrl,
            isPM,
            hourSlider: parseInt(hourSlider.value, 10),
            volume: parseInt(volumeSlider.value, 10),
            digitalTimeOverlay: digitalTimeOverlay.classList.contains('visible'),
            tickTock: tickTockToggle.checked,
            numeralStyle: romanNumeralsGroup.classList.contains('hidden') ? 'arabic' : 'roman'
        };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
        // Storage unavailable (private mode etc.): settings still
        // work for this session, they just won't persist.
    }
}

// Debounce helper: wait for `delay` ms of inactivity before
// calling `fn`. Used on slider `input` events so rapid drags
// only write to localStorage once at the end.
function debounce(fn, delay) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

const debouncedSaveSettings = debounce(saveSettings, 150);

// Bus Schedule Panel Elements
const busPanel = document.getElementById('busPanel');
const busFrame = document.getElementById('busFrame');
const busScheduleToggle = document.getElementById('busScheduleToggle');
const busReloadBtn = document.getElementById('busReloadBtn');
const busOpenTabLink = document.getElementById('busOpenTabLink');

// Learn Panel Elements (Math -> Addition). The panel content is a
// self-contained iframe (learn.html + learn.js); the parent page only
// controls its wrapper visibility and screen-space reservation.
const learnPanel = document.getElementById('learnPanel');
const learnFrame = document.getElementById('learnFrame');
const learnPanelToggle = document.getElementById('learnPanelToggle');
const learnToggleBtn = document.getElementById('learnToggleBtn');
// Unified TTS mode buttons (2x2 grid). Legacy `ttsToggle` / `ttsEngine*Btn`
// IDs no longer exist in the markup; lookups are guarded so old cached
// pages don't throw.
const ttsModeOffBtn = document.getElementById('ttsModeOffBtn');
const ttsModeAutoBtn = document.getElementById('ttsModeAutoBtn');
const ttsModeBrowserBtn = document.getElementById('ttsModeBrowserBtn');
const ttsModeGoogleBtn = document.getElementById('ttsModeGoogleBtn');
const ttsModeDesc = document.getElementById('ttsModeDesc');

// Quick Route Sidebar + Settings Manager Elements
const quickRouteBtns = document.getElementById('quickRouteBtns');
const busRouteAddBtn = document.getElementById('busRouteAddBtn');
const busRouteList = document.getElementById('busRouteList');
const busRouteForm = document.getElementById('busRouteForm');
const busRouteLabelInput = document.getElementById('busRouteLabelInput');
const busRouteUrlInput = document.getElementById('busRouteUrlInput');
const busRouteFormError = document.getElementById('busRouteFormError');
const busRouteCancelBtn = document.getElementById('busRouteCancelBtn');
const busRouteSaveBtn = document.getElementById('busRouteSaveBtn');

// Modal Elements
const controlModal = document.getElementById('controlModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

// Numeral Switcher Elements
const romanNumeralsGroup = document.getElementById('romanNumerals');
const arabicNumeralsGroup = document.getElementById('arabicNumerals');
const numeralRomanBtn = document.getElementById('numeralRomanBtn');
const numeralArabicBtn = document.getElementById('numeralArabicBtn');
const windWeightsBtn = document.getElementById('windWeightsBtn');
const chainLeft = document.getElementById('chainLeft');
const chainRight = document.getElementById('chainRight');

// Modal Handlers
openSettingsBtn.addEventListener('click', () => {
    controlModal.classList.remove('hidden-modal');
});
closeSettingsBtn.addEventListener('click', () => {
    controlModal.classList.add('hidden-modal');
});
controlModal.addEventListener('click', (e) => {
    if (e.target === controlModal) {
        controlModal.classList.add('hidden-modal');
    }
});

// Audio Toggle Button
function updateAudioButtonUI() {
    // Green "Sound Active" only when audio is truly running;
    // amber "Enable Sound" while the browser still has it blocked/suspended.
    const isTrulyActive = audio.enabled && audio.isRunning();
    if (isTrulyActive) {
        audioBtnText.textContent = "Sound Active";
        enableAudioBtn.className = "flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl transition shadow-md";
    } else {
        audioBtnText.textContent = "Enable Sound";
        enableAudioBtn.className = "flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-xl transition shadow-md";
    }
    // Sound state gates the Learn iframe's TTS, so push it on every change.
    notifyLearnTTSState();
}

enableAudioBtn.addEventListener('click', () => {
    audio.toggleAudio();
    updateAudioButtonUI();
});

// Autoplay policy: browsers only allow AudioContext.resume() after a user
// gesture. Listen once for ANY first interaction (click, tap, key press)
// anywhere on the page so sound becomes truly active without requiring
// the user to click the sound button specifically.
let gestureListenersAttached = true;
const firstGestureHandler = () => {
    audio.activate();
    audio.enableAudio(); // default-on: the activating gesture also turns sound ON
    updateAudioButtonUI();
    if (audio.isRunning() && gestureListenersAttached) {
        detachGestureListeners();
    }
};
// Listeners stay attached until audio is TRULY running, so a gesture that
// fails to unlock the context (e.g. pointerdown on some browsers) is
// simply retried on the next interaction.
const gestureEvents = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend'];
const detachGestureListeners = () => {
    gestureListenersAttached = false;
    gestureEvents.forEach(evtName => window.removeEventListener(evtName, firstGestureHandler));
};
gestureEvents.forEach(evtName => {
    window.addEventListener(evtName, firstGestureHandler);
});
// Keep button state in sync when resume completes asynchronously.
// (Re-bound inside activate(), since ctx only exists after init.)
const syncButtonOnStateChange = () => {
    if (audio.ctx) {
        audio.ctx.onstatechange = () => {
            updateAudioButtonUI();
            if (audio.isRunning() && gestureListenersAttached) {
                detachGestureListeners();
            }
        };
    }
};
syncButtonOnStateChange();
const originalActivate = audio.activate.bind(audio);
audio.activate = () => {
    originalActivate();
    syncButtonOnStateChange();
};

// Reflect the real audio state on load (starts amber until first gesture).
updateAudioButtonUI();

// Trigger Cuckoo Button
triggerCuckooBtn.addEventListener('click', () => {
    let count = currentSimTime.getHours() % 12;
    if (count === 0) count = 12;
    performCuckooSequence(count);
});

// Toggle Time Mode Button (Realtime vs Manual)
toggleTimeModeBtn.addEventListener('click', () => {
    isRealTimeMode = !isRealTimeMode;

    if (isRealTimeMode) {
        timeModeText.textContent = "Manual Mode";
        manualControls.classList.add('hidden');
        statusText.textContent = "Real Time";
        statusBadge.className = "px-2.5 py-1 text-xs rounded-lg font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5";
    } else {
        timeModeText.textContent = "Real Time Mode";
        manualControls.classList.remove('hidden');
        statusText.textContent = "Manual Simulation";
        statusBadge.className = "px-2.5 py-1 text-xs rounded-lg font-medium bg-amber-950 text-amber-400 border border-amber-800/50 flex items-center gap-1.5";
    }
    saveSettings();
});

// AM/PM Toggle Elements
const amBtn = document.getElementById('amBtn');
const pmBtn = document.getElementById('pmBtn');
let isPM = false;

function updateTimeFromSlider() {
    const val = parseInt(hourSlider.value, 10); // 0–719
    const totalMinutes = val; // each unit = 1 minute across 12 hours
    let displayHour = Math.floor(totalMinutes / 60); // 0–11
    const displayMin = totalMinutes % 60;

    // Convert to 24-hour for internal time
    let hour24 = displayHour;
    if (isPM) {
        hour24 = displayHour === 0 ? 12 : displayHour + 12; // 0→12, 1→13 .. 11→23
    }
    // AM: 0→0, 1→1 .. 11→11

    currentSimTime.setHours(hour24);
    currentSimTime.setMinutes(displayMin);
    currentSimTime.setSeconds(0);

    // Display label: 12-hour format
    const labelHour = displayHour === 0 ? 12 : displayHour;
    const labelMin = String(displayMin).padStart(2, '0');
    manualHourVal.textContent = `${labelHour}:${labelMin} ${isPM ? 'PM' : 'AM'}`;
}

amBtn.addEventListener('click', () => {
    isPM = false;
    amBtn.className = 'px-3 py-1 rounded-md font-bold bg-amber-600 text-slate-950 transition-all';
    pmBtn.className = 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition-all';
    updateTimeFromSlider();
    saveSettings();
});
pmBtn.addEventListener('click', () => {
    isPM = true;
    pmBtn.className = 'px-3 py-1 rounded-md font-bold bg-amber-600 text-slate-950 transition-all';
    amBtn.className = 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition-all';
    updateTimeFromSlider();
    saveSettings();
});

// Slider Handlers
hourSlider.addEventListener('input', () => {
    updateTimeFromSlider();
    debouncedSaveSettings();
});

speedSlider.addEventListener('input', (e) => {
    speedMultiplier = parseInt(e.target.value, 10);
    speedVal.textContent = `${speedMultiplier}x ${speedMultiplier === 1 ? '(Realtime)' : 'Speed'}`;
    debouncedSaveSettings();
});

tickTockToggle.addEventListener('change', (e) => {
    audio.tickEnabled = e.target.checked;
    saveSettings();
});

autoChimeToggle.addEventListener('change', (e) => {
    autoChimeEnabled = e.target.checked;
    saveSettings();
});

autoRewindToggle.addEventListener('change', (e) => {
    autoRewindEnabled = e.target.checked;
    saveSettings();
});

volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10) / 100;
    audio.setVolume(val);
    volumeVal.textContent = `${e.target.value}%`;
    debouncedSaveSettings();
});

// Digital Time Overlay Toggle
digitalTimeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
        digitalTimeOverlay.classList.add('visible');
        digitalTimeOverlay.setAttribute('aria-hidden', 'false');
        updateClockUI(currentSimTime);
    } else {
        digitalTimeOverlay.classList.remove('visible');
        digitalTimeOverlay.setAttribute('aria-hidden', 'true');
    }
    saveSettings();
});

// Bus Schedule Panel helpers shared by the Settings toggle and the
// quick-route sidebar shortcuts.
function showBusPanel() {
    busPanel.classList.add('visible');
    busPanel.setAttribute('aria-hidden', 'false');
    // Lazy-load the embed only when first enabled so the page
    // stays fast when the feature is never used.
    if (!busFrame.src || busFrame.src === window.location.href || busFrame.src === 'about:blank') {
        busFrame.src = currentBusUrl;
    }
}

function hideBusPanel() {
    busPanel.classList.remove('visible');
    busPanel.setAttribute('aria-hidden', 'true');
}

// Highlight the sidebar button whose route is currently loaded
// (only while the panel itself is visible).
function syncShortcutHighlight() {
    Array.from(quickRouteBtns.children).forEach((btn, i) => {
        const route = busRoutes[i];
        btn.classList.toggle('active', busScheduleEnabled && !!route && route.url === activeRouteUrl);
    });
}

// Open the schedule panel with a specific route pre-selected.
// Toggle behavior: pressing the SAME route while it is already
// showing hides the panel; pressing a DIFFERENT route swaps the
// displayed route. Assigning src on every non-toggle press both
// swaps the displayed route AND refreshes the ETA data.
function openBusRoute(route) {
    if (busScheduleEnabled && activeRouteUrl === route.url) {
        // Same route pressed again -> toggle the panel OFF
        busScheduleEnabled = false;
        busScheduleToggle.checked = false; // keep Settings toggle in sync
        hideBusPanel();
        activeRouteUrl = null;
        syncShortcutHighlight();
        positionLearnPanel();
        fitClockToScreen();
        saveSettings();
        return;
    }
    currentBusUrl = route.url;
    activeRouteUrl = route.url;
    busOpenTabLink.href = route.url;
    busFrame.src = route.url;
    if (!busScheduleEnabled) {
        busScheduleEnabled = true;
        busScheduleToggle.checked = true; // keep Settings toggle in sync
        collapseOtherPanel('bus'); // narrow screens: one panel at a time
    }
    showBusPanel();
    syncShortcutHighlight();
    positionLearnPanel();
    fitClockToScreen();
    saveSettings();
}

// Bus Schedule Panel Toggle:
// ON  -> show the left-docked panel (lazy-loads hkbus.app on first use)
//         and re-fit the clock into the remaining space to its right.
// OFF -> hide the panel and restore the centered clock.
busScheduleToggle.addEventListener('change', (e) => {
    busScheduleEnabled = e.target.checked;
    if (busScheduleEnabled) {
        collapseOtherPanel('bus'); // narrow screens: one panel at a time
        showBusPanel();
        syncShortcutHighlight();
    } else {
        hideBusPanel();
        activeRouteUrl = null;
        syncShortcutHighlight();
    }
    positionLearnPanel();
    fitClockToScreen();
    saveSettings();
});

// Reload the embedded schedule on demand (reloads whichever view
// is currently active: homepage or a shortcut route)
busReloadBtn.addEventListener('click', () => {
    busFrame.src = currentBusUrl;
});

// On narrow viewports, allow only ONE left-docked panel at a time so the
// clock keeps enough room. When `keep` ('bus' or 'learn') opens while the
// other is also open (and the screen is below the coexist breakpoint),
// collapse the other panel and sync its Settings toggle + state.
function collapseOtherPanel(keep) {
    if (window.innerWidth >= PANEL_COEXIST_MIN_WIDTH) return;
    if (keep === 'learn' && busScheduleEnabled) {
        busScheduleEnabled = false;
        busScheduleToggle.checked = false;
        hideBusPanel();
        activeRouteUrl = null;
        syncShortcutHighlight();
    } else if (keep === 'bus' && learnPanelEnabled) {
        learnPanelEnabled = false;
        learnPanelToggle.checked = false;
        hideLearnPanel();
        syncLearnHighlight();
    } else {
        return; // nothing collapsed -> no repositioning needed
    }
    // Re-flow the remaining panel's position after collapsing the
    // other (e.g. learn moves back left once the bus panel is gone).
    positionLearnPanel();
}

// ===== Learn Panel (Math -> Addition) =====
// Controls the LEFT-docked learning module. The panel's own logic
// (question rules, 1-hour cache, type/category selection) lives in
// learn.js inside learn.html — the parent only shows/hides the
// wrapper and shifts it right of the bus panel when both are open.

function showLearnPanel() {
    learnPanel.classList.add('visible');
    learnPanel.setAttribute('aria-hidden', 'false');
    // Lazy-load the iframe only on first use so the page stays
    // light when the feature is never opened.
    if (!learnFrame.src || learnFrame.src === window.location.href || learnFrame.src === 'about:blank') {
        learnFrame.src = 'learn.html';
    }
    positionLearnPanel();
    // The iframe's TTS needs the parent's read-aloud + sound state. It
    // isn't ready until after load, so push the state on every `load`.
    notifyLearnTTSState();
}

function hideLearnPanel() {
    learnPanel.classList.remove('visible');
    learnPanel.setAttribute('aria-hidden', 'true');
}

// Push the current TTS settings to the Learn iframe (cross-iframe bridge).
// The Learn speech is allowed only when BOTH:
//   - the unified TTS mode is not 'off' (ttsEnabled mirror), and
//   - the global sound is truly active (audio.enabled && audio.isRunning()).
// Otherwise speechSynthesis / audio clips are suppressed in the iframe.
// `ttsEngine` selects the speech backend: 'auto' (browser, fallback to
// Google), 'browser' (no fallback, silent on failure), 'google' (no
// fallback, silent on failure).
function notifyLearnTTSState() {
    if (!learnFrame || !learnFrame.contentWindow) return;
    try {
        learnFrame.contentWindow.postMessage({
            type: 'learn-tts-state',
            ttsEnabled: !!ttsEnabled,
            soundActive: !!(audio.enabled && audio.isRunning()),
            ttsEngine: ttsEngine
        }, '*');
    } catch (err) {
        /* iframe not ready yet — state is re-sent on its `load` event */
    }
}

// Whenever the iframe finishes loading, (re)send the TTS state so a
// freshly-opened panel always starts with the correct gating.
learnFrame.addEventListener('load', notifyLearnTTSState);

// The iframe asks for its TTS state on boot (in case it loaded before the
// parent attached the `load` listener). Answer with the same message shape.
window.addEventListener('message', (e) => {
    if (e.source === learnFrame.contentWindow && e.data && e.data.type === 'learn-tts-query') {
        notifyLearnTTSState();
    }
});

// Unified Read-Aloud (TTS) selector: Off / Auto / Browser / Google in a
// compact 2x2 grid. Off mutes speech (legacy ttsEnabled=false); the other
// three pick the engine with Auto falling back to Google.
const TTS_MODE_DESCS = {
    off: 'Read-aloud is off — no speech',
    auto: 'Speak Learn questions & answers · Browser → Google fallback',
    browser: 'Speak via browser voices · silent on failure',
    google: 'Speak via Google · silent on failure'
};

function syncTTSStateFromMode() {
    ttsEnabled = (ttsMode !== 'off');
    ttsEngine = (ttsMode === 'off' ? 'auto' : ttsMode);
}

function syncTTSModeButtons() {
    const active = 'flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition bg-amber-600 border-amber-500 text-slate-950 shadow-md';
    const idle = 'flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl border text-left transition bg-slate-800/60 border-slate-700 text-slate-300 hover:border-amber-600/60 hover:text-white';
    const map = [
        [ttsModeOffBtn, 'off'],
        [ttsModeAutoBtn, 'auto'],
        [ttsModeBrowserBtn, 'browser'],
        [ttsModeGoogleBtn, 'google']
    ];
    map.forEach(([btn, mode]) => {
        if (!btn) return;
        btn.className = (ttsMode === mode ? active : idle);
        btn.setAttribute('aria-checked', ttsMode === mode ? 'true' : 'false');
    });
    if (ttsModeDesc) ttsModeDesc.textContent = TTS_MODE_DESCS[ttsMode] || TTS_MODE_DESCS.auto;
}

function setTTSMode(mode) {
    const next = String(mode || 'auto').toLowerCase();
    if (next !== 'off' && next !== 'auto' && next !== 'browser' && next !== 'google') return;
    ttsMode = next;
    syncTTSStateFromMode();
    syncTTSModeButtons();
    notifyLearnTTSState();
    saveSettings();
}

if (ttsModeOffBtn) ttsModeOffBtn.addEventListener('click', () => setTTSMode('off'));
if (ttsModeAutoBtn) ttsModeAutoBtn.addEventListener('click', () => setTTSMode('auto'));
if (ttsModeBrowserBtn) ttsModeBrowserBtn.addEventListener('click', () => setTTSMode('browser'));
if (ttsModeGoogleBtn) ttsModeGoogleBtn.addEventListener('click', () => setTTSMode('google'));

// Keep the panel shifted to the right of the bus schedule panel when
// both are open on wide screens, so they never overlap.
function positionLearnPanel() {
    if (!learnPanelEnabled) return;
    if (busScheduleEnabled && window.innerWidth >= 640) {
        // Compute the bus panel's FINAL resting geometry from its fixed
        // CSS (left: 16px, width: min(420px, 36vw)) instead of reading
        // getBoundingClientRect(). The rect is polluted by the entrance
        // transition: the panel animates transform translateX(-16px) ->
        // none over 0.35s, so a measurement taken right after enabling
        // still reports the -16px shift, which made the learn panel sit
        // ~16px too far LEFT and let the two panels overlap once the bus
        // panel finished sliding into place.
        const busLeft = 16;
        const busWidth = Math.min(420, window.innerWidth * 0.36);
        const busFinalRight = busLeft + busWidth;
        learnPanel.style.left = Math.max(busFinalRight + 12, 16) + 'px';
    } else {
        learnPanel.style.left = ''; // fall back to the CSS default (16px)
    }
}

// Reflect the Learn panel's ON/OFF state on the header shortcut button
// (bright when open, dim when closed) — same pattern as the bus-route
// sidebar highlight.
function syncLearnHighlight() {
    learnToggleBtn.classList.toggle('active', learnPanelEnabled);
}

// Toggle used by BOTH the Settings checkbox and the header shortcut.
function setLearnPanelEnabled(on) {
    learnPanelEnabled = on;
    learnPanelToggle.checked = on;
    if (on) {
        collapseOtherPanel('learn'); // narrow screens: one panel at a time
        showLearnPanel();
    } else {
        hideLearnPanel();
    }
    syncLearnHighlight();
    fitClockToScreen();
    saveSettings();
}

// Header "Learn" shortcut: one tap toggles the panel.
learnToggleBtn.addEventListener('click', () => {
    setLearnPanelEnabled(!learnPanelEnabled);
});

// Settings toggle.
learnPanelToggle.addEventListener('change', (e) => {
    setLearnPanelEnabled(e.target.checked);
});

// ===== Bus Route Shortcuts: Sidebar + Settings Manager =====

// Build one sidebar button per stored route shortcut.
function renderQuickRouteButtons() {
    quickRouteBtns.innerHTML = '';
    busRoutes.forEach((route) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quick-route-btn';
        btn.textContent = route.label;
        btn.addEventListener('click', () => openBusRoute(route));
        quickRouteBtns.appendChild(btn);
    });
    syncShortcutHighlight();
}

// Build the Settings-modal rows (label + url + edit/delete controls).
function renderBusRouteManager() {
    busRouteList.innerHTML = '';
    if (busRoutes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-[11px] text-slate-500 italic';
        empty.textContent = 'No shortcuts yet. Click "+ Add" to create one.';
        busRouteList.appendChild(empty);
        return;
    }
    busRoutes.forEach((route, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5';

        const badge = document.createElement('span');
        badge.className = 'shrink-0 min-w-[34px] text-center px-2 py-0.5 rounded-md bg-amber-600/20 text-amber-400 text-xs font-bold';
        badge.textContent = route.label;

        const urlSpan = document.createElement('span');
        urlSpan.className = 'flex-1 min-w-0 text-[10px] text-slate-500 truncate';
        urlSpan.textContent = route.url;
        urlSpan.title = route.url;

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.title = 'Edit';
        editBtn.className = 'shrink-0 p-1 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition';
        editBtn.innerHTML =
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
            'd="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>';
        editBtn.addEventListener('click', () => startEditRoute(idx));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.title = 'Delete';
        delBtn.className = 'shrink-0 p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition';
        delBtn.innerHTML =
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
            'd="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
        delBtn.addEventListener('click', () => deleteRoute(idx));

        row.append(badge, urlSpan, editBtn, delBtn);
        busRouteList.appendChild(row);
    });
}

function hideRouteForm() {
    editingRouteIndex = -1;
    busRouteForm.classList.add('hidden');
    busRouteFormError.classList.add('hidden');
    busRouteLabelInput.value = '';
    busRouteUrlInput.value = '';
}

function startAddRoute() {
    editingRouteIndex = -1;
    busRouteLabelInput.value = '';
    busRouteUrlInput.value = '';
    busRouteFormError.classList.add('hidden');
    busRouteForm.classList.remove('hidden');
    busRouteLabelInput.focus();
}

function startEditRoute(idx) {
    editingRouteIndex = idx;
    busRouteLabelInput.value = busRoutes[idx].label;
    busRouteUrlInput.value = busRoutes[idx].url;
    busRouteFormError.classList.add('hidden');
    busRouteForm.classList.remove('hidden');
    busRouteLabelInput.focus();
}

function deleteRoute(idx) {
    const removed = busRoutes.splice(idx, 1)[0];
    if (removed && removed.url === activeRouteUrl) {
        activeRouteUrl = null; // its highlight no longer applies
    }
    saveBusRoutes();
    saveSettings();
    renderQuickRouteButtons();
    renderBusRouteManager();
    if (!busFormHidden()) hideRouteForm();
}

function busFormHidden() {
    return busRouteForm.classList.contains('hidden');
}

function showRouteFormError(msg) {
    busRouteFormError.textContent = msg;
    busRouteFormError.classList.remove('hidden');
}

// Validate and persist the add/edit form. URLs must be absolute
// http(s) links; hkbus.app route links pre-select the route.
function saveRouteFromForm() {
    const label = busRouteLabelInput.value.trim();
    const url = busRouteUrlInput.value.trim();
    if (!label) {
        showRouteFormError('Label is required.');
        return;
    }
    if (!/^https?:\/\//i.test(url)) {
        showRouteFormError('URL must start with http:// or https://');
        return;
    }
    if (editingRouteIndex >= 0) {
        const oldUrl = busRoutes[editingRouteIndex].url;
        busRoutes[editingRouteIndex] = { label, url };
        if (activeRouteUrl === oldUrl) activeRouteUrl = url;
    } else {
        busRoutes.push({ label, url });
    }
    saveBusRoutes();
    saveSettings();
    renderQuickRouteButtons();
    renderBusRouteManager();
    hideRouteForm();
}

busRouteAddBtn.addEventListener('click', startAddRoute);
busRouteCancelBtn.addEventListener('click', hideRouteForm);
busRouteSaveBtn.addEventListener('click', saveRouteFromForm);
[busRouteLabelInput, busRouteUrlInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveRouteFromForm();
    });
});

// Initial paint of the sidebar buttons and settings rows
renderQuickRouteButtons();
renderBusRouteManager();

// Numeral Switcher Logic
numeralRomanBtn.addEventListener('click', () => {
    romanNumeralsGroup.classList.remove('hidden');
    arabicNumeralsGroup.classList.add('hidden');
    numeralRomanBtn.className = "px-3 py-1 rounded-lg font-bold bg-amber-600 text-slate-950 transition";
    numeralArabicBtn.className = "px-3 py-1 rounded-lg text-slate-400 hover:text-white transition";
    saveSettings();
});

numeralArabicBtn.addEventListener('click', () => {
    arabicNumeralsGroup.classList.remove('hidden');
    romanNumeralsGroup.classList.add('hidden');
    numeralArabicBtn.className = "px-3 py-1 rounded-lg font-bold bg-amber-600 text-slate-950 transition";
    numeralRomanBtn.className = "px-3 py-1 rounded-lg text-slate-400 hover:text-white transition";
    saveSettings();
});

// Rewind Pinecone Weights
function rewindWeights() {
    weightDropAmount = 0;
    chainLeft.style.height = '16px';
    chainRight.style.height = '8px';
}
windWeightsBtn.addEventListener('click', rewindWeights);
document.getElementById('weightLeft').addEventListener('click', rewindWeights);
document.getElementById('weightRight').addEventListener('click', rewindWeights);

// Cuckoo Bird & Dancers Animation Sequence
function performCuckooSequence(count) {
    if (isCuckooActive) return;
    isCuckooActive = true;

    cuckooHouse.classList.add('doors-open');
    dancingBalcony.classList.add('dancing-active');

    setTimeout(() => {
        cuckooHouse.classList.add('cuckoo-active');

        let callsDone = 0;

        function chimeLoop() {
            if (callsDone < count) {
                cuckooHouse.classList.add('cuckoo-singing');
                audio.playCuckooCall(() => {
                    cuckooHouse.classList.remove('cuckoo-singing');
                    callsDone++;
                    setTimeout(chimeLoop, 200);
                });
            } else {
                setTimeout(() => {
                    cuckooHouse.classList.remove('cuckoo-active');
                    setTimeout(() => {
                        cuckooHouse.classList.remove('doors-open');
                        dancingBalcony.classList.remove('dancing-active');
                        isCuckooActive = false;
                    }, 400);
                }, 300);
            }
        }

        setTimeout(chimeLoop, 300);

    }, 500);
}

// Clock SVG Rotations and Logic
function updateClockUI(time) {
    const hours = time.getHours();
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();
    const ms = time.getMilliseconds();

    // Angles
    const secDeg = ((seconds + ms / 1000) / 60) * 360;
    const minDeg = ((minutes + seconds / 60) / 60) * 360;
    const hourDeg = (((hours % 12) + minutes / 60) / 12) * 360;

    // Apply rotations to SVG clock hands around center point (150, 150)
    if (secondHandGroup) secondHandGroup.setAttribute('transform', `rotate(${secDeg} 150 150)`);
    if (minuteHandGroup) minuteHandGroup.setAttribute('transform', `rotate(${minDeg} 150 150)`);
    if (hourHandGroup) hourHandGroup.setAttribute('transform', `rotate(${hourDeg} 150 150)`);

    // Update digital readouts. Build the formatted string once,
    // then only write to the DOM when a readout is actually shown
    // (the modal clock and floating overlay are hidden most of the
    // time, so this skips ~120 wasted text writes/min).
    const timeString = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    if (digitalClock && !controlModal.classList.contains('hidden-modal')) {
        digitalClock.textContent = timeString;
    }
    if (digitalTimeText && digitalTimeOverlay.classList.contains('visible')) {
        digitalTimeText.textContent = timeString;
    }

    // Lower Weights as clock ticks (Calibrated to 24-Hour Cycle)
    const dropRatePerSec = (120 / 86400) * speedMultiplier;
    weightDropAmount += dropRatePerSec;

    if (weightDropAmount >= 120) {
        if (autoRewindEnabled) {
            rewindWeights();
        } else {
            weightDropAmount = 120; // Hold at max drop if auto-rewind is off
        }
    }

    chainLeft.style.height = `${16 + weightDropAmount}px`;
    chainRight.style.height = `${8 + (weightDropAmount * 0.75)}px`;

    // Tick sound & Auto hourly chime
    if (seconds !== lastSecond) {
        lastSecond = seconds;
        lastTickSide = !lastTickSide;
        audio.playTickTock(lastTickSide);

        if (autoChimeEnabled && minutes === 0 && seconds === 0 && !isCuckooActive) {
            let cuckooCount = hours % 12;
            if (cuckooCount === 0) cuckooCount = 12;
            performCuckooSequence(cuckooCount);
        }
    }
}

// Responsive Scaling: Detect browser window/container size and resize clock to fit screen perfectly.
// When the Bus Schedule panel is ON (and the screen is wide enough for
// side-by-side layout), the panel's footprint is reserved on the LEFT
// and the clock is scaled/centered within the remaining right-hand
// region, i.e. "bus schedule on the left, clock moves to the right".
function fitClockToScreen() {
    const clock = document.getElementById('clockContainer');
    const stage = document.getElementById('clockStage');
    if (!clock || !stage) return;

    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;

    if (stageWidth <= 0 || stageHeight <= 0) return;

    // Full design envelope of the clock including waterwheel, woodcutter, pendulum, and hanging weights
    const baseWidth = 690;
    const baseHeight = 910;

    // Safety padding so clock never touches screen edge
    const paddingX = 16;
    const paddingY = 12;

    // Right-side reservation for the quick-route sidebar strip
    // (#quickSidebar) so the clock never sits underneath it. On
    // portrait phones the height constraint usually binds first,
    // so this flat horizontal cost is negligible there.
    const sidebarReserve = 72;

    let availableW = Math.max(stageWidth - paddingX - sidebarReserve, 60);
    const availableH = Math.max(stageHeight - paddingY, 60);
    // Nudge the clock left of true center by half the reserved
    // strip so it is centered within the actually-free area.
    let lateralOffset = -sidebarReserve / 2;

    // Left-docked panels (bus schedule + learn module). Both dock on
    // the left edge; compute the RIGHTMOST open panel's FINAL edge and
    // re-center the clock inside [that edge, stage edge]. Below 640px
    // they become full overlays instead, so no space is reserved.
    //
    // Geometry is computed from each panel's fixed CSS (left + width),
    // NOT from getBoundingClientRect(). The latter is polluted by the
    // entrance/exit `transform: translateX(-16px)` transition, so a
    // measurement taken mid-toggle reports a stale position and the
    // clock would be re-fit against the wrong edge (e.g. when the bus
    // panel is turned off, the learn panel still reads shifted right).
    let rightmostPanel = 0;
    if (busScheduleEnabled) {
        rightmostPanel = 16 + Math.min(420, window.innerWidth * 0.36);
    }
    if (learnPanelEnabled) {
        // Learn panel is shifted right of the bus panel when both are
        // open (see positionLearnPanel()); otherwise it sits at 16px.
        const learnWidth = Math.min(320, window.innerWidth * 0.30);
        const learnLeft = busScheduleEnabled
            ? Math.max(12 + rightmostPanel, 16)
            : 16;
        rightmostPanel = Math.max(rightmostPanel, learnLeft + learnWidth);
    }

    if (rightmostPanel > 0 && window.innerWidth >= 640) {
        const stageRect = stage.getBoundingClientRect();
        const gap = 24; // breathing room between panel(s) and clock
        const regionLeft = Math.max(rightmostPanel + gap, stageRect.left);
        const regionRight = stageRect.right - sidebarReserve;

        // Only shift when a sensible amount of room remains for the clock
        if (regionRight - regionLeft > 160) {
            availableW = Math.max(regionRight - regionLeft - paddingX, 60);
            const regionCenterX = (regionLeft + regionRight) / 2;
            const stageCenterX = stageRect.left + stageWidth / 2;
            lateralOffset = regionCenterX - stageCenterX;
        }
    }

    const scale = Math.min(availableW / baseWidth, availableH / baseHeight);

    // translateX is outermost so it shifts in unscaled screen pixels,
    // keeping the clock centered in the free region next to the panel.
    clock.style.transform = `translateX(${lateralOffset}px) scale(${scale})`;
    clock.style.transformOrigin = 'center center';
}

window.addEventListener('resize', () => {
    positionLearnPanel();
    fitClockToScreen();
});
window.addEventListener('orientationchange', () => {
    positionLearnPanel();
    fitClockToScreen();
});
if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => fitClockToScreen());
    resizeObserver.observe(document.body);
    const stageElem = document.getElementById('clockStage');
    if (stageElem) resizeObserver.observe(stageElem);
}

// Main Animation Frame Tick
function tick() {
    if (isRealTimeMode) {
        currentSimTime = new Date();
    } else {
        currentSimTime = new Date(currentSimTime.getTime() + (16.6 * speedMultiplier));
    }

    updateClockUI(currentSimTime);
    requestAnimationFrame(tick);
}

window.addEventListener('DOMContentLoaded', fitClockToScreen);

// Apply loaded settings to UI and state (runs after all functions
// and event listeners are defined, right before window.onload).
const savedSettings = loadSettings();
if (savedSettings) {
    if (typeof savedSettings.isRealTimeMode === 'boolean') isRealTimeMode = savedSettings.isRealTimeMode;
    if (typeof savedSettings.autoChimeEnabled === 'boolean') {
        autoChimeEnabled = savedSettings.autoChimeEnabled;
        autoChimeToggle.checked = savedSettings.autoChimeEnabled;
    }
    if (typeof savedSettings.autoRewindEnabled === 'boolean') {
        autoRewindEnabled = savedSettings.autoRewindEnabled;
        autoRewindToggle.checked = savedSettings.autoRewindEnabled;
    }
    if (typeof savedSettings.busScheduleEnabled === 'boolean') busScheduleEnabled = savedSettings.busScheduleEnabled;
    if (typeof savedSettings.learnPanelEnabled === 'boolean') learnPanelEnabled = savedSettings.learnPanelEnabled;
    // New unified key wins; fall back to the legacy pair
    // (ttsEnabled boolean + ttsEngine string) from earlier versions.
    if (savedSettings.ttsMode === 'off' || savedSettings.ttsMode === 'auto' || savedSettings.ttsMode === 'browser' || savedSettings.ttsMode === 'google') {
        ttsMode = savedSettings.ttsMode;
    } else {
        let legacyEngine = 'auto';
        if (savedSettings.ttsEngine === 'auto' || savedSettings.ttsEngine === 'browser' || savedSettings.ttsEngine === 'google') {
            legacyEngine = savedSettings.ttsEngine;
        }
        if (typeof savedSettings.ttsEnabled === 'boolean') {
            ttsMode = savedSettings.ttsEnabled ? legacyEngine : 'off';
        } else {
            ttsMode = legacyEngine;
        }
    }
    syncTTSStateFromMode();
    if (typeof savedSettings.speedMultiplier === 'number') speedMultiplier = Math.max(1, Math.min(60, savedSettings.speedMultiplier));
    if (typeof savedSettings.currentBusUrl === 'string' && /^https?:\/\//i.test(savedSettings.currentBusUrl)) currentBusUrl = savedSettings.currentBusUrl;
    if (savedSettings.activeRouteUrl === null || (typeof savedSettings.activeRouteUrl === 'string' && /^https?:\/\//i.test(savedSettings.activeRouteUrl))) activeRouteUrl = savedSettings.activeRouteUrl;
    if (typeof savedSettings.isPM === 'boolean') isPM = savedSettings.isPM;
    if (typeof savedSettings.hourSlider === 'number') hourSlider.value = Math.max(0, Math.min(719, savedSettings.hourSlider));
    if (typeof savedSettings.volume === 'number') volumeSlider.value = Math.max(0, Math.min(100, savedSettings.volume));
    if (typeof savedSettings.digitalTimeOverlay === 'boolean') {
        if (savedSettings.digitalTimeOverlay) {
            digitalTimeOverlay.classList.add('visible');
            digitalTimeOverlay.setAttribute('aria-hidden', 'false');
        } else {
            digitalTimeOverlay.classList.remove('visible');
            digitalTimeOverlay.setAttribute('aria-hidden', 'true');
        }
    }
    if (typeof savedSettings.tickTock === 'boolean') {
        tickTockToggle.checked = savedSettings.tickTock;
        audio.tickEnabled = savedSettings.tickTock;
    }
    if (savedSettings.numeralStyle === 'roman') {
        romanNumeralsGroup.classList.remove('hidden');
        arabicNumeralsGroup.classList.add('hidden');
        numeralRomanBtn.className = "px-3 py-1 rounded-lg font-bold bg-amber-600 text-slate-950 transition";
        numeralArabicBtn.className = "px-3 py-1 rounded-lg text-slate-400 hover:text-white transition";
    }
}

// Sync UI with loaded settings
if (isRealTimeMode) {
    timeModeText.textContent = "Manual Mode";
    manualControls.classList.add('hidden');
    statusText.textContent = "Real Time";
    statusBadge.className = "px-2.5 py-1 text-xs rounded-lg font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5";
} else {
    timeModeText.textContent = "Real Time Mode";
    manualControls.classList.remove('hidden');
    statusText.textContent = "Manual Simulation";
    statusBadge.className = "px-2.5 py-1 text-xs rounded-lg font-medium bg-amber-950 text-amber-400 border border-amber-800/50 flex items-center gap-1.5";
    updateTimeFromSlider();
}

if (isPM) {
    pmBtn.className = 'px-3 py-1 rounded-md font-bold bg-amber-600 text-slate-950 transition-all';
    amBtn.className = 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition-all';
} else {
    amBtn.className = 'px-3 py-1 rounded-md font-bold bg-amber-600 text-slate-950 transition-all';
    pmBtn.className = 'px-3 py-1 rounded-md text-slate-400 hover:text-white transition-all';
}

speedSlider.value = speedMultiplier;
speedVal.textContent = `${speedMultiplier}x ${speedMultiplier === 1 ? '(Realtime)' : 'Speed'}`;

if (busScheduleEnabled) {
    busScheduleToggle.checked = true;
    busOpenTabLink.href = currentBusUrl;
    showBusPanel();
    syncShortcutHighlight();
}

if (learnPanelEnabled) {
    learnPanelToggle.checked = true;
    showLearnPanel();
}
syncLearnHighlight();
syncTTSStateFromMode();
syncTTSModeButtons();

// Enforce one-panel-at-a-time if the viewport is narrow but both were
// saved as enabled (e.g. restored from a wider-screen session).
// collapseOtherPanel() also re-positions the surviving panel, so no
// separate positionLearnPanel() is needed here.
if (busScheduleEnabled && learnPanelEnabled) {
    collapseOtherPanel('bus');
}

// Both panels are restored above; fit once.
fitClockToScreen();

digitalTimeToggle.checked = digitalTimeOverlay.classList.contains('visible');

window.onload = function () {
    fitClockToScreen();
    requestAnimationFrame(tick);
};