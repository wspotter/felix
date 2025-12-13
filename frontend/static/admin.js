const tokenKey = 'felix-admin-token';
let adminToken = localStorage.getItem(tokenKey) || '';

const tokenInput = document.getElementById('tokenInput');
const saveTokenBtn = document.getElementById('saveToken');
const refreshBtn = document.getElementById('refresh');
const healthSection = document.getElementById('healthSection');
const sessionsTableBody = document.querySelector('#sessionsTable tbody');
const sessionCount = document.getElementById('sessionCount');
const eventsList = document.getElementById('eventsList');
const eventCount = document.getElementById('eventCount');
const logsList = document.getElementById('logsList');
const logCount = document.getElementById('logCount');

const REFRESH_MS = 5000;
let refreshTimer = null;

if (tokenInput && adminToken) {
  tokenInput.value = adminToken;
}

function setStatus(text) {
  refreshBtn.textContent = text;
}

function formatTimestamp(ts) {
  if (!ts && ts !== 0) return '—';
  const date = new Date(ts * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatSince(ts) {
  if (!ts && ts !== 0) return '—';
  const diffMs = Date.now() - ts * 1000;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

async function fetchAdmin(path) {
  const headers = {};
  if (adminToken) {
    // Support both X-Admin-Token and Authorization: Bearer formats
    // If token looks like a JWT or session token, use Authorization header
    // Otherwise use X-Admin-Token for backwards compatibility
    if (adminToken.includes('.') || adminToken.length > 40) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    } else {
      headers['X-Admin-Token'] = adminToken;
    }
  }
  const res = await fetch(path, { headers });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized: set a valid admin token.');
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

function renderHealth(health) {
  const cards = [];
  const statusClass = health.status === 'ok' ? 'status-badge' : 'status-badge danger';
  cards.push(`
    <div class="card">
      <div class="flex-between" style="margin-bottom:10px;">
        <div class="status-badge ${statusClass.includes('danger') ? 'danger' : ''}">
          <span class="status-dot"></span>
          <span>${health.status || 'unknown'}</span>
        </div>
        <span class="muted">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="grid" style="gap:6px;">
        <div class="stat"><span class="label">STT</span><span class="value">${health.stt || 'n/a'}</span></div>
        <div class="stat"><span class="label">LLM</span><span class="value">${health.llm || 'n/a'}</span></div>
        <div class="stat"><span class="label">TTS</span><span class="value">${health.tts || 'n/a'}</span></div>
        <div class="stat"><span class="label">ComfyUI</span><span class="value">${health.comfyui || 'n/a'}</span></div>
      </div>
    </div>
  `);

  cards.push(`
    <div class="card">
      <div class="flex-between" style="margin-bottom:10px;">
        <h3 style="margin:0;">Runtime</h3>
        <span class="muted">tools ${health.tools_registered ?? 0}</span>
      </div>
      <div class="grid" style="gap:6px;">
        <div class="stat"><span class="label">Connections</span><span class="value">${health.active_connections ?? 0}</span></div>
        <div class="stat"><span class="label">Sessions</span><span class="value">${health.active_sessions ?? 0}</span></div>
        <div class="stat"><span class="label">Events</span><span class="value">${health.events ?? 0}</span></div>
        <div class="stat"><span class="label">Logs</span><span class="value">${health.logs ?? 0}</span></div>
      </div>
    </div>
  `);

  healthSection.innerHTML = cards.join('');
}

function renderSessions(sessions) {
  sessionCount.textContent = `${sessions.length} active`;
  const rows = sessions
    .sort((a, b) => (b.last_activity || 0) - (a.last_activity || 0))
    .map((s) => {
      const counts = s.history_counts || {};
      return `
        <tr>
          <td class="nowrap">${s.client_id}</td>
          <td>${s.state}</td>
          <td>${formatSince(s.last_activity)}</td>
          <td class="muted">u:${counts.user || 0} a:${counts.assistant || 0} t:${counts.tool || 0}</td>
          <td>${s.speaking_timeout ? 'timed out' : 'ok'}</td>
        </tr>
      `;
    });
  sessionsTableBody.innerHTML = rows.join('') || '<tr><td colspan="5" class="muted">No active sessions</td></tr>';
}

function renderList(listEl, items, formatter) {
  listEl.innerHTML = items
    .slice()
    .reverse()
    .map(formatter)
    .join('') || '<div class="muted">No data yet</div>';
}

function renderEvents(events) {
  eventCount.textContent = events.length;
  renderList(eventsList, events, (ev) => {
    const { type, timestamp, ...rest } = ev;
    const details = Object.entries(rest)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ');
    return `
      <div class="list-item">
        <div class="meta">
          <span>${formatTimestamp(timestamp)}</span>
          <span>${type}</span>
        </div>
        <div>${details || '<span class="muted">No details</span>'}</div>
      </div>
    `;
  });
}

function renderLogs(logs) {
  logCount.textContent = logs.length;
  renderList(logsList, logs, (log) => {
    const { level, message, timestamp, ...rest } = log;
    const details = Object.entries(rest)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' · ');
    return `
      <div class="list-item">
        <div class="meta">
          <span>${formatTimestamp(timestamp)}</span>
          <span>${level}</span>
        </div>
        <div>${message}</div>
        <div class="muted">${details || 'No details'}</div>
      </div>
    `;
  });
}

async function refreshAll() {
  if (!adminToken) {
    setStatus('Add token to refresh');
    return;
  }
  try {
    setStatus('Refreshing...');
    const [health, sessions, events, logs] = await Promise.all([
      fetchAdmin('/api/admin/health'),
      fetchAdmin('/api/admin/sessions'),
      fetchAdmin('/api/admin/events'),
      fetchAdmin('/api/admin/logs'),
    ]);
    renderHealth(health);
    renderSessions(sessions.sessions || []);
    renderEvents(events.events || []);
    renderLogs(logs.logs || []);
    setStatus('Refresh');
  } catch (err) {
    setStatus('Refresh failed');
    console.error(err);
    alert(err.message);
  }
}

function startPolling() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshAll, REFRESH_MS);
}

saveTokenBtn?.addEventListener('click', () => {
  adminToken = tokenInput.value.trim();
  if (adminToken) {
    localStorage.setItem(tokenKey, adminToken);
    refreshAll();
    startPolling();
  }
});

refreshBtn?.addEventListener('click', () => refreshAll());

// Initial kick
if (adminToken) {
  refreshAll();
  startPolling();
} else {
  setStatus('Add token to refresh');
}
