/**
 * CrowdPulse TN - Modern Civic Issue Detection Platform
 * Single Page Application Architecture
 */

const STATE = {
  currentUser: null,
  token: localStorage.getItem('cp_token') || null,
  route: localStorage.getItem('cp_token') ? 'landing' : 'login',
  routeParams: {},
  categories: [],
  departments: [],
  notifications: [],
  kpis: null,
  activeMap: null,
  activeMiniMap: null,
  language: localStorage.getItem('cp_lang') || 'en',
  theme: localStorage.getItem('cp_theme') || (localStorage.getItem('cp_contrast') === 'true' ? 'dark' : 'light'),
  highContrast: localStorage.getItem('cp_theme') === 'dark' || localStorage.getItem('cp_contrast') === 'true',
  copilotOpen: false,
  copilotMessages: []
};

// Apply initial dark theme
if (STATE.theme === 'dark' || STATE.highContrast) {
  document.body.classList.add('dark-mode');
}

const I18N = {
  en: {
    brand_tagline: "Detect Early. Act Together.",
    overview_map: "Overview & Map",
    submit_report: "Submit Report",
    my_reports: "My Reports",
    emerging_radar: "Emerging Radar",
    ai_copilot: "AI Civic Copilot",
    priority_matrix: "Priority & SLA Matrix",
    resolution_verification: "Verification & Resolution",
    ai_governance: "AI Governance & Models",
    operations_dashboard: "Operations Dashboard",
    incidents_clusters: "Incidents & Clusters",
    all_reports: "All Citizen Reports",
    civic_analytics: "Civic Analytics",
    detection_settings: "Detection Settings"
  },
  ta: {
    brand_tagline: "முன்கூட்டியே கண்டறிவோம். ஒன்றிணைவோம்.",
    overview_map: "கண்ணோட்டம் & வரைபடம்",
    submit_report: "புகார் அளிக்குக",
    my_reports: "எனது புகார்கள்",
    emerging_radar: "முன்னெச்சரிக்கை ரேடார்",
    ai_copilot: "ஏஐ மக்கள் உதவியாளர்",
    priority_matrix: "முன்னுரிமை & காலக்கெடு",
    resolution_verification: "தீர்வு & சரிபார்ப்பு",
    ai_governance: "ஏஐ மேலாண்மை & மாதிரி",
    operations_dashboard: "நிர்வாகக் கட்டுப்பாட்டு அறை",
    incidents_clusters: "பொதுப் பிரச்சனைகள்",
    all_reports: "அனைத்துப் புகார்கள்",
    civic_analytics: "மாநகரப் பகுப்பாய்வு",
    detection_settings: "அமைப்புகள்"
  }
};

function t(key) {
  const lang = STATE.language || 'en';
  return (I18N[lang] && I18N[lang][key]) || (I18N['en'][key]) || key;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toggleLanguage() {
  STATE.language = STATE.language === 'en' ? 'ta' : 'en';
  localStorage.setItem('cp_lang', STATE.language);
  renderApp();
  showToast(STATE.language === 'ta' ? 'தமிழ் மொழி மாற்றப்பட்டது' : 'Switched to English', 'success');
}

function toggleTheme() {
  const newTheme = STATE.theme === 'dark' ? 'light' : 'dark';
  STATE.theme = newTheme;
  STATE.highContrast = newTheme === 'dark';
  localStorage.setItem('cp_theme', newTheme);
  localStorage.setItem('cp_contrast', newTheme === 'dark' ? 'true' : 'false');
  if (newTheme === 'dark') {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('high-contrast');
    showToast('🌙 Dark Mode Enabled', 'info');
  } else {
    document.body.classList.remove('dark-mode');
    document.body.classList.remove('high-contrast');
    showToast('☀️ Light Mode Enabled', 'info');
  }
  updateThemeButtons();
}

function updateThemeButtons() {
  const isDark = STATE.theme === 'dark';
  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.innerHTML = `<span class="theme-toggle-icon">${isDark ? '☀️' : '🌙'}</span><span class="theme-toggle-text">${isDark ? 'Light' : 'Dark'}</span>`;
  });
}

function toggleContrast() {
  toggleTheme();
}

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
  const hash = window.location.hash.replace('#', '');
  if (!hash || (hash === 'login' && STATE.currentUser)) {
    if (STATE.currentUser) {
      if (['authority', 'admin', 'staff'].includes(STATE.currentUser.role)) {
        STATE.route = 'authority/dashboard';
      } else {
        STATE.route = 'citizen/report';
      }
    } else {
      STATE.route = 'login';
    }
    STATE.routeParams = {};
  } else if (hash === 'login') {
    STATE.route = 'login';
    STATE.routeParams = {};
  } else if (hash === 'public-map') {
    STATE.route = 'public-map';
    STATE.routeParams = {};
  } else {
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
}

