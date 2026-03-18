// ===================== DATA STORE =====================
const STORAGE_KEY = 'zmv_tracker_data';

const defaultData = {
  clients: [
    { id: 'c1', name: 'Praxis Dr. Müller', contractHours: 20, hourlyRate: 85, extraRate: 95, billingPeriod: 'monthly', notes: 'GOZ-Schwerpunkt' },
    { id: 'c2', name: 'Praxis Dr. Weber & Partner', contractHours: 40, hourlyRate: 80, extraRate: 90, billingPeriod: 'monthly', notes: 'BEMA + GOZ' },
    { id: 'c3', name: 'Zahnarztpraxis Am Park', contractHours: 15, hourlyRate: 90, extraRate: 105, billingPeriod: 'monthly', notes: 'Nur GOZ-Erstattungen' },
  ],
  timeEntries: [
    { id: 't1', clientId: 'c1', date: '2026-03-17', startTime: '08:00', endTime: '10:30', duration: 2.5, project: 'GOZ-Erstattungen', notes: 'Q1 Nachbearbeitung' },
    { id: 't2', clientId: 'c2', date: '2026-03-17', startTime: '11:00', endTime: '14:00', duration: 3, project: 'BEMA-Abrechnung', notes: 'Monatsabschluss März' },
    { id: 't3', clientId: 'c1', date: '2026-03-16', startTime: '09:00', endTime: '12:00', duration: 3, project: 'HKP-Prüfung', notes: '' },
    { id: 't4', clientId: 'c3', date: '2026-03-16', startTime: '13:00', endTime: '15:30', duration: 2.5, project: 'GOZ-Erstattungen', notes: 'Neue Fälle' },
    { id: 't5', clientId: 'c2', date: '2026-03-15', startTime: '08:30', endTime: '13:30', duration: 5, project: 'BEMA-Abrechnung', notes: '' },
    { id: 't6', clientId: 'c2', date: '2026-03-14', startTime: '09:00', endTime: '16:00', duration: 7, project: 'KFO-Abrechnung', notes: 'Quartalsabschluss' },
  ],
  screenshots: [],
  activeTimer: null
};

let data = loadData();
let currentPage = 'dashboard';
let screenshotInterval = null;
let activeStream = null;       // persistent screen capture stream
let activeVideoTrack = null;   // persistent video track for grabbing frames

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults for new fields
      return { ...defaultData, ...parsed };
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(defaultData));
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch(e) {}
}

