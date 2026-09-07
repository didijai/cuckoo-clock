/**
 * Gallery token broker — viewer-identity sessions, folder-scoped SA Drive tokens.
 *
 * Roles:
 *  - Browser (GitHub Pages) holds: opaque session (localStorage, permanent)
 *    + short SA access_token (memory only, ~1h). Calls Drive directly as SA identity.
 *  - Script holds: CLIENT_ID + ALLOWLIST (code), SA_CLIENT_EMAIL + SA_PRIVATE_KEY
 *    (Script Properties, never repo). Mints folder-scoped SA tokens (drive.readonly).
 *  - Drive folder shared Viewer-only to the SA email. Leaked browser token sees
 *    that folder only, never the owner's whole Drive.
 *
 * Setup (owner does once):
 *  1. Cloud Console (new project): enable Drive API, create Service Account
 *     (no roles, no delegation), JSON key downloaded, share FOLDER_ID Viewer to SA.
 *  2. Same/new project Web client: authorized JS origins = https://<you>.github.io.
 *  3. Fill FOLDER_ID / CLIENT_ID / ALLOWLIST below (or keep placeholders, set in code).
 *  4. Apps Script Project Settings > Script Properties: add
 *       SA_CLIENT_EMAIL = <sa>@<project>.iam.gserviceaccount.com
 *       SA_PRIVATE_KEY  = -----BEGIN PRIVATE KEY-----... (paste full PEM from JSON,
 *                         newlines preserved; \\n sequences are auto-fixed)
 *  5. appsscript.json oauthScopes: script.storage + script.external_request +
 *     userinfo.email only (NO drive scope — script never calls DriveApp).
 *  6. Deploy > Web app > Execute as: Me > Who has access: Anyone.
 *  7. Paste Web App URL into index.html APPS_SCRIPT_URL.
 */
// Personal values live in Script Properties (never in git).
// Project Settings > Script Properties: CFG_FOLDER_ID, CFG_CLIENT_ID,
// CFG_ALLOWLIST (comma-separated emails). Consts below are fallbacks only.
const FOLDER_ID = 'PASTE_FOLDER_ID';
const CLIENT_ID = 'PASTE_WEB_CLIENT_ID.apps.googleusercontent.com';
const ALLOWLIST = [
  // 'PASTE_ALLOWED_EMAIL@gmail.com',
];

function getCfg() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('CFG_FOLDER_ID') || FOLDER_ID;
  const clientId = props.getProperty('CFG_CLIENT_ID') || CLIENT_ID;
  const rawList = props.getProperty('CFG_ALLOWLIST');
  const allowlist = rawList
    ? rawList.split(',').map((s) => s.trim()).filter((s) => s)
    : ALLOWLIST.slice();
  return { folderId: folderId, clientId: clientId, allowlist: allowlist };
}

const SA_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function doGet(e) {
  return handle((e && e.parameter) || {});
}

function doPost(e) {
  let p = {};
  try {
    if (e && e.postData && e.postData.contents) p = JSON.parse(e.postData.contents);
  } catch (err) {}
  if (e && e.parameter) {
    for (const k in e.parameter) if (!(k in p)) p[k] = e.parameter[k];
  }
  return handle(p);
}

function handle(p) {
  const action = p.action || '';
  try {
    // Public bootstrap: lets the static repo hold only APPS_SCRIPT_URL.
    // Folder ID alone grants nothing without a session + SA token.
    if (action === 'config') {
      const cfg = getCfg();
      const ready = cfg.folderId.indexOf('PASTE') !== 0 && cfg.clientId.indexOf('PASTE') !== 0;
      return out(p, { client_id: cfg.clientId, folder_id: cfg.folderId, ready: ready });
    }
    if (action === 'session') return actionSession(p);
    if (action === 'token') return actionToken(p);
    if (action === 'logout') return actionLogout(p);
    return out(p, { error: 'unknown action' });
  } catch (err) {
    return out(p, { error: String(err) });
  }
}

// Exchange Google ID token -> per-user opaque session (verified + allowlisted)
function actionSession(p) {
  const idToken = p.id_token || p.credential || '';
  if (!idToken) return out(p, { error: 'missing id_token' });
  const info = verifyIdToken(idToken);
  if (!info.ok) return out(p, { error: 'bad id_token: ' + info.error });
  const email = String(info.email || '').toLowerCase();
  const allowed = getCfg().allowlist.map((a) => String(a).toLowerCase());
  if (allowed.indexOf(email) < 0) return out(p, { error: 'not allowed: ' + email });
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(
    'sess_' + token, JSON.stringify({ email: email, created: new Date().toISOString() }));
  return out(p, { session: token, email: email });
}