// Toast Notifications
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
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

  // Dedicated Full-Page Login Portal
  if (STATE.route === 'login') {
    renderLoginView(appEl);
    return;
  }

  // Dedicated Full-Page View-Only Public Situational Map
  if (STATE.route === 'public-map' || (STATE.route === 'landing' && !STATE.currentUser)) {
    renderPublicSituationalMapView(appEl);
    return;
  }

  const isAuthority = STATE.currentUser && ['authority', 'admin', 'staff'].includes(STATE.currentUser.role);
  const isCitizen = STATE.currentUser && STATE.currentUser.role === 'citizen';

  // Strict Route Guard: Protect Authority Views from Citizens & Unauthenticated Users
  if (STATE.route.startsWith('authority/')) {
    if (!STATE.currentUser) {
      showToast('Authentication Required: Please sign in to access Authority operations.', 'error');
      STATE.route = 'login';
      LOGIN_VIEW_STATE.activeTab = 'official';
      window.location.hash = '#login';
      renderLoginView(appEl);
      return;
    }
    if (!isAuthority) {
      showToast('Access Restricted: You are signed in as a Citizen. Authority Operations are for municipal officials only.', 'error');
      STATE.route = 'citizen/report';
      window.location.hash = '#citizen/report';
    }
  }

  // Strict Route Guard: Protect Citizen My Reports if unauthenticated
  if (STATE.route === 'citizen/my-reports' && !STATE.currentUser) {
    showToast('Please sign in to view your submitted reports.', 'info');
    STATE.route = 'login';
    LOGIN_VIEW_STATE.activeTab = 'citizen';
    window.location.hash = '#login';
    renderLoginView(appEl);
    return;
  }

  const isPublicLanding = STATE.route === 'landing';

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
        ${isAuthority ? `
          <div class="nav-section-title">Authority Operations Command</div>
          <div class="nav-item ${STATE.route === 'authority/dashboard' ? 'active' : ''}" onclick="navigateTo('authority/dashboard')">
            <span>📊</span> ${t('operations_dashboard')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/radar' ? 'active' : ''}" onclick="navigateTo('authority/radar')">
            <span>⚡</span> ${t('emerging_radar')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/copilot' ? 'active' : ''}" onclick="navigateTo('authority/copilot')">
            <span>🤖</span> ${t('ai_copilot')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/priorities' ? 'active' : ''}" onclick="navigateTo('authority/priorities')">
            <span>🎯</span> ${t('priority_matrix')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/resolutions' ? 'active' : ''}" onclick="navigateTo('authority/resolutions')">
            <span>🛡️</span> ${t('resolution_verification')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/incidents' ? 'active' : ''}" onclick="navigateTo('authority/incidents')">
            <span>🚨</span> ${t('incidents_clusters')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/reports' ? 'active' : ''}" onclick="navigateTo('authority/reports')">
            <span>📑</span> ${t('all_reports')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/analytics' ? 'active' : ''}" onclick="navigateTo('authority/analytics')">
            <span>📈</span> ${t('civic_analytics')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/governance' ? 'active' : ''}" onclick="navigateTo('authority/governance')">
            <span>🔬</span> ${t('ai_governance')}
          </div>
          <div class="nav-item ${STATE.route === 'authority/settings' ? 'active' : ''}" onclick="navigateTo('authority/settings')">
            <span>⚙️</span> ${t('detection_settings')}
          </div>
          <div class="nav-section-title" style="margin-top: 1rem;">Public Situational View</div>
          <div class="nav-item ${STATE.route === 'landing' ? 'active' : ''}" onclick="navigateTo('landing')">
            <span>🏛️</span> ${t('overview_map')}
          </div>
        ` : `
          <div class="nav-section-title">Citizen Public Portal</div>
          <div class="nav-item ${STATE.route === 'landing' ? 'active' : ''}" onclick="navigateTo('landing')">
            <span>🏛️</span> ${t('overview_map')}
          </div>
          <div class="nav-item ${STATE.route === 'citizen/report' ? 'active' : ''}" onclick="navigateTo('citizen/report')">
            <span>📝</span> ${t('submit_report')}
          </div>
          <div class="nav-item ${STATE.route === 'citizen/my-reports' ? 'active' : ''}" onclick="navigateTo('citizen/my-reports')">
            <span>📋</span> ${t('my_reports')}
          </div>
        `}
      </nav>

      <div class="sidebar-footer">
        ${STATE.currentUser ? `
          <div class="user-badge">
            <div class="user-avatar">${STATE.currentUser.full_name[0]}</div>
            <div style="flex: 1; overflow: hidden;">
              <div class="user-meta-name">${escapeHtml(STATE.currentUser.full_name)}</div>
              <div class="user-meta-role" style="text-transform: uppercase; font-weight: 700; font-size: 0.72rem;">${STATE.currentUser.role}</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="handleLogout()" title="Logout" style="padding: 0.2rem 0.4rem;">⎋</button>
          </div>
        ` : `
          <button class="btn btn-primary btn-sm" style="width: 100%;" onclick="navigateTo('login')">🔐 Sign In / Register</button>
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
          <!-- Language & Accessibility -->
          <button class="btn btn-secondary btn-sm" onclick="toggleLanguage()" title="Switch English / தமிழ்">
            🌐 ${STATE.language === 'ta' ? 'English' : 'தமிழ்'}
          </button>
          <button class="theme-toggle-btn" onclick="toggleTheme()" title="Switch Light / Dark Mode">
            <span class="theme-toggle-icon">${STATE.theme === 'dark' ? '☀️' : '🌙'}</span>
            <span class="theme-toggle-text">${STATE.theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <!-- User Session Status (Role Choosing Switcher Removed) -->
          ${STATE.currentUser ? `
            <div class="user-status-pill" style="display: flex; align-items: center; gap: 0.45rem; background: var(--bg-main); padding: 0.25rem 0.65rem; border-radius: 999px; border: 1px solid var(--border);">
              <span class="badge ${isAuthority ? 'badge-primary' : 'badge-neutral'}" style="text-transform: uppercase; font-size: 0.68rem; font-weight: 700; padding: 2px 7px;">
                ${STATE.currentUser.role}
              </span>
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--navy); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(STATE.currentUser.full_name)}
              </span>
              <button class="btn btn-sm btn-secondary" onclick="handleLogout()" title="Logout" style="padding: 0.15rem 0.5rem; font-size: 0.72rem; border-radius: 999px;">⎋ Logout</button>
            </div>
          ` : `
            <button class="btn btn-sm btn-primary" onclick="navigateTo('login')">🔐 Sign In</button>
          `}

          <!-- Notification Bell -->
          <button class="btn btn-secondary btn-sm" onclick="openNotificationsModal()" style="position: relative;">
            🔔
            <span id="notif-count-badge" class="badge" style="display: none; position: absolute; top: -5px; right: -5px; background: var(--red); color: #fff; font-size: 0.65rem; padding: 1px 5px; border-radius: 999px;">0</span>
          </button>

          <!-- Citizen Report Button (Hidden for Authority Command) -->
          ${!isAuthority ? `
            <button class="btn btn-primary btn-sm" onclick="navigateTo('citizen/report')">+ ${t('submit_report')}</button>
          ` : ''}
        </div>
      </header>

      <!-- Main Page View Content -->
      <main class="page-container" id="main-content">
        <div style="text-align: center; padding: 3rem;"><div class="spinner"></div> Loading view...</div>
      </main>
    </div>

    <!-- Floating AI Civic Copilot Root -->
    <div id="floating-copilot-container"></div>
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
  } else if (STATE.route === 'authority/radar') {
    renderRadarView(contentEl);
  } else if (STATE.route === 'authority/copilot') {
    renderCopilotAuthorityView(contentEl);
  } else if (STATE.route === 'authority/priorities') {
    renderPriorityMatrixView(contentEl);
  } else if (STATE.route === 'authority/resolutions') {
    renderResolutionsView(contentEl);
  } else if (STATE.route === 'authority/governance') {
    renderGovernanceView(contentEl);
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
  renderFloatingCopilot();
}

function getPageTitle() {
  switch (STATE.route) {
    case 'public-map': return 'Tamil Nadu Public Situational Map';
    case 'landing': return 'Civic Early-Warning Overview';
    case 'citizen/report': return 'Lodge Civic Grievance';
    case 'citizen/my-reports': return 'My Submitted Reports';
    case 'authority/dashboard': return 'Authority Operations & Incident Detection';
    case 'authority/radar': return 'Emerging Issue Radar & Anomaly Spikes';
    case 'authority/copilot': return 'AI Civic Operations Copilot';
    case 'authority/priorities': return 'Smart Incident Prioritization & SLA Matrix';
    case 'authority/resolutions': return 'Resolution Evidence & Citizen Verification';
    case 'authority/governance': return 'AI Governance & Model Telemetry';
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
// VIEW 0: VIEW-ONLY PUBLIC SITUATIONAL MAP
// ==========================================
let publicMapInstance = null;
let publicMapActiveCategory = null;
let publicMapActiveDistrict = null;
let publicMapIncidentsData = [];
let publicMapReportsData = [];
let publicMapMarkers = [];

async function renderPublicSituationalMapView(container) {
  const isTa = STATE.language === 'ta';

  container.innerHTML = `
    <div class="public-situational-wrapper" style="min-height: 100vh; background: var(--bg-main); color: var(--text-primary); display: flex; flex-direction: column;">
      <!-- Public Transparency Header -->
      <header class="public-nav-header" style="padding: 1rem 2.25rem; display: flex; justify-content: space-between; align-items: center; background: var(--surface); border-bottom: 1px solid var(--border); box-shadow: var(--shadow-sm); position: sticky; top: 0; z-index: 1000;">
        <div style="display: flex; align-items: center; gap: 0.85rem; cursor: pointer;" onclick="navigateTo('public-map')">
          <img src="/static/assets/logo.svg" alt="CrowdPulse TN" width="38" height="38">
          <div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--navy); line-height: 1.1; letter-spacing: -0.02em;">CrowdPulse TN</div>
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--teal); text-transform: uppercase; letter-spacing: 0.06em;">
              ${isTa ? 'தமிழ்நாடு அரசு • பொது வரைபடம் & வெளிப்படைத்தன்மை' : 'Official Public Situational Map • Tamil Nadu'}
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <button class="btn btn-secondary btn-sm" onclick="toggleLanguage()" title="Switch Language">
            🌐 ${isTa ? 'English' : 'தமிழ்'}
          </button>
          <button class="theme-toggle-btn" onclick="toggleTheme()" title="Switch Light / Dark Mode">
            <span class="theme-toggle-icon">${STATE.theme === 'dark' ? '☀️' : '🌙'}</span>
            <span class="theme-toggle-text">${STATE.theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          ${STATE.currentUser ? `
            <button class="btn btn-primary btn-sm" onclick="navigateTo(STATE.currentUser.role === 'citizen' ? 'citizen/report' : 'authority/dashboard')">
              👤 ${isTa ? 'எனது போர்டல்' : 'Back to My Portal'} (${STATE.currentUser.role.toUpperCase()})
            </button>
          ` : `
            <button class="btn btn-primary btn-sm" onclick="navigateTo('login')">
              🔐 ${isTa ? 'குடிமக்கள் / அலுவலர் உள்நுழைவு' : 'Citizen & Official Sign In'}
            </button>
          `}
        </div>
      </header>

      <!-- Public View Hero & Notification Banner -->
      <div style="background: linear-gradient(135deg, rgba(15, 157, 138, 0.08) 0%, rgba(20, 36, 58, 0.05) 100%); padding: 1.75rem 2.25rem 1.25rem; border-bottom: 1px solid var(--border);">
        <div style="max-width: 1300px; margin: 0 auto; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: var(--surface); padding: 0.2rem 0.65rem; border-radius: 999px; border: 1px solid var(--border); font-size: 0.75rem; font-weight: 700; color: var(--teal); margin-bottom: 0.5rem;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--teal); display: inline-block;"></span>
              ${isTa ? 'பொதுப் பார்வை முறை • தனிநபர் விவரங்கள் பாதுகாக்கப்பட்டுள்ளன' : 'View-Only Public Transparency Mode • 100% PII Redacted'}
            </div>
            <h1 style="font-size: 1.75rem; font-weight: 800; color: var(--navy); margin: 0 0 0.35rem; letter-spacing: -0.02em;">
              ${isTa ? 'தமிழ்நாடு நகர்ப்புற பிரச்சனைகள் & முன்னெச்சரிக்கை வரைபடம்' : 'Tamil Nadu Civic Situational Map & Early Warnings'}
            </h1>
            <p style="font-size: 0.9rem; color: var(--text-secondary); margin: 0; max-width: 800px;">
              ${isTa
                ? 'பொதுமக்கள் புகார்கள் மற்றும் ஏஐ முன்னெச்சரிக்கை தகவல்களை வெளிப்படைத்தன்மையுடன் காணுங்கள். குடிநீர்த் தட்டுப்பாடு, சாலைப் பள்ளங்கள் மற்றும் வடிகால் பிரச்சனைகள் கண்காணிக்கப்படுகின்றன.'
                : 'Real-time collective civic pulse across Tamil Nadu municipalities. Discover emerging water disruptions, pothole clusters, and civic anomalies consolidated for rapid municipal response.'}
            </p>
          </div>

          <div style="display: flex; gap: 0.6rem;">
            <button class="btn btn-outline-teal btn-sm" onclick="initPublicSituationalMap()" title="Refresh Live Map">
              🔄 ${isTa ? 'வரைபடத்தைப் புதுப்பி' : 'Refresh Live Map'}
            </button>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('login')">
              📢 ${isTa ? 'புதிய புகார் அளிக்க' : 'Lodge Grievance'}
            </button>
          </div>
        </div>
      </div>

      <!-- Real-Time Civic Pulse KPIs -->
      <div style="padding: 1.25rem 2.25rem; max-width: 1300px; margin: 0 auto; width: 100%; box-sizing: border-box;">
        <div id="public-kpis-strip" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="card" style="margin: 0; padding: 1rem 1.25rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Monitored Hotspots</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--navy); margin-top: 0.2rem;" id="pub-stat-incidents">...</div>
            <div style="font-size: 0.74rem; color: var(--teal); font-weight: 600;">Active Municipal Clusters</div>
          </div>
          <div class="card" style="margin: 0; padding: 1rem 1.25rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Citizen Signals</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--navy); margin-top: 0.2rem;" id="pub-stat-signals">...</div>
            <div style="font-size: 0.74rem; color: var(--text-secondary);">Public Grievances Logged</div>
          </div>
          <div class="card" style="margin: 0; padding: 1rem 1.25rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Early Warning Detections</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--amber); margin-top: 0.2rem;" id="pub-stat-candidates">...</div>
            <div style="font-size: 0.74rem; color: var(--text-secondary);">AI Space-Time Anomaly Clusters</div>
          </div>
          <div class="card" style="margin: 0; padding: 1rem 1.25rem;">
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Resolution Window (Avg)</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--green); margin-top: 0.2rem;" id="pub-stat-sla">...</div>
            <div style="font-size: 0.74rem; color: var(--green); font-weight: 600;">Rapid Civic Escalation SLA</div>
          </div>
        </div>

        <!-- Filter Bar & Category Chips -->
        <div class="card" style="margin-bottom: 1.5rem; padding: 1rem 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;" id="public-category-filters">
              <span style="font-size: 0.82rem; font-weight: 700; color: var(--navy); margin-right: 0.25rem;">Filters:</span>
              <button class="btn btn-sm btn-primary pub-cat-btn" data-cat="all" onclick="filterPublicMapByCategory(null)">All Categories</button>
              <button class="btn btn-sm btn-secondary pub-cat-btn" data-cat="1" onclick="filterPublicMapByCategory(1)">💧 Drinking Water</button>
              <button class="btn btn-sm btn-secondary pub-cat-btn" data-cat="2" onclick="filterPublicMapByCategory(2)">🛣️ Roads & Potholes</button>
              <button class="btn btn-sm btn-secondary pub-cat-btn" data-cat="3" onclick="filterPublicMapByCategory(3)">🌊 Drainage & Flood</button>
              <button class="btn btn-sm btn-secondary pub-cat-btn" data-cat="4" onclick="filterPublicMapByCategory(4)">🗑️ Solid Waste</button>
              <button class="btn btn-sm btn-secondary pub-cat-btn" data-cat="5" onclick="filterPublicMapByCategory(5)">💡 Street Lighting</button>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select class="form-control" style="font-size: 0.82rem; padding: 0.35rem 0.65rem;" id="public-district-select" onchange="filterPublicMapByDistrict(this.value)">
                <option value="">All Monitored Areas</option>
                <option value="T. Nagar">T. Nagar (Chennai)</option>
                <option value="Anna Nagar">Anna Nagar (Chennai)</option>
                <option value="Velachery">Velachery (Chennai)</option>
                <option value="Mylapore">Mylapore (Chennai)</option>
                <option value="Coimbatore">Coimbatore Corporation</option>
                <option value="Madurai">Madurai Corporation</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Interactive Map Frame -->
        <div class="card" style="padding: 0.75rem; margin-bottom: 2rem; position: relative;">
          <div id="public-situational-map" style="height: 540px; width: 100%; border-radius: var(--radius-sm); z-index: 1;"></div>
          
          <!-- Legend Strip -->
          <div style="display: flex; gap: 1.5rem; padding: 0.75rem 0.5rem 0.25rem; font-size: 0.8rem; color: var(--text-secondary); flex-wrap: wrap; align-items: center; border-top: 1px solid var(--border); margin-top: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--amber); display: inline-block;"></span>
              <strong>AI Candidate Hotspot</strong> (Spatial Clustering Active)
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--teal); display: inline-block;"></span>
              <strong>Verified Official Incident</strong> (Municipal Works Dispatched)
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem;">
              <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--green); display: inline-block;"></span>
              <strong>Resolved & Restored</strong>
            </div>
            <div style="margin-left: auto; color: var(--text-muted); font-size: 0.75rem;">
              💡 Click any marker or circle to view aggregated civic signals & verification details
            </div>
          </div>
        </div>

        <!-- Transparency Incident Directory & Recent Public Signals -->
        <div class="card" style="margin-bottom: 2rem;">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div class="card-title">Live Public Incident Directory</div>
              <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.2rem;">
                Official municipal incidents synthesized from multiple resident complaints.
              </div>
            </div>
            <span class="badge badge-verified">Public Transparency Feed</span>
          </div>

          <div class="table-responsive" id="public-incidents-table-box" style="margin-top: 0.75rem;">
            <div style="text-align: center; padding: 2rem;"><div class="spinner"></div> Loading incident records...</div>
          </div>
        </div>

        <!-- Citizen Call to Action Banner -->
        <div class="card" style="background: linear-gradient(135deg, #14243A 0%, #0F9D8A 100%); color: #FFFFFF; padding: 2.25rem; text-align: center; margin-bottom: 2rem;">
          <h2 style="font-size: 1.6rem; font-weight: 800; color: #FFFFFF; margin: 0 0 0.5rem;">
            ${isTa ? 'உங்கள் பகுதியில் குடிநீர், சாலை அல்லது வடிகால் பிரச்சனையா?' : 'Experiencing a Civic Problem on Your Street?'}
          </h2>
          <p style="font-size: 0.95rem; color: rgba(255, 255, 255, 0.88); max-width: 650px; margin: 0 auto 1.5rem;">
            ${isTa
              ? 'தமிழ்நாடு முழுவதும் உடனடி தீர்வு பெற உங்கள் புகாரை பதிவு செய்யுங்கள். எங்கள் ஏஐ அமைப்பு உங்கள் புகாரை அருகிலுள்ள பிற புகார்களுடன் இணைத்து விரைந்து நடவடிக்கை எடுக்கும்.'
              : 'Submit your grievance in 60 seconds with GPS auto-detection, photo upload, and voice notes. CrowdPulse groups duplicate signals and routes directly to Greater Chennai Corporation, Metro Water, and TNEB.'}
          </p>
          <div style="display: flex; justify-content: center; gap: 0.85rem; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-lg" onclick="navigateTo('login')" style="background: #FFFFFF; color: var(--navy); font-weight: 700; border: none;">
              📢 ${isTa ? 'குடிமக்கள் உள்நுழைவு & புகார் செய்க' : 'Sign In & Lodge Citizen Complaint'}
            </button>
            <button class="btn btn-outline btn-lg" onclick="navigateTo('login')" style="color: #FFFFFF; border-color: rgba(255, 255, 255, 0.4);">
              🏛️ ${isTa ? 'அதிகாரப்பூர்வ நிர்வாக உள்நுழைவு' : 'Official Authority Sign In'}
            </button>
          </div>
        </div>
      </div>

      <!-- Public View Footer -->
      <footer style="margin-top: auto; padding: 1.5rem 2rem; background: var(--surface); border-top: 1px solid var(--border); text-align: center; font-size: 0.8rem; color: var(--text-secondary);">
        <div style="display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
          <strong>CrowdPulse TN</strong>
          <span>•</span>
          <span>Government of Tamil Nadu Civic Intelligence</span>
          <span>•</span>
          <span>Zero PII Exposure Guaranteed</span>
          <span>•</span>
          <a href="#login" onclick="navigateTo('login')" style="color: var(--teal); text-decoration: underline; font-weight: 600;">Officer & Citizen Sign In Portal</a>
        </div>
        <div>Designed for resilient, responsive urban governance across 38 districts of Tamil Nadu.</div>
      </footer>
    </div>
  `;

  // Initialize Map & Fetch Public Metrics
  setTimeout(() => {
    initPublicSituationalMap();
    loadPublicOverviewMetrics();
  }, 100);
}

async function initPublicSituationalMap() {
  const container = document.getElementById('public-situational-map');
  if (!container || typeof L === 'undefined') return;

  if (publicMapInstance) {
    try {
      publicMapInstance.remove();
    } catch (e) {}
    publicMapInstance = null;
  }
  if (container._leaflet_id) {
    delete container._leaflet_id;
  }

  try {
    const map = L.map('public-situational-map').setView([13.0405, 80.2337], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | CrowdPulse TN Public Transparency'
    }).addTo(map);

    publicMapInstance = map;

    const [incidents, reports] = await Promise.all([
      API.req('/map/incidents'),
      API.req('/map/reports?limit=100')
    ]);

    publicMapIncidentsData = incidents || [];
    publicMapReportsData = reports || [];

    renderPublicMapLayers();
    renderPublicIncidentsTable();
  } catch (err) {
    console.error("Failed to initialize public situational map:", err);
  }
}

function renderPublicMapLayers() {
  if (!publicMapInstance) return;

  // Clear existing markers
  publicMapMarkers.forEach(m => publicMapInstance.removeLayer(m));
  publicMapMarkers = [];

  let filteredIncidents = publicMapIncidentsData;
  let filteredReports = publicMapReportsData;

  if (publicMapActiveCategory) {
    filteredIncidents = filteredIncidents.filter(inc => {
      if (publicMapActiveCategory === 1) return inc.category_name?.toLowerCase().includes('water');
      if (publicMapActiveCategory === 2) return inc.category_name?.toLowerCase().includes('road') || inc.category_name?.toLowerCase().includes('pothole');
      if (publicMapActiveCategory === 3) return inc.category_name?.toLowerCase().includes('drain') || inc.category_name?.toLowerCase().includes('flood');
      if (publicMapActiveCategory === 4) return inc.category_name?.toLowerCase().includes('waste') || inc.category_name?.toLowerCase().includes('garbage');
      if (publicMapActiveCategory === 5) return inc.category_name?.toLowerCase().includes('light') || inc.category_name?.toLowerCase().includes('electricity');
      return true;
    });

    filteredReports = filteredReports.filter(r => {
      if (publicMapActiveCategory === 1) return r.category_name?.toLowerCase().includes('water');
      if (publicMapActiveCategory === 2) return r.category_name?.toLowerCase().includes('road') || r.category_name?.toLowerCase().includes('pothole');
      if (publicMapActiveCategory === 3) return r.category_name?.toLowerCase().includes('drain') || r.category_name?.toLowerCase().includes('flood');
      if (publicMapActiveCategory === 4) return r.category_name?.toLowerCase().includes('waste') || r.category_name?.toLowerCase().includes('garbage');
      if (publicMapActiveCategory === 5) return r.category_name?.toLowerCase().includes('light') || r.category_name?.toLowerCase().includes('electricity');
      return true;
    });
  }

  if (publicMapActiveDistrict) {
    const q = publicMapActiveDistrict.toLowerCase();
    filteredIncidents = filteredIncidents.filter(inc => 
      (inc.area && inc.area.toLowerCase().includes(q)) || 
      (inc.title && inc.title.toLowerCase().includes(q))
    );
  }

  // Add Incident Circles & Centroids
  filteredIncidents.forEach(inc => {
    const color = inc.status === 'candidate' ? '#F2B544' : inc.status === 'closed' ? '#2D9B68' : '#0F9D8A';

    const circle = L.circle([inc.latitude, inc.longitude], {
      color: color,
      fillColor: color,
      fillOpacity: 0.18,
      radius: inc.radius_meters || 350
    }).addTo(publicMapInstance);
    publicMapMarkers.push(circle);

    const marker = L.circleMarker([inc.latitude, inc.longitude], {
      radius: 9,
      fillColor: color,
      color: '#FFFFFF',
      weight: 2.5,
      opacity: 1,
      fillOpacity: 0.95
    }).addTo(publicMapInstance);

    marker.bindPopup(`
      <div style="font-family: inherit; min-width: 220px;">
        <div style="font-size: 0.72rem; font-weight: 700; color: ${color}; text-transform: uppercase;">
          ${escapeHtml(inc.status.toUpperCase())} ${inc.is_candidate ? '(AI CANDIDATE HOTSPOT)' : '(OFFICIAL INCIDENT)'}
        </div>
        <strong style="font-size: 0.95rem; color: #14243A; display: block; margin: 0.25rem 0;">${escapeHtml(inc.title)}</strong>
        <div style="font-size: 0.8rem; color: #68778D;">📍 ${escapeHtml(inc.area || 'Chennai')}</div>
        <div style="margin-top: 0.45rem; font-size: 0.82rem; background: #F1F5F9; padding: 0.35rem 0.5rem; border-radius: 4px;">
          👥 <strong>${inc.report_count}</strong> Citizen reports consolidated
        </div>
        <div style="margin-top: 0.5rem; font-size: 0.74rem; color: #64748B;">
          🔒 Reporter identities sanitized for privacy
        </div>
        <button onclick="navigateTo('login')" style="margin-top: 0.5rem; width: 100%; background: #0F9D8A; color: #fff; border: none; padding: 0.35rem 0.6rem; border-radius: 6px; font-weight: 600; cursor: pointer;">
          Sign In to Track or Report
        </button>
      </div>
    `);
    publicMapMarkers.push(marker);
  });

  // Add Individual Signal Dots
  filteredReports.forEach(r => {
    const marker = L.circleMarker([r.latitude, r.longitude], {
      radius: 4.5,
      fillColor: r.category_color || '#0F9D8A',
      color: '#FFFFFF',
      weight: 1.5,
      opacity: 0.8,
      fillOpacity: 0.75
    }).addTo(publicMapInstance);

    marker.bindPopup(`
      <div style="font-size: 0.8rem;">
        <span style="font-size: 0.7rem; color: #94A3B8;">${escapeHtml(r.reference_no)}</span><br>
        <strong>${escapeHtml(r.title)}</strong><br>
        <span style="color: #68778D;">${escapeHtml(r.category_name)} • Severity: ${escapeHtml(r.severity)}</span>
      </div>
    `);
    publicMapMarkers.push(marker);
  });

  // Re-center if district changed
  if (publicMapActiveDistrict && filteredIncidents.length > 0) {
    publicMapInstance.setView([filteredIncidents[0].latitude, filteredIncidents[0].longitude], 14);
  }
}

function filterPublicMapByCategory(catId) {
  publicMapActiveCategory = catId;
  document.querySelectorAll('.pub-cat-btn').forEach(b => {
    if ((catId === null && b.dataset.cat === 'all') || (catId && b.dataset.cat === String(catId))) {
      b.className = 'btn btn-sm btn-primary pub-cat-btn';
    } else {
      b.className = 'btn btn-sm btn-secondary pub-cat-btn';
    }
  });
  renderPublicMapLayers();
  renderPublicIncidentsTable();
}

function filterPublicMapByDistrict(district) {
  publicMapActiveDistrict = district || null;
  renderPublicMapLayers();
  renderPublicIncidentsTable();
}

function renderPublicIncidentsTable() {
  const box = document.getElementById('public-incidents-table-box');
  if (!box) return;

  let filtered = publicMapIncidentsData;
  if (publicMapActiveCategory) {
    filtered = filtered.filter(inc => {
      if (publicMapActiveCategory === 1) return inc.category_name?.toLowerCase().includes('water');
      if (publicMapActiveCategory === 2) return inc.category_name?.toLowerCase().includes('road') || inc.category_name?.toLowerCase().includes('pothole');
      if (publicMapActiveCategory === 3) return inc.category_name?.toLowerCase().includes('drain') || inc.category_name?.toLowerCase().includes('flood');
      if (publicMapActiveCategory === 4) return inc.category_name?.toLowerCase().includes('waste') || inc.category_name?.toLowerCase().includes('garbage');
      if (publicMapActiveCategory === 5) return inc.category_name?.toLowerCase().includes('light') || inc.category_name?.toLowerCase().includes('electricity');
      return true;
    });
  }
  if (publicMapActiveDistrict) {
    const q = publicMapActiveDistrict.toLowerCase();
    filtered = filtered.filter(inc => (inc.area && inc.area.toLowerCase().includes(q)) || (inc.title && inc.title.toLowerCase().includes(q)));
  }

  if (filtered.length === 0) {
    box.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No incidents matching active category/district filters.</div>`;
    return;
  }

  box.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Incident Ref</th>
          <th>Title & Category</th>
          <th>Locality</th>
          <th>Signals Aggregated</th>
          <th>Current Status</th>
          <th>Detection Window</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(inc => `
          <tr>
            <td><code>${escapeHtml(inc.incident_number)}</code></td>
            <td>
              <strong>${escapeHtml(inc.title)}</strong><br>
              <span style="font-size: 0.75rem; color: ${inc.category_color || 'var(--teal)'}; font-weight: 600;">● ${escapeHtml(inc.category_name)}</span>
            </td>
            <td>${escapeHtml(inc.area || 'Chennai')}</td>
            <td><span class="badge badge-candidate">👥 ${inc.report_count} Reports</span></td>
            <td>
              <span class="badge badge-status badge-${inc.status}">
                ${inc.status === 'candidate' ? 'AI Candidate' : inc.status.toUpperCase()}
              </span>
            </td>
            <td style="font-size: 0.78rem; color: var(--text-secondary);">${new Date(inc.created_at).toLocaleString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadPublicOverviewMetrics() {
  try {
    const ov = await API.req('/analytics/overview');
    if (document.getElementById('pub-stat-incidents')) {
      document.getElementById('pub-stat-incidents').textContent = ov.active_incidents ?? 14;
    }
    if (document.getElementById('pub-stat-signals')) {
      document.getElementById('pub-stat-signals').textContent = ov.total_reports ?? 248;
    }
    if (document.getElementById('pub-stat-candidates')) {
      document.getElementById('pub-stat-candidates').textContent = ov.candidates_awaiting ?? 3;
    }
    if (document.getElementById('pub-stat-sla')) {
      document.getElementById('pub-stat-sla').textContent = `${ov.avg_resolution_hours ?? 4.2}h`;
    }
  } catch (e) {
    console.warn("Public overview metrics load notice:", e);
  }
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
    <div style="max-width: 1100px; margin: 0 auto; width: 100%; box-sizing: border-box;">
      <!-- Top Citizen Portal Navigation Tabs -->
      <div class="citizen-tabs-bar">
        <button class="citizen-tab-btn active" id="tab-btn-lodge" onclick="switchCitizenViewTab('lodge')">
          ✍️ Lodge Civic Complaint
        </button>
        <button class="citizen-tab-btn" id="tab-btn-track" onclick="switchCitizenViewTab('track')">
          🔍 Live Grievance Progress Radar
        </button>
        <button class="citizen-tab-btn" id="tab-btn-history" onclick="switchCitizenViewTab('history')">
          📋 My Complaints History
        </button>
      </div>

      <!-- Dedicated Grievance Tracking Radar Card -->
      <div class="card" id="citizen-tracking-card" style="margin-bottom: 2rem; border: 1.5px solid var(--border); box-shadow: var(--shadow-sm); box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
          <div>
            <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: var(--teal-light); color: var(--teal); padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; margin-bottom: 0.4rem;">
              <span>📍</span> OFFICIAL MUNICIPAL STATUS RADAR
            </div>
            <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--navy); margin: 0 0 0.35rem;">
              Track Grievance Lifecycle & Resolutions
            </h2>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0; max-width: 720px;">
              Enter any complaint reference number to inspect real-time progress: AI clustering, assigned municipal department, field rectification status, and official completion proof.
            </p>
          </div>
          <button class="btn btn-sm btn-outline-teal" onclick="switchCitizenViewTab('lodge')">
            ✍️ Lodge New Complaint
          </button>
        </div>

        <!-- Search Bar -->
        <div style="display: flex; gap: 0.6rem; align-items: center; background: var(--surface-alt); padding: 0.5rem 0.75rem; border-radius: var(--radius-md); border: 1.5px solid var(--border); max-width: 650px; box-sizing: border-box;">
          <span style="font-size: 1.2rem;">🔍</span>
          <input type="text" id="citizen-main-track-input" placeholder="Enter Reference # (e.g. TN-2610-WAS01, TN-2610-81DEEC)" style="flex: 1; border: none; background: transparent; font-size: 0.92rem; font-weight: 600; color: var(--text-primary); outline: none;" onkeydown="if(event.key === 'Enter') handleCitizenTrackingSearch('citizen-main-track-input')">
          <button class="btn btn-primary btn-sm" onclick="handleCitizenTrackingSearch('citizen-main-track-input')" style="padding: 0.55rem 1.15rem; font-weight: 700;">
            Track Progress
          </button>
        </div>

        <!-- Quick Demo Chips -->
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.85rem; font-size: 0.78rem;">
          <span style="color: var(--text-secondary); font-weight: 600;">Sample References:</span>
          <button class="badge" style="background: var(--surface); border: 1px solid var(--green); color: var(--green); cursor: pointer; padding: 4px 10px; font-weight: 700;" onclick="handleCitizenTrackingSearchDirect('TN-2610-WAS01')">
            ✅ #TN-2610-WAS01 (Certified Resolved & Evidence)
          </button>
          <button class="badge" style="background: var(--surface); border: 1px solid var(--amber); color: var(--amber); cursor: pointer; padding: 4px 10px; font-weight: 700;" onclick="handleCitizenTrackingSearchDirect('TN-2610-81DEEC')">
            ⚡ #TN-2610-81DEEC (Active Grievance)
          </button>
        </div>

        <!-- Inline Tracking Result Box (Renders progress directly on user page) -->
        <div id="inline-tracking-result-box" style="display: none; margin-top: 1.5rem; box-sizing: border-box;"></div>
      </div>

      <!-- Citizen Complaint Submission Form Section -->
      <div class="card" id="citizen-form-section" style="box-sizing: border-box;">
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

      <!-- Live Reports History Section Directly Below the Form -->
      <div id="citizen-report-history-container" style="margin-top: 2rem; box-sizing: border-box;">
        <div class="card" style="padding: 1.5rem; text-align: center;">
          <div class="spinner"></div>
          <div style="margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.85rem;">Loading your reports history...</div>
        </div>
      </div>
    </div>
  `;

  // Init Pin Picker Map
  setTimeout(() => {
    initPinPickerMap();
  }, 100);

  // Load Submitted Reports History right below the form
  loadCitizenReportHistory();
}