// ===================== UTILITIES =====================
function uid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2,'0')}m`;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function getClientById(id) { return data.clients.find(c => c.id === id); }

function getClientHours(clientId, month) {
  const now = month || new Date().toISOString().slice(0, 7);
  return data.timeEntries
    .filter(e => e.clientId === clientId && e.date.startsWith(now))
    .reduce((sum, e) => sum + e.duration, 0);
}

function getClientScreenshots(clientId) {
  return data.screenshots.filter(s => s.clientId === clientId);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${msg}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ===================== NAVIGATION =====================
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item')[['dashboard','tracking','clients','billing','screenshots'].indexOf(page)].classList.add('active');
  render();
}

// ===================== TIMER LOGIC =====================
async function startTimer(clientId) {
  if (data.activeTimer) return;
  const client = getClientById(clientId);
  
  // Request screen share ONCE at clock-in — user approves once, then it runs silently
  // preferCurrentTab: false + selfBrowserSurface: exclude forces the "Entire Screen" picker
  try {
    activeStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor', cursor: 'always' },
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      monitorTypeSurfaces: 'include',
      surfaceSwitching: 'exclude'
    });
    activeVideoTrack = activeStream.getVideoTracks()[0];
    
    // If user stops sharing via browser UI, auto clock-out
    activeVideoTrack.addEventListener('ended', () => {
      if (data.activeTimer) {
        toast('Bildschirmfreigabe beendet — Timer gestoppt');
        stopTimer();
      }
    });
  } catch(e) {
    toast('Bildschirmfreigabe erforderlich für Screenshots');
    // Start timer anyway but without screenshots
    activeStream = null;
    activeVideoTrack = null;
  }
  
  data.activeTimer = {
    clientId,
    clientName: client.name,
    startTime: Date.now(),
    startTimeFormatted: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    project: document.getElementById('timer-project')?.value || 'Allgemein'
  };
  saveData();
  startScreenshotCapture();
  render();
  toast(`Timer gestartet für ${client.name}`);
}

function stopTimer() {
  if (!data.activeTimer) return;
  const elapsed = (Date.now() - data.activeTimer.startTime) / 3600000;
  const entry = {
    id: uid(),
    clientId: data.activeTimer.clientId,
    date: new Date().toISOString().slice(0, 10),
    startTime: data.activeTimer.startTimeFormatted,
    endTime: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    duration: Math.round(elapsed * 100) / 100,
    project: data.activeTimer.project,
    notes: ''
  };
  data.timeEntries.unshift(entry);
  const clientName = data.activeTimer.clientName;
  data.activeTimer = null;
  stopScreenshotCapture();
  
  // Close the persistent screen share stream
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
    activeVideoTrack = null;
  }
  
  saveData();
  render();
  toast(`${formatDuration(entry.duration)} erfasst für ${clientName}`);
}

function getElapsedSeconds() {
  if (!data.activeTimer) return 0;
  return Math.floor((Date.now() - data.activeTimer.startTime) / 1000);
}

// ===================== SCREENSHOT LOGIC =====================
function startScreenshotCapture() {
  stopScreenshotCapture();
  // First screenshot after 10 seconds (let stream stabilize), then every 10 minutes
  setTimeout(() => {
    captureScreenshot();
    screenshotInterval = setInterval(captureScreenshot, 600000); // 10 min
  }, 10000);
}

function stopScreenshotCapture() {
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
}

async function captureScreenshot() {
  if (!data.activeTimer) return;
  
  // Use the persistent stream — no new permission prompt
  if (!activeVideoTrack || activeVideoTrack.readyState !== 'live') {
    console.log('Screenshot übersprungen: Kein aktiver Video-Stream');
    addPlaceholderScreenshot('Stream nicht verfügbar');
    return;
  }
  
  try {
    const imageCapture = new ImageCapture(activeVideoTrack);
    const bitmap = await imageCapture.grabFrame();
    
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    
    // Add timestamp watermark
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, bitmap.height - 36, bitmap.width, 36);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';
    const ts = new Date().toLocaleString('de-DE');
    const clientName = data.activeTimer.clientName;
    ctx.fillText(`${clientName}  —  ${ts}  —  ${data.activeTimer.project}`, 12, bitmap.height - 12);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    
    const screenshot = {
      id: uid(),
      clientId: data.activeTimer.clientId,
      timestamp: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      dataUrl,
      project: data.activeTimer.project
    };
    
    data.screenshots.push(screenshot);
    saveData();
    
    // Update screenshot counter in UI if visible
    const counter = document.getElementById('ss-counter');
    if (counter) counter.textContent = getClientScreenshots(data.activeTimer.clientId).length;
    
    toast('📷 Screenshot erfasst');
  } catch(e) {
    console.log('Screenshot fehlgeschlagen:', e.message);
    addPlaceholderScreenshot(e.message);
  }
}

function addPlaceholderScreenshot(reason) {
  if (!data.activeTimer) return;
  const screenshot = {
    id: uid(),
    clientId: data.activeTimer.clientId,
    timestamp: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    dataUrl: null,
    project: data.activeTimer.project,
    placeholder: true,
    reason: reason || 'Unbekannt'
  };
  data.screenshots.push(screenshot);
  saveData();
}

function downloadScreenshots(clientId) {
  const client = getClientById(clientId);
  const shots = getClientScreenshots(clientId).filter(s => s.dataUrl);
  if (shots.length === 0) {
    toast('Keine Screenshots zum Download vorhanden');
    return;
  }
  // Download each screenshot
  shots.forEach((s, i) => {
    const link = document.createElement('a');
    link.href = s.dataUrl;
    link.download = `${client.name.replace(/[^a-zA-Z0-9äöüÄÖÜ]/g, '_')}_${s.date}_${s.time.replace(/:/g, '-')}.jpg`;
    link.click();
  });
  toast(`${shots.length} Screenshots heruntergeladen`);
}

// ===================== TIMER UPDATE LOOP =====================
setInterval(() => {
  if (data.activeTimer) {
    const el = document.getElementById('live-timer');
    if (el) el.textContent = formatTime(getElapsedSeconds());
  }
}, 1000);

// ===================== MODALS =====================
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ===================== CLIENT MANAGEMENT =====================
function openClientModal(clientId) {
  const client = clientId ? getClientById(clientId) : null;
  const title = client ? 'Kunde bearbeiten' : 'Neuer Kunde';
  
  const body = `
    <div class="form-group">
      <label>Kundenname / Praxisname</label>
      <input class="form-input" id="f-name" value="${client?.name || ''}" placeholder="z.B. Praxis Dr. Müller">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Vertragliche Stunden/Monat</label>
        <input class="form-input" id="f-hours" type="number" step="0.5" value="${client?.contractHours || ''}" placeholder="z.B. 20">
      </div>
      <div class="form-group">
        <label>Stundensatz (€)</label>
        <input class="form-input" id="f-rate" type="number" step="0.01" value="${client?.hourlyRate || ''}" placeholder="z.B. 85.00">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Zusatzstunden-Satz (€)</label>
        <input class="form-input" id="f-extra" type="number" step="0.01" value="${client?.extraRate || ''}" placeholder="z.B. 95.00">
      </div>
      <div class="form-group">
        <label>Abrechnungszeitraum</label>
        <select class="form-input" id="f-period">
          <option value="monthly" ${client?.billingPeriod === 'monthly' ? 'selected' : ''}>Monatlich</option>
          <option value="quarterly" ${client?.billingPeriod === 'quarterly' ? 'selected' : ''}>Quartalsweise</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Notizen</label>
      <input class="form-input" id="f-notes" value="${client?.notes || ''}" placeholder="z.B. Schwerpunkt, Besonderheiten...">
    </div>
  `;
  
  const footer = `
    ${client ? `<button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')">Löschen</button>` : ''}
    <div style="flex:1"></div>
    <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
    <button class="btn btn-primary" onclick="saveClient('${clientId || ''}')">Speichern</button>
  `;
  
  openModal(title, body, footer);
}

function saveClient(clientId) {
  const name = document.getElementById('f-name').value.trim();
  if (!name) return toast('Bitte Kundennamen eingeben');
  
  const obj = {
    id: clientId || uid(),
    name,
    contractHours: parseFloat(document.getElementById('f-hours').value) || 0,
    hourlyRate: parseFloat(document.getElementById('f-rate').value) || 0,
    extraRate: parseFloat(document.getElementById('f-extra').value) || 0,
    billingPeriod: document.getElementById('f-period').value,
    notes: document.getElementById('f-notes').value.trim()
  };
  
  if (clientId) {
    const idx = data.clients.findIndex(c => c.id === clientId);
    if (idx >= 0) data.clients[idx] = obj;
  } else {
    data.clients.push(obj);
  }
  
  saveData();
  closeModal();
  render();
  toast(clientId ? 'Kunde aktualisiert' : 'Kunde hinzugefügt');
}

function deleteClient(clientId) {
  if (!confirm('Kunde wirklich löschen? Alle zugehörigen Zeiteinträge bleiben erhalten.')) return;
  data.clients = data.clients.filter(c => c.id !== clientId);
  saveData();
  closeModal();
  render();
  toast('Kunde gelöscht');
}

// ===================== MANUAL TIME ENTRY =====================
function openManualEntry() {
  const clientOpts = data.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  
  const body = `
    <div class="form-group">
      <label>Kunde</label>
      <select class="form-input" id="m-client">${clientOpts}</select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Datum</label>
        <input class="form-input" id="m-date" type="date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group">
        <label>Projekt</label>
        <input class="form-input" id="m-project" placeholder="z.B. GOZ-Erstattungen" value="Allgemein">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Von</label>
        <input class="form-input" id="m-start" type="time" value="09:00">
      </div>
      <div class="form-group">
        <label>Bis</label>
        <input class="form-input" id="m-end" type="time" value="17:00">
      </div>
    </div>
    <div class="form-group">
      <label>Notizen</label>
      <input class="form-input" id="m-notes" placeholder="Optional...">
    </div>
  `;
  
  const footer = `
    <button class="btn btn-ghost" onclick="closeModal()">Abbrechen</button>
    <button class="btn btn-primary" onclick="saveManualEntry()">Eintrag speichern</button>
  `;
  
  openModal('Manueller Zeiteintrag', body, footer);
}

function saveManualEntry() {
  const startParts = document.getElementById('m-start').value.split(':').map(Number);
  const endParts = document.getElementById('m-end').value.split(':').map(Number);
  const startMin = startParts[0] * 60 + startParts[1];
  const endMin = endParts[0] * 60 + endParts[1];
  const duration = Math.round((endMin - startMin) / 60 * 100) / 100;
  
  if (duration <= 0) return toast('Endzeit muss nach Startzeit liegen');
  
  const entry = {
    id: uid(),
    clientId: document.getElementById('m-client').value,
    date: document.getElementById('m-date').value,
    startTime: document.getElementById('m-start').value,
    endTime: document.getElementById('m-end').value,
    duration,
    project: document.getElementById('m-project').value || 'Allgemein',
    notes: document.getElementById('m-notes').value
  };
  
  data.timeEntries.unshift(entry);
  saveData();
  closeModal();
  render();
  toast(`${formatDuration(duration)} erfasst`);
}

function deleteEntry(entryId) {
  data.timeEntries = data.timeEntries.filter(e => e.id !== entryId);
  saveData();
  render();
  toast('Eintrag gelöscht');
}

// ===================== RENDER PAGES =====================
function render() {
  const pages = { dashboard: renderDashboard, tracking: renderTracking, clients: renderClients, billing: renderBilling, screenshots: renderScreenshots };
  const titleMap = { dashboard: 'Dashboard', tracking: 'Zeiterfassung', clients: 'Kundenverwaltung', billing: 'Abrechnung', screenshots: 'Screenshots' };
  
  document.getElementById('page-title').textContent = titleMap[currentPage];
  document.getElementById('header-actions').innerHTML = '';
  pages[currentPage]();
}

// ---- Dashboard ----
function renderDashboard() {
  const now = new Date().toISOString().slice(0, 7);
  const monthEntries = data.timeEntries.filter(e => e.date.startsWith(now));
  const totalHours = monthEntries.reduce((s, e) => s + e.duration, 0);
  const todayEntries = data.timeEntries.filter(e => e.date === new Date().toISOString().slice(0, 10));
  const todayHours = todayEntries.reduce((s, e) => s + e.duration, 0);
  const totalRevenue = data.clients.reduce((sum, c) => {
    const hrs = getClientHours(c.id, now);
    const base = Math.min(hrs, c.contractHours) * c.hourlyRate;
    const extra = Math.max(0, hrs - c.contractHours) * c.extraRate;
    return sum + base + extra;
  }, 0);
  
  let html = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Heute</div>
        <div class="stat-value">${formatDuration(todayHours)}</div>
        <div class="stat-sub">${todayEntries.length} Einträge</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Dieser Monat</div>
        <div class="stat-value">${formatDuration(totalHours)}</div>
        <div class="stat-sub">${monthEntries.length} Einträge</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Aktive Kunden</div>
        <div class="stat-value">${data.clients.length}</div>
        <div class="stat-sub">Verträge</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Umsatz (Monat)</div>
        <div class="stat-value" style="color:var(--success)">€${totalRevenue.toLocaleString('de-DE', {minimumFractionDigits: 0})}</div>
        <div class="stat-sub">Geschätzt</div>
      </div>
    </div>
  `;
  
  // Active timer
  if (data.activeTimer) {
    html += `
      <div class="timer-card active" style="margin-bottom: 28px;">
        <div class="timer-label">⏱ AKTIVER TIMER</div>
        <div class="timer-client">${data.activeTimer.clientName}</div>
        <div class="timer-project">${data.activeTimer.project}</div>
        <div class="timer-display" id="live-timer">${formatTime(getElapsedSeconds())}</div>
        <div class="timer-controls">
          <button class="btn btn-ghost" onclick="captureScreenshot()" style="border-radius:50px">📷 Jetzt</button>
          <button class="btn btn-danger btn-clock" onclick="stopTimer()">⏹ Clock Out</button>
        </div>
        <div class="screenshot-indicator">
          <div class="screenshot-dot ${activeVideoTrack && activeVideoTrack.readyState === 'live' ? 'active' : ''}"></div>
          ${activeVideoTrack && activeVideoTrack.readyState === 'live' 
            ? `Bildschirmfreigabe aktiv — Screenshots alle 10 Min · <strong id="ss-counter">${getClientScreenshots(data.activeTimer.clientId).length}</strong> erfasst`
            : 'Keine Bildschirmfreigabe — Screenshots deaktiviert'}
        </div>
      </div>
    `;
  }
  
  // Client overview
  html += `<div class="card"><div class="card-header"><h2>Kunden-Übersicht — ${new Date().toLocaleString('de-DE', { month: 'long', year: 'numeric' })}</h2></div><div class="card-body"><div class="table-wrap"><table>
    <thead><tr><th>Kunde</th><th>Vertraglich</th><th>Geleistet</th><th>Auslastung</th><th>Status</th></tr></thead><tbody>`;
  
  data.clients.forEach(c => {
    const hrs = getClientHours(c.id, now);
    const pct = c.contractHours > 0 ? Math.round(hrs / c.contractHours * 100) : 0;
    const status = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success';
    const statusLabel = pct >= 100 ? 'Überschritten' : pct >= 80 ? 'Fast aufgebraucht' : 'Im Rahmen';
    const barColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--teal)';
    
    html += `<tr>
      <td><strong>${c.name}</strong></td>
      <td class="mono">${c.contractHours}h</td>
      <td class="mono">${hrs.toFixed(1)}h</td>
      <td style="min-width:140px">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="mono" style="font-size:12px;width:36px">${pct}%</span>
          <div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:${Math.min(pct,100)}%;background:${barColor}"></div></div>
        </div>
      </td>
      <td><span class="badge badge-${status}">${statusLabel}</span></td>
    </tr>`;
  });
  
  html += '</tbody></table></div></div></div>';
  
  document.getElementById('page-content').innerHTML = html;
}

