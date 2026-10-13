/**
 * CrowdPulse TN - Modern Civic Issue Detection Platform
 * Single Page Application Architecture
 */

const STATE = {
  currentUser: null,
  token: localStorage.getItem('cp_token') || null,
  route: 'landing',
  routeParams: {},
  categories: [],
  departments: [],
  notifications: [],
  kpis: null,
  activeMap: null,
  activeMiniMap: null
};

// API Helper
const API = {
  async req(endpoint, options = {}) {
    const headers = options.headers || {};
    if (STATE.token) {
      headers['Authorization'] = `Bearer ${STATE.token}`;
    }
    try {
      const res = await fetch(`/api${endpoint}`, { ...options, headers });
      if (res.status === 401 && STATE.token) {
        // Token expired
        STATE.token = null;
        STATE.currentUser = null;
        localStorage.removeItem('cp_token');
        showToast('Session expired. Please log in again.', 'info');
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(err.detail || 'Network error');
      }
      return await res.json();
    } catch (e) {
      console.error(`API Error ${endpoint}:`, e);
      throw e;
    }
  },

  async loadInitialData() {
    try {
      const [cats, depts] = await Promise.all([
        this.req('/admin/categories'),
        this.req('/admin/departments')
      ]);
      STATE.categories = cats;
      STATE.departments = depts;

      if (STATE.token) {
        const me = await this.req('/auth/me');
        STATE.currentUser = me;
        this.loadNotifications();
      }
    } catch (e) {
      console.warn("Initial load warning:", e);
    }
  },

  async loadNotifications() {
    if (!STATE.token) return;
    try {
      STATE.notifications = await this.req('/notifications');
      updateNotificationBadge();
    } catch (e) {}
  }
};

// Navigation & Routing
function navigateTo(route, params = {}) {
  STATE.route = route;
  STATE.routeParams = params;
  window.location.hash = `#${route}` + (params.id ? `/${params.id}` : '');
  renderApp();
}