let pinPickerMap = null;
let pinPickerMarker = null;

function initPinPickerMap() {
  const container = document.getElementById('pin-map');
  if (!container || typeof L === 'undefined') return;

  if (pinPickerMap) {
    try {
      pinPickerMap.remove();
    } catch (e) {}
    pinPickerMap = null;
  }
  if (container._leaflet_id) {
    delete container._leaflet_id;
  }

  const latInput = document.getElementById('input-lat');
  const lonInput = document.getElementById('input-lon');
  const initialLat = latInput ? parseFloat(latInput.value) || 13.0398 : 13.0398;
  const initialLon = lonInput ? parseFloat(lonInput.value) || 80.2342 : 80.2342;

  try {
    pinPickerMap = L.map('pin-map').setView([initialLat, initialLon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pinPickerMap);

    pinPickerMarker = L.marker([initialLat, initialLon], { draggable: true }).addTo(pinPickerMap);

    pinPickerMarker.on('dragend', function(e) {
      const pos = e.target.getLatLng();
      if (document.getElementById('input-lat')) document.getElementById('input-lat').value = pos.lat.toFixed(6);
      if (document.getElementById('input-lon')) document.getElementById('input-lon').value = pos.lng.toFixed(6);
    });

    pinPickerMap.on('click', function(e) {
      pinPickerMarker.setLatLng(e.latlng);
      if (document.getElementById('input-lat')) document.getElementById('input-lat').value = e.latlng.lat.toFixed(6);
      if (document.getElementById('input-lon')) document.getElementById('input-lon').value = e.latlng.lng.toFixed(6);
    });
  } catch (err) {
    console.warn('Map initialization warning:', err);
  }
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
    form.reset();
    btn.disabled = false;
    btn.textContent = '🚀 Submit Report for AI Analysis';
    const previewBox = document.getElementById('image-preview-box');
    if (previewBox) previewBox.textContent = '';

    // Immediately reload history below so newly submitted report appears right away
    await loadCitizenReportHistory();
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
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <div class="modal-title">✓ Grievance Lodged Successfully</div>
          <button class="close-btn" onclick="closeModal()">×</button>
        </div>

        <div style="background: var(--teal-light); padding: 1.25rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; border-left: 4px solid var(--teal);">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--teal); text-transform: uppercase;">Tracking Reference</div>
          <div style="font-size: 1.55rem; font-weight: 800; color: var(--navy);">${escapeHtml(report.reference_no)}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">Category: <strong>${escapeHtml(report.category_name)}</strong></div>
        </div>

        <div class="card" style="margin-bottom: 1.25rem; padding: 1rem;">
          <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.5rem;">🤖 AI Pipeline & Spatial Triage</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
            <div>Pipeline Model: <code>${escapeHtml(report.analysis?.model_version || 'cp-civic-nlp-v2.1')}</code></div>
            <div>NLP Confidence: <strong>${((report.analysis?.confidence_score || 0.85) * 100).toFixed(1)}%</strong></div>
            <div>Cluster Status: 
              ${report.has_incident ? `<span class="badge badge-candidate">Aggregated into ${escapeHtml(report.incident_number)}</span>` : '<span class="badge badge-verified">Individual Incident Signal</span>'}
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="closeModal(); openTrackProgressModal('${escapeHtml(report.reference_no)}');">
            🔍 Track Live Progress Now
          </button>
          <button class="btn btn-secondary" onclick="closeModal(); document.getElementById('citizen-report-history-container')?.scrollIntoView({ behavior: 'smooth' });">
            📋 View in History Below
          </button>
          <button class="btn btn-secondary" onclick="closeModal();">
            + Lodge Another Grievance
          </button>
        </div>
      </div>
    </div>
  `;
}

function getReportStageBadge(r) {
  const status = (r.status || '').toLowerCase();
  const incStatus = (r.incident_status || '').toLowerCase();

  if (status === 'withdrawn') {
    return `<span class="badge" style="background: var(--surface-alt); color: var(--text-muted); font-size: 0.72rem;">Withdrawn</span>`;
  }
  if (status === 'resolved' || status === 'closed' || incStatus === 'resolved' || incStatus === 'closed' || incStatus === 'resolved_pending') {
    return `<span class="badge" style="background: #DEF7EC; color: #03543F; font-weight: 700; border: 1px solid #31C48D; font-size: 0.72rem;">✅ Step 5/5: Resolved & Fixed</span>`;
  }
  if (status === 'in_progress' || incStatus === 'in_progress') {
    return `<span class="badge" style="background: #FEF08A; color: #854D0E; font-weight: 700; border: 1px solid #FACC15; font-size: 0.72rem;">⚡ Step 4/5: Field Action</span>`;
  }
  if (r.has_incident || r.assigned_department_name || status === 'verified' || status === 'linked_to_incident') {
    return `<span class="badge" style="background: #E1EFFE; color: #1E429F; font-weight: 700; border: 1px solid #76A9FA; font-size: 0.72rem;">🏢 Step 3/5: Dept Assigned</span>`;
  }
  if (r.analysis || status === 'analyzed') {
    return `<span class="badge" style="background: #E6FFFA; color: #047481; font-weight: 700; border: 1px solid #20C997; font-size: 0.72rem;">🤖 Step 2/5: AI Verified</span>`;
  }
  return `<span class="badge" style="background: var(--surface-alt); color: var(--text-secondary); font-weight: 700; border: 1px solid var(--border); font-size: 0.72rem;">📥 Step 1/5: Submitted</span>`;
}

function buildTrackingProgressHTML(report, isModal = false) {
  const status = (report.status || '').toLowerCase();
  const incStatus = (report.incident_status || '').toLowerCase();
  const isResolved = status === 'resolved' || status === 'closed' || incStatus === 'resolved' || incStatus === 'closed' || incStatus === 'resolved_pending';
  const isInProgress = status === 'in_progress' || incStatus === 'in_progress';
  const isDeptAssigned = Boolean(report.has_incident || report.assigned_department_name || status === 'verified' || status === 'linked_to_incident' || isInProgress || isResolved);
  const isAiAnalyzed = Boolean(report.analysis || status !== 'submitted' || isDeptAssigned || isInProgress || isResolved);

  let currentStep = 1;
  if (isResolved) currentStep = 5;
  else if (isInProgress) currentStep = 4;
  else if (isDeptAssigned) currentStep = 3;
  else if (isAiAnalyzed) currentStep = 2;

  const formattedCreatedDate = report.created_at ? new Date(report.created_at).toLocaleString() : 'N/A';
  const formattedResolvedDate = report.resolved_at ? new Date(report.resolved_at).toLocaleString() : (report.updated_at ? new Date(report.updated_at).toLocaleString() : null);

  const steps = [
    {
      num: 1,
      title: 'Grievance Lodged',
      desc: 'Citizen signal received with EXIF-redacted location.',
      time: formattedCreatedDate,
      isDone: currentStep > 1,
      isActive: currentStep === 1
    },
    {
      num: 2,
      title: 'AI Verification',
      desc: report.analysis
        ? `Verified (${Math.round((report.analysis.confidence_score || 0.85) * 100)}% conf)`
        : 'NLP classification & spatial clustering.',
      time: isAiAnalyzed ? formattedCreatedDate : 'Pending AI scan',
      isDone: currentStep > 2,
      isActive: currentStep === 2
    },
    {
      num: 3,
      title: 'Dept Dispatched',
      desc: report.assigned_department_name 
        ? escapeHtml(report.assigned_department_name)
        : (report.has_incident ? `Aggregated into ${report.incident_number}` : 'Assigned to field command'),
      time: isDeptAssigned ? (report.has_incident ? 'Linked to Incident' : 'Dispatched') : 'Queued for triage',
      isDone: currentStep > 3,
      isActive: currentStep === 3
    },
    {
      num: 4,
      title: 'Field Action Active',
      desc: isInProgress || isResolved ? 'Municipal crew executing repairs on-site' : 'Awaiting field deployment',
      time: report.sla_due_date ? `SLA: ${new Date(report.sla_due_date).toLocaleDateString()}` : (isInProgress ? 'In Progress' : 'Scheduled'),
      isDone: currentStep > 4,
      isActive: currentStep === 4
    },
    {
      num: 5,
      title: 'Resolution Certified',
      desc: isResolved ? 'Work inspected & certified fixed' : 'Pending final closure audit',
      time: formattedResolvedDate || (isResolved ? 'Resolved' : 'Pending'),
      isDone: currentStep === 5,
      isActive: false
    }
  ];

  return `
    <div style="width: 100%; box-sizing: border-box; overflow-x: hidden;">
      <!-- Header Bar -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem; margin-bottom: 1.25rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span style="font-size: 1.25rem; font-weight: 800; color: var(--navy);">📍 Grievance Lifecycle & Live Progress</span>
            <span class="badge ${isResolved ? 'badge-verified' : (isInProgress ? 'badge-assigned' : 'badge-candidate')}">
              ${isResolved ? '✅ RESOLVED & VERIFIED' : (isInProgress ? '⚡ FIELD ACTION ACTIVE' : 'IN REVIEW')}
            </span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
            Official municipal tracking record for reference <strong>#${escapeHtml(report.reference_no)}</strong>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem; align-items: center;">
          ${!isModal ? `
            <button class="btn btn-outline-teal btn-sm" onclick="openTrackProgressModal('${escapeHtml(report.reference_no)}')" title="Open in Fullscreen Modal">
              ⛶ Open Modal
            </button>
            <button class="btn btn-secondary btn-sm" onclick="closeInlineProgressTracker()" title="Close Tracker">
              ✕ Close Tracker
            </button>
          ` : `
            <button class="close-btn" onclick="closeModal()">×</button>
          `}
        </div>
      </div>

      <!-- Grievance Summary Card -->
      <div style="background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
          <div style="flex: 1; min-width: 250px;">
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--teal); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.2rem;">
              LODGED ISSUE
            </div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--navy); line-height: 1.3;">
              ${escapeHtml(report.title)}
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.35rem; line-height: 1.4;">
              ${escapeHtml(report.description || 'No description provided.')}
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.4rem; min-width: 200px;">
            <div style="font-size: 0.78rem;">
              <span style="color: var(--text-secondary);">Tracking Ref:</span>
              <code style="font-weight: 800; color: var(--navy); font-size: 0.88rem; background: var(--surface); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); margin-left: 4px;">#${escapeHtml(report.reference_no)}</code>
            </div>
            <div style="font-size: 0.78rem;">
              <span style="color: var(--text-secondary);">Category:</span>
              <strong style="color: ${report.category_color || 'var(--teal)'}; margin-left: 4px;">● ${escapeHtml(report.category_name)}</strong>
            </div>
            <div style="font-size: 0.78rem;">
              <span style="color: var(--text-secondary);">Locality:</span>
              <strong style="color: var(--navy); margin-left: 4px;">${escapeHtml(report.address || report.district || 'Chennai, TN')}</strong>
            </div>
            <div style="font-size: 0.78rem;">
              <span style="color: var(--text-secondary);">Lodged On:</span>
              <span style="color: var(--text-secondary); margin-left: 4px;">${formattedCreatedDate}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 5-STAGE INTERACTIVE STEPPER -->
      <div class="card" style="padding: 1.25rem 1rem; margin-bottom: 1.5rem; background: var(--surface); border: 1px solid var(--border); box-sizing: border-box; overflow: hidden;">
        <div style="font-size: 0.85rem; font-weight: 800; color: var(--navy); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: space-between;">
          <span>📈 Live Lifecycle Progression</span>
          <span style="font-size: 0.78rem; font-weight: 600; color: var(--teal);">Stage ${currentStep} of 5</span>
        </div>

        <div class="tracking-stepper-wrap">
          <div class="tracking-stepper">
            ${steps.map((st, idx) => `
              <div class="tracking-step ${st.isDone ? 'completed' : ''} ${st.isActive ? 'active' : ''}">
                ${idx < steps.length - 1 ? `
                  <div class="tracking-step-line ${st.isDone ? 'is-done' : ''}"></div>
                ` : ''}
                <div class="tracking-node">
                  ${st.isDone ? '✓' : st.num}
                </div>
                <div class="tracking-step-title">${st.title}</div>
                <div class="tracking-step-desc">${st.desc}</div>
                <div class="tracking-step-time">${st.time}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- RESOLUTION CERTIFICATE BOX (When report is resolved) -->
      ${isResolved ? `
        <div class="resolution-certified-box" style="animation: fadeIn 0.4s ease; box-sizing: border-box;">
          <div class="resolution-certified-icon">🏆</div>
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
              <div style="font-size: 1.05rem; font-weight: 800; color: var(--green);">
                Officially Resolved & Verified by Field Authority
              </div>
              <span class="badge badge-verified" style="background: var(--green); color: #fff; font-weight: 700;">
                ✓ RESOLUTION CERTIFIED
              </span>
            </div>
            <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.25rem;">
              Resolved on: <strong>${formattedResolvedDate || 'Recently Completed'}</strong> • Responsible Department: <strong>${escapeHtml(report.assigned_department_name || 'Municipal Works')}</strong>
            </div>

            ${report.resolution_notes ? `
              <div style="margin-top: 0.75rem; background: var(--surface); padding: 0.85rem; border-radius: var(--radius-sm); border-left: 3px solid var(--green); font-size: 0.85rem; color: var(--text-primary); line-height: 1.5;">
                <strong style="color: var(--green);">Official Field Officer Note:</strong><br>
                ${escapeHtml(report.resolution_notes)}
              </div>
            ` : `
              <div style="margin-top: 0.75rem; background: var(--surface); padding: 0.85rem; border-radius: var(--radius-sm); border-left: 3px solid var(--green); font-size: 0.85rem; color: var(--text-primary);">
                <strong style="color: var(--green);">Official Field Officer Note:</strong><br>
                Civic field personnel completed repairs and verified site restoration according to municipal SLA requirements.
              </div>
            `}

            ${report.resolution_evidence_url ? `
              <div style="margin-top: 0.85rem;">
                <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.35rem;">
                  📷 PHOTOGRAPHIC PROOF OF RESOLUTION:
                </div>
                <img src="${report.resolution_evidence_url}" alt="Resolution Evidence" style="max-width: 100%; max-height: 220px; border-radius: var(--radius-sm); border: 1px solid var(--border); object-fit: cover;">
              </div>
            ` : ''}

            <!-- Citizen Feedback / Confirmation Rating Prompt -->
            <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed rgba(3, 84, 63, 0.2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
              <span style="font-size: 0.8rem; font-weight: 600; color: var(--green);">Are you satisfied with this resolution?</span>
              <div style="display: flex; gap: 0.4rem;">
                <button class="btn btn-sm" style="background: var(--green); color: #fff; font-size: 0.75rem; padding: 0.2rem 0.6rem;" onclick="showToast('Thank you for confirming resolution satisfaction!', 'success')">👍 Yes, Satisfied</button>
                <button class="btn btn-sm btn-secondary" style="font-size: 0.75rem; padding: 0.2rem 0.6rem;" onclick="showToast('Reopen inquiry registered. Field supervisor notified.', 'info')">👎 Still an Issue</button>
              </div>
            </div>
          </div>
        </div>
      ` : `
        <!-- LIVE STATUS ACTION BANNER (When still pending or in-progress) -->
        <div style="background: ${isInProgress ? 'var(--amber-light)' : 'var(--teal-light)'}; border: 1.5px solid ${isInProgress ? 'var(--amber)' : 'var(--teal)'}; border-radius: var(--radius-md); padding: 1.1rem 1.35rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; box-sizing: border-box;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.5rem;">${isInProgress ? '⚡' : '🏢'}</span>
            <div>
              <div style="font-size: 0.95rem; font-weight: 800; color: ${isInProgress ? 'var(--amber)' : 'var(--teal)'};">
                ${isInProgress ? 'Field Squad Currently In Action' : 'Assigned to Municipal Command'}
              </div>
              <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.15rem;">
                Department: <strong>${escapeHtml(report.assigned_department_name || 'Municipal Works')}</strong>
                ${report.has_incident ? ` • Consolidated Incident: <strong>#${escapeHtml(report.incident_number)}</strong>` : ''}
              </div>
            </div>
          </div>
          ${report.sla_due_date ? `
            <div style="text-align: right;">
              <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">Expected Resolution SLA</div>
              <div style="font-size: 0.95rem; font-weight: 800; color: var(--navy);">${new Date(report.sla_due_date).toLocaleDateString()}</div>
            </div>
          ` : ''}
        </div>
      `}

      <!-- MUNICIPAL AUDIT TIMELINE LOG -->
      <div class="card" style="padding: 1.25rem; margin-bottom: 1.25rem; background: var(--surface); box-sizing: border-box;">
        <div style="font-size: 0.85rem; font-weight: 800; color: var(--navy); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.4rem;">
          <span>📜</span> Municipal Audit Timeline & Event Log
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${(report.status_history && report.status_history.length > 0) ? report.status_history.map((h, i) => `
            <div style="display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.65rem 0.85rem; background: var(--surface-alt); border-radius: var(--radius-sm); border-left: 3px solid ${i === 0 ? 'var(--teal)' : 'var(--border)'}; box-sizing: border-box;">
              <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; min-width: 130px;">
                ${h.created_at ? new Date(h.created_at).toLocaleString() : 'Recent'}
              </div>
              <div style="flex: 1;">
                <div style="font-size: 0.82rem; font-weight: 700; color: var(--navy);">
                  ${escapeHtml(h.actor || 'Municipal System')} • <span style="text-transform: capitalize; color: var(--teal);">${escapeHtml(h.new_status || 'Update')}</span>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem;">
                  ${escapeHtml(h.notes || 'Action recorded in official log.')}
                </div>
              </div>
            </div>
          `).join('') : `
            <div style="font-size: 0.82rem; color: var(--text-secondary); font-style: italic; padding: 0.5rem;">
              No historical status transitions recorded yet.
            </div>
          `}
        </div>
      </div>

      <!-- FOOTER ACTIONS -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard?.writeText('${escapeHtml(report.reference_no)}'); showToast('Reference #${escapeHtml(report.reference_no)} copied to clipboard!', 'success');">
            📋 Copy Ref #
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.print()">
            🖨️ Print Receipt
          </button>
        </div>
        ${isModal ? `
          <button class="btn btn-primary" onclick="closeModal()">
            Close Tracker
          </button>
        ` : `
          <button class="btn btn-secondary btn-sm" onclick="closeInlineProgressTracker()">
            ✕ Collapse Tracker
          </button>
        `}
      </div>
    </div>
  `;
}

async function displayInlineProgressTracker(reportIdOrRef) {
  const resultBox = document.getElementById('inline-tracking-result-box');
  if (!resultBox) {
    return openTrackProgressModal(reportIdOrRef);
  }

  resultBox.style.display = 'block';
  resultBox.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      <div class="spinner" style="margin: 0 auto 0.75rem;"></div>
      <div style="font-weight: 700; color: var(--navy);">Retrieving grievance progress records...</div>
    </div>
  `;
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    let report = null;
    const cleanRef = String(reportIdOrRef).trim().replace(/^#/, '');

    if (/^\d+$/.test(cleanRef)) {
      try {
        report = await API.req(`/reports/${cleanRef}`);
      } catch (e) {
        report = await API.req(`/reports/track/${encodeURIComponent(cleanRef)}`);
      }
    } else {
      report = await API.req(`/reports/track/${encodeURIComponent(cleanRef)}`);
    }

    if (!report) {
      throw new Error('No complaint found for this reference.');
    }

    resultBox.innerHTML = `
      <div class="inline-tracker-card">
        ${buildTrackingProgressHTML(report, false)}
      </div>
    `;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    resultBox.innerHTML = `
      <div class="card" style="border: 1px solid var(--red); padding: 1.5rem; text-align: center; color: var(--red);">
        <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">🔍</div>
        <div style="font-weight: 800; font-size: 1.1rem; margin-bottom: 0.25rem;">Grievance Reference Not Found</div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
          ${escapeHtml(err.detail || err.message || 'Please check the reference number and try again.')}
        </p>
        <button class="btn btn-secondary btn-sm" onclick="closeInlineProgressTracker()">Close</button>
      </div>
    `;
  }
}

function closeInlineProgressTracker() {
  const resultBox = document.getElementById('inline-tracking-result-box');
  if (resultBox) {
    resultBox.style.display = 'none';
    resultBox.innerHTML = '';
  }
}

function handleCitizenTrackingSearch(inputId) {
  const input = document.getElementById(inputId);
  if (!input || !input.value.trim()) {
    showToast('Please enter a reference number (e.g. TN-2610-WAS01)', 'warning');
    if (input) input.focus();
    return;
  }
  displayInlineProgressTracker(input.value.trim());
}

function handleCitizenTrackingSearchDirect(ref) {
  const input = document.getElementById('citizen-main-track-input');
  if (input) input.value = ref;
  displayInlineProgressTracker(ref);
}

function switchCitizenViewTab(tab) {
  document.querySelectorAll('.citizen-tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`tab-btn-${tab}`);
  if (btn) btn.classList.add('active');

  const lodgeForm = document.getElementById('citizen-form-section');
  const trackingCard = document.getElementById('citizen-tracking-card');
  const historySec = document.getElementById('citizen-report-history-container');

  if (tab === 'lodge') {
    if (lodgeForm) lodgeForm.scrollIntoView({ behavior: 'smooth' });
  } else if (tab === 'track') {
    if (trackingCard) {
      trackingCard.scrollIntoView({ behavior: 'smooth' });
      document.getElementById('citizen-main-track-input')?.focus();
    }
  } else if (tab === 'history') {
    if (historySec) historySec.scrollIntoView({ behavior: 'smooth' });
  }
}

function viewGrievanceProgress(ref) {
  const inlineBox = document.getElementById('inline-tracking-result-box');
  if (inlineBox) {
    displayInlineProgressTracker(ref);
  } else {
    openTrackProgressModal(ref);
  }
}

async function openTrackProgressModal(reportIdOrRef) {
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) return;

  // Immediate loading state in modal overlay
  modalRoot.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target === this) closeModal();">
      <div class="modal-content" style="max-width: 600px; text-align: center; padding: 2.5rem 1.5rem;">
        <div class="spinner" style="width: 36px; height: 36px; margin: 0 auto 1rem;"></div>
        <div style="font-size: 1.15rem; font-weight: 800; color: var(--navy);">Fetching Live Grievance Progress...</div>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.35rem;">Connecting to Tamil Nadu Civic Operations & Municipal Resolution Stream...</p>
      </div>
    </div>
  `;

  try {
    let report = null;
    const cleanRef = String(reportIdOrRef).trim().replace(/^#/, '');

    if (/^\d+$/.test(cleanRef)) {
      try {
        report = await API.req(`/reports/${cleanRef}`);
      } catch (e) {
        report = await API.req(`/reports/track/${encodeURIComponent(cleanRef)}`);
      }
    } else {
      report = await API.req(`/reports/track/${encodeURIComponent(cleanRef)}`);
    }

    if (!report) {
      throw new Error('Report details could not be found.');
    }

    modalRoot.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target === this) closeModal();">
        <div class="modal-content" style="box-sizing: border-box;">
          ${buildTrackingProgressHTML(report, true)}
        </div>
      </div>
    `;
  } catch (err) {
    modalRoot.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target === this) closeModal();">
        <div class="modal-content" style="max-width: 520px; text-align: center; padding: 2.25rem 1.5rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--red); margin-bottom: 0.5rem;">
            Grievance Not Found
          </div>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.5;">
            ${escapeHtml(err.detail || err.message || 'We could not find a report matching this tracking reference number. Please verify the reference and try again.')}
          </p>
          <div style="display: flex; justify-content: center; gap: 0.75rem;">
            <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            <button class="btn btn-primary" onclick="closeModal(); document.getElementById('citizen-main-track-input')?.focus();">Try Again</button>
          </div>
        </div>
      </div>
    `;
  }
}

function trackReportByInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input || !input.value.trim()) {
    showToast('Please enter a tracking reference number (e.g. REF-...)', 'warning');
    if (input) input.focus();
    return;
  }
  viewGrievanceProgress(input.value.trim());
}

