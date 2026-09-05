/* ==========================================================================
   Media Panel — Google Drive photo/audio/video gallery with auto-rotate.
   Self-contained inside media.html (its own iframe), mirroring the Learn
   module pattern. Drive Sign In/Out lives in the parent Settings panel
   and drives this iframe via postMessage (`media-auth`); the parent also
   pushes the rotation interval (`media-config`). This iframe reports its
   auth/library state back (`media-auth-status`) so Settings can show it.

   - Same CLIENT_ID / FOLDER_ID as the reference demo (dummy/index.html).
   - Token cached in localStorage with early-renewal buffer + silent refresh.
   - Lists image + video + audio files in the folder (id/name/mimeType +
     thumbnailLink). FULL file bytes are fetched on demand for the viewer
     only (current item + neighbours, cached as object URLs). The Browse
     grid NEVER downloads full files and NEVER fetch()es thumbnails
     (lh3.googleusercontent.com rejects authorized CORS fetches): tiles
     render plain <img src="thumbnailLink"> (signed URL, CORS-exempt,
     =s400), attached lazily on scroll with an icon + onerror fallback.
     Refresh re-lists the folder and reconciles the full-blob cache
     (keeps blobs for files still present, drops the rest).
   - Browse suspends the slideshow (timer cleared, hidden media paused);
     returning to Viewer resumes the current item.
   - Auto-rotate: images advance every `rotateSec` (default 30s, set by the
     parent Settings and persisted there). Audio/video play through, then
     wait `rotateSec` after the `ended` event before advancing.
    - Two views: Viewer (single-item slideshow) and Browse (thumbnail grid).
    - Popup mode: opened standalone as media.html?popup=1 (panel header
      "Open in New Tab" / header pop-out button, same pattern as the bus
      schedule panel). body.popup widens the layout (fluid auto-fill grid,
      taller stage) and the header owns a Sign In/Out button, since no
      Settings parent exists to drive auth via postMessage. Token cache in
      localStorage is shared, so signing in once signs in both modes.
    ========================================================================== */