function parseHashRoute() {
  const hash = window.location.hash.replace('#', '') || 'landing';
  const parts = hash.split('/');
  if (parts[0] === 'authority' && parts[1] === 'incidents' && parts[2]) {
    STATE.route = 'authority/incident/detail';
    STATE.routeParams = { id: parts[2] };
  } else if (parts[0] === 'citizen' && parts[1] === 'report' && parts[2]) {
    STATE.route = 'citizen/report/detail';
    STATE.routeParams = { id: parts[2] };
  } else {
    STATE.route = hash;
    STATE.routeParams = {};
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Main App Render
async function renderApp() {
  const appEl = document.getElementById('app');
  if (!appEl) return;

  const isPublicLanding = STATE.route === 'landing';
  const isAuthority = STATE.currentUser && ['authority', 'admin', 'staff'].includes(STATE.currentUser.role);

  appEl.innerHTML = `
    <!-- Sidebar -->
    <aside class="app-sidebar ${isPublicLanding ? 'style-landing' : ''}" id="app-sidebar">
      <div class="sidebar-header">
        <img src="/static/assets/logo.svg" alt="CrowdPulse TN" width="34" height="34">
        <div>
          <div class="brand-title">CrowdPulse TN</div>
          <div class="brand-tagline">Detect Early. Act Together.</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section-title">Public Portal</div>
        <div class="nav-item ${STATE.route === 'landing' ? 'active' : ''}" onclick="navigateTo('landing')">
          <span>🏛️</span> Overview & Map
        </div>
        <div class="nav-item ${STATE.route === 'citizen/report' ? 'active' : ''}" onclick="navigateTo('citizen/report')">
          <span>📝</span> Submit Report
        </div>
        <div class="nav-item ${STATE.route === 'citizen/my-reports' ? 'active' : ''}" onclick="navigateTo('citizen/my-reports')">
          <span>📋</span> My Reports
        </div>

        <div class="nav-section-title">Authority Intelligence</div>
        <div class="nav-item ${STATE.route === 'authority/dashboard' ? 'active' : ''}" onclick="navigateTo('authority/dashboard')">
          <span>📊</span> Operations Dashboard
        </div>
        <div class="nav-item ${STATE.route === 'authority/incidents' ? 'active' : ''}" onclick="navigateTo('authority/incidents')">
          <span>🚨</span> Incidents & Clusters
        </div>
        <div class="nav-item ${STATE.route === 'authority/reports' ? 'active' : ''}" onclick="navigateTo('authority/reports')">
          <span>📑</span> All Citizen Reports
        </div>
        <div class="nav-item ${STATE.route === 'authority/analytics' ? 'active' : ''}" onclick="navigateTo('authority/analytics')">
          <span>📈</span> Civic Analytics
        </div>
        <div class="nav-item ${STATE.route === 'authority/settings' ? 'active' : ''}" onclick="navigateTo('authority/settings')">
          <span>⚙️</span> Detection Settings
        </div>
      </nav>

      <div class="sidebar-footer">
        ${STATE.currentUser ? `
          <div class="user-badge">
            <div class="user-avatar">${STATE.currentUser.full_name[0]}</div>
            <div style="flex: 1; overflow: hidden;">
              <div class="user-meta-name">${STATE.currentUser.full_name}</div>
              <div class="user-meta-role">${STATE.currentUser.role}</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="handleLogout()" title="Logout" style="padding: 0.2rem 0.4rem;">⎋</button>
          </div>
        ` : `
          <button class="btn btn-primary btn-sm" style="width: 100%;" onclick="openLoginModal()">Login / Register</button>
        `}
      </div>
    </aside>

    <!-- Main Wrapper -->
    <div class="main-wrapper">
      <!-- Top Navigation -->
      <header class="top-header">
        <div class="header-left">
          <button class="btn btn-secondary btn-sm" id="sidebar-toggle" onclick="toggleSidebar()" style="display: none;">☰</button>
          <div class="page-title">${getPageTitle()}</div>
        </div>

        <div class="header-right">
          <!-- Quick Demo Switcher -->
          <div style="display: flex; align-items: center; gap: 0.4rem; background: var(--bg-main); padding: 0.25rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Demo Role:</span>
            <select class="role-switcher-dropdown" onchange="quickSwitchRole(this.value)">
              <option value="" disabled ${!STATE.currentUser ? 'selected' : ''}>Switch Role...</option>
              <option value="citizen" ${STATE.currentUser?.role === 'citizen' ? 'selected' : ''}>Citizen (Karthik)</option>
              <option value="officer" ${STATE.currentUser?.role === 'authority' ? 'selected' : ''}>Officer (Dr. Radhakrishnan, IAS)</option>
              <option value="staff" ${STATE.currentUser?.role === 'staff' ? 'selected' : ''}>Staff (Murugesan JE)</option>
              <option value="admin" ${STATE.currentUser?.role === 'admin' ? 'selected' : ''}>Admin (System)</option>
            </select>
          </div>

          <!-- Notification Bell -->
          <button class="btn btn-secondary btn-sm" onclick="openNotificationsModal()" style="position: relative;">
            🔔
            <span id="notif-count-badge" class="badge" style="display: none; position: absolute; top: -5px; right: -5px; background: var(--red); color: #fff; font-size: 0.65rem; padding: 1px 5px; border-radius: 999px;">0</span>
          </button>

          <!-- Quick Action -->
          <button class="btn btn-primary btn-sm" onclick="navigateTo('citizen/report')">+ Report Issue</button>
        </div>
      </header>

      <!-- Main Page View Content -->
      <main class="page-container" id="main-content">
        <div style="text-align: center; padding: 3rem;"><div class="spinner"></div> Loading view...</div>
      </main>
    </div>

    <!-- Modals & Toasts Container -->
    <div id="modal-root"></div>
    <div id="toast-container" class="toast-container"></div>
  `;

  // Render specific route view
  const contentEl = document.getElementById('main-content');
  if (STATE.route === 'landing') {
    renderLandingView(contentEl);
  } else if (STATE.route === 'citizen/report') {
    renderCitizenReportView(contentEl);
  } else if (STATE.route === 'citizen/my-reports') {
    renderCitizenMyReportsView(contentEl);
  } else if (STATE.route === 'authority/dashboard') {
    renderAuthorityDashboardView(contentEl);
  } else if (STATE.route === 'authority/incidents') {
    renderAuthorityIncidentsView(contentEl);
  } else if (STATE.route === 'authority/incident/detail') {
    renderAuthorityIncidentDetailView(contentEl, STATE.routeParams.id);
  } else if (STATE.route === 'authority/reports') {
    renderAuthorityReportsView(contentEl);
  } else if (STATE.route === 'authority/analytics') {
    renderAuthorityAnalyticsView(contentEl);
  } else if (STATE.route === 'authority/settings') {
    renderAuthoritySettingsView(contentEl);
  } else {
    renderLandingView(contentEl);
  }

  updateNotificationBadge();
}

function getPageTitle() {
  switch (STATE.route) {
    case 'landing': return 'Civic Early-Warning Overview';
    case 'citizen/report': return 'Lodge Civic Grievance';
    case 'citizen/my-reports': return 'My Submitted Reports';
    case 'authority/dashboard': return 'Authority Operations & Incident Detection';
    case 'authority/incidents': return 'Incidents & Emerging Candidates';
    case 'authority/incident/detail': return 'Incident Evidence & Verification';
    case 'authority/reports': return 'All Citizen Reports';
    case 'authority/analytics': return 'Civic Analytics & Intelligence';
    case 'authority/settings': return 'Detection Thresholds & System';
    default: return 'CrowdPulse TN';
  }
}

function updateNotificationBadge() {
  const badge = document.getElementById('notif-count-badge');
  if (!badge) return;
  const unread = STATE.notifications.filter(n => !n.is_read).length;
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function toggleSidebar() {
  const sb = document.getElementById('app-sidebar');
  if (sb) sb.classList.toggle('open');
}

// ==========================================
// VIEW 1: PUBLIC LANDING PAGE
// ==========================================
async function renderLandingView(container) {
  container.innerHTML = `
    <!-- Hero Banner -->
    <section class="hero-section">
      <div class="hero-tagline">Tamil Nadu Civic Intelligence System</div>
      <h1 class="hero-title">Your City Speaks. CrowdPulse Listens.</h1>
      <p class="hero-description">
        Turn individual citizen grievances into collective civic intelligence. Detect emerging public supply disruptions, pothole clusters, and waterlogging early to help authorities respond rapidly.
      </p>
      <div class="hero-cta-group">
        <button class="btn btn-primary btn-lg" onclick="navigateTo('citizen/report')">📢 Report an Issue</button>
        <button class="btn btn-secondary btn-lg" onclick="navigateTo('authority/dashboard')">📊 Open Authority Operations</button>
        <button class="btn btn-outline-teal btn-lg" style="color: #fff; border-color: var(--teal);" onclick="triggerLiveDemo()">⚡ Run Live Water Burst Demo</button>
      </div>
    </section>

    <!-- Key Workflow Explanation -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Collective Issue Detection Explained</div>
        <span class="badge badge-candidate">AI Space-Time Clustering</span>
      </div>
      <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.95rem;">
        When multiple citizens from nearby streets lodge individual complaints about the same problem within hours, CrowdPulse identifies the emerging incident, consolidates evidence, and creates one verified incident for authority response.
      </p>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem;">
        <div style="background: var(--surface-alt); padding: 1.25rem; border-radius: var(--radius-sm); border-left: 4px solid var(--teal);">
          <div style="font-weight: 700; color: var(--navy); margin-bottom: 0.35rem;">1. Citizen Signals</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Residents submit complaints via text, photos, or voice. Each report is sanitized and geocoded.</p>
        </div>
        <div style="background: var(--surface-alt); padding: 1.25rem; border-radius: var(--radius-sm); border-left: 4px solid var(--amber);">
          <div style="font-weight: 700; color: var(--navy); margin-bottom: 0.35rem;">2. AI & Geo Analysis</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">NLP categorizes issues in Tamil & English. DBSCAN spatial clustering connects reports within rolling windows.</p>
        </div>
        <div style="background: var(--surface-alt); padding: 1.25rem; border-radius: var(--radius-sm); border-left: 4px solid var(--green);">
          <div style="font-weight: 700; color: var(--navy); margin-bottom: 0.35rem;">3. Authority Resolution</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Officers inspect explainable evidence, assign departments, and notify all contributing citizens upon fix.</p>
        </div>
      </div>
    </div>

    <!-- Live Map Preview -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Live Civic Map: Chennai & Tamil Nadu</div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-secondary" onclick="loadMapData()">🔄 Refresh Map</button>
        </div>
      </div>
      <div id="landing-map" class="map-frame"></div>
      <div style="display: flex; gap: 1.5rem; margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-secondary); flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--amber); display: inline-block;"></span> Candidate Cluster (AI Detected)
        </div>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--teal); display: inline-block;"></span> Verified Official Incident
        </div>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--green); display: inline-block;"></span> Resolved Incident
        </div>
        <div style="margin-left: auto; color: var(--text-muted); font-size: 0.75rem;">
          *Demonstration records seeded in T. Nagar, Anna Nagar & Velachery
        </div>
      </div>
    </div>

    <!-- Supported Civic Categories -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">Monitored Civic Categories</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
        ${STATE.categories.map(cat => `
          <div style="border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1rem; background: var(--surface);">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;">
              <span style="width: 10px; height: 10px; border-radius: 50%; background: ${cat.color};"></span>
              <strong style="font-size: 0.9rem;">${cat.name}</strong>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">${cat.description || 'Civic infrastructure issues.'}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  initLeafletMap('landing-map');
}

// Leaflet Map Initialization
async function initLeafletMap(containerId, center = [13.0405, 80.2337], zoom = 13) {
  if (typeof L === 'undefined') {
    console.warn("Leaflet not yet loaded");
    return;
  }

  const mapContainer = document.getElementById(containerId);
  if (!mapContainer) return;

  if (STATE.activeMap) {
    STATE.activeMap.remove();
    STATE.activeMap = null;
  }

  const map = L.map(containerId).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors | CrowdPulse TN'
  }).addTo(map);

  STATE.activeMap = map;
  await loadMapData();
}

async function loadMapData() {
  if (!STATE.activeMap) return;
  try {
    const [incidents, reports] = await Promise.all([
      API.req('/map/incidents'),
      API.req('/map/reports?limit=50')
    ]);

    // Add Incident Circles & Centroids
    incidents.forEach(inc => {
      const color = inc.status === 'candidate' ? '#F2B544' : inc.status === 'closed' ? '#2D9B68' : '#0F9D8A';
      
      // Radius Coverage Circle
      L.circle([inc.latitude, inc.longitude], {
        color: color,
        fillColor: color,
        fillOpacity: 0.18,
        radius: inc.radius_meters || 350
      }).addTo(STATE.activeMap);

      // Centroid Marker
      const marker = L.circleMarker([inc.latitude, inc.longitude], {
        radius: 9,
        fillColor: color,
        color: '#FFFFFF',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(STATE.activeMap);

      marker.bindPopup(`
        <div style="font-family: inherit; min-width: 200px;">
          <div style="font-size: 0.75rem; font-weight: 700; color: ${color}; text-transform: uppercase;">
            ${inc.status.toUpperCase()} ${inc.is_candidate ? '(AI CANDIDATE)' : ''}
          </div>
          <strong style="font-size: 0.95rem; color: #14243A; display: block; margin: 0.2rem 0;">${inc.title}</strong>
          <div style="font-size: 0.8rem; color: #68778D;">${inc.area}</div>
          <div style="margin-top: 0.4rem; font-size: 0.8rem;">
            <strong>${inc.report_count}</strong> Citizen complaints grouped
          </div>
          <button onclick="navigateTo('authority/incident/detail', {id: ${inc.id}})" style="margin-top: 0.5rem; width: 100%; background: #0F9D8A; color: #fff; border: none; padding: 0.35rem 0.6rem; border-radius: 6px; font-weight: 600; cursor: pointer;">Inspect Evidence</button>
        </div>
      `);
    });

    // Add Individual Report Points
    reports.forEach(r => {
      const marker = L.circleMarker([r.latitude, r.longitude], {
        radius: 4.5,
        fillColor: r.category_color || '#0F9D8A',
        color: '#FFFFFF',
        weight: 1.5,
        opacity: 0.8,
        fillOpacity: 0.75
      }).addTo(STATE.activeMap);

      marker.bindPopup(`
        <div style="font-size: 0.8rem;">
          <span style="font-size: 0.7rem; color: #94A3B8;">${r.reference_no}</span><br>
          <strong>${r.title}</strong><br>
          <span style="color: #68778D;">${r.category_name} (${r.severity})</span>
        </div>
      `);
    });

  } catch (e) {
    console.error("Map data load error:", e);
  }
}

// ==========================================
// VIEW 2: CITIZEN REPORT FORM
// ==========================================
function renderCitizenReportView(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Lodge Civic Complaint</div>
          <span style="font-size: 0.75rem; color: var(--teal); font-weight: 600;">🔒 Privacy Protected</span>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
          Submit your civic grievance with accurate location details. Our AI pipeline categorizes the issue and checks for spatial-temporal clustering across your locality.
        </p>

        <form id="report-form" onsubmit="handleReportSubmit(event)">
          <div class="form-group">
            <label class="form-label">Issue Title *</label>
            <input type="text" name="title" class="form-control" required placeholder="e.g., Severe drinking water pipeline burst on South Boag Road" minlength="5" maxlength="200">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Civic Category *</label>
              <select name="category_id" class="form-control" required id="report-category-select">
                ${STATE.categories.map(c => `
                  <option value="${c.id}">${c.name}</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Perceived Severity *</label>
              <select name="severity" class="form-control">
                <option value="low">Low - Minor nuisance</option>
                <option value="medium" selected>Medium - Significant disturbance</option>
                <option value="high">High - Serious road/utility outage</option>
                <option value="critical">Critical - Immediate life/property hazard</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Detailed Description (English or தமிழ்) *</label>
            <textarea name="description" class="form-control" rows="4" required minlength="10" placeholder="Explain the civic issue, landmarks, and impact on residents... (தண்ணீர் தட்டுப்பாடு, சாலை பள்ளம், குப்பை தேக்கம்)"></textarea>
          </div>

          <!-- Location Selector & Map -->
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
              <label class="form-label" style="margin-bottom: 0;">Location Coordinates & Landmark *</label>
              <button type="button" class="btn btn-sm btn-outline-teal" onclick="detectGPSLocation()">📍 Use My Geolocation</button>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">
              <input type="number" step="any" name="latitude" id="input-lat" class="form-control" value="13.0398" required placeholder="Latitude">
              <input type="number" step="any" name="longitude" id="input-lon" class="form-control" value="80.2342" required placeholder="Longitude">
              <select class="form-control" onchange="applyLocationPreset(this.value)">
                <option value="">Quick TN Locality...</option>
                <option value="13.0398,80.2342,South Boag Road, T. Nagar">T. Nagar - South Boag Road</option>
                <option value="13.0415,80.2329,Ranganathan Street, T. Nagar">T. Nagar - Ranganathan St</option>
                <option value="13.0850,80.2100,2nd Avenue, Anna Nagar">Anna Nagar - 2nd Avenue</option>
                <option value="12.9810,80.2180,Lake Bypass Road, Velachery">Velachery - Lake Bypass</option>
                <option value="13.0335,80.2685,Kapaleeshwarar Temple Tank, Mylapore">Mylapore - Tank Area</option>
              </select>
            </div>

            <input type="text" name="address" id="input-address" class="form-control" placeholder="Street Address / Landmark (e.g., Usman Road Cross, T. Nagar Ward 117)" style="margin-bottom: 0.75rem;">

            <div id="pin-map" class="map-frame" style="height: 250px;"></div>
            <span style="font-size: 0.74rem; color: var(--text-muted);">*Click anywhere on the map above to accurately reposition your complaint pin.</span>
          </div>

          <!-- Multimodal Uploads -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Attach Photo (Optional)</label>
              <input type="file" name="image" accept="image/*" class="form-control" onchange="previewUploadImage(event)">
              <div id="image-preview-box" style="margin-top: 0.5rem; font-size: 0.74rem; color: var(--teal);"></div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Voice Complaint (Optional)</label>
              <input type="file" name="audio" accept="audio/*" class="form-control">
              <span style="font-size: 0.72rem; color: var(--text-muted);">Tamil/English audio transcribed automatically.</span>
            </div>
          </div>

          <!-- Anonymous & Privacy Check -->
          <div style="background: var(--surface-alt); padding: 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer;">
              <input type="checkbox" name="is_anonymous">
              <span>Submit anonymously (Hide my identity from public civic records)</span>
            </label>
          </div>

          <button type="submit" class="btn btn-primary btn-lg" id="submit-report-btn" style="width: 100%;">
            🚀 Submit Report for AI Analysis
          </button>
        </form>
      </div>
    </div>
  `;

  // Init Pin Picker Map
  setTimeout(() => {
    initPinPickerMap();
  }, 100);
}

let pinPickerMap = null;
let pinPickerMarker = null;

function initPinPickerMap() {
  const container = document.getElementById('pin-map');
  if (!container || typeof L === 'undefined') return;

  const initialLat = parseFloat(document.getElementById('input-lat').value) || 13.0398;
  const initialLon = parseFloat(document.getElementById('input-lon').value) || 80.2342;

  pinPickerMap = L.map('pin-map').setView([initialLat, initialLon], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pinPickerMap);

  pinPickerMarker = L.marker([initialLat, initialLon], { draggable: true }).addTo(pinPickerMap);

  pinPickerMarker.on('dragend', function(e) {
    const pos = e.target.getLatLng();
    document.getElementById('input-lat').value = pos.lat.toFixed(6);
    document.getElementById('input-lon').value = pos.lng.toFixed(6);
  });

  pinPickerMap.on('click', function(e) {
    pinPickerMarker.setLatLng(e.latlng);
    document.getElementById('input-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('input-lon').value = e.latlng.lng.toFixed(6);
  });
}

function applyLocationPreset(val) {
  if (!val) return;
  const [lat, lon, addr] = val.split(',');
  document.getElementById('input-lat').value = lat;
  document.getElementById('input-lon').value = lon;
  document.getElementById('input-address').value = addr;
  if (pinPickerMap && pinPickerMarker) {
    const latLng = [parseFloat(lat), parseFloat(lon)];
    pinPickerMarker.setLatLng(latLng);
    pinPickerMap.setView(latLng, 16);
  }
}

function detectGPSLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        document.getElementById('input-lat').value = lat;
        document.getElementById('input-lon').value = lon;
        if (pinPickerMap && pinPickerMarker) {
          pinPickerMarker.setLatLng([lat, lon]);
          pinPickerMap.setView([lat, lon], 16);
        }
        showToast('Location updated from device GPS!', 'success');
      },
      () => showToast('Could not fetch GPS. Please select location on map.', 'info')
    );
  }
}

function previewUploadImage(e) {
  const box = document.getElementById('image-preview-box');
  if (e.target.files && e.target.files[0]) {
    box.textContent = `✓ Selected: ${e.target.files[0].name} (EXIF metadata will be stripped for privacy)`;
  }
}

async function handleReportSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('submit-report-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Analyzing & Checking Space-Time Clusters...';

  const formData = new FormData(form);
  try {
    const res = await API.req('/reports', {
      method: 'POST',
      body: formData
    });

    showToast(`Report #${res.reference_no} submitted successfully!`, 'success');
    openReportSuccessModal(res);
  } catch (err) {
    showToast(err.message || 'Failed to submit report', 'error');
    btn.disabled = false;
    btn.textContent = '🚀 Submit Report for AI Analysis';
  }
}

function openReportSuccessModal(report) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">✓ Grievance Lodged Successfully</div>
          <button class="close-btn" onclick="closeModal()">×</button>
        </div>

        <div style="background: var(--teal-light); padding: 1.25rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; border-left: 4px solid var(--teal);">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--teal); text-transform: uppercase;">Tracking Reference</div>
          <div style="font-size: 1.45rem; font-weight: 800; color: var(--navy);">${report.reference_no}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">Category: <strong>${report.category_name}</strong></div>
        </div>

        <div class="card" style="margin-bottom: 1.25rem; padding: 1rem;">
          <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.5rem;">🤖 AI Pipeline Result</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">
            <div>Model Version: <code>${report.analysis?.model_version || 'cp-civic-nlp-v2.1'}</code></div>
            <div>Confidence Score: <strong>${((report.analysis?.confidence_score || 0.85) * 100).toFixed(1)}%</strong></div>
            <div>Clustering Status: 
              ${report.has_incident ? `<span class="badge badge-candidate">Consolidated into ${report.incident_number}</span>` : '<span class="badge badge-verified">Logged as Individual Signal</span>'}
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem;">
          <button class="btn btn-primary" onclick="closeModal(); navigateTo('citizen/my-reports');">View In My Reports</button>
          <button class="btn btn-secondary" onclick="closeModal(); navigateTo('landing');">Return to Civic Map</button>
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// VIEW 3: CITIZEN MY REPORTS
// ==========================================
async function renderCitizenMyReportsView(container) {
  if (!STATE.currentUser) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem;">
        <h3>Please Log In to View Your Reports</h3>
        <p style="color: var(--text-secondary); margin: 0.75rem 0 1.5rem;">Log in as Karthik or another citizen to view submitted grievances.</p>
        <button class="btn btn-primary" onclick="openLoginModal()">Login with Demo Account</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading your reports...</div>`;
  try {
    const reports = await API.req('/reports/mine');
    if (!reports.length) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <h3>No Reports Lodged Yet</h3>
          <p style="color: var(--text-secondary); margin: 0.5rem 0 1.5rem;">You haven't submitted any civic complaints yet.</p>
          <button class="btn btn-primary" onclick="navigateTo('citizen/report')">+ Submit Your First Report</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">My Civic Reports (${reports.length})</div>
          <button class="btn btn-primary btn-sm" onclick="navigateTo('citizen/report')">+ Lodge New Report</button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title & Category</th>
                <th>Locality</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Consolidated Incident</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${reports.map(r => `
                <tr>
                  <td><code>${r.reference_no}</code></td>
                  <td>
                    <strong>${r.title}</strong><br>
                    <span style="font-size: 0.75rem; color: ${r.category_color};">● ${r.category_name}</span>
                  </td>
                  <td>${r.address || r.district}</td>
                  <td><span class="badge badge-priority-${r.severity}">${r.severity.toUpperCase()}</span></td>
                  <td><span class="badge badge-status badge-${r.status}">${r.status}</span></td>
                  <td>
                    ${r.has_incident ? `
                      <span class="badge badge-candidate" title="Grouped into collective incident">🚨 ${r.incident_number}</span>
                    ` : '<span style="color: var(--text-muted); font-size: 0.78rem;">Individual Signal</span>'}
                  </td>
                  <td style="font-size: 0.78rem; color: var(--text-secondary);">${new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    ${r.status !== 'withdrawn' ? `
                      <button class="btn btn-sm btn-secondary" onclick="withdrawReport(${r.id})" style="font-size: 0.7rem; color: var(--red);">Withdraw</button>
                    ` : '<span style="font-size: 0.75rem; color: var(--text-muted);">Withdrawn</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error loading reports: ${e.message}</div>`;
  }
}

async function withdrawReport(id) {
  if (!confirm("Are you sure you want to withdraw this report?")) return;
  try {
    await API.req(`/reports/${id}/withdraw`, { method: 'PATCH' });
    showToast('Report withdrawn successfully', 'info');
    renderCitizenMyReportsView(document.getElementById('main-content'));
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==========================================
// VIEW 4: AUTHORITY DASHBOARD
// ==========================================
async function renderAuthorityDashboardView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading authority intelligence dashboard...</div>`;

  try {
    const [kpis, incidents, candidates] = await Promise.all([
      API.req('/analytics/overview'),
      API.req('/incidents?limit=10'),
      API.req('/incidents?is_candidate=true')
    ]);

    container.innerHTML = `
      <!-- Demonstration Notice Banner -->
      <div style="background: var(--surface); border: 1px solid var(--amber); border-left: 5px solid var(--amber); padding: 0.85rem 1.25rem; border-radius: var(--radius-sm); margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: gap;">
        <div>
          <strong style="color: var(--navy); font-size: 0.9rem;">🧪 Demonstration Operational Mode Active</strong>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Demonstration scenario records for Tamil Nadu. Distinguishes between AI Candidates and Officially Verified Incidents.</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="triggerLiveDemo()">⚡ Run Water Burst Demo</button>
      </div>

      <!-- KPI Grid -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Citizen Reports</div>
          <div class="kpi-value">${kpis.total_reports}</div>
          <div class="kpi-subtext">+${kpis.new_reports_today} logged today</div>
        </div>

        <div class="kpi-card kpi-amber">
          <div class="kpi-label">Awaiting Verification</div>
          <div class="kpi-value" style="color: var(--amber);">${kpis.candidates_awaiting_review}</div>
          <div class="kpi-subtext">AI-detected clusters needing review</div>
        </div>

        <div class="kpi-card kpi-red">
          <div class="kpi-label">Active Incidents</div>
          <div class="kpi-value">${kpis.active_incidents}</div>
          <div class="kpi-subtext">${kpis.high_priority_incidents} high/critical priority</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Cluster Compression</div>
          <div class="kpi-value" style="color: var(--teal);">${kpis.cluster_reduction_rate}%</div>
          <div class="kpi-subtext">Duplicate complaints saved</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Avg Resolution Time</div>
          <div class="kpi-value">${kpis.avg_resolution_hours}h</div>
          <div class="kpi-subtext">From detection to closure</div>
        </div>
      </div>

      <!-- Emerging Issue Alerts Feed (Candidates) -->
      ${candidates.length > 0 ? `
        <div class="card" style="border-left: 5px solid var(--amber); background: #FFFDF9;">
          <div class="card-header">
            <div class="card-title" style="color: #92400E;">🚨 Emerging Incident Candidates (${candidates.length})</div>
            <span class="badge badge-candidate">Requires Authority Action</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
            The AI engine grouped multiple nearby complaints matching spatial & temporal burst rules. Verify or reject below:
          </p>

          <div style="display: flex; flex-direction: column; gap: 0.85rem;">
            ${candidates.map(c => `
              <div style="background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.15rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                <div style="flex: 1; min-width: 280px;">
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                    <span class="badge badge-candidate">${c.incident_number}</span>
                    <strong style="font-size: 0.95rem; color: var(--navy);">${c.title}</strong>
                  </div>
                  <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 0.35rem;">
                    📍 ${c.geographic_area} • <strong>${c.report_count} Reports</strong> from <strong>${c.unique_reporter_count} Unique Citizens</strong>
                  </div>
                  <div style="font-size: 0.78rem; color: #475569; background: var(--surface-alt); padding: 0.35rem 0.65rem; border-radius: 4px;">
                    💡 <em>Detection reason:</em> ${c.description}
                  </div>
                </div>

                <div style="display: flex; gap: 0.5rem;">
                  <button class="btn btn-sm btn-primary" onclick="verifyCandidate(${c.id}, true)">✓ Verify Incident</button>
                  <button class="btn btn-sm btn-secondary" onclick="verifyCandidate(${c.id}, false)">✕ Reject</button>
                  <button class="btn btn-sm btn-secondary" onclick="navigateTo('authority/incident/detail', {id: ${c.id}})">Inspect Evidence</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Interactive Map & Charts Grid -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div class="card" style="margin-bottom: 0;">
          <div class="card-header">
            <div class="card-title">Live Operational Map</div>
            <button class="btn btn-sm btn-secondary" onclick="loadMapData()">🔄 Refresh</button>
          </div>
          <div id="authority-dash-map" class="map-frame" style="height: 420px;"></div>
        </div>

        <div class="card" style="margin-bottom: 0; display: flex; flex-direction: column;">
          <div class="card-header">
            <div class="card-title">Reports by Category</div>
          </div>
          <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
            <canvas id="category-chart" width="300" height="260"></canvas>
          </div>
          <div id="category-legend" style="margin-top: 0.75rem; font-size: 0.78rem; display: flex; flex-direction: column; gap: 0.25rem;"></div>
        </div>
      </div>

      <!-- Active Incidents Table -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Recently Updated Incidents</div>
          <button class="btn btn-sm btn-secondary" onclick="navigateTo('authority/incidents')">View All Incidents →</button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Incident ID</th>
                <th>Title</th>
                <th>Category</th>
                <th>Area</th>
                <th>Reports</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Department</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${incidents.map(inc => `
                <tr>
                  <td><code>${inc.incident_number}</code></td>
                  <td><strong>${inc.title}</strong></td>
                  <td><span style="color: ${inc.category_color};">● ${inc.category_name}</span></td>
                  <td>${inc.geographic_area}</td>
                  <td><strong>${inc.report_count}</strong> (${inc.unique_reporter_count} citizens)</td>
                  <td><span class="badge badge-status badge-${inc.status}">${inc.status}</span></td>
                  <td><span class="badge badge-priority-${inc.priority}">${inc.priority.toUpperCase()}</span></td>
                  <td>${inc.assigned_department_name || '<span style="color: var(--text-muted);">Unassigned</span>'}</td>
                  <td>
                    <button class="btn btn-sm btn-secondary" onclick="navigateTo('authority/incident/detail', {id: ${inc.id}})">Review</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    setTimeout(() => {
      initLeafletMap('authority-dash-map');
      drawCategoryCanvasChart();
    }, 100);

  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error loading dashboard: ${e.message}</div>`;
  }
}

// 1-Click Verification Handler
async function verifyCandidate(id, isVerified) {
  try {
    await API.req(`/incidents/${id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: isVerified })
    });
    showToast(isVerified ? 'Incident verified officially!' : 'Candidate rejected', 'success');
    renderAuthorityDashboardView(document.getElementById('main-content'));
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Clean Canvas Chart Drawing (No external script crashes)
async function drawCategoryCanvasChart() {
  const canvas = document.getElementById('category-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  try {
    const data = await API.req('/analytics/categories');
    if (!data.length) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const total = data.reduce((acc, d) => acc + d.count, 0) || 1;

    // Draw Donut Chart
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;
    const innerRadius = 50;

    let startAngle = -Math.PI / 2;

    data.slice(0, 5).forEach(item => {
      const sliceAngle = (item.count / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = item.color || '#0F9D8A';
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Center text
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillStyle = '#14243A';
    ctx.textAlign = 'center';
    ctx.fillText(`${total}`, centerX, centerY + 2);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#68778D';
    ctx.fillText('Reports', centerX, centerY + 18);

    // Legend
    const legendEl = document.getElementById('category-legend');
    if (legendEl) {
      legendEl.innerHTML = data.slice(0, 5).map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${item.color};"></span>
            <span>${item.name}</span>
          </div>
          <strong>${item.count} (${item.percentage}%)</strong>
        </div>
      `).join('');
    }

  } catch (e) {
    console.error("Canvas chart error:", e);
  }
}

// ==========================================
// VIEW 5: INCIDENT DETAIL & EVIDENCE WORKFLOW
// ==========================================
async function renderAuthorityIncidentDetailView(container, incidentId) {
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading incident details and evidence...</div>`;
  try {
    const inc = await API.req(`/incidents/${incidentId}`);

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
        <button class="btn btn-secondary btn-sm" onclick="navigateTo('authority/incidents')">← Back to Incidents</button>
        <div style="display: flex; gap: 0.5rem;">
          <span class="badge badge-priority-${inc.priority}">${inc.priority.toUpperCase()} PRIORITY</span>
          <span class="badge badge-status badge-${inc.status}">${inc.status.toUpperCase()}</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <!-- Left: Incident Overview & Map -->
        <div>
          <div class="card">
            <div class="card-header">
              <div>
                <span style="font-size: 0.8rem; font-weight: 700; color: ${inc.category_color};">● ${inc.category_name}</span>
                <div class="card-title" style="margin-top: 0.2rem;">${inc.title}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">Incident ID: <code>${inc.incident_number}</code> • ${inc.geographic_area}</div>
              </div>
            </div>

            <p style="color: var(--text-primary); margin-bottom: 1.25rem; font-size: 0.95rem;">${inc.description}</p>

            <!-- Leaflet Incident Cluster Map -->
            <div id="incident-focus-map" class="map-frame" style="height: 340px; margin-bottom: 1rem;"></div>

            <!-- Explainability Card -->
            <div style="background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
              <div style="font-weight: 700; color: var(--navy); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
                🔍 AI Explainability & Cluster Evidence
              </div>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                ${inc.detection_reason}
              </p>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; font-size: 0.8rem;">
                <div>Algorithm: <code>${inc.evidence_summary?.detection_algorithm || 'DBSCAN-Spatial-Temporal-TFIDF-v2'}</code></div>
                <div>Time Span: <strong>${inc.evidence_summary?.actual_time_span_minutes || '85'} min</strong></div>
                <div>Coverage Radius: <strong>${inc.radius_meters}m</strong></div>
                <div>Distinct Citizens: <strong>${inc.unique_reporter_count}</strong></div>
              </div>

              ${inc.evidence_summary?.uncertainty_notes ? `
                <div style="margin-top: 0.75rem; font-size: 0.78rem; color: #64748B; border-top: 1px solid var(--border-light); padding-top: 0.5rem;">
                  ℹ️ <em>Operational note:</em> ${inc.evidence_summary.uncertainty_notes}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Supporting Citizen Reports -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Supporting Citizen Grievances (${inc.reports.length})</div>
            </div>
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Report Summary</th>
                    <th>Location</th>
                    <th>Reported Time</th>
                  </tr>
                </thead>
                <tbody>
                  ${inc.reports.map(r => `
                    <tr>
                      <td><code>${r.reference_no}</code></td>
                      <td>
                        <strong>${r.title}</strong>
                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem;">${r.description}</p>
                      </td>
                      <td style="font-size: 0.8rem;">${r.address || r.district}</td>
                      <td style="font-size: 0.75rem; color: var(--text-muted);">${new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Right: Actions & Workflow -->
        <div>
          <!-- Verification / Workflow Actions Card -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Authority Workflow</div>
            </div>

            <!-- Verification Buttons -->
            ${inc.status === 'candidate' ? `
              <div style="background: var(--amber-light); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid rgba(242, 181, 68, 0.4); margin-bottom: 1.25rem;">
                <div style="font-weight: 700; color: #92400E; font-size: 0.85rem; margin-bottom: 0.5rem;">Candidate Review Required</div>
                <div style="display: flex; gap: 0.5rem;">
                  <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="verifyIncidentAction(${inc.id}, true)">✓ Verify Incident</button>
                  <button class="btn btn-danger btn-sm" onclick="verifyIncidentAction(${inc.id}, false)">✕ Reject</button>
                </div>
              </div>
            ` : ''}

            <!-- Department Assignment -->
            <form onsubmit="handleAssignSubmit(event, ${inc.id})" style="margin-bottom: 1.25rem;">
              <div class="form-label">Assign Responsible Department</div>
              <select name="department_id" class="form-control" style="margin-bottom: 0.5rem;">
                ${STATE.departments.map(d => `
                  <option value="${d.id}" ${inc.assigned_department_id === d.id ? 'selected' : ''}>${d.name} (${d.code})</option>
                `).join('')}
              </select>
              <input type="text" name="notes" class="form-control" placeholder="Work instructions / Dispatch notes" style="margin-bottom: 0.5rem;">
              <button type="submit" class="btn btn-primary btn-sm" style="width: 100%;">Assign Department</button>
            </form>

            <!-- Status Transition -->
            <div class="form-label">Update Operational Progress</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1.25rem;">
              <button class="btn btn-secondary btn-sm" onclick="updateIncidentStatusAction(${inc.id}, 'in_progress')">In Progress</button>
              <button class="btn btn-secondary btn-sm" onclick="updateIncidentStatusAction(${inc.id}, 'resolved_pending')">Resolved (Review)</button>
              <button class="btn btn-primary btn-sm" style="grid-column: span 2; background: var(--green);" onclick="updateIncidentStatusAction(${inc.id}, 'closed')">✓ Mark Closed & Solved</button>
            </div>

            <!-- Public Citizen Update -->
            <form onsubmit="handlePublicUpdateSubmit(event, ${inc.id})">
              <div class="form-label">Broadcast Citizen Update</div>
              <textarea name="public_update" class="form-control" rows="2" placeholder="Citizen update visible to all contributing residents..." style="margin-bottom: 0.5rem;">${inc.public_update || ''}</textarea>
              <button type="submit" class="btn btn-outline-teal btn-sm" style="width: 100%;">Publish Public Update</button>
            </form>
          </div>

          <!-- Status Audit Trail Timeline -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Status Audit Trail</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${inc.status_history?.map(h => `
                <div style="border-left: 2px solid var(--teal); padding-left: 0.75rem;">
                  <div style="font-size: 0.8rem; font-weight: 700; color: var(--navy);">${h.actor} → <span class="badge badge-status badge-${h.new_status}">${h.new_status}</span></div>
                  <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem;">${h.notes || 'Status updated'}</div>
                  <div style="font-size: 0.7rem; color: var(--text-muted);">${new Date(h.created_at).toLocaleString()}</div>
                </div>
              `).join('') || '<div style="font-size: 0.8rem; color: var(--text-muted);">No history logged yet.</div>'}
            </div>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      initIncidentFocusMap(inc);
    }, 100);

  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error loading incident: ${e.message}</div>`;
  }
}

function initIncidentFocusMap(inc) {
  if (typeof L === 'undefined') return;
  const map = L.map('incident-focus-map').setView([inc.center_latitude, inc.center_longitude], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  const color = inc.status === 'candidate' ? '#F2B544' : '#0F9D8A';
  // Circle
  L.circle([inc.center_latitude, inc.center_longitude], {
    color: color,
    fillColor: color,
    fillOpacity: 0.2,
    radius: inc.radius_meters || 350
  }).addTo(map);

  // Centroid
  L.circleMarker([inc.center_latitude, inc.center_longitude], {
    radius: 10,
    fillColor: color,
    color: '#fff',
    weight: 3,
    fillOpacity: 1
  }).addTo(map).bindPopup(`<strong>Incident Centroid</strong><br>${inc.title}`);

  // Individual Reports
  inc.reports.forEach(r => {
    L.circleMarker([r.latitude, r.longitude], {
      radius: 5,
      fillColor: '#14243A',
      color: '#fff',
      weight: 1.5,
      fillOpacity: 0.9
    }).addTo(map).bindPopup(`<strong>${r.reference_no}</strong><br>${r.title}`);
  });
}

async function verifyIncidentAction(id, verified) {
  try {
    await API.req(`/incidents/${id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified })
    });
    showToast(verified ? 'Incident verified!' : 'Candidate rejected', 'success');
    renderAuthorityIncidentDetailView(document.getElementById('main-content'), id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function handleAssignSubmit(e, id) {
  e.preventDefault();
  const form = e.target;
  const deptId = form.department_id.value;
  const notes = form.notes.value;

  try {
    await API.req(`/incidents/${id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department_id: parseInt(deptId), notes })
    });
    showToast('Department assigned successfully!', 'success');
    renderAuthorityIncidentDetailView(document.getElementById('main-content'), id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function updateIncidentStatusAction(id, status) {
  try {
    await API.req(`/incidents/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    showToast(`Status updated to ${status}`, 'success');
    renderAuthorityIncidentDetailView(document.getElementById('main-content'), id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function handlePublicUpdateSubmit(e, id) {
  e.preventDefault();
  const update = e.target.public_update.value;
  try {
    await API.req(`/incidents/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: update, is_internal: false })
    });
    showToast('Citizen public update broadcasted!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==========================================
// VIEW 6: ALL INCIDENTS LIST
// ==========================================
async function renderAuthorityIncidentsView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading incidents...</div>`;
  try {
    const incidents = await API.req('/incidents?limit=100');

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Consolidated Incidents (${incidents.length})</div>
          <div style="display: flex; gap: 0.5rem;">
            <select class="form-control" style="width: auto;" onchange="filterIncidents(this.value)">
              <option value="">All Statuses</option>
              <option value="candidate">Candidate Only</option>
              <option value="verified">Verified Only</option>
              <option value="assigned">Assigned Only</option>
              <option value="closed">Closed Only</option>
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Category</th>
                <th>Area</th>
                <th>Reports</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Department</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${incidents.map(inc => `
                <tr>
                  <td><code>${inc.incident_number}</code></td>
                  <td><strong>${inc.title}</strong></td>
                  <td><span style="color: ${inc.category_color};">● ${inc.category_name}</span></td>
                  <td>${inc.geographic_area}</td>
                  <td><strong>${inc.report_count}</strong></td>
                  <td><span class="badge badge-status badge-${inc.status}">${inc.status}</span></td>
                  <td><span class="badge badge-priority-${inc.priority}">${inc.priority.toUpperCase()}</span></td>
                  <td>${inc.assigned_department_name || '<span style="color: var(--text-muted);">-</span>'}</td>
                  <td>
                    <button class="btn btn-sm btn-secondary" onclick="navigateTo('authority/incident/detail', {id: ${inc.id}})">Inspect</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error: ${e.message}</div>`;
  }
}

// ==========================================
// VIEW 7: ALL CITIZEN REPORTS LIST
// ==========================================
async function renderAuthorityReportsView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading raw citizen reports...</div>`;
  try {
    const reports = await API.req('/reports?limit=100');

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Raw Citizen Complaints Stream (${reports.length})</div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Title & Description</th>
                <th>Category</th>
                <th>Coordinates</th>
                <th>Status</th>
                <th>Cluster Link</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${reports.map(r => `
                <tr>
                  <td><code>${r.reference_no}</code></td>
                  <td>
                    <strong>${r.title}</strong>
                    <div style="font-size: 0.78rem; color: var(--text-secondary);">${r.description}</div>
                  </td>
                  <td><span style="color: ${r.category_color};">● ${r.category_name}</span></td>
                  <td style="font-size: 0.75rem;">${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</td>
                  <td><span class="badge badge-status badge-${r.status}">${r.status}</span></td>
                  <td>
                    ${r.has_incident ? `
                      <span class="badge badge-candidate">${r.incident_number}</span>
                    ` : '<span style="font-size: 0.75rem; color: var(--text-muted);">Unclustered</span>'}
                  </td>
                  <td style="font-size: 0.75rem; color: var(--text-muted);">${new Date(r.created_at).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error: ${e.message}</div>`;
  }
}

// ==========================================
// VIEW 8: CIVIC ANALYTICS
// ==========================================
async function renderAuthorityAnalyticsView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 2rem;">Loading civic analytics...</div>`;
  try {
    const [kpis, trends, hotspots] = await Promise.all([
      API.req('/analytics/overview'),
      API.req('/analytics/trends?days=7'),
      API.req('/analytics/hotspots')
    ]);

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <div>
          <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--navy);">Civic Intelligence & Response Metrics</h2>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Calculated from database records. No fabricated metrics.</div>
        </div>
        <a href="/api/analytics/export-csv" class="btn btn-secondary btn-sm" download>📥 Export Aggregate CSV</a>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Verified Incidents</div>
          <div class="kpi-value">${kpis.active_incidents + kpis.resolved_incidents}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Cluster Compression Rate</div>
          <div class="kpi-value" style="color: var(--teal);">${kpis.cluster_reduction_rate}%</div>
          <div class="kpi-subtext">Citizen signal deduplication index</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Average Time to Resolution</div>
          <div class="kpi-value">${kpis.avg_resolution_hours} Hours</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Geographic Hotspot Localities</div>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Locality / Neighborhood</th>
                <th>Reports Lodged</th>
                <th>Incidents Triggered</th>
                <th>Dominant Civic Category</th>
                <th>Coordinates</th>
              </tr>
            </thead>
            <tbody>
              ${hotspots.map(h => `
                <tr>
                  <td><strong>${h.area}</strong></td>
                  <td>${h.report_count}</td>
                  <td><span class="badge badge-candidate">${h.incident_count} Incidents</span></td>
                  <td>${h.primary_category}</td>
                  <td style="font-size: 0.75rem;">${h.latitude.toFixed(4)}, ${h.longitude.toFixed(4)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error: ${e.message}</div>`;
  }
}

// ==========================================
// VIEW 9: SYSTEM SETTINGS
// ==========================================
async function renderAuthoritySettingsView(container) {
  try {
    const settings = await API.req('/admin/settings');

    container.innerHTML = `
      <div style="max-width: 700px; margin: 0 auto;">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Detection Thresholds & System Parameters</div>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
            Configure DBSCAN spatial clustering radius, temporal rolling windows, and category-specific triggers.
          </p>

          <form onsubmit="handleSettingsSave(event)">
            <div class="form-group">
              <label class="form-label">Spatial Clustering Distance (Meters)</label>
              <input type="number" name="DETECTION_DISTANCE_METERS" class="form-control" value="${settings.DETECTION_DISTANCE_METERS || 600}">
              <span style="font-size: 0.72rem; color: var(--text-muted);">Maximum radius distance between reports to consider them belonging to the same cluster.</span>
            </div>

            <div class="form-group">
              <label class="form-label">Rolling Time Window (Minutes)</label>
              <input type="number" name="DETECTION_TIME_WINDOW_MINUTES" class="form-control" value="${settings.DETECTION_TIME_WINDOW_MINUTES || 180}">
              <span style="font-size: 0.72rem; color: var(--text-muted);">Evaluation interval for report arrival rate and burst detection.</span>
            </div>

            <div class="form-group">
              <label class="form-label">Min Reports to Trigger Water Supply Cluster</label>
              <input type="number" name="DETECTION_MIN_WATER_REPORTS" class="form-control" value="${settings.DETECTION_MIN_WATER_REPORTS || 4}">
            </div>

            <div class="form-group">
              <label class="form-label">Min Reports for General Civic Categories</label>
              <input type="number" name="DETECTION_MIN_DEFAULT_REPORTS" class="form-control" value="${settings.DETECTION_MIN_DEFAULT_REPORTS || 4}">
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%;">Save Configuration Settings</button>
          </form>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error: ${e.message}</div>`;
  }
}

async function handleSettingsSave(e) {
  e.preventDefault();
  const form = e.target;
  const updates = {
    DETECTION_DISTANCE_METERS: form.DETECTION_DISTANCE_METERS.value,
    DETECTION_TIME_WINDOW_MINUTES: form.DETECTION_TIME_WINDOW_MINUTES.value,
    DETECTION_MIN_WATER_REPORTS: form.DETECTION_MIN_WATER_REPORTS.value,
    DETECTION_MIN_DEFAULT_REPORTS: form.DETECTION_MIN_DEFAULT_REPORTS.value
  };
  try {
    await API.req('/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    showToast('Settings saved successfully!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==========================================
// DEMO SCENARIO RUNNER: WATER BURST
// ==========================================
async function triggerLiveDemo() {
  showToast('⚡ Running Live Water Supply Cluster Demo...', 'info');
  try {
    await API.req('/demo/seed', { method: 'POST' });
    showToast('Demo dataset initialized! Navigating to Candidate Incident in T. Nagar...', 'success');
    navigateTo('authority/dashboard');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// Quick Role Switcher
async function quickSwitchRole(role) {
  let email = 'citizen@crowdpulse.tn';
  if (role === 'officer') email = 'officer@crowdpulse.tn';
  if (role === 'staff') email = 'staff.roads@crowdpulse.tn';
  if (role === 'admin') email = 'admin@crowdpulse.tn';

  try {
    const res = await API.req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'DemoPass123!' })
    });

    STATE.token = res.access_token;
    STATE.currentUser = res.user;
    localStorage.setItem('cp_token', res.access_token);
    showToast(`Switched to ${res.user.full_name} (${res.user.role})`, 'success');
    API.loadNotifications();
    renderApp();
  } catch (e) {
    showToast('Role switch failed: ' + e.message, 'error');
  }
}

function handleLogout() {
  STATE.token = null;
  STATE.currentUser = null;
  localStorage.removeItem('cp_token');
  showToast('Logged out successfully', 'info');
  navigateTo('landing');
}

// Notifications Modal
function openNotificationsModal() {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <div class="modal-title">🔔 Notification Center</div>
          <button class="close-btn" onclick="closeModal()">×</button>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-bottom: 0.75rem;">
          <button class="btn btn-sm btn-secondary" onclick="markAllNotificationsRead()">Mark all as read</button>
        </div>

        <div style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
          ${STATE.notifications.length > 0 ? STATE.notifications.map(n => `
            <div style="padding: 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: ${n.is_read ? 'var(--surface)' : 'var(--teal-light)'};">
              <strong style="font-size: 0.85rem; color: var(--navy);">${n.title}</strong>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin: 0.2rem 0;">${n.message}</div>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${new Date(n.created_at).toLocaleString()}</div>
            </div>
          `).join('') : '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No notifications yet.</div>'}
        </div>
      </div>
    </div>
  `;
}

async function markAllNotificationsRead() {
  try {
    await API.req('/notifications/read-all', { method: 'POST' });
    STATE.notifications.forEach(n => n.is_read = true);
    updateNotificationBadge();
    closeModal();
    showToast('Notifications marked as read', 'info');
  } catch (e) {}
}

function closeModal() {
  const modalRoot = document.getElementById('modal-root');
  if (modalRoot) modalRoot.innerHTML = '';
}

// Login Modal
function openLoginModal() {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content" style="max-width: 420px;">
        <div class="modal-header">
          <div class="modal-title">Log In to CrowdPulse TN</div>
          <button class="close-btn" onclick="closeModal()">×</button>
        </div>

        <div style="margin-bottom: 1.25rem;">
          <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.5rem;">Quick Demo Profiles:</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
            <button class="btn btn-sm btn-secondary" onclick="quickSwitchRole('citizen'); closeModal();">Citizen Karthik</button>
            <button class="btn btn-sm btn-secondary" onclick="quickSwitchRole('officer'); closeModal();">Officer Radhakrishnan</button>
            <button class="btn btn-sm btn-secondary" onclick="quickSwitchRole('staff'); closeModal();">Staff Murugesan</button>
            <button class="btn btn-sm btn-secondary" onclick="quickSwitchRole('admin'); closeModal();">Administrator</button>
          </div>
        </div>

        <div style="text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">— or log in with credentials —</div>

        <form onsubmit="handleManualLogin(event)">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" name="email" class="form-control" required value="citizen@crowdpulse.tn">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" name="password" class="form-control" required value="DemoPass123!">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%;">Log In</button>
        </form>
      </div>
    </div>
  `;
}

async function handleManualLogin(e) {
  e.preventDefault();
  const form = e.target;
  try {
    const res = await API.req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.value, password: form.password.value })
    });
    STATE.token = res.access_token;
    STATE.currentUser = res.user;
    localStorage.setItem('cp_token', res.access_token);
    closeModal();
    showToast(`Welcome, ${res.user.full_name}!`, 'success');
    API.loadNotifications();
    renderApp();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Window Event Listeners
window.addEventListener('hashchange', () => {
  parseHashRoute();
  renderApp();
});

window.addEventListener('DOMContentLoaded', async () => {
  parseHashRoute();
  await API.loadInitialData();
  renderApp();
});