// Mint (or reuse cached) folder-scoped SA access token for a valid session
function actionToken(p) {
  const email = checkSession(p.session || '');
  if (!email) return out(p, { error: 'unauthorized' });
  const cache = CacheService.getScriptCache();
  const cached = cache ? cache.get('sa_access') : null;
  if (cached) return out(p, { access_token: cached, expires_in: 3600, cached: true });
  const cfg = getSaConfig();
  if (!cfg.ok) return out(p, { error: cfg.error });
  const assertion = buildSaAssertion(cfg.email, cfg.key);
  const payload = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: assertion,
  };
  const res = UrlFetchApp.fetch(TOKEN_URL, {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    return out(p, { error: 'sa token ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300) });
  }
  const d = JSON.parse(res.getContentText());
  if (!d.access_token) return out(p, { error: 'no access_token in SA response' });
  try { cache.put('sa_access', d.access_token, 3300); } catch (err) {}
  return out(p, { access_token: d.access_token, expires_in: d.expires_in || 3600 });
}

function actionLogout(p) {
  if (p.session) {
    try { PropertiesService.getScriptProperties().deleteProperty('sess_' + p.session); } catch (err) {}
  }
  return out(p, { ok: true });
}

function checkSession(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties().getProperty('sess_' + token);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    const allowed = getCfg().allowlist.map((a) => String(a).toLowerCase());
    if (allowed.indexOf(String(o.email || '').toLowerCase()) < 0) return null;
    return o.email;
  } catch (err) { return null; }
}

function getSaConfig() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('SA_CLIENT_EMAIL') || '';
  let key = props.getProperty('SA_PRIVATE_KEY') || '';
  if (!email || !key) {
    return { ok: false, error: 'server not configured (SA_CLIENT_EMAIL/SA_PRIVATE_KEY missing)' };
  }
  // JSON private_key often arrives with literal \n — restore real newlines
  key = key.replace(/\\n/g, '\n');
  if (key.indexOf('BEGIN PRIVATE KEY') < 0) {
    return { ok: false, error: 'SA_PRIVATE_KEY malformed' };
  }
  return { ok: true, email: email, key: key };
}

function verifyIdToken(idToken) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, error: 'tokeninfo ' + res.getResponseCode() };
  const d = JSON.parse(res.getContentText());
  if (d.aud !== getCfg().clientId) return { ok: false, error: 'aud mismatch' };
  const now = Math.floor(Date.now() / 1000);
  if (d.exp && Number(d.exp) < now) return { ok: false, error: 'expired' };
  if (d.email_verified !== 'true' && d.email_verified !== true) return { ok: false, error: 'email not verified' };
  if (!d.email) return { ok: false, error: 'no email' };
  return { ok: true, email: d.email };
}

function b64url(objOrBytes) {
  const bytes = (typeof objOrBytes === 'string')
    ? Utilities.newBlob(objOrBytes).getBytes()
    : objOrBytes;
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function buildSaAssertion(saEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: saEmail,
    scope: SA_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const input = header + '.' + claim;
  const sig = Utilities.computeRsaSha256Signature(input, privateKey);
  return input + '.' + b64url(sig);
}

// ---- Admin helpers (Run in Apps Script editor) ----
function adminListSessions() {
  const props = PropertiesService.getScriptProperties().getProperties();
  let n = 0;
  for (const k in props) {
    if (k.indexOf('sess_') !== 0) continue;
    n++;
    try {
      const o = JSON.parse(props[k]);
      Logger.log(k.slice(0, 18) + '… email=' + o.email + ' created=' + o.created);
    } catch (err) {
      Logger.log(k + ' (unparseable)');
    }
  }
  Logger.log('total sessions: ' + n);
}

function adminRevokeEmail(email) {
  email = String(email || '').toLowerCase();
  const store = PropertiesService.getScriptProperties();
  const props = store.getProperties();
  let n = 0;
  for (const k in props) {
    if (k.indexOf('sess_') !== 0) continue;
    try {
      const o = JSON.parse(props[k]);
      if (String(o.email || '').toLowerCase() === email) { store.deleteProperty(k); n++; }
    } catch (err) {}
  }
  Logger.log('revoked ' + n + ' session(s) for ' + email);
}

function adminRevokeAll() {
  const store = PropertiesService.getScriptProperties();
  const props = store.getProperties();
  let n = 0;
  for (const k in props) {
    if (k.indexOf('sess_') === 0) { store.deleteProperty(k); n++; }
  }
  Logger.log('revoked all ' + n + ' session(s)');
}

function out(p, obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