(function () {
    'use strict';

    // Same values as E:\workspace\dummy\index.html — do not change.
    const CLIENT_ID = '219675970458-evrvj3a8ouldd0d52uqtepvr1sud26s6.apps.googleusercontent.com';
    const FOLDER_ID = '1qY0ptECT-jFf0hxfq2fL49uYMFmP0Ztv';
    const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

    const TOKEN_KEY = 'gdrive_access_token';
    const EXPIRY_KEY = 'gdrive_token_expiry';
    // Rotation interval is owned by the parent Settings page, but keep a
    // local fallback so the panel still works standalone / in tests.
    const LOCAL_INTERVAL_KEY = 'clock.mediaRotateSec';
    const LOCAL_VIEW_KEY = 'clock.mediaView';
    const DEFAULT_ROTATE_SEC = 30;

    // Popup (standalone full-tab) mode follows the FRAME context, not the
    // query string: framed inside the docked panel it is always embedded
    // (single outer title), top-level it is always a popup (owns its own
    // header + Sign In). ?popup=1 on the link just documents the intent.
    const EMBEDDED = (function () {
        try { return !!(window.parent && window.parent !== window); }
        catch (e) { return false; }
    })();
    const POPUP = !EMBEDDED;
    if (POPUP && document.body) document.body.classList.add('popup');

    // Auth hint wording depends on who owns Sign In: the Settings parent
    // when docked, the header button when in popup mode.
    function signinHint() {
        return POPUP ? 'tap Sign In above to load media'
                     : 'use Settings → Media to sign in';
    }

    let tokenClient = null;
    let files = [];            // [{id,name,mimeType,kind,thumbnailLink}]
    let objectUrls = {};       // fileId -> FULL blob object URL (viewer cache)
    let thumbObserver = null;  // IntersectionObserver: only load visible tiles
    let lastSyncText = '';     // last successful folder re-list time
    let refreshing = false;
    let currentIndex = 0;
    let viewMode = '';         // 'viewer' | 'browse' (set via setView at boot)
    let playing = true;        // slideshow running (pause blocks auto-advance)
    let rotateSec = DEFAULT_ROTATE_SEC;
    let rotateTimer = null;    // pending setTimeout for next advance
    let progressRaf = 0;       // progress-bar animation frame
    let progressStart = 0;     // timestamp the current wait began
    let progressLenMs = 0;     // how long the current wait lasts
    let waitingAfterMedia = false; // true while counting down post-ended

    const $ = (id) => document.getElementById(id);

    /* ---------------- token cache (same approach as reference demo) ------ */
    function getCachedToken() {
        try {
            const token = localStorage.getItem(TOKEN_KEY);
            const expiry = Number(localStorage.getItem(EXPIRY_KEY) || 0);
            if (!token) return null;
            if (Date.now() >= expiry) return null;
            return token;
        } catch (e) { return null; }
    }
    function saveToken(accessToken, expiresInSec) {
        try {
            const expiry = Date.now() + (Number(expiresInSec) || 3600) * 1000 - 60 * 1000;
            localStorage.setItem(TOKEN_KEY, accessToken);
            localStorage.setItem(EXPIRY_KEY, String(expiry));
        } catch (e) { /* private mode: session-only */ }
    }
    function clearToken() {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(EXPIRY_KEY);
        } catch (e) {}
    }

    /* ---------------- auth (driven from parent Settings) ----------------- */
    function setAuthUI(signedIn, statusText) {
        const dot = $('authDot'), status = $('authStatus');
        if (dot) dot.classList.toggle('signed', !!signedIn);
        if (status) status.textContent = statusText || (signedIn ? 'Signed in' : 'Not signed in');
        // Popup tab owns its auth: keep the header button label in sync.
        const authBtn = $('authBtn');
        if (authBtn) authBtn.textContent = signedIn ? 'Sign Out' : 'Sign In';
        // Mirror the state to the parent Settings panel (no-op standalone).
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'media-auth-status',
                    signedIn: !!signedIn,
                    statusText: status ? status.textContent : '',
                    count: files.length
                }, '*');
            }
        } catch (e) {}
    }

    // Copy shown when signed out — points at Settings when docked,
    // at the header button when in popup mode.
    function signedOutHint() {
        return POPUP ? 'Signed out. Tap Sign In above to reload.'
                     : 'Signed out. Use Settings → Media → Sign In to reload.';
    }

    function signOut() {
        try {
            const cached = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } })();
            if (cached && window.google && window.google.accounts && window.google.accounts.oauth2) {
                try { window.google.accounts.oauth2.revoke(cached, function () {}); } catch (e) {}
            }
        } catch (e) {}
        clearToken();
        stopPlayback();
        files = [];
        currentIndex = 0;
        revokeAllObjectUrls();
        renderEmpty(signedOutHint());
        setAuthUI(false, 'Not signed in — ' + signinHint());
        syncControls();
        updateFooter();
        renderBrowse();
    }

    function initGsi() {
        if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
            setTimeout(initGsi, 100);
            return;
        }
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: function (response) {
                if (response && response.access_token) {
                    saveToken(response.access_token, response.expires_in);
                    setAuthUI(true);
                    loadLibrary(response.access_token);
                } else if (response && response.error) {
                    console.warn('Token request failed, need user click:', response);
                    setAuthUI(false, 'Sign-in needed — use Settings → Media → Sign In');
                }
            }
        });

        const cached = getCachedToken();
        if (cached) {
            setAuthUI(true, 'Signed in (restored)');
            loadLibrary(cached);
        } else {
            try {
                if (localStorage.getItem(TOKEN_KEY)) {
                    // Had a token but expired -> silent refresh when possible.
                    tokenClient.requestAccessToken({ prompt: '' });
                } else {
                    setAuthUI(false, 'Not signed in — ' + signinHint());
                }
            } catch (e) { setAuthUI(false); }
        }
    }

    // Called from Settings (via postMessage) or the empty-state hint.
    // Must run inside a user gesture when it pops up (Settings click
    // counts — the message is dispatched synchronously from the click).
    function requestToken() {
        const cached = getCachedToken();
        if (cached) {
            loadLibrary(cached);
            return;
        }
        if (!tokenClient) { setAuthUI(false, 'Auth still loading… try again from Settings'); return; }
        try {
            const hadPrior = (() => { try { return !!localStorage.getItem(TOKEN_KEY); } catch (e) { return false; } })();
            tokenClient.requestAccessToken({ prompt: hadPrior ? '' : 'consent' });
        } catch (e) {
            setAuthUI(false, 'Sign-in popup blocked? Try again from Settings');
        }
    }

    /* ---------------- Drive listing -------------------------------------- */
    function kindOf(mime) {
        const m = String(mime || '');
        if (m.indexOf('image/') === 0) return 'photo';
        if (m.indexOf('video/') === 0) return 'video';
        if (m.indexOf('audio/') === 0) return 'audio';
        return 'other';
    }

    async function loadLibrary(accessToken, opts) {
        opts = opts || {};
        setAuthUI(true, 'Loading media…');
        if (!opts.silent) renderEmpty('Loading your Drive media…');
        try {
            const q = "'" + FOLDER_ID + "' in parents and " +
                "(mimeType contains 'image/' or mimeType contains 'video/' or mimeType contains 'audio/') and " +
                'trashed = false';
            let url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
                '&fields=files(id,name,mimeType,thumbnailLink),nextPageToken&orderBy=name&pageSize=100';
            const all = [];
            let pageToken = null;
            do {
                const res = await fetch(pageToken ? url + '&pageToken=' + encodeURIComponent(pageToken) : url, {
                    headers: { Authorization: 'Bearer ' + accessToken }
                });
                if (res.status === 401 || res.status === 403) {
                    clearToken();
                    setAuthUI(false, 'Session expired — sign in again from Settings');
                    return;
                }
                if (!res.ok) throw new Error('Drive list failed: ' + res.status);
                const data = await res.json();
                (data.files || []).forEach(function (f) {
                    const kind = kindOf(f.mimeType);
                    if (kind === 'other') return;
                    all.push({ id: f.id, name: f.name || 'Untitled', mimeType: f.mimeType, kind: kind, thumbnailLink: f.thumbnailLink || null });
                });
                pageToken = data.nextPageToken || null;
            } while (pageToken);

            // Refresh path: keep blobs for files still present instead of
            // wiping the whole cache (first load starts empty anyway).
            const prevId = opts.preserveId || (files[currentIndex] && files[currentIndex].id) || null;
            files = all;
            reconcileCaches(all.map(function (f) { return f.id; }));
            lastSyncText = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            let startAt = 0;
            if (prevId) {
                const at = all.findIndex(function (f) { return f.id === prevId; });
                if (at >= 0) startAt = at;
            }
            currentIndex = startAt;
            if (!files.length) {
                setAuthUI(true, 'Signed in — folder is empty');
                renderEmpty('No photos, audio or video found in this Drive folder yet.');
            } else {
                setAuthUI(true, 'Signed in · ' + files.length + ' item' + (files.length === 1 ? '' : 's'));
                showIndex(currentIndex);
                preloadAround(currentIndex);
            }
            syncControls();
            renderBrowse();
            updateFooter();
        } catch (err) {
            console.error('[Media] load failed:', err);
            setAuthUI(true, 'Load failed — sign in again from Settings to retry');
            if (!opts.silent) renderEmpty('Could not load media. Check your connection, then sign in again from Settings.');
        } finally {
            refreshing = false;
            syncRefreshBtn();
        }
    }

    // Manual refresh: re-list the folder, reconcile caches, keep position.
    // Never mass-downloads: full blobs stay cached, thumbnails refill lazily.
    function refreshLibrary() {
        if (refreshing) return;
        const token = getCachedToken();
        if (!token) { requestToken(); return; }
        refreshing = true;
        syncRefreshBtn();
        const cur = files[currentIndex];
        loadLibrary(token, { preserveId: cur ? cur.id : null, silent: true });
    }

    function syncRefreshBtn() {
        const btn = $('refreshBtn');
        if (!btn) return;
        btn.disabled = refreshing;
        btn.textContent = refreshing ? '↻ Refreshing…' : '↻ Refresh';
    }

    // LRU cap for FULL blobs: neighbour preload + viewing accumulate one
    // blob URL per file, which adds up with hundreds of large videos. Keep
    // the most recent FULL_CACHE_MAX; always spare the current item and its
    // neighbours so playback never re-downloads. Evicted tiles fall back to
    // their thumbnailLink <img> automatically (renderBrowse/paintThumb read
    // objectUrls live).
    const FULL_CACHE_MAX = 20;
    function touchFullCache(id) {
        if (objectUrls[id]) {
            const url = objectUrls[id];
            delete objectUrls[id]; // re-insert = most-recently-used
            objectUrls[id] = url;
        }
        const keep = {};
        if (files.length) {
            keep[files[currentIndex] && files[currentIndex].id] = true;
            keep[files[(currentIndex + 1) % files.length] && files[(currentIndex + 1) % files.length].id] = true;
            keep[files[(currentIndex - 1 + files.length) % files.length] && files[(currentIndex - 1 + files.length) % files.length].id] = true;
        }
        const ids = Object.keys(objectUrls);
        for (let k = 0; k < ids.length && Object.keys(objectUrls).length > FULL_CACHE_MAX; k++) {
            if (keep[ids[k]]) continue;
            try { URL.revokeObjectURL(objectUrls[ids[k]]); } catch (e) {}
            delete objectUrls[ids[k]];
        }
    }

    async function blobUrlFor(file, accessToken) {
        if (objectUrls[file.id]) { touchFullCache(file.id); return objectUrls[file.id]; }
        const token = accessToken || getCachedToken();
        if (!token) throw new Error('no token');
        const res = await fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media', {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (res.status === 401 || res.status === 403) {
            clearToken();
            setAuthUI(false, 'Session expired — sign in again from Settings');
            throw new Error('unauthorized');
        }
        if (!res.ok) throw new Error('media fetch failed: ' + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrls[file.id] = url;
        touchFullCache(file.id);
        return url;
    }

    function revokeAllObjectUrls() {
        Object.keys(objectUrls).forEach(function (id) {
            try { URL.revokeObjectURL(objectUrls[id]); } catch (e) {}
        });
        objectUrls = {};
    }

    // Drop cached full blobs for files no longer in the folder, keep the
    // rest so Refresh never re-downloads what we already have. (Grid
    // thumbnails are plain <img> links, nothing to revoke.)
    function reconcileCaches(keptIds) {
        const keep = {};
        keptIds.forEach(function (id) { keep[id] = true; });
        Object.keys(objectUrls).forEach(function (id) {
            if (!keep[id]) {
                try { URL.revokeObjectURL(objectUrls[id]); } catch (e) {}
                delete objectUrls[id];
            }
        });
    }

    function preloadAround(index) {
        if (!files.length) return;
        const next = files[(index + 1) % files.length];
        const prev = files[(index - 1 + files.length) % files.length];
        [next, prev].forEach(function (f) {
            if (f && !objectUrls[f.id]) {
                // Viewer neighbour preload (full file, only 2 at a time).
                // Paint its grid tile in place when it lands — no grid
                // re-render, so Browse never loses its scroll position.
                blobUrlFor(f).catch(function () {}).then(function (u) {
                    if (u) paintThumb(f.id);
                });
            }
        });
    }

    /* ---------------- viewer rendering ----------------------------------- */
    function renderEmpty(msg) {
        $('stageEmpty').hidden = false;
        const label = $('stageEmpty').querySelector('span:last-child');
        if (label) label.innerHTML = String(msg || '').replace(/\n/g, '<br>');
        $('photoEl').hidden = true;
        $('videoEl').hidden = true;
        $('audioWrap').hidden = true;
        $('typeBadge').textContent = '—';
        $('fileName').textContent = 'No media loaded';
        $('fileCount').textContent = files.length ? ('0 / ' + files.length) : '';
        stopProgress();
    }

    function stopPlayback() {
        clearRotateTimer();
        stopProgress();
        try {
            const v = $('videoEl');
            v.pause(); v.removeAttribute('src'); v.load();
        } catch (e) {}
        try {
            const a = $('audioEl');
            a.pause(); a.removeAttribute('src'); a.load();
            $('audioDisc').classList.remove('playing');
        } catch (e) {}
    }

    async function showIndex(index) {
        if (!files.length) { renderEmpty(signedOutHint()); return; }
        currentIndex = (index + files.length) % files.length;
        const file = files[currentIndex];
        stopPlayback();

        $('stageEmpty').hidden = true;
        $('photoEl').hidden = true;
        $('videoEl').hidden = true;
        $('audioWrap').hidden = true;
        $('typeBadge').textContent = file.kind === 'photo' ? 'Photo' : file.kind === 'video' ? 'Video' : 'Audio';
        $('typeBadge').className = 'type-badge' + (file.kind === 'video' ? ' video' : file.kind === 'audio' ? ' audio' : '');
        $('fileName').textContent = file.name;
        $('fileName').title = file.name;
        $('fileCount').textContent = (currentIndex + 1) + ' / ' + files.length;

        try {
            const url = await blobUrlFor(file);
            // Stale guard: user may have paged while we fetched.
            if (files[currentIndex] !== file) return;
            if (file.kind === 'photo') {
                const img = $('photoEl');
                img.src = url;
                img.alt = file.name;
                img.hidden = false;
                scheduleNext(rotateSec * 1000, false);
            } else if (file.kind === 'video') {
                const v = $('videoEl');
                v.src = url;
                v.hidden = false;
                try { await v.play(); } catch (e) { /* autoplay blocked: user presses play, `ended` still rotates */ }
                // Rotation is armed on `ended` (plus a safety timeout in
                // case `ended` never fires for a corrupt file).
                scheduleNext(Math.max(rotateSec * 1000, 5000) + 120000, false, true);
            } else {
                $('audioWrap').hidden = false;
                const a = $('audioEl');
                a.src = url;
                try { await a.play(); $('audioDisc').classList.add('playing'); } catch (e) {}
                scheduleNext(Math.max(rotateSec * 1000, 5000) + 180000, false, true);
            }
        } catch (err) {
            console.warn('[Media] show failed:', file.name, err);
            $('fileName').textContent = file.name + ' (failed to load — skipping…)';
            scheduleNext(3000, false);
        }
        syncControls();
        renderBrowse();
        updateFooter();
        preloadAround(currentIndex);
    }

    /* ---------------- auto-rotate ---------------------------------------- */
    function clearRotateTimer() {
        if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
    }

    // waitMs: how long before advancing. `safetyOnly` means a media element
    // is expected to drive the advance via `ended`; the timer is just a
    // backstop for files that never end.
    function scheduleNext(waitMs, afterMedia, safetyOnly) {
        clearRotateTimer();
        stopProgress();
        // BUGFIX: never advance while the user is browsing — the viewer is
        // hidden, so rotating there just burns bandwidth and surprises the
        // user on return. The wait restarts in resumeCurrent().
        if (viewMode === 'browse') { updateFooter(); return; }
        if (!playing || !files.length) { updateFooter(); return; }
        waitingAfterMedia = !!afterMedia;
        if (safetyOnly) {
            // No visible countdown while media plays; progress resumes for
            // the post-ended wait (see onMediaEnded).
            updateFooter('Playing…');
            rotateTimer = setTimeout(function () { step(1); }, waitMs);
            return;
        }
        startProgress(waitMs, afterMedia);
        rotateTimer = setTimeout(function () { step(1); }, waitMs);
        updateFooter();
    }

    function onMediaEnded() {
        if (!files.length) return;
        // Spec: audio/video wait `rotateSec` AFTER finishing before rotating.
        clearRotateTimer();
        if (viewMode === 'browse' || !playing) { updateFooter(); return; }
        scheduleNext(rotateSec * 1000, true, false);
    }

    function startProgress(lenMs, afterMedia) {
        stopProgress();
        progressLenMs = Math.max(lenMs, 1);
        progressStart = performance.now();
        const fill = $('progressFill');
        fill.classList.toggle('waiting', !!afterMedia);
        const tickBar = function (now) {
            const done = Math.min((now - progressStart) / progressLenMs, 1);
            fill.style.width = (done * 100).toFixed(1) + '%';
            if (done < 1) progressRaf = requestAnimationFrame(tickBar);
        };
        progressRaf = requestAnimationFrame(tickBar);
    }
    function stopProgress() {
        if (progressRaf) { cancelAnimationFrame(progressRaf); progressRaf = 0; }
        const fill = $('progressFill');
        if (fill) { fill.style.width = '0%'; fill.classList.remove('waiting'); }
    }

    function step(dir) {
        if (!files.length) return;
        showIndex(currentIndex + dir);
    }

    function setPlaying(on) {
        playing = !!on;
        if (!playing) {
            clearRotateTimer();
            stopProgress();
            try { $('videoEl').pause(); } catch (e) {}
            try {
                $('audioEl').pause();
                $('audioDisc').classList.remove('playing');
            } catch (e) {}
        } else if (files.length) {
            // Resume: re-show current item so its wait restarts cleanly.
            showIndex(currentIndex);
        }
        syncControls();
        updateFooter();
    }

    function syncControls() {
        const has = files.length > 0;
        $('prevBtn').disabled = !has;
        $('nextBtn').disabled = !has;
        $('playBtn').disabled = !has;
        $('playBtn').textContent = playing ? '⏸ Pause' : '▶ Play';
    }

    // Single status bar (see media.html .media-footer): auth + item count
    // live on the left (setAuthUI), slideshow state on the right here.
    // NOTE: no static "Every Xs" note — it duplicated the live countdown
    // ("Next in Xs"), so the interval only appears inside live messages.
    function updateFooter(overrideNote) {
        const dot = $('rotateDot'), note = $('rotateNote');
        if (!files.length) {
            if (dot) dot.classList.add('paused');
            if (note) note.textContent = 'Sign in to load media';
            return;
        }
        // While browsing, the slideshow is suspended by design (see
        // setView) — say so instead of showing a stale countdown.
        if (viewMode === 'browse' && !overrideNote) {
            if (dot) dot.classList.add('paused');
            if (note) note.textContent = 'Browsing — slideshow paused';
            return;
        }
        if (overrideNote) {
            if (dot) dot.classList.remove('paused');
            if (note) note.textContent = overrideNote;
            return;
        }
        if (dot) dot.classList.toggle('paused', !playing);
        if (note) {
            if (!playing) note.textContent = 'Slideshow paused';
            else if (waitingAfterMedia) note.textContent = 'Next after ' + rotateSec + 's pause';
            else {
                const cur = files[currentIndex];
                note.textContent = (cur && (cur.kind === 'video' || cur.kind === 'audio'))
                    ? 'Advances ' + rotateSec + 's after playback'
                    : 'Next in ' + rotateSec + 's';
            }
        }
    }

    /* ---------------- view mode: viewer vs browse grid -------------------
       Entering Browse SUSPENDS the slideshow (timer cleared, hidden media
       paused); returning to Viewer resumes the current item's wait (see
       resumeCurrent). This fixes the bug where the 30s timer kept
       advancing the hidden viewer while browsing. */
    function setView(mode) {
        const next = (mode === 'browse') ? 'browse' : 'viewer';
        const changed = next !== viewMode;
        viewMode = next;
        try { localStorage.setItem(LOCAL_VIEW_KEY, viewMode); } catch (e) {}
        const viewer = $('viewerView'), browse = $('browseView');
        if (viewer) viewer.style.display = viewMode === 'viewer' ? 'flex' : 'none';
        if (browse) {
            browse.hidden = viewMode !== 'browse';
            browse.style.display = viewMode === 'browse' ? 'flex' : 'none';
        }
        if ($('viewerTab')) $('viewerTab').classList.toggle('active', viewMode === 'viewer');
        if ($('browseTab')) $('browseTab').classList.toggle('active', viewMode === 'browse');
        if (viewMode === 'browse') {
            // Suspend: no timer, no progress, hidden media paused. The
            // `playing` flag is left untouched so Viewer resumes cleanly.
            clearRotateTimer();
            stopProgress();
            try { $('videoEl').pause(); } catch (e) {}
            try { $('audioEl').pause(); $('audioDisc').classList.remove('playing'); } catch (e) {}
            renderBrowse();
            updateFooter();
        } else if (changed) {
            resumeCurrent();
        }
    }

    // Restart the current item's wait/playback after returning from Browse.
    // Photos restart their countdown; video/audio resume in place (no
    // re-download — the blob URL is cached) with a fresh safety backstop.
    function resumeCurrent() {
        if (!playing || !files.length) { updateFooter(); return; }
        const cur = files[currentIndex];
        if (!cur) { updateFooter(); return; }
        if (cur.kind === 'photo' && !$('photoEl').hidden && $('photoEl').src) {
            scheduleNext(rotateSec * 1000, false);
            return;
        }
        if ((cur.kind === 'video' || cur.kind === 'audio')) {
            const el = cur.kind === 'video' ? $('videoEl') : $('audioEl');
            if (el && el.src && !el.ended) {
                stopProgress();
                updateFooter('Playing…');
                try {
                    const p = el.play();
                    if (p && p.catch) p.catch(function () {});
                } catch (e) {}
                if (cur.kind === 'audio') {
                    try { $('audioDisc').classList.add('playing'); } catch (e) {}
                }
                clearRotateTimer();
                rotateTimer = setTimeout(function () { step(1); },
                    Math.max(rotateSec * 1000, 5000) + (cur.kind === 'video' ? 120000 : 180000));
                return;
            }
        }
        showIndex(currentIndex);
    }

    function readLocalView() {
        try {
            return localStorage.getItem(LOCAL_VIEW_KEY) === 'browse' ? 'browse' : 'viewer';
        } catch (e) { return 'viewer'; }
    }

    /* ---------------- thumbnails: direct <img>, lazy ----------------------
       BUGFIX (CORS): thumbnailLink lives on lh3.googleusercontent.com,
       which rejects cross-origin fetch() with an Authorization header, so
       downloading thumbnails as blobs always fails. The fix is to NOT
       fetch at all: the thumbnailLink is a signed capability URL, and
       plain <img src> display is exempt from CORS. Tiles therefore render
       <img src="thumbnailLink"> directly (resized to =s400, a few KB).
       The Browse grid still NEVER downloads full files — those are only
       fetched when a tile is opened in the Viewer. Images are assigned
       lazily as tiles scroll into view (IntersectionObserver, 200px
       margin) with loading="lazy", so a 500-file folder doesn't fire 500
       requests at once. Audio has no Drive thumbnail -> icon tile. */
    function thumbSrc(file) {
        // Drive returns e.g. "...=s220"; ask for a grid-friendly width.
        try {
            const link = file && file.thumbnailLink;
            if (typeof link !== 'string' || !link) return null;
            if (/=s\d+/.test(link)) return link.replace(/=s\d+[^&]*/, '=s400');
            return link;
        } catch (e) { return file && file.thumbnailLink; }
    }

    function thumbIcon(kind) {
        return kind === 'video' ? '🎬' : kind === 'audio' ? '🎵' : '🖼️';
    }

    function makeThumbImg(file, src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = file ? file.name : '';
        img.loading = 'lazy';
        // Broken/expired thumbnailLink -> fall back to the icon tile
        // instead of a broken-image glyph.
        img.onerror = function () {
            const holder = img.parentElement;
            if (!holder) return;
            img.remove();
            if (!holder.textContent) holder.textContent = thumbIcon(file && file.kind);
        };
        return img;
    }

    // Upgrade a single tile to the cached FULL blob (e.g. after the viewer
    // or neighbour preload downloaded it) without re-rendering the grid.
    function paintThumb(fileId) {
        const grid = $('browseGrid');
        if (!grid || !objectUrls[fileId]) return;
        const cell = grid.querySelector('[data-file-id="' + fileId + '"] .browse-thumb');
        if (!cell) return;
        const img = cell.querySelector('img');
        if (img && img.src !== objectUrls[fileId]) img.src = objectUrls[fileId];
    }

    function ensureThumbObserver() {
        if (thumbObserver || !('IntersectionObserver' in window)) return thumbObserver;
        thumbObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (!en.isIntersecting) return;
                const cell = en.target;
                thumbObserver.unobserve(cell);
                if (cell.getAttribute('data-thumb-loaded')) return;
                const id = cell.getAttribute('data-file-id');
                const file = files.find(function (f) { return f.id === id; });
                if (!file) return;
                cell.setAttribute('data-thumb-loaded', '1');
                const holder = cell.querySelector('.browse-thumb');
                if (!holder || holder.querySelector('img')) return;
                const full = objectUrls[file.id];
                const src = full || thumbSrc(file);
                if (!src) return;
                holder.textContent = '';
                holder.classList.remove('video', 'audio');
                holder.appendChild(makeThumbImg(file, src));
            });
        }, { root: $('browseGrid'), rootMargin: '200px', threshold: 0.01 });
        return thumbObserver;
    }

    // Thumbnail grid: tiles render instantly as icon placeholders; the
    // <img> is attached lazily on scroll (or immediately where
    // IntersectionObserver is unavailable). Tapping a tile jumps the
    // viewer to that item (full file downloads only then).
    function renderBrowse() {
        const grid = $('browseGrid'), count = $('browseCount');
        if (!grid) return;
        if (thumbObserver) { try { thumbObserver.disconnect(); } catch (e) {} thumbObserver = null; }
        grid.innerHTML = '';
        if (count) {
            let label = files.length
                ? files.length + ' item' + (files.length === 1 ? '' : 's') + ' · tap to view'
                : 'Browse';
            if (lastSyncText) label += ' · synced ' + lastSyncText;
            count.textContent = label;
        }
        syncRefreshBtn();
        if (!files.length) {
            const s = document.createElement('div');
            s.className = 'browse-empty';
            s.innerHTML = POPUP ? 'Nothing here yet.<br>Tap Sign In above.'
                                : 'Nothing here yet.<br>Sign in via Settings → Media.';
            grid.appendChild(s);
            return;
        }
        const observer = ensureThumbObserver();
        files.forEach(function (f, i) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'browse-cell' + (i === currentIndex ? ' active' : '');
            cell.title = f.name;
            cell.setAttribute('data-file-id', f.id);

            const thumb = document.createElement('span');
            thumb.className = 'browse-thumb' + (f.kind === 'video' ? ' video' : f.kind === 'audio' ? ' audio' : '');
            const full = objectUrls[f.id];
            const link = thumbSrc(f);
            if (full) {
                // Already have the full file (viewed/preloaded): best quality.
                thumb.classList.remove('video', 'audio');
                thumb.appendChild(makeThumbImg(f, full));
                cell.setAttribute('data-thumb-loaded', '1');
            } else if (f.kind === 'audio' || !link) {
                thumb.textContent = thumbIcon(f.kind);
            } else {
                // Placeholder until the tile scrolls into view; the
                // observer then attaches the direct thumbnailLink <img>.
                // No fetch(), no CORS — plain image display is exempt.
                thumb.textContent = thumbIcon(f.kind);
                if (observer) observer.observe(cell);
                else {
                    thumb.textContent = '';
                    thumb.classList.remove('video', 'audio');
                    thumb.appendChild(makeThumbImg(f, link));
                    cell.setAttribute('data-thumb-loaded', '1');
                }
            }

            const name = document.createElement('span');
            name.className = 'browse-name';
            name.textContent = f.name;

            cell.appendChild(thumb);
            cell.appendChild(name);
            cell.addEventListener('click', function () {
                setView('viewer');
                showIndex(i);
            });
            grid.appendChild(cell);
        });
    }

    /* ---------------- rotation interval (parent-owned) -------------------
       Hard cap matches the parent (script.js slider, 5–120s) so the two
       sides can never disagree. */
    const ROTATE_MIN = 5, ROTATE_MAX = 120;
    function applyRotateSec(sec, persistLocal) {
        const n = Math.round(Number(sec));
        if (!isFinite(n)) return;
        rotateSec = Math.min(ROTATE_MAX, Math.max(ROTATE_MIN, n));
        if (persistLocal) {
            try { localStorage.setItem(LOCAL_INTERVAL_KEY, String(rotateSec)); } catch (e) {}
        }
        updateFooter();
        // Restart the current wait with the new interval when showing a photo.
        const cur = files[currentIndex];
        if (playing && cur && cur.kind === 'photo' && !$('photoEl').hidden) {
            scheduleNext(rotateSec * 1000, false);
        }
    }

    function readLocalInterval() {
        try {
            const raw = localStorage.getItem(LOCAL_INTERVAL_KEY);
            const n = Math.round(Number(raw));
            if (isFinite(n) && n >= ROTATE_MIN && n <= ROTATE_MAX) return n;
        } catch (e) {}
        return DEFAULT_ROTATE_SEC;
    }

    window.addEventListener('message', function (e) {
        const data = e.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'media-config' && typeof data.rotateSec !== 'undefined') {
            applyRotateSec(data.rotateSec, false);
        } else if (data.type === 'media-auth' && typeof data.action === 'string') {
            if (data.action === 'signin' || data.action === 'reload') requestToken();
            else if (data.action === 'signout') signOut();
            else if (data.action === 'refresh') refreshLibrary();
            else if (data.action === 'status') {
                // Parent re-opened Settings and wants a fresh status push.
                const dot = $('authDot');
                setAuthUI(dot ? dot.classList.contains('signed') : !!getCachedToken(),
                    $('authStatus') ? $('authStatus').textContent : undefined);
            }
        }
    });
    // Ask the parent for the persisted interval on boot (parent may have
    // loaded this iframe before attaching its own `load` bridge).
    function queryParentConfig() {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'media-config-query' }, '*');
                window.parent.postMessage({ type: 'media-auth-query' }, '*');
            }
        } catch (e) {}
    }

    /* ---------------- boot ----------------------------------------------- */
    document.addEventListener('DOMContentLoaded', function () {
        try {
            rotateSec = readLocalInterval();
            viewMode = readLocalView();
            $('prevBtn').addEventListener('click', function () { step(-1); });
            $('nextBtn').addEventListener('click', function () { step(1); });
            $('playBtn').addEventListener('click', function () { setPlaying(!playing); });
            if ($('viewerTab')) $('viewerTab').addEventListener('click', function () { setView('viewer'); });
            if ($('browseTab')) $('browseTab').addEventListener('click', function () { setView('browse'); });
            if ($('refreshBtn')) $('refreshBtn').addEventListener('click', refreshLibrary);
            // Header: pop-out opens the standalone full-tab (bus-panel pattern).
            if ($('popoutBtn')) $('popoutBtn').addEventListener('click', function () {
                try { window.open('media.html?popup=1', '_blank', 'noopener'); } catch (e) {}
            });
            // Header: popup tab owns its auth (user gesture keeps the
            // Google popup unblocked, same as the Settings button).
            if ($('authBtn')) $('authBtn').addEventListener('click', function () {
                const dot = $('authDot');
                if (dot && dot.classList.contains('signed')) signOut();
                else requestToken();
            });
            if (POPUP) {
                // Standalone wording: no Settings parent exists here.
                const st = $('authStatus');
                if (st && /Settings/.test(st.textContent || '')) {
                    st.textContent = 'Not signed in — tap Sign In above';
                }
                const emptyLabel = document.querySelector('#stageEmpty span:last-child');
                if (emptyLabel && /Settings/.test(emptyLabel.innerHTML || '')) {
                    emptyLabel.innerHTML = 'Tap Sign In above<br>to load photos, audio &amp; video.';
                }
                const emptyTitle = document.querySelector('.media-header-subtitle');
                if (emptyTitle) emptyTitle.textContent = 'Photo · Audio · Video · Full Tab';
            }
            $('videoEl').addEventListener('ended', onMediaEnded);
            $('audioEl').addEventListener('ended', function () {
                $('audioDisc').classList.remove('playing');
                onMediaEnded();
            });
            $('videoEl').addEventListener('play', function () { stopProgress(); updateFooter('Playing…'); });
            $('audioEl').addEventListener('play', function () {
                $('audioDisc').classList.add('playing');
                stopProgress(); updateFooter('Playing…');
            });
            $('videoEl').addEventListener('pause', function () {
                if (playing && !$('videoEl').hidden && !$('videoEl').ended) updateFooter('Paused video — slideshow waits');
            });
            setView(viewMode);
            syncControls();
            renderBrowse();
            updateFooter();
            initGsi();
            queryParentConfig();
        } catch (err) {
            console.error('[Media] boot failed:', err);
        }
    });
})();