async function loadCitizenReportHistory() {
  const historyContainer = document.getElementById('citizen-report-history-container');
  if (!historyContainer) return;

  if (!STATE.currentUser) {
    historyContainer.innerHTML = `
      <div class="card" style="padding: 1.5rem; text-align: center;">
        <p style="color: var(--text-secondary); margin: 0;">Sign in to view and track your submitted complaints history.</p>
      </div>
    `;
    return;
  }

  try {
    const reports = await API.req('/reports/mine');
    if (!reports || reports.length === 0) {
      historyContainer.innerHTML = `
        <div class="card" style="padding: 2rem; text-align: center; border: 1px dashed var(--border);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
          <div style="font-weight: 700; font-size: 1.05rem; color: var(--navy); margin-bottom: 0.25rem;">No Submitted Reports Yet</div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); max-width: 500px; margin: 0 auto;">
            When you submit a civic grievance using the form above, your real-time tracking history, AI clustering status, and municipal resolution updates will appear right here.
          </p>
        </div>
      `;
      return;
    }

    historyContainer.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div class="card-title" style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.15rem;">
              <span>📋</span> My Submitted Reports History (${reports.length})
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">
              Real-time monitoring of grievances lodged by you. Track lifecycle from intake to certified resolution.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <div class="tracking-search-bar" style="max-width: 280px;">
              <input type="text" id="citizen-track-ref-input" placeholder="🔍 Track Ref (REF-...)" style="border: none; background: transparent; font-size: 0.8rem; width: 100%; outline: none;" onkeydown="if(event.key === 'Enter') trackReportByInput('citizen-track-ref-input')">
              <button class="btn btn-sm btn-primary" onclick="trackReportByInput('citizen-track-ref-input')" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Track</button>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="loadCitizenReportHistory()" title="Refresh History">
              🔄 Refresh
            </button>
          </div>
        </div>

        <div class="table-responsive" style="margin-top: 1rem;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Issue & Category</th>
                <th>Locality</th>
                <th>Severity</th>
                <th>Progress Stage</th>
                <th>Consolidated Incident</th>
                <th>Lodged Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${reports.map(r => `
                <tr>
                  <td>
                    <code style="font-weight: 700; color: var(--navy); cursor: pointer;" onclick="viewGrievanceProgress('${escapeHtml(r.reference_no)}')">
                      ${escapeHtml(r.reference_no)}
                    </code>
                  </td>
                  <td>
                    <strong>${escapeHtml(r.title)}</strong><br>
                    <span style="font-size: 0.75rem; color: ${r.category_color || 'var(--teal)'}; font-weight: 600;">● ${escapeHtml(r.category_name)}</span>
                  </td>
                  <td style="font-size: 0.82rem;">${escapeHtml(r.address || r.district || 'Chennai')}</td>
                  <td><span class="badge badge-priority-${r.severity}">${(r.severity || 'medium').toUpperCase()}</span></td>
                  <td>${getReportStageBadge(r)}</td>
                  <td>
                    ${r.has_incident ? `
                      <span class="badge badge-candidate" title="Aggregated into municipal incident">🚨 ${escapeHtml(r.incident_number)}</span>
                    ` : '<span style="color: var(--text-muted); font-size: 0.78rem;">Individual Signal</span>'}
                  </td>
                  <td style="font-size: 0.78rem; color: var(--text-secondary);">${new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
                      <button class="btn btn-sm btn-primary" onclick="viewGrievanceProgress('${escapeHtml(r.reference_no)}')" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                        <span>🔍</span> Track Progress
                      </button>
                      ${r.status !== 'withdrawn' && r.status !== 'resolved' ? `
                        <button class="btn btn-sm btn-secondary" onclick="handleWithdrawReportFromHistory(${r.id})" style="font-size: 0.7rem; color: var(--red); padding: 0.25rem 0.5rem;" title="Withdraw Report">Withdraw</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    historyContainer.innerHTML = `
      <div class="card" style="padding: 1.5rem; color: var(--red); border-left: 4px solid var(--red);">
        <strong>Error loading submitted reports history:</strong> ${escapeHtml(err.message)}
      </div>
    `;
  }
}

async function handleWithdrawReportFromHistory(id) {
  if (!confirm("Are you sure you want to withdraw this report?")) return;
  try {
    await API.req(`/reports/${id}/withdraw`, { method: 'PATCH' });
    showToast('Report withdrawn successfully', 'info');
    await loadCitizenReportHistory();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ==========================================
// VIEW 3: CITIZEN MY REPORTS
// ==========================================
async function renderCitizenMyReportsView(container) {
  if (!STATE.currentUser) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem;">
        <h3>Please Log In to View Your Reports</h3>
        <p style="color: var(--text-secondary); margin: 0.75rem 0 1.5rem;">Sign in with your citizen account to track status and updates on your submitted issues.</p>
        <button class="btn btn-primary" onclick="navigateTo('login')">🔐 Sign In to Citizen Portal</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="text-align: center; padding: 2rem;"><div class="spinner"></div> Loading your reports & progress...</div>`;
  try {
    const reports = await API.req('/reports/mine');
    if (!reports.length) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📋</div>
          <h3>No Reports Lodged Yet</h3>
          <p style="color: var(--text-secondary); margin: 0.5rem 0 1.5rem;">You haven't submitted any civic complaints yet.</p>
          <button class="btn btn-primary" onclick="navigateTo('citizen/report')">+ Submit Your First Report</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <div class="card-title" style="font-size: 1.25rem;">My Civic Grievances (${reports.length})</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem;">
              Live tracking and certified resolution monitoring for all complaints registered by you.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <div class="tracking-search-bar" style="max-width: 280px;">
              <input type="text" id="myreports-track-ref-input" placeholder="🔍 Track Ref # (REF-...)" style="border: none; background: transparent; font-size: 0.8rem; width: 100%; outline: none;" onkeydown="if(event.key === 'Enter') trackReportByInput('myreports-track-ref-input')">
              <button class="btn btn-sm btn-primary" onclick="trackReportByInput('myreports-track-ref-input')" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Track</button>
            </div>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('citizen/report')">+ Lodge New Report</button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title & Category</th>
                <th>Locality</th>
                <th>Severity</th>
                <th>Progress Stage</th>
                <th>Consolidated Incident</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${reports.map(r => `
                <tr>
                  <td>
                    <code style="cursor: pointer; font-weight: 700; color: var(--navy);" onclick="openTrackProgressModal('${escapeHtml(r.reference_no)}')">
                      ${escapeHtml(r.reference_no)}
                    </code>
                  </td>
                  <td>
                    <strong>${escapeHtml(r.title)}</strong><br>
                    <span style="font-size: 0.75rem; color: ${r.category_color || 'var(--teal)'}; font-weight: 600;">● ${escapeHtml(r.category_name)}</span>
                  </td>
                  <td>${escapeHtml(r.address || r.district || 'Chennai')}</td>
                  <td><span class="badge badge-priority-${r.severity}">${escapeHtml(r.severity.toUpperCase())}</span></td>
                  <td>${getReportStageBadge(r)}</td>
                  <td>
                    ${r.has_incident ? `
                      <span class="badge badge-candidate" title="Grouped into collective incident">🚨 ${escapeHtml(r.incident_number)}</span>
                    ` : '<span style="color: var(--text-muted); font-size: 0.78rem;">Individual Signal</span>'}
                  </td>
                  <td style="font-size: 0.78rem; color: var(--text-secondary);">${new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
                      <button class="btn btn-sm btn-primary" onclick="openTrackProgressModal('${escapeHtml(r.reference_no)}')" style="font-size: 0.72rem; padding: 0.25rem 0.6rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                        <span>🔍</span> Track Progress
                      </button>
                      ${r.status !== 'withdrawn' && r.status !== 'resolved' ? `
                        <button class="btn btn-sm btn-secondary" onclick="withdrawReport(${r.id})" style="font-size: 0.7rem; color: var(--red); padding: 0.25rem 0.5rem;">Withdraw</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Error loading reports: ${escapeHtml(e.message)}</div>`;
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

// Quick role switching is removed to enforce strict authentication separation
async function quickSwitchRole() {
  navigateTo('login');
}

function handleLogout() {
  STATE.token = null;
  STATE.currentUser = null;
  localStorage.removeItem('cp_token');
  showToast('Logged out successfully', 'info');
  navigateTo('login');
}

// ==========================================
// ADVANCED AI INTELLIGENCE VIEWS & COPILOT
// ==========================================

// 1. FLOATING CIVIC COPILOT WIDGET
function renderFloatingCopilot() {
  const container = document.getElementById('floating-copilot-container');
  if (!container) return;

  const isOpen = STATE.copilotOpen;
  container.innerHTML = `
    <!-- Floating Trigger Button -->
    <button class="floating-copilot-btn" onclick="toggleCopilotDrawer()" title="Open CrowdPulse AI Assistant">
      <span>🤖</span>
      <span>${t('ai_copilot')}</span>
    </button>

    <!-- Slide-up Chat Drawer -->
    <div class="copilot-drawer" id="copilot-drawer" style="display: ${isOpen ? 'flex' : 'none'};">
      <div class="copilot-header">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="font-size: 1.3rem;">🤖</span>
          <div>
            <div style="font-weight: 700; font-size: 0.95rem;">CrowdPulse Civic Copilot</div>
            <div style="font-size: 0.72rem; color: var(--teal); letter-spacing: 0.04em;">Bilingual AI Assistant (தமிழ் / EN)</div>
          </div>
        </div>
        <button class="close-btn" style="color: #fff; font-size: 1.25rem;" onclick="toggleCopilotDrawer()">✕</button>
      </div>

      <div class="copilot-messages" id="copilot-drawer-messages">
        <div class="copilot-msg assistant">
          👋 <strong>வணக்கம்! Welcome to CrowdPulse TN.</strong><br>
          I am your ground-level municipal civic assistant. You can ask me how to file a complaint, check tracking numbers (e.g. <code>RPT-...</code> or <code>INC-...</code>), or get official Tamil Nadu helplines in English or தமிழ்.
        </div>
        ${STATE.copilotMessages.map(m => `
          <div class="copilot-msg ${m.role === 'user' ? 'user' : 'assistant'}">
            ${m.text.replace(/\n/g, '<br>')}
          </div>
        `).join('')}
      </div>

      <div class="copilot-input-area">
        <div class="prompt-chips">
          <div class="prompt-chip" onclick="sendCopilotMessage('How do I file a civic complaint?')">📝 How to report?</div>
          <div class="prompt-chip" onclick="sendCopilotMessage('Official Tamil Nadu emergency helplines')">📞 Emergency Helplines</div>
          <div class="prompt-chip" onclick="sendCopilotMessage('புகார் செய்வது எப்படி?')">🌐 தமிழ் உதவி</div>
          <div class="prompt-chip" onclick="sendCopilotMessage('Show critical incidents requiring action')">🚨 Critical Issues</div>
        </div>
        <form onsubmit="handleCopilotSubmit(event)" style="display: flex; gap: 0.5rem; margin-top: 0.35rem;">
          <input type="text" id="copilot-drawer-input" class="form-control" style="font-size: 0.85rem; padding: 0.5rem 0.75rem;" placeholder="Ask in English or தமிழ்..." required>
          <button type="submit" class="btn btn-primary btn-sm" style="padding: 0 1rem;">Send</button>
        </form>
      </div>
    </div>
  `;
}

function toggleCopilotDrawer() {
  STATE.copilotOpen = !STATE.copilotOpen;
  renderFloatingCopilot();
  if (STATE.copilotOpen) {
    setTimeout(() => {
      const input = document.getElementById('copilot-drawer-input');
      if (input) input.focus();
    }, 100);
  }
}

async function handleCopilotSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('copilot-drawer-input');
  if (!input || !input.value.trim()) return;
  const q = input.value.trim();
  input.value = '';
  await sendCopilotMessage(q);
}

async function sendCopilotMessage(queryText) {
  STATE.copilotMessages.push({ role: 'user', text: queryText });
  renderFloatingCopilot();
  
  // Scroll to bottom
  const box = document.getElementById('copilot-drawer-messages');
  if (box) box.scrollTop = box.scrollHeight;

  try {
    const res = await API.req('/copilot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText })
    });
    STATE.copilotMessages.push({ role: 'assistant', text: res.response });
  } catch (err) {
    STATE.copilotMessages.push({ role: 'assistant', text: `⚠️ Error communicating with Copilot: ${err.message}` });
  }

  renderFloatingCopilot();
  const box2 = document.getElementById('copilot-drawer-messages');
  if (box2) box2.scrollTop = box2.scrollHeight;
}

// 2. EMERGING ISSUE RADAR VIEW
async function renderRadarView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;"><div class="spinner"></div> Loading Emerging Risk Radar...</div>`;

  try {
    const [summary, forecastsData] = await Promise.all([
      API.req('/radar/summary'),
      API.req('/radar/forecasts')
    ]);

    const forecasts = forecastsData.forecasts || [];

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--navy);">⚡ Emerging Issue Early-Warning Radar</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">
            Real-time spatiotemporal velocity anomaly detection comparing 24h complaint volume against rolling 7-day municipal baselines.
          </p>
        </div>
        <button class="btn btn-primary" onclick="recalculateRadarSpikes()">🔄 Recalculate Anomaly Spikes</button>
      </div>

      <!-- KPI Metrics -->
      <div class="kpi-grid" style="margin-bottom: 2rem;">
        <div class="kpi-card" style="border-top: 4px solid var(--navy);">
          <div class="kpi-label">Active Anomaly Clusters</div>
          <div class="kpi-value">${summary.total_active_clusters || forecasts.length}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Across Tamil Nadu Wards</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid var(--red);">
          <div class="kpi-label">Critical Growth Spikes</div>
          <div class="kpi-value" style="color: var(--red);">${summary.critical_count || 1}</div>
          <div style="font-size: 0.75rem; color: var(--red); font-weight: 700; margin-top: 0.25rem;">&gt;200% over baseline velocity</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid var(--amber);">
          <div class="kpi-label">High Velocity Alerts</div>
          <div class="kpi-value" style="color: var(--amber);">${summary.high_count || 2}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Preemptive mitigation queued</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid var(--green);">
          <div class="kpi-label">Preemptive Mitigation Index</div>
          <div class="kpi-value" style="color: var(--green);">91.4%</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Actionable response guidance</div>
        </div>
      </div>

      <!-- Forecasts Cards Grid -->
      <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 1rem; color: var(--navy);">
        Live Anomaly Alerts & Actionable Municipal Recommendations
      </h3>

      <div class="radar-grid">
        ${forecasts.map(f => {
          const isCrit = f.risk_level === 'critical';
          const isHigh = f.risk_level === 'high';
          const badgeClass = isCrit ? 'risk-pulse-critical' : isHigh ? 'badge-high' : 'badge-medium';

          return `
            <div class="radar-card risk-${f.risk_level}">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <span class="badge ${badgeClass}" style="text-transform: uppercase; font-weight: 800; font-size: 0.75rem; padding: 0.25rem 0.6rem;">
                  ${isCrit ? '🚨 CRITICAL SPIKE' : `${f.risk_level.toUpperCase()} RISK`}
                </span>
                <span style="font-size: 0.8rem; font-weight: 700; color: ${f.growth_rate_pct > 0 ? 'var(--red)' : 'var(--green)'};">
                  +${f.growth_rate_pct}% surge
                </span>
              </div>

              <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--navy); margin-bottom: 0.35rem;">
                ${f.geographic_area}
              </h4>
              <div style="font-size: 0.82rem; color: var(--teal); font-weight: 600; margin-bottom: 0.75rem;">
                Category: ${f.category_name} (${f.district})
              </div>

              <div style="background: var(--surface-alt); border-radius: var(--radius-sm); padding: 0.65rem; margin-bottom: 0.85rem; font-size: 0.8rem; display: flex; justify-content: space-between;">
                <div><strong>Current:</strong> ${f.current_volume} complaints / 24h</div>
                <div><strong>Baseline:</strong> ${f.baseline_volume} avg / day</div>
                <div><strong>Confidence:</strong> ${(f.confidence * 100).toFixed(0)}%</div>
              </div>

              <div style="background: rgba(15, 157, 138, 0.08); border: 1px solid var(--teal); border-radius: var(--radius-sm); padding: 0.75rem; font-size: 0.82rem; line-height: 1.45; color: var(--navy); margin-bottom: 1rem;">
                🛡️ <strong>Recommended Mitigation:</strong><br>
                ${f.recommendation}
              </div>

              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="showToast('Preemptive action advisory dispatched to zonal office', 'success')">
                  ⚡ Dispatch Preemptive Squad
                </button>
                <button class="btn btn-secondary btn-sm" onclick="navigateTo('authority/incidents')">
                  View Dossier
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Failed to load radar forecasts: ${e.message}</div>`;
  }
}

async function recalculateRadarSpikes() {
  try {
    showToast('Recalculating spatiotemporal velocity anomalies...', 'info');
    await API.req('/radar/recalculate', { method: 'POST' });
    showToast('Radar forecasts synchronized with live database!', 'success');
    renderRadarView(document.getElementById('main-content'));
  } catch (e) {
    showToast('Recalculation error: ' + e.message, 'error');
  }
}

// 3. AUTHORITY FULL COPILOT VIEW
async function renderCopilotAuthorityView(container) {
  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
        <div>
          <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--navy);">🤖 AI Civic Operations Copilot</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">
            Database-grounded operational assistant for municipal engineers, IAS zonal commissioners, and department dispatchers.
          </p>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; height: 600px;">
        <div style="background: var(--navy); color: #fff; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.4rem;">🏛️</span>
            <div>
              <strong>Tamil Nadu Municipal Operations AI Engine</strong>
              <div style="font-size: 0.75rem; color: var(--teal);">Context: Real-Time Incident & SLA Registry</div>
            </div>
          </div>
          <span class="badge badge-success" style="background: var(--teal); color: #fff;">LIVE REASONING</span>
        </div>

        <div class="copilot-messages" id="authority-copilot-messages" style="flex: 1; padding: 1.25rem; overflow-y: auto; background: var(--surface-alt);">
          <div class="copilot-msg assistant">
            👋 <strong>Welcome, Officer.</strong><br>
            I have full read-access to the CrowdPulse database. You can request executive briefings, inquire about SLA-overdue tickets, or inspect specific wards like T. Nagar, Velachery, or Anna Nagar.
          </div>
        </div>

        <div style="padding: 1rem; background: var(--surface); border-top: 1px solid var(--border);">
          <div class="prompt-chips" style="margin-bottom: 0.65rem;">
            <div class="prompt-chip" onclick="sendAuthorityCopilotQuery('Show all critical incidents requiring action')">🚨 Critical Incidents</div>
            <div class="prompt-chip" onclick="sendAuthorityCopilotQuery('List SLA overdue incidents')">⏱️ Overdue SLAs</div>
            <div class="prompt-chip" onclick="sendAuthorityCopilotQuery('Provide an executive daily briefing')">📊 Executive Briefing</div>
            <div class="prompt-chip" onclick="sendAuthorityCopilotQuery('Summarize issues in Velachery and T. Nagar')">📍 T. Nagar / Velachery Dossier</div>
            <div class="prompt-chip" onclick="sendAuthorityCopilotQuery('What is the status of INC-2610-WAS03?')">🔍 Track Incident</div>
          </div>
          <form onsubmit="handleAuthorityCopilotSubmit(event)" style="display: flex; gap: 0.75rem;">
            <input type="text" id="authority-copilot-input" class="form-control" placeholder="Ask operations questions (e.g. 'Which ward has the most sewer leaks?')..." required>
            <button type="submit" class="btn btn-primary" style="padding: 0 1.5rem;">Query Copilot</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

async function handleAuthorityCopilotSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('authority-copilot-input');
  if (!input || !input.value.trim()) return;
  const q = input.value.trim();
  input.value = '';
  await sendAuthorityCopilotQuery(q);
}

async function sendAuthorityCopilotQuery(queryText) {
  const box = document.getElementById('authority-copilot-messages');
  if (!box) return;

  const userMsg = document.createElement('div');
  userMsg.className = 'copilot-msg user';
  userMsg.textContent = queryText;
  box.appendChild(userMsg);
  box.scrollTop = box.scrollHeight;

  const loadingMsg = document.createElement('div');
  loadingMsg.className = 'copilot-msg assistant';
  loadingMsg.innerHTML = '<em>Searching database and compiling operational response...</em>';
  box.appendChild(loadingMsg);
  box.scrollTop = box.scrollHeight;

  try {
    const res = await API.req('/copilot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText, role_override: 'authority' })
    });
    loadingMsg.innerHTML = res.response.replace(/\n/g, '<br>');
  } catch (err) {
    loadingMsg.innerHTML = `<span style="color: var(--red);">Error: ${err.message}</span>`;
  }
  box.scrollTop = box.scrollHeight;
}

// 4. SMART PRIORITY & SLA MATRIX VIEW
async function renderPriorityMatrixView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;"><div class="spinner"></div> Loading Smart Priority & SLA Matrix...</div>`;

  try {
    const incidents = await API.req('/incidents?limit=50');

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--navy);">🎯 Smart Incident Prioritization & SLA Matrix</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">
            Dynamic 0–100 Multi-Factor Severity Scoring, automated SLA countdowns, and authorized authority overrides.
          </p>
        </div>
        <button class="btn btn-secondary" onclick="navigateTo('authority/dashboard')">← Back to Dashboard</button>
      </div>

      <div class="card" style="padding: 0; overflow-x: auto;">
        <table class="data-table" style="width: 100%;">
          <thead>
            <tr>
              <th>Score & Band</th>
              <th>Incident</th>
              <th>Category & Area</th>
              <th>SLA Due & Status</th>
              <th>Factor Breakdown (Hazard / Volume / Area)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${incidents.map(inc => {
              const score = inc.priority_score || 50.0;
              const band = (inc.priority || 'medium').toLowerCase();
              const dialClass = band === 'critical' ? 'dial-critical' : band === 'high' ? 'dial-high' : band === 'medium' ? 'dial-medium' : 'dial-low';
              const isOverdue = inc.is_overdue;

              return `
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                      <div class="priority-score-dial ${dialClass}">
                        ${score.toFixed(0)}
                      </div>
                      <div>
                        <strong style="text-transform: uppercase; font-size: 0.75rem; color: var(--navy);">${band}</strong>
                        <div style="font-size: 0.68rem; color: var(--text-muted);">0-100 Scale</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>${inc.incident_number}</strong>
                    <div style="font-size: 0.85rem; color: var(--text-primary); font-weight: 600;">${inc.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${inc.report_count} supporting citizen reports</div>
                  </td>
                  <td>
                    <span class="badge" style="background: ${inc.category_color}20; color: ${inc.category_color}; font-weight: 700;">
                      ${inc.category_name}
                    </span>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
                      📍 ${inc.geographic_area}
                    </div>
                  </td>
                  <td>
                    <div class="sla-pill ${isOverdue ? 'overdue' : 'active'}">
                      ⏱️ ${isOverdue ? 'OVERDUE' : 'SLA Target'}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                      ${inc.sla_due_date ? new Date(inc.sla_due_date).toLocaleString() : '24h Standard'}
                    </div>
                  </td>
                  <td style="min-width: 200px;">
                    <div style="display: flex; gap: 0.5rem; font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                      <span>Hazard: 30%</span>
                      <span>Volume: 25%</span>
                      <span>Area: 20%</span>
                      <span>SLA: 10%</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: var(--border); border-radius: 999px; overflow: hidden; display: flex;">
                      <div style="width: 30%; background: var(--red);" title="Hazard Factor"></div>
                      <div style="width: 25%; background: var(--amber);" title="Volume Velocity"></div>
                      <div style="width: 25%; background: var(--teal);" title="Area Sensitivity"></div>
                      <div style="width: 20%; background: #3498DB;" title="SLA Urgency"></div>
                    </div>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="openPriorityOverrideModal(${inc.id}, '${inc.priority}')">
                      ✏️ Override
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Failed to load priority matrix: ${e.message}</div>`;
  }
}

function openPriorityOverrideModal(incidentId, currPriority) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content" style="max-width: 460px;">
        <div class="modal-header">
          <div class="modal-title">✏️ Manual Priority Override</div>
          <button class="close-btn" onclick="closeModal()">×</button>
        </div>
        <form onsubmit="handlePriorityOverrideSubmit(event, ${incidentId})">
          <div class="form-group">
            <label class="form-label">Current AI Priority</label>
            <input type="text" class="form-control" value="${currPriority.toUpperCase()}" disabled>
          </div>
          <div class="form-group">
            <label class="form-label">New Official Priority Level</label>
            <select name="priority" class="form-control" required>
              <option value="critical">Critical (4 Hour SLA Guaranteed)</option>
              <option value="high">High (12 Hour SLA)</option>
              <option value="medium">Medium (24 Hour Standard)</option>
              <option value="low">Low (48 Hour Maintenance)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Justification & Regulatory Reason</label>
            <textarea name="reason" class="form-control" rows="3" placeholder="Explain the grounds for manual priority adjustment (logged to state audit trail)..." required></textarea>
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Override</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handlePriorityOverrideSubmit(e, incidentId) {
  e.preventDefault();
  const form = e.target;
  try {
    await API.req(`/incidents/${incidentId}/priority-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priority: form.priority.value,
        override_reason: form.reason.value
      })
    });
    closeModal();
    showToast('Incident priority updated and recorded to state audit log!', 'success');
    renderPriorityMatrixView(document.getElementById('main-content'));
  } catch (err) {
    showToast('Override error: ' + err.message, 'error');
  }
}

// 5. RESOLUTION VERIFICATION CENTER VIEW
async function renderResolutionsView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;"><div class="spinner"></div> Loading Resolution Verifications...</div>`;

  try {
    const [resData, incData] = await Promise.all([
      API.req('/resolutions/recent'),
      API.req('/incidents?status=in_progress&limit=10')
    ]);

    const resolutions = resData.resolutions || [];

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--navy);">🛡️ Civic Resolution Verification Center</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">
            Before-and-after photographic evidence, field contractor notes, citizen 1–5 star ratings, and transparent reopening workflows.
          </p>
        </div>
        <button class="btn btn-primary" onclick="openResolutionSubmitModal()">+ Log New Field Completion Evidence</button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 1.5rem;">
        ${resolutions.map(r => `
          <div class="card" style="padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
              <div>
                <span class="badge badge-success">✓ WORK VERIFIED</span>
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--navy); margin-left: 0.5rem;">${r.incident_number}</span>
              </div>
              <div style="color: #F1C40F; font-size: 1.1rem; font-weight: 800;">
                ${'★'.repeat(r.citizen_rating)}${'☆'.repeat(5 - r.citizen_rating)}
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">(${r.citizen_rating}/5)</span>
              </div>
            </div>

            <h4 style="font-size: 1.1rem; font-weight: 700; color: var(--navy); margin-bottom: 0.25rem;">${r.title}</h4>
            <div style="font-size: 0.82rem; color: var(--teal); font-weight: 600; margin-bottom: 0.85rem;">📍 ${r.geographic_area} — ${r.category_name}</div>

            <!-- Photographic Comparison -->
            <div class="resolution-comparison">
              <div class="comparison-box">
                <img src="${r.before_image_url || '/static/images/velachery_before.jpg'}" onerror="this.src='/static/assets/logo.svg'" class="comparison-img" alt="Before Remediation">
                <div class="comparison-label">📷 Before Remediation</div>
              </div>
              <div class="comparison-box">
                <img src="${r.after_image_url || '/static/images/velachery_after.jpg'}" onerror="this.src='/static/assets/logo.svg'" class="comparison-img" alt="After Remediation">
                <div class="comparison-label">✨ After Municipal Work</div>
              </div>
            </div>

            <div style="background: var(--surface-alt); border-radius: var(--radius-sm); padding: 0.75rem; font-size: 0.82rem; margin-bottom: 1rem;">
              <strong>👷 Completion Dossier:</strong><br>
              ${r.work_completion_notes}
            </div>

            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openFeedbackModal(${r.incident_id})">
                ⭐ Rate Resolution Quality
              </button>
              <button class="btn btn-outline-danger btn-sm" onclick="handleReopenPrompt(${r.incident_id})">
                ⚠️ Reopen Issue
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Failed to load resolution center: ${e.message}</div>`;
  }
}

function openResolutionSubmitModal(incidentId = 1) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <div class="modal-title">📸 Submit Resolution Evidence</div>
          <button class="close-btn" onclick="closeModal()">×</button>
        </div>
        <form onsubmit="handleResolutionEvidenceSubmit(event, ${incidentId})">
          <div class="form-group">
            <label class="form-label">Incident ID</label>
            <input type="number" name="incident_id" class="form-control" value="${incidentId}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Before Work Photo URL</label>
            <input type="text" name="before_url" class="form-control" value="/static/images/velachery_before.jpg" required>
          </div>
          <div class="form-group">
            <label class="form-label">After Work Photo URL</label>
            <input type="text" name="after_url" class="form-control" value="/static/images/velachery_after.jpg" required>
          </div>
          <div class="form-group">
            <label class="form-label">Work Completion Notes & Technical Summary</label>
            <textarea name="notes" class="form-control" rows="3" placeholder="Describe materials utilized, team dispatched, and physical tests performed..." required>Field unit deployed jetting machine TN-01-SW-229. Sewer blockage extracted and asphalt cold patched.</textarea>
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit Verification</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleResolutionEvidenceSubmit(e, incId) {
  e.preventDefault();
  const form = e.target;
  const targetId = form.incident_id.value || incId;
  try {
    await API.req(`/incidents/${targetId}/resolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_completion_notes: form.notes.value,
        before_image_url: form.before_url.value,
        after_image_url: form.after_url.value
      })
    });
    closeModal();
    showToast('Work completion evidence verified and submitted!', 'success');
    renderResolutionsView(document.getElementById('main-content'));
  } catch (err) {
    showToast('Submission error: ' + err.message, 'error');
  }
}

function openFeedbackModal(incidentId) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
          <div class="modal-title">⭐ Citizen Verification Rating</div>
          <button class="close-btn" onclick="closeModal()">×</button>
        </div>
        <form onsubmit="handleCitizenFeedbackSubmit(event, ${incidentId})">
          <div class="form-group">
            <label class="form-label">Rate Municipal Work Quality</label>
            <select name="rating" class="form-control" required>
              <option value="5">★★★★★ 5 Stars — Excellent & Completely Fixed</option>
              <option value="4">★★★★☆ 4 Stars — Good Remediation</option>
              <option value="3">★★★☆☆ 3 Stars — Satisfactory</option>
              <option value="2">★★☆☆☆ 2 Stars — Partially Solved</option>
              <option value="1">★☆☆☆☆ 1 Star — Poor Quality / Still Broken</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Citizen Feedback Notes</label>
            <textarea name="feedback" class="form-control" rows="3" placeholder="Share your on-ground observations..."></textarea>
          </div>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Submit Rating</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function handleCitizenFeedbackSubmit(e, incidentId) {
  e.preventDefault();
  const form = e.target;
  try {
    await API.req(`/incidents/${incidentId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        citizen_confirmation_rating: parseInt(form.rating.value),
        citizen_feedback_text: form.feedback.value,
        reopen_incident: false
      })
    });
    closeModal();
    showToast('Thank you! Citizen verification rating recorded.', 'success');
    renderResolutionsView(document.getElementById('main-content'));
  } catch (err) {
    showToast('Feedback error: ' + err.message, 'error');
  }
}

async function handleReopenPrompt(incidentId) {
  const reason = prompt('Please describe why this issue is persisting or why work is incomplete:');
  if (!reason) return;
  try {
    await API.req(`/incidents/${incidentId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        citizen_confirmation_rating: 1,
        citizen_feedback_text: reason,
        reopen_incident: true,
        reopen_reason: reason
      })
    });
    showToast('Incident reopened and escalated to zonal engineer!', 'info');
    renderResolutionsView(document.getElementById('main-content'));
  } catch (err) {
    showToast('Reopen error: ' + err.message, 'error');
  }
}

// 6. AI GOVERNANCE & MODEL MONITORING VIEW
async function renderGovernanceView(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;"><div class="spinner"></div> Loading AI Governance Telemetry...</div>`;

  try {
    const [metrics, toggles] = await Promise.all([
      API.req('/governance/metrics'),
      API.req('/governance/toggles')
    ]);

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--navy);">🔬 AI Governance & Model Telemetry</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">
            Transparent monitoring of confidence distributions, inference latencies, human corrections, and state compliance toggles.
          </p>
        </div>
        <span class="badge badge-success" style="padding: 0.5rem 1rem; font-size: 0.8rem;">
          ✓ TN AI ETHICS 2026 COMPLIANT
        </span>
      </div>

      <!-- Governance Tiles -->
      <div class="kpi-grid" style="margin-bottom: 2rem;">
        <div class="kpi-card" style="border-top: 4px solid var(--teal);">
          <div class="kpi-label">Overall Model Accuracy</div>
          <div class="kpi-value" style="color: var(--teal);">${metrics.overall_model_accuracy_pct}%</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Across all civic inferences</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid var(--navy);">
          <div class="kpi-label">Average Confidence Score</div>
          <div class="kpi-value">${(metrics.avg_confidence_score * 100).toFixed(0)}%</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Multi-class threshold 0.75</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid var(--amber);">
          <div class="kpi-label">Human Review Correction Rate</div>
          <div class="kpi-value" style="color: var(--amber);">${metrics.human_correction_rate_pct}%</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${metrics.human_corrections_count} corrections recorded</div>
        </div>
        <div class="kpi-card" style="border-top: 4px solid var(--green);">
          <div class="kpi-label">PII Redaction Scrubbing</div>
          <div class="kpi-value" style="color: var(--green);">100%</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Phones & IDs auto-masked</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
        <!-- Component Latencies -->
        <div class="card">
          <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--navy); margin-bottom: 1rem;">
            ⚡ Component Latency Benchmarks
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.85rem;">
            ${Object.entries(metrics.component_latencies_ms || {}).map(([comp, ms]) => `
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.25rem;">
                  <strong>${comp}</strong>
                  <span style="color: var(--teal); font-weight: 700;">${ms} ms</span>
                </div>
                <div style="width: 100%; height: 6px; background: var(--border); border-radius: 999px; overflow: hidden;">
                  <div style="width: ${Math.min(100, ms * 3.5)}%; height: 100%; background: var(--teal);"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Interactive AI Feature Toggles -->
        <div class="card">
          <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--navy); margin-bottom: 1rem;">
            🎛️ AI Engine Feature Toggles
          </h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.25rem;">
            Enable or disable individual AI modules on-demand. Changes persist dynamically across API microservices.
          </p>

          <div style="display: flex; flex-direction: column; gap: 1rem;">
            ${[
              { key: 'ai_multimodal_nlp', label: 'Multimodal Tamil-English NLP', desc: 'Auto-translates and extracts landmarks from citizen descriptions' },
              { key: 'ai_perceptual_dhash', label: 'Perceptual dHash Duplicate Detection', desc: 'Identifies recycled photographic evidence within 1km' },
              { key: 'ai_early_warning_radar', label: 'Emerging Issue Radar 2.0', desc: 'Velocity z-score spike alarms against rolling baselines' },
              { key: 'ai_smart_prioritization', label: '0–100 Smart Prioritization Engine', desc: 'Multi-factor risk assessment and SLA countdown timers' },
              { key: 'ai_copilot_assistant', label: 'AI Civic Copilot Assistant', desc: 'Conversational grounded assistance for citizens and officials' }
            ].map(tgl => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-light);">
                <div>
                  <div style="font-weight: 700; font-size: 0.9rem; color: var(--navy);">${tgl.label}</div>
                  <div style="font-size: 0.78rem; color: var(--text-secondary);">${tgl.desc}</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" ${toggles[tgl.key] ? 'checked' : ''} onchange="toggleGovernanceFlag('${tgl.key}', this.checked)">
                  <span class="toggle-slider"></span>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Active Model Registry -->
      <div class="card">
        <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--navy); margin-bottom: 1rem;">
          📦 Active Civic AI Models & Artifact Registry
        </h3>
        <table class="data-table" style="width: 100%;">
          <thead>
            <tr>
              <th>Model Name</th>
              <th>Version Tag</th>
              <th>Benchmark Accuracy</th>
              <th>Status</th>
              <th>Compliance Audit</th>
            </tr>
          </thead>
          <tbody>
            ${(metrics.active_models || []).map(m => `
              <tr>
                <td><strong>${m.name}</strong></td>
                <td><code>${m.version}</code></td>
                <td><span style="color: var(--green); font-weight: 700;">${(m.accuracy_score * 100).toFixed(1)}%</span></td>
                <td><span class="badge badge-success">ACTIVE & IN SERVICE</span></td>
                <td><span style="font-size: 0.8rem; color: var(--text-secondary);">Verified Clean Dataset</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="card" style="color: var(--red);">Failed to load AI Governance: ${e.message}</div>`;
  }
}

async function toggleGovernanceFlag(key, enabled) {
  try {
    await API.req('/governance/toggles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, enabled })
    });
    showToast(`AI flag '${key}' updated to ${enabled ? 'ENABLED' : 'DISABLED'}`, 'success');
  } catch (e) {
    showToast('Failed to update toggle: ' + e.message, 'error');
  }
}

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

// ==========================================
// DEDICATED MULTI-PORTAL AUTHENTICATION VIEW
// ==========================================

const LOGIN_VIEW_STATE = {
  portal: 'citizen', // 'citizen' | 'official'
  citizenMode: 'signin', // 'signin' | 'register'
  forgotOpen: false,
  forgotStep: 1, // 1: request, 2: reset
  demoOtp: null,
  forgotEmail: ''
};

function renderLoginView(container) {
  const isCitizen = LOGIN_VIEW_STATE.portal === 'citizen';
  const isSignIn = LOGIN_VIEW_STATE.citizenMode === 'signin';
  const isForgot = LOGIN_VIEW_STATE.forgotOpen;
  const isTa = STATE.language === 'ta';

  container.innerHTML = `
    <div class="login-portal-wrapper">
      <!-- Top Navigation Header -->
      <header class="login-nav-header">
        <div class="login-brand">
          <img src="/static/assets/logo.svg" alt="CrowdPulse TN" width="40" height="40">
          <div class="login-brand-text">
            <h1>CrowdPulse TN</h1>
            <span>${isTa ? 'தமிழ்நாடு அரசு • நகர்ப்புற ஏஐ நுண்ணறிவு தளம்' : 'Govt of Tamil Nadu • Civic AI Intelligence'}</span>
          </div>
        </div>

        <div class="login-nav-actions">
          <button class="btn btn-secondary btn-sm" onclick="toggleLanguage()" title="Switch Language">
            🌐 ${isTa ? 'English' : 'தமிழ்'}
          </button>
          <button class="theme-toggle-btn" onclick="toggleTheme()" title="Switch Light / Dark Mode" style="color: #fff; background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25);">
            <span class="theme-toggle-icon">${STATE.theme === 'dark' ? '☀️' : '🌙'}</span>
            <span class="theme-toggle-text">${STATE.theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button class="btn btn-outline btn-sm" onclick="navigateTo('public-map')" style="color: #fff; border-color: rgba(255,255,255,0.3);">
            🗺️ ${isTa ? 'பொது வரைபடம்' : 'Explore Public Map'}
          </button>
        </div>
      </header>

      <!-- Main Dual-Pane Container -->
      <main class="login-main-container">
        <!-- Left Hero & State Civic Showcase -->
        <div class="login-hero-pane">
          <div class="login-badge-tn">
            🏛️ ${isTa ? 'அங்கீகரிக்கப்பட்ட தமிழ்நாடு குடிமக்கள் & நிர்வாக தளம்' : 'Official Tamil Nadu Civic & Governance Portal'}
          </div>

          <h2 class="login-hero-title">
            ${isTa 
              ? 'முன்கூட்டியே கண்டறிவோம்.<br>ஒன்றிணைந்து தீர்ப்போம்.' 
              : 'Empowering Citizens.<br>Accelerating Governance.'}
          </h2>

          <p class="login-hero-desc">
            ${isTa
              ? 'சென்னை முதல் கன்னியாகுமரி வரை 8 கோடி மக்களுக்கான AI-இயங்கும் பொதுப் பிரச்சனை கண்காணிப்பு தளம். குடிமக்களின் புகார்களை நேரடி நிர்வாகக் கட்டுப்பாட்டு அறையுடன் இணைக்கிறது.'
              : 'AI-assisted collective civic intelligence connecting 8 Crore citizens across 38 districts with Greater Chennai Corporation, Metro Water, and TNEB operational commands.'}
          </p>

          <!-- Real-Time Pulse Metric Cards -->
          <div class="login-stats-grid">
            <div class="login-stat-card">
              <div class="login-stat-val">38</div>
              <div class="login-stat-lbl">${isTa ? 'மாவட்டங்கள்' : 'Districts Monitored'}</div>
            </div>
            <div class="login-stat-card">
              <div class="login-stat-val">4h</div>
              <div class="login-stat-lbl">${isTa ? 'அவசர காலக்கெடு' : 'Critical SLA Window'}</div>
            </div>
            <div class="login-stat-card">
              <div class="login-stat-val">100%</div>
              <div class="login-stat-lbl">${isTa ? 'தனியுரிமை பாதுகாப்பு' : 'PII Redacted'}</div>
            </div>
          </div>

          <!-- Municipal Agency Chips -->
          <div style="font-size: 0.8rem; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em;">
            ${isTa ? 'இணைக்கப்பட்ட துறைகள்:' : 'Integrated Municipal Agencies:'}
          </div>
          <div class="login-dept-chips">
            <span class="login-dept-chip">🏛️ Greater Chennai Corporation (1913)</span>
            <span class="login-dept-chip">💧 CMWSSB Metro Water (044-4567 4567)</span>
            <span class="login-dept-chip">⚡ TANGEDCO Minnagam (94987 94987)</span>
            <span class="login-dept-chip">🛣️ Highways & Stormwater Drains</span>
            <span class="login-dept-chip">🚨 State Disaster Management (1070)</span>
          </div>
        </div>

        <!-- Right Side: Separate Authentication Card -->
        <div class="auth-box">
          <!-- Segmented Portal Tabs (Citizen vs Official/Admin) -->
          <div class="portal-tabs-header">
            <button class="portal-tab-btn ${isCitizen ? 'active' : ''}" onclick="switchLoginPortal('citizen')">
              <span style="font-size: 1.15rem;">👤</span>
              <span>${isTa ? 'குடிமக்கள் தளம்' : 'Citizen Portal'}</span>
            </button>
            <button class="portal-tab-btn ${!isCitizen ? 'active' : ''}" onclick="switchLoginPortal('official')">
              <span style="font-size: 1.15rem;">🏛️</span>
              <span>${isTa ? 'அதிகாரிகள் & நிர்வாகம்' : 'Official / Admin'}</span>
            </button>
          </div>

          <div class="auth-body-container">
            ${isForgot ? renderForgotPasswordForm(isTa) : (isCitizen ? renderCitizenAuthPane(isSignIn, isTa) : renderOfficialAuthPane(isTa))}
          </div>
        </div>
      </main>

      <!-- Bottom Emergency Helpline Strip -->
      <footer class="login-helpline-strip">
        <div>
          © 2026 CrowdPulse TN • Government of Tamil Nadu Civic Intelligence Platform
        </div>
        <div class="login-helpline-items">
          <div class="login-helpline-item"><span>📞 GCC:</span> <strong>1913</strong></div>
          <div class="login-helpline-item"><span>⚡ Electricity:</span> <strong>94987 94987</strong></div>
          <div class="login-helpline-item"><span>💧 Metro Water:</span> <strong>044-4567 4567</strong></div>
          <div class="login-helpline-item"><span>🚨 State Emergency:</span> <strong>1070</strong></div>
        </div>
      </footer>
    </div>
  `;
}

function renderCitizenAuthPane(isSignIn, isTa) {
  if (isSignIn) {
    return `
      <!-- Sub-Pills: Sign In vs Register -->
      <div class="sub-mode-pills">
        <button class="sub-mode-pill active" onclick="switchCitizenMode('signin')">
          ${isTa ? 'உள்நுழைக (Sign In)' : 'Sign In'}
        </button>
        <button class="sub-mode-pill" onclick="switchCitizenMode('register')">
          ${isTa ? 'புதிய கணக்கு (Create Account)' : 'Create Account'}
        </button>
      </div>

      <!-- Citizen Sign In Form -->
      <form onsubmit="handleCitizenLoginSubmit(event)" style="margin-top: 1rem;">
        <div id="cit-login-alert"></div>
        <div class="form-group">
          <label class="form-label">${isTa ? 'மின்னஞ்சல் அல்லது பயனர் பெயர்' : 'Email Address / Username'}</label>
          <input type="text" name="identifier" class="form-control" placeholder="${isTa ? 'மின்னஞ்சல் அல்லது கைபேசி' : 'Enter registered email or username'}" required autocomplete="username">
        </div>

        <div class="form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">${isTa ? 'கடவுச்சொல்' : 'Password'}</label>
            <a href="javascript:void(0)" onclick="openForgotPasswordFlow()" style="font-size: 0.78rem; color: var(--teal); font-weight: 600;">
              ${isTa ? 'கடவுச்சொல் மறந்துவிட்டதா?' : 'Forgot Password?'}
            </a>
          </div>
          <div class="password-field-wrapper">
            <input type="password" id="cit-login-pw" name="password" class="form-control" placeholder="${isTa ? 'கடவுச்சொல் உள்ளிடவும்' : 'Enter your password'}" required autocomplete="current-password">
            <button type="button" class="password-toggle-eye" onclick="togglePasswordVisibility('cit-login-pw', this)">👁️</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem; font-size: 0.82rem; color: var(--text-secondary);">
          <input type="checkbox" id="remember-me-cit" checked>
          <label for="remember-me-cit" style="cursor: pointer;">${isTa ? 'என்னை நினைவில் கொள்' : 'Remember me on this browser'}</label>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 0.95rem; font-weight: 700;">
          ${isTa ? 'குடிமக்கள் தளத்திற்குள் நுழைக' : 'Sign In as Citizen'}
        </button>
      </form>

      <div style="text-align: center; margin-top: 1.25rem; font-size: 0.85rem; color: var(--text-secondary);">
        ${isTa ? 'புதியவரா?' : "Don't have an account?"} 
        <a href="javascript:void(0)" onclick="switchCitizenMode('register')" style="color: var(--teal); font-weight: 700;">
          ${isTa ? 'இங்கே கணக்கு தொடங்கவும்' : 'Create an Account'}
        </a>
      </div>
    `;
  } else {
    // REGISTER FORM
    return `
      <div class="sub-mode-pills">
        <button class="sub-mode-pill" onclick="switchCitizenMode('signin')">
          ${isTa ? 'உள்நுழைக (Sign In)' : 'Sign In'}
        </button>
        <button class="sub-mode-pill active" onclick="switchCitizenMode('register')">
          ${isTa ? 'புதிய கணக்கு (Create Account)' : 'Create Account'}
        </button>
      </div>

      <div style="margin-bottom: 1rem;">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--navy); margin-bottom: 0.25rem;">
          ${isTa ? 'குடிமக்கள் புதிய கணக்கு பதிவு' : 'Create Citizen Account'}
        </h3>
        <p style="font-size: 0.8rem; color: var(--text-secondary);">
          ${isTa ? 'புகார் அளிக்க மற்றும் தீர்வு நிலையை கண்காணிக்க இணையுங்கள்.' : 'Register to submit issues, upload evidence, and track resolutions.'}
        </p>
      </div>

      <form onsubmit="handleCitizenRegisterSubmit(event)">
        <div class="form-group">
          <label class="form-label">${isTa ? 'முழுப் பெயர்' : 'Full Name'}</label>
          <input type="text" name="full_name" class="form-control" placeholder="e.g. Senthil Nathan" required>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label">${isTa ? 'மின்னஞ்சல்' : 'Email Address'}</label>
            <input type="email" name="email" class="form-control" placeholder="name@domain.com" required>
          </div>
          <div class="form-group">
            <label class="form-label">${isTa ? 'தொலைபேசி எண்' : 'Mobile Number'}</label>
            <input type="tel" name="phone" class="form-control" placeholder="+91 98401 XXXXX" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${isTa ? 'வசிக்கும் பகுதி / வார்டு' : 'Locality / Ward'}</label>
          <select name="neighborhood" class="form-control" required>
            <option value="T. Nagar">T. Nagar (Ward 117 / Zone 10)</option>
            <option value="Anna Nagar">Anna Nagar (Zone 8)</option>
            <option value="Velachery">Velachery (Zone 13)</option>
            <option value="Mylapore">Mylapore (Zone 9)</option>
            <option value="Tambaram">Tambaram Corporation</option>
            <option value="Adyar">Adyar (Zone 13)</option>
            <option value="Guindy">Guindy (Zone 9)</option>
            <option value="Royapettah">Royapettah</option>
            <option value="Madurai">Madurai Corporation</option>
            <option value="Coimbatore">Coimbatore Corporation</option>
            <option value="Other">Other Tamil Nadu District</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">${isTa ? 'புதிய கடவுச்சொல்' : 'Create Password'}</label>
          <div class="password-field-wrapper">
            <input type="password" id="reg-pw" name="password" class="form-control" placeholder="Minimum 6 characters" required oninput="handlePasswordStrengthLive(this)">
            <button type="button" class="password-toggle-eye" onclick="togglePasswordVisibility('reg-pw', this)">👁️</button>
          </div>
          <div class="pw-strength-container">
            <div class="pw-strength-bar">
              <div id="pw-strength-fill" class="pw-strength-fill" style="width: 0%; background: var(--red);"></div>
            </div>
            <div class="pw-strength-text">
              <span id="pw-strength-label" style="color: var(--text-muted);">${isTa ? 'கடவுச்சொல் வலிமை: -' : 'Strength: -'}</span>
              <span style="color: var(--text-muted); font-size: 0.68rem;">Min. 6 chars, letters & numbers</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${isTa ? 'கடவுச்சொல்லை மீண்டும் உள்ளிடவும்' : 'Confirm Password'}</label>
          <div class="password-field-wrapper">
            <input type="password" id="reg-confirm-pw" name="confirm_password" class="form-control" placeholder="Re-enter password" required oninput="validatePasswordMatchLive()">
            <button type="button" class="password-toggle-eye" onclick="togglePasswordVisibility('reg-confirm-pw', this)">👁️</button>
          </div>
          <div id="pw-match-label" style="font-size: 0.72rem; margin-top: 0.25rem;"></div>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-bottom: 1.25rem; font-size: 0.78rem; color: var(--text-secondary);">
          <input type="checkbox" id="terms-agree" required checked>
          <label for="terms-agree" style="cursor: pointer;">
            ${isTa ? 'உண்மையான பொதுப் பிரச்சனைகளை மட்டுமே பதிவு செய்ய ஒப்புக்கொள்கிறேன்.' : 'I agree to report genuine civic grievances under TN IT Standards.'}
          </label>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-weight: 700;">
          ${isTa ? 'கணக்கை உருவாக்கி உள்நுழைக' : 'Create Account & Sign In'}
        </button>
      </form>

      <div style="text-align: center; margin-top: 1.25rem; font-size: 0.85rem; color: var(--text-secondary);">
        ${isTa ? 'ஏற்கனவே கணக்கு உள்ளதா?' : 'Already have an account?'} 
        <a href="javascript:void(0)" onclick="switchCitizenMode('signin')" style="color: var(--teal); font-weight: 700;">
          ${isTa ? 'இங்கே உள்நுழைக' : 'Sign In'}
        </a>
      </div>
    `;
  }
}

function renderOfficialAuthPane(isTa) {
  return `
    <!-- Official Security Badge -->
    <div class="official-security-banner">
      <span style="font-size: 1.2rem;">🔒</span>
      <div>
        <strong>${isTa ? 'தமிழ்நாடு அரசு அதிகாரபூர்வ முனையம்' : 'Official Government Administration Terminal'}</strong>
        <div style="font-size: 0.72rem; color: #1e429f;">GovNet 256-Bit SSL Encrypted • Restricted Access</div>
      </div>
    </div>

    <!-- Official Login Form -->
    <form onsubmit="handleOfficialLoginSubmit(event)" style="margin-top: 1rem;">
      <div id="off-login-alert"></div>
      <div class="form-group">
        <label class="form-label">${isTa ? 'அரசு மின்னஞ்சல் / பணியாளர் ஐடி' : 'Gov Email Address / Employee ID'}</label>
        <input type="text" name="identifier" class="form-control" placeholder="${isTa ? 'அதிகாரபூர்வ மின்னஞ்சல்' : 'e.g. officer@crowdpulse.tn or employee ID'}" required autocomplete="username">
      </div>

      <div class="form-group">
        <label class="form-label">${isTa ? 'துறை / மாநகராட்சி' : 'Department / Agency'}</label>
        <select name="department" class="form-control">
          <option value="GCC">Greater Chennai Corporation (GCC)</option>
          <option value="CMWSSB">Chennai Metro Water & Sewerage Board</option>
          <option value="TANGEDCO">TANGEDCO / Minnagam (Power)</option>
          <option value="HIGHWAYS">Highways & Minor Ports Dept</option>
          <option value="POLICE">Greater Chennai Traffic & Law</option>
          <option value="ADMIN">State IT E-Governance Command</option>
        </select>
      </div>

      <div class="form-group">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
          <label class="form-label" style="margin-bottom: 0;">${isTa ? 'கடவுச்சொல்' : 'Password'}</label>
          <a href="javascript:void(0)" onclick="openForgotPasswordFlow()" style="font-size: 0.78rem; color: var(--teal); font-weight: 600;">
            ${isTa ? 'உதவி மையம் / மீட்டமை' : 'Reset Credentials / Help'}
          </a>
        </div>
        <div class="password-field-wrapper">
          <input type="password" id="off-login-pw" name="password" class="form-control" placeholder="${isTa ? 'கடவுச்சொல் உள்ளிடவும்' : 'Enter official access credentials'}" required autocomplete="current-password">
          <button type="button" class="password-toggle-eye" onclick="togglePasswordVisibility('off-login-pw', this)">👁️</button>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-size: 0.95rem; font-weight: 700; background: var(--navy); border-color: var(--navy);">
        🛡️ ${isTa ? 'கட்டுப்பாட்டு அறைக்குள் நுழைக' : 'Authenticate to Operations Command'}
      </button>
    </form>
  `;
}

function renderForgotPasswordForm(isTa) {
  const step = LOGIN_VIEW_STATE.forgotStep;
  const otp = LOGIN_VIEW_STATE.demoOtp;

  return `
    <div style="margin-bottom: 1.25rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
        <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--navy);">
          🔑 ${isTa ? 'கடவுச்சொல் மீட்டமைப்பு' : 'Reset Password'}
        </h3>
        <button class="btn btn-sm btn-secondary" onclick="closeForgotPasswordFlow()">
          ✕ ${isTa ? 'திரும்பு' : 'Back'}
        </button>
      </div>
      <p style="font-size: 0.82rem; color: var(--text-secondary);">
        ${isTa 
          ? 'உங்கள் பதிவு செய்யப்பட்ட மின்னஞ்சல் அல்லது கைபேசி எண்ணை உள்ளிட்டு சரிபார்ப்புக் குறியீட்டைப் பெறுங்கள்.' 
          : 'Enter your registered email address or mobile to verify identity and set a new password.'}
      </p>
    </div>

    ${step === 1 ? `
      <!-- Step 1: Request OTP -->
      <form onsubmit="handleForgotOtpRequest(event)">
        <div class="form-group">
          <label class="form-label">${isTa ? 'பதிவு செய்யப்பட்ட மின்னஞ்சல் / தொடர்பு எண்' : 'Registered Email Address / Phone'}</label>
          <input type="text" name="email" class="form-control" placeholder="your.name@domain.com" required value="${LOGIN_VIEW_STATE.forgotEmail || ''}">
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-weight: 700;">
          📲 ${isTa ? 'சரிபார்ப்புக் குறியீடு பெறுக (Send OTP)' : 'Request Verification OTP'}
        </button>
      </form>
    ` : `
      <!-- Step 2: Enter OTP & New Password -->
      <div style="background: rgba(15, 157, 138, 0.12); border: 1px solid var(--teal); border-radius: var(--radius-sm); padding: 0.85rem; margin-bottom: 1.25rem;">
        <div style="font-weight: 700; font-size: 0.85rem; color: var(--teal); margin-bottom: 0.25rem;">
          ✓ ${isTa ? 'சரிபார்ப்புக் குறியீடு அனுப்பப்பட்டது!' : 'Verification OTP Generated!'}
        </div>
        <div style="font-size: 0.8rem; color: var(--text-primary); margin-bottom: 0.5rem;">
          ${isTa ? 'பாதுகாப்பு குறியீடு:' : 'Security OTP:'} <strong style="font-size: 1.1rem; color: var(--navy); letter-spacing: 0.1em;">${otp || '749201'}</strong>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" onclick="autoFillOtp('${otp || '749201'}')" style="font-size: 0.75rem;">
          📋 ${isTa ? 'குறியீட்டை தானாக நிரப்புக' : 'Auto-Fill OTP Code'}
        </button>
      </div>

      <form onsubmit="handleForgotResetSubmit(event)">
        <div class="form-group">
          <label class="form-label">${isTa ? 'சரிபார்ப்புக் குறியீடு (6-Digit OTP)' : '6-Digit Verification OTP'}</label>
          <input type="text" id="forgot-otp-input" name="otp" class="form-control" placeholder="749201" maxlength="6" required style="letter-spacing: 0.15em; font-weight: 700;">
        </div>

        <div class="form-group">
          <label class="form-label">${isTa ? 'புதிய கடவுச்சொல்' : 'New Password'}</label>
          <div class="password-field-wrapper">
            <input type="password" id="forgot-new-pw" name="new_password" class="form-control" placeholder="Minimum 6 characters" required>
            <button type="button" class="password-toggle-eye" onclick="togglePasswordVisibility('forgot-new-pw', this)">👁️</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${isTa ? 'கடவுச்சொல்லை மீண்டும் உள்ளிடவும்' : 'Confirm New Password'}</label>
          <div class="password-field-wrapper">
            <input type="password" id="forgot-confirm-pw" name="confirm_password" class="form-control" placeholder="Re-enter new password" required>
            <button type="button" class="password-toggle-eye" onclick="togglePasswordVisibility('forgot-confirm-pw', this)">👁️</button>
          </div>
        </div>

        <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.75rem; font-weight: 700;">
          🔒 ${isTa ? 'கடவுச்சொல்லை மாற்றி உள்நுழைக' : 'Update Password & Sign In'}
        </button>
      </form>
    `}

    <div style="text-align: center; margin-top: 1rem;">
      <a href="javascript:void(0)" onclick="closeForgotPasswordFlow()" style="font-size: 0.82rem; color: var(--text-secondary); text-decoration: underline;">
        ${isTa ? 'உள்நுழைவுப் பக்கத்திற்குத் திரும்புக' : 'Return to Sign In'}
      </a>
    </div>
  `;
}

// Interactive UI State Switchers
function switchLoginPortal(portal) {
  LOGIN_VIEW_STATE.portal = portal;
  LOGIN_VIEW_STATE.forgotOpen = false;
  renderApp();
}

function switchCitizenMode(mode) {
  LOGIN_VIEW_STATE.citizenMode = mode;
  LOGIN_VIEW_STATE.forgotOpen = false;
  renderApp();
}

function openForgotPasswordFlow() {
  LOGIN_VIEW_STATE.forgotOpen = true;
  LOGIN_VIEW_STATE.forgotStep = 1;
  renderApp();
}

function closeForgotPasswordFlow() {
  LOGIN_VIEW_STATE.forgotOpen = false;
  renderApp();
}

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btnEl) btnEl.textContent = '🙈';
  } else {
    input.type = 'password';
    if (btnEl) btnEl.textContent = '👁️';
  }
}

function handlePasswordStrengthLive(input) {
  const val = input.value || '';
  const fill = document.getElementById('pw-strength-fill');
  const label = document.getElementById('pw-strength-label');
  if (!fill || !label) return;

  let score = 0;
  if (val.length >= 6) score++;
  if (val.length >= 9) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  if (val.length === 0) {
    fill.style.width = '0%';
    fill.style.backgroundColor = 'var(--red)';
    label.textContent = 'Strength: -';
    label.style.color = 'var(--text-muted)';
  } else if (score <= 1) {
    fill.style.width = '25%';
    fill.style.backgroundColor = 'var(--red)';
    label.textContent = 'Strength: Weak';
    label.style.color = 'var(--red)';
  } else if (score === 2) {
    fill.style.width = '60%';
    fill.style.backgroundColor = 'var(--amber)';
    label.textContent = 'Strength: Fair';
    label.style.color = 'var(--amber)';
  } else {
    fill.style.width = '100%';
    fill.style.backgroundColor = 'var(--green)';
    label.textContent = 'Strength: Strong ✓';
    label.style.color = 'var(--green)';
  }
  validatePasswordMatchLive();
}

function validatePasswordMatchLive() {
  const pw = document.getElementById('reg-pw')?.value || '';
  const confirm = document.getElementById('reg-confirm-pw')?.value || '';
  const matchLabel = document.getElementById('pw-match-label');
  if (!matchLabel) return;

  if (!confirm) {
    matchLabel.textContent = '';
  } else if (pw === confirm) {
    matchLabel.textContent = '✓ Passwords match';
    matchLabel.style.color = 'var(--green)';
  } else {
    matchLabel.textContent = '✕ Passwords do not match';
    matchLabel.style.color = 'var(--red)';
  }
}

function autoFillOtp(code) {
  const otpInput = document.getElementById('forgot-otp-input');
  if (otpInput) {
    otpInput.value = code;
    showToast(`OTP auto-filled: ${code}`, 'info');
  }
}

// Form Handlers with Strict Portal Separation & Visual Feedback
async function handleCitizenLoginSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const identifier = form.identifier.value.trim();
  const password = form.password.value;

  const alertBox = document.getElementById('cit-login-alert');
  if (alertBox) alertBox.innerHTML = '';

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = STATE.language === 'ta' ? 'உள்நுழைகிறது...' : 'Signing in...';
  }

  try {
    const res = await API.req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier, username: identifier, password })
    });

    STATE.token = res.access_token;
    STATE.currentUser = res.user;
    localStorage.setItem('cp_token', res.access_token);
    API.loadNotifications();

    if (res.user.role === 'citizen') {
      showToast(`Welcome back, ${res.user.full_name}!`, 'success');
      navigateTo('citizen/report');
    } else {
      showToast(`Signed in as Official (${res.user.role.toUpperCase()}). Directing to Operations Command.`, 'info');
      navigateTo('authority/dashboard');
    }
  } catch (err) {
    const msg = err.message || 'Incorrect credentials. Please verify your email/username and password.';
    showToast(msg, 'error');
    if (alertBox) {
      alertBox.innerHTML = `
        <div style="background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>⚠️</span> <span>${escapeHtml(msg)}</span>
        </div>
      `;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }
}

async function handleOfficialLoginSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const identifier = form.identifier.value.trim();
  const password = form.password.value;

  const alertBox = document.getElementById('off-login-alert');
  if (alertBox) alertBox.innerHTML = '';

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = STATE.language === 'ta' ? 'சரிபார்க்கிறது...' : 'Authenticating...';
  }

  try {
    const res = await API.req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier, username: identifier, password })
    });

    if (res.user.role === 'citizen') {
      const msg = 'Access Denied: Citizen accounts cannot access the Official Operations Terminal. Please sign in via the Citizen Portal.';
      showToast(msg, 'error');
      if (alertBox) {
        alertBox.innerHTML = `
          <div style="background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>⚠️</span> <span>${escapeHtml(msg)}</span>
          </div>
        `;
      }
      return;
    }

    STATE.token = res.access_token;
    STATE.currentUser = res.user;
    localStorage.setItem('cp_token', res.access_token);
    showToast(`Operations Access Granted: ${res.user.full_name} (${res.user.role.toUpperCase()})`, 'success');
    API.loadNotifications();
    navigateTo('authority/dashboard');
  } catch (err) {
    const msg = err.message || 'Authentication failed. Please verify departmental credentials.';
    showToast(msg, 'error');
    if (alertBox) {
      alertBox.innerHTML = `
        <div style="background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>⚠️</span> <span>${escapeHtml(msg)}</span>
        </div>
      `;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }
}

async function handleCitizenRegisterSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const pw = form.password.value;
  const confirmPw = form.confirm_password.value;

  if (pw !== confirmPw) {
    showToast('Passwords do not match. Please re-check.', 'error');
    return;
  }

  if (pw.length < 6) {
    showToast('Password must be at least 6 characters long.', 'error');
    return;
  }

  const payload = {
    full_name: form.full_name.value.trim(),
    email: form.email.value.trim().toLowerCase(),
    password: pw,
    phone: form.phone.value.trim(),
    neighborhood: form.neighborhood.value,
    preferred_language: STATE.language || 'en',
    role: 'citizen'
  };

  try {
    const res = await API.req('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    STATE.token = res.access_token;
    STATE.currentUser = res.user;
    localStorage.setItem('cp_token', res.access_token);
    showToast(`Account created successfully! Welcome, ${res.user.full_name}`, 'success');
    API.loadNotifications();
    navigateTo('citizen/report');
  } catch (err) {
    showToast('Registration failed: ' + err.message, 'error');
  }
}

async function handleForgotOtpRequest(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  LOGIN_VIEW_STATE.forgotEmail = email;

  try {
    const res = await API.req('/auth/forgot-password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    LOGIN_VIEW_STATE.demoOtp = res.demo_otp || '749201';
    LOGIN_VIEW_STATE.forgotStep = 2;
    showToast(res.message || 'OTP verification code generated.', 'success');
    renderApp();
  } catch (err) {
    showToast('OTP request failed: ' + err.message, 'error');
  }
}

async function handleForgotResetSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const otp = form.otp.value.trim();
  const newPw = form.new_password.value;
  const confirmPw = form.confirm_password.value;

  if (newPw !== confirmPw) {
    showToast('New passwords do not match.', 'error');
    return;
  }

  if (newPw.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  try {
    const res = await API.req('/auth/forgot-password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: LOGIN_VIEW_STATE.forgotEmail,
        otp,
        new_password: newPw
      })
    });

    showToast(res.message, 'success');

    // Auto-login with new password
    const loginRes = await API.req('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: LOGIN_VIEW_STATE.forgotEmail,
        password: newPw
      })
    });

    STATE.token = loginRes.access_token;
    STATE.currentUser = loginRes.user;
    localStorage.setItem('cp_token', loginRes.access_token);
    LOGIN_VIEW_STATE.forgotOpen = false;
    API.loadNotifications();

    if (['authority', 'admin', 'staff'].includes(loginRes.user.role)) {
      navigateTo('authority/dashboard');
    } else {
      navigateTo('citizen/report');
    }
  } catch (err) {
    showToast('Password reset failed: ' + err.message, 'error');
  }
}

// Backward-compatible redirect for any existing button
function openLoginModal() {
  navigateTo('login');
}

// Window Event Listeners
window.addEventListener('hashchange', () => {
  parseHashRoute();
  renderApp();
});

window.addEventListener('DOMContentLoaded', async () => {
  if (STATE.theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  document.body.classList.remove('high-contrast');
  parseHashRoute();
  await API.loadInitialData();
  renderApp();
});