// ---- Tracking ----
function renderTracking() {
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-ghost" onclick="openManualEntry()">+ Manueller Eintrag</button>
  `;
  
  const clientOpts = data.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  
  let html = `<div class="timer-section">`;
  
  if (data.activeTimer) {
    const streamActive = activeVideoTrack && activeVideoTrack.readyState === 'live';
    const shotCount = getClientScreenshots(data.activeTimer.clientId).length;
    html += `
      <div class="timer-card active">
        <div class="timer-label">AKTIVER TIMER</div>
        <div class="timer-client">${data.activeTimer.clientName}</div>
        <div class="timer-project">${data.activeTimer.project}</div>
        <div class="timer-display" id="live-timer">${formatTime(getElapsedSeconds())}</div>
        <div class="timer-controls">
          <button class="btn btn-ghost" onclick="captureScreenshot()" style="border-radius:50px" ${!streamActive ? 'disabled style="opacity:0.4;border-radius:50px"' : ''}>📷 Jetzt</button>
          <button class="btn btn-danger btn-clock" onclick="stopTimer()">⏹ Clock Out</button>
        </div>
        <div class="screenshot-indicator">
          <div class="screenshot-dot ${streamActive ? 'active' : ''}"></div>
          ${streamActive 
            ? `Bildschirmfreigabe aktiv — alle 10 Min · <strong id="ss-counter">${shotCount}</strong> erfasst`
            : `<span>Keine Bildschirmfreigabe</span> &nbsp;<button class="btn btn-sm btn-primary" onclick="reconnectScreenShare()" style="padding:4px 12px;font-size:11px">🔄 Freigabe erteilen</button>`}
        </div>
      </div>
      <div class="timer-card">
        <div class="timer-label">SESSION INFO</div>
        <div style="text-align:left;margin-top:16px;">
          <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px">Gestartet</span><br><strong>${data.activeTimer.startTimeFormatted} Uhr</strong></div>
          <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px">Kunde</span><br><strong>${data.activeTimer.clientName}</strong></div>
          <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px">Projekt</span><br><strong>${data.activeTimer.project}</strong></div>
          <div style="margin-bottom:12px"><span style="color:var(--text-muted);font-size:12px">Screenshots</span><br><strong>${streamActive ? '✅ Aktiv (alle 10 Min)' : '❌ Keine Freigabe'}</strong></div>
          <div><span style="color:var(--text-muted);font-size:12px">Nächster Screenshot</span><br><strong id="next-ss-timer">—</strong></div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="timer-card">
        <div class="timer-label">NEUEN TIMER STARTEN</div>
        <div class="timer-display" style="color:var(--text-muted)">00:00:00</div>
        <div style="display:flex;flex-direction:column;gap:10px;align-items:center;margin-top:16px;">
          <select class="form-input" id="timer-client" style="max-width:280px">${clientOpts}</select>
          <input class="form-input" id="timer-project" placeholder="Projekt (z.B. GOZ-Erstattungen)" style="max-width:280px" value="Allgemein">
          <button class="btn btn-success btn-clock" onclick="startTimer(document.getElementById('timer-client').value)">▶ Clock In</button>
        </div>
        <div class="screenshot-indicator">
          <div class="screenshot-dot"></div>
          Einmalige Bildschirmfreigabe beim Start — danach automatisch alle 10 Min
        </div>
      </div>
      <div class="timer-card">
        <div class="timer-label">SCHNELLSTART</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
          ${data.clients.map(c => `
            <button class="btn btn-ghost" style="justify-content:flex-start;width:100%" onclick="document.getElementById('timer-client').value='${c.id}';startTimer('${c.id}')">
              ▶ &nbsp;${c.name}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }
  html += `</div>`;
  
  // Recent entries
  html += `<div class="card"><div class="card-header"><h2>Letzte Einträge</h2></div><div class="card-body"><div class="table-wrap"><table>
    <thead><tr><th>Datum</th><th>Kunde</th><th>Projekt</th><th>Von</th><th>Bis</th><th>Dauer</th><th></th></tr></thead><tbody>`;
  
  data.timeEntries.slice(0, 20).forEach(e => {
    const client = getClientById(e.clientId);
    html += `<tr>
      <td class="mono">${e.date}</td>
      <td>${client?.name || '—'}</td>
      <td>${e.project}</td>
      <td class="mono">${e.startTime}</td>
      <td class="mono">${e.endTime}</td>
      <td class="mono"><strong>${formatDuration(e.duration)}</strong></td>
      <td><button class="btn btn-ghost btn-sm" onclick="deleteEntry('${e.id}')" title="Löschen" style="color:var(--danger);border:none;padding:4px 8px">✕</button></td>
    </tr>`;
  });
  
  if (data.timeEntries.length === 0) {
    html += '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">Noch keine Einträge vorhanden</td></tr>';
  }
  
  html += '</tbody></table></div></div></div>';
  document.getElementById('page-content').innerHTML = html;
}

// ---- Clients ----
function renderClients() {
  document.getElementById('header-actions').innerHTML = `
    <button class="btn btn-primary" onclick="openClientModal()">+ Neuer Kunde</button>
  `;
  
  const now = new Date().toISOString().slice(0, 7);
  
  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;">';
  
  data.clients.forEach(c => {
    const hrs = getClientHours(c.id, now);
    const pct = c.contractHours > 0 ? Math.round(hrs / c.contractHours * 100) : 0;
    const extraHrs = Math.max(0, hrs - c.contractHours);
    const barColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--teal)';
    const monthlyBase = c.contractHours * c.hourlyRate;
    const shots = getClientScreenshots(c.id).length;
    
    html += `
      <div class="card" style="cursor:pointer" onclick="openClientModal('${c.id}')">
        <div class="card-body">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:14px">
            <div>
              <div style="font-weight:700;font-size:15px">${c.name}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${c.notes || 'Keine Notizen'}</div>
            </div>
            <span class="badge badge-${pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success'}">${pct}%</span>
          </div>
          <div class="progress-bar" style="margin-bottom:14px"><div class="progress-fill" style="width:${Math.min(pct,100)}%;background:${barColor}"></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
            <div><span style="color:var(--text-muted)">Vertrag</span><br><strong class="mono">${c.contractHours}h × €${c.hourlyRate}</strong></div>
            <div><span style="color:var(--text-muted)">Geleistet</span><br><strong class="mono">${hrs.toFixed(1)}h</strong></div>
            <div><span style="color:var(--text-muted)">Monatsbasis</span><br><strong class="mono">€${monthlyBase.toLocaleString('de-DE')}</strong></div>
            <div><span style="color:var(--text-muted)">Zusatzstunden</span><br><strong class="mono" style="color:${extraHrs > 0 ? 'var(--danger)' : 'inherit'}">${extraHrs.toFixed(1)}h × €${c.extraRate}</strong></div>
          </div>
          <div style="margin-top:12px;font-size:11px;color:var(--text-muted)">📷 ${shots} Screenshots</div>
        </div>
      </div>
    `;
  });
  
  if (data.clients.length === 0) {
    html += '<div class="empty-state"><p>Noch keine Kunden angelegt</p></div>';
  }
  
  html += '</div>';
  document.getElementById('page-content').innerHTML = html;
}

// ---- Billing ----
function renderBilling() {
  const now = new Date().toISOString().slice(0, 7);
  const monthLabel = new Date().toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  
  let totalBase = 0, totalExtra = 0, totalAll = 0;
  
  let html = `
    <div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
      <div class="tabs">
        <button class="tab active">${monthLabel}</button>
      </div>
    </div>
  `;
  
  html += '<div style="display:flex;flex-direction:column;gap:16px">';
  
  data.clients.forEach(c => {
    const hrs = getClientHours(c.id, now);
    const contractUsed = Math.min(hrs, c.contractHours);
    const extraHrs = Math.max(0, hrs - c.contractHours);
    const baseCost = contractUsed * c.hourlyRate;
    const extraCost = extraHrs * c.extraRate;
    const total = baseCost + extraCost;
    const remainingHrs = Math.max(0, c.contractHours - hrs);
    
    totalBase += baseCost;
    totalExtra += extraCost;
    totalAll += total;
    
    html += `
      <div class="card">
        <div class="card-header">
          <h2>${c.name}</h2>
          <span class="mono" style="font-size:18px;font-weight:700;color:${extraHrs > 0 ? 'var(--danger)' : 'var(--teal)'}">€${total.toLocaleString('de-DE', {minimumFractionDigits: 2})}</span>
        </div>
        <div class="card-body">
          <div class="billing-breakdown">
            <div class="billing-line">
              <span>Vertragliche Stunden</span>
              <span class="mono">${contractUsed.toFixed(1)}h × €${c.hourlyRate.toFixed(2)} = €${baseCost.toFixed(2)}</span>
            </div>
            ${extraHrs > 0 ? `
              <div class="billing-line" style="color:var(--danger)">
                <span>⚠ Zusatzstunden</span>
                <span class="mono">${extraHrs.toFixed(1)}h × €${c.extraRate.toFixed(2)} = €${extraCost.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="billing-line">
              <span>Verbleibend</span>
              <span class="mono">${remainingHrs.toFixed(1)}h von ${c.contractHours}h</span>
            </div>
            <div class="billing-line total">
              <span>Gesamt</span>
              <span class="mono">€${total.toFixed(2)}</span>
            </div>
          </div>
          
          <div style="margin-top:16px">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">EINZELNACHWEISE</div>
            <table style="font-size:12px">
              <thead><tr><th>Datum</th><th>Projekt</th><th>Zeit</th><th>Dauer</th></tr></thead>
              <tbody>
                ${data.timeEntries.filter(e => e.clientId === c.id && e.date.startsWith(now)).map(e => `
                  <tr>
                    <td class="mono">${e.date}</td>
                    <td>${e.project}</td>
                    <td class="mono">${e.startTime}–${e.endTime}</td>
                    <td class="mono"><strong>${formatDuration(e.duration)}</strong></td>
                  </tr>
                `).join('') || '<tr><td colspan="4" style="color:var(--text-muted)">Keine Einträge</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  
  // Total summary
  html += `
    <div class="card" style="margin-top:20px;border-color:var(--teal)">
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;color:var(--text-muted);font-weight:600">GESAMTUMSATZ ${monthLabel.toUpperCase()}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Vertrag: €${totalBase.toFixed(2)} + Zusatz: €${totalExtra.toFixed(2)}</div>
        </div>
        <div class="mono" style="font-size:32px;font-weight:700;color:var(--teal)">€${totalAll.toLocaleString('de-DE', {minimumFractionDigits: 2})}</div>
      </div>
    </div>
  `;
  
  document.getElementById('page-content').innerHTML = html;
}

// ---- Screenshots ----
function renderScreenshots() {
  const clientFilter = data.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  
  let html = `
    <div style="display:flex;gap:12px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
      <select class="form-input" id="ss-filter" style="width:auto;min-width:200px" onchange="renderScreenshotGrid()">
        <option value="all">Alle Kunden</option>
        ${clientFilter}
      </select>
      <button class="btn btn-ghost" onclick="captureScreenshot()" ${!data.activeTimer ? 'disabled style="opacity:0.5"' : ''}>📷 Screenshot jetzt</button>
      <div style="flex:1"></div>
      <button class="btn btn-primary btn-sm" onclick="downloadFilteredScreenshots()">⬇ Screenshots exportieren</button>
    </div>
    <div id="ss-grid"></div>
  `;
  
  document.getElementById('page-content').innerHTML = html;
  renderScreenshotGrid();
}

function renderScreenshotGrid() {
  const filter = document.getElementById('ss-filter')?.value || 'all';
  const shots = filter === 'all' ? data.screenshots : data.screenshots.filter(s => s.clientId === filter);
  
  // Group by client
  const grouped = {};
  shots.forEach(s => {
    const client = getClientById(s.clientId);
    const key = client?.name || 'Unbekannt';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });
  
  let html = '';
  
  if (shots.length === 0) {
    html = `<div class="empty-state" style="padding:60px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <p style="margin-top:12px">Noch keine Screenshots vorhanden.<br>Screenshots werden automatisch alle 10 Minuten bei laufendem Timer erstellt.</p>
    </div>`;
  } else {
    Object.entries(grouped).forEach(([clientName, clientShots]) => {
      html += `<div style="margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:15px;font-weight:700">${clientName}</h3>
          <span style="font-size:12px;color:var(--text-muted)">${clientShots.length} Screenshots</span>
        </div>
        <div class="screenshot-grid">`;
      
      clientShots.sort((a, b) => b.timestamp - a.timestamp).forEach(s => {
        html += `
          <div class="screenshot-item">
            <div class="screenshot-preview">
              ${s.dataUrl ? `<img src="${s.dataUrl}" alt="Screenshot">` : '📷'}
            </div>
            <div class="screenshot-meta">
              <strong>${s.date}</strong> · ${s.time}<br>${s.project}
            </div>
          </div>
        `;
      });
      
      html += '</div></div>';
    });
  }
  
  document.getElementById('ss-grid').innerHTML = html;
}

function downloadFilteredScreenshots() {
  const filter = document.getElementById('ss-filter')?.value || 'all';
  if (filter === 'all') {
    data.clients.forEach(c => downloadScreenshots(c.id));
  } else {
    downloadScreenshots(filter);
  }
}

// ===================== INIT =====================
// On page reload: active timer may persist but stream is gone
if (data.activeTimer) {
  // Stream is lost on reload — timer keeps running but screenshots need re-auth
  // We don't auto-start screenshot capture without a stream
  console.log('Timer aktiv, aber Bildschirmfreigabe muss nach Seitenneuladen erneuert werden.');
}

render();

// Reconnect screen share for existing timer
async function reconnectScreenShare() {
  if (!data.activeTimer) return;
  try {
    activeStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor', cursor: 'always' },
      preferCurrentTab: false,
      selfBrowserSurface: 'exclude',
      monitorTypeSurfaces: 'include',
      surfaceSwitching: 'exclude'
    });
    activeVideoTrack = activeStream.getVideoTracks()[0];
    activeVideoTrack.addEventListener('ended', () => {
      if (data.activeTimer) {
        toast('Bildschirmfreigabe beendet — Timer gestoppt');
        stopTimer();
      }
    });
    startScreenshotCapture();
    render();
    toast('Bildschirmfreigabe wiederhergestellt');
  } catch(e) {
    toast('Bildschirmfreigabe abgelehnt — nur Zeiterfassung aktiv');
  }
}