import { Auth } from '../core/js/auth.js';
import { showLoadingOverlay, hideLoadingOverlay } from '/core/js/ui-feedback.js';

document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay('Cargando inicio...');
    // Check authentication
    const effectiveUser = Auth.checkAuth();
    const realUser = Auth.getRealUser();
    if (!effectiveUser || !realUser) {
        hideLoadingOverlay();
        return; // checkAuth redirects if null
    }

    try {
        applyHomeButtonOrder();
        setupHeader(effectiveUser);
        setupHomeHeroBanner();
        await setupSubheader(realUser, effectiveUser);
        setupLogout();

        // Initialize Admin Controls and Visibility
        initAdminControls(effectiveUser);
        applyVisibilitySettings(effectiveUser);
        await updateCalendarTodayBadge(effectiveUser);

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } finally {
        hideLoadingOverlay();
    }
});

function isSuperAdminUser(user) {
    const cargo = String(user?.cargo || '').toLowerCase();
    return cargo.includes('super admin');
}

function isBetaTesterUser(user) {
    const type = String(user?.type || '').toLowerCase();
    return type.includes('beta');
}

function canUserSeeByVisibility(user, visibilityRaw) {
    const visibility = String(visibilityRaw || 'TODOS').toLowerCase();
    if (isSuperAdminUser(user)) {
        return true;
    }
    if (visibility === 'solo sa') {
        return false;
    }
    if (visibility === 'sa + qf') {
        return String(user?.cargo || '') === 'Químico Farmacéutico';
    }
    if (visibility === 'sa + af') {
        return String(user?.cargo || '') === 'Auxiliar de Farmacia';
    }
    return true; // TODOS u otros valores no restrictivos
}

function canUserSeeByStatus(user, statusRaw) {
    if (isSuperAdminUser(user)) {
        return true;
    }

    const status = String(statusRaw || 'Omega').toLowerCase();
    if (status === 'alfa') {
        return false;
    }
    if (status === 'beta') {
        return isBetaTesterUser(user);
    }
    return true; // omega
}

function applyHomeButtonOrder() {
    const grid = document.getElementById('home-grid');
    if (!grid) return;

    const order = JSON.parse(localStorage.getItem('home_button_order') || '[]');
    if (!Array.isArray(order) || order.length === 0) return;

    const items = Array.from(grid.querySelectorAll('.home-card-col'));
    const byPage = new Map(items.map(item => [item.getAttribute('data-page'), item]));
    const alreadyPlaced = new Set();

    order.forEach(pageId => {
        const item = byPage.get(pageId);
        if (!item || alreadyPlaced.has(item)) return;
        grid.appendChild(item);
        alreadyPlaced.add(item);
    });

    items.forEach(item => {
        if (!alreadyPlaced.has(item)) {
            grid.appendChild(item);
        }
    });
}

function formatHomeDate(date = new Date()) {
    return new Intl.DateTimeFormat('es-CL', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

function setupHomeHeroBanner() {
    const dateBadge = document.getElementById('home-date-badge');
    const banner = document.getElementById('home-info-banner');

    if (dateBadge) {
        dateBadge.textContent = formatHomeDate(new Date());
    }
    if (!banner) {
        return;
    }

    banner.classList.add('hidden-banner');
    banner.classList.remove('banner-warning', 'banner-danger');
    banner.textContent = '';

    const raw = localStorage.getItem('home_important_banner') || '';
    if (!raw) return;

    let message = '';
    let level = 'info';
    let expiresAt = '';

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            message = String(parsed.message || '').trim();
            level = String(parsed.level || 'info').toLowerCase();
            expiresAt = String(parsed.expiresAt || '').trim();
        }
    } catch {
        message = String(raw).trim();
    }

    if (!message) return;
    if (expiresAt) {
        const expirationDate = new Date(expiresAt);
        if (!Number.isNaN(expirationDate.getTime()) && expirationDate.getTime() < Date.now()) {
            localStorage.removeItem('home_important_banner');
            return;
        }
    }

    banner.textContent = message;
    if (level === 'warning') {
        banner.classList.add('banner-warning');
    } else if (level === 'danger' || level === 'error') {
        banner.classList.add('banner-danger');
    }
    banner.classList.remove('hidden-banner');
}

async function updateCalendarTodayBadge(user) {
    const badge = document.getElementById('calendar-today-badge');
    if (!badge || !user) return;

    try {
        const params = new URLSearchParams({
            user_rut: String(user.rut || ''),
            user_cargo: String(user.cargo || ''),
            user_locale_id: String(user.locale_id || '')
        });
        if (isSuperAdminUser(user)) {
            params.set('sa_view_all', '1');
        }

        const response = await fetch(`/api/calendar/count/today?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const total = Number(data?.unreadIncomplete ?? data?.total ?? 0);

        badge.textContent = String(total);
        badge.classList.toggle('hidden-badge', total <= 0);
    } catch (error) {
        console.error('Error loading calendar today badge:', error);
    }
}

function setupHeader(user) {
    const userSigla = document.getElementById('user-sigla');
    const userName = document.getElementById('user-name-text');
    const userCargo = document.getElementById('user-cargo-text');

    if (user) {
        // Initials for mobile
        const initials = (user.names || user.name).split(' ').map(n => n[0]).join('') + (user.last_names ? user.last_names[0] : '');
        userSigla.textContent = initials.toUpperCase().substring(0, 2);

        // Full name and cargo for PC
        userName.textContent = `${user.names || user.name} ${user.last_names || ''}`;
        userCargo.textContent = user.cargo;
    }
}

async function setupSubheader(realUser, effectiveUser) {
    const subheader = document.querySelector('.subheader-fixed');
    const localSelect = document.getElementById('local-select');
    const workerSelect = document.getElementById('worker-select');
    if (!subheader || !localSelect || !workerSelect) return;

    if (!isSuperAdminUser(realUser)) {
        subheader.style.display = 'none';
        return;
    }

    subheader.style.display = '';

    try {
        const [localesResponse, users] = await Promise.all([
            fetch('/api/locales'),
            Auth.fetchUsers()
        ]);
        const locales = await localesResponse.json();
        const simulationUser = Auth.getSimulationUser();
        const selectedLocaleId = String(simulationUser?.locale_id || effectiveUser?.locale_id || realUser?.locale_id || '');
        const selectedWorkerRut = String(simulationUser?.rut || '');

        localSelect.innerHTML = '';

        locales.forEach(local => {
            const option = document.createElement('option');
            option.value = local.id;
            const localName = String(local?.name || local?.nombre || local?.nombre_local || '').trim();
            option.textContent = `${local.id} ${localName}`.trim();
            if (String(local.id) === selectedLocaleId) {
                option.selected = true;
            }
            localSelect.appendChild(option);
        });

        // Initial load of workers
        updateWorkerView(localSelect.value, effectiveUser, users, selectedWorkerRut);

        localSelect.addEventListener('change', (e) => {
            updateWorkerView(e.target.value, effectiveUser, users, '');
        });

        workerSelect.addEventListener('change', () => {
            const selectedRut = workerSelect.value;
            if (selectedRut === '__self__') {
                const hadSimulation = Auth.isSimulationActive();
                Auth.clearSimulationUser();
                if (hadSimulation) {
                    window.location.reload();
                }
                return;
            }

            if (!selectedRut) {
                return;
            }

            const selectedUser = users.find(u => String(u.rut || '') === String(selectedRut));
            if (!selectedUser) return;

            Auth.setSimulationUser(selectedUser);
            window.location.reload();
        });

    } catch (error) {
        console.error('Error loading locales:', error);
    }
}

function updateWorkerView(localId, currentUser, users, selectedWorkerRut = '') {
    const workerSelect = document.getElementById('worker-select');
    workerSelect.innerHTML = '<option value="">Simular trabajador...</option>';
    workerSelect.insertAdjacentHTML('beforeend', '<option value="__self__">Usar mi sesión (SA)</option>');

    const sourceUsers = Array.isArray(users) ? users : [];
    const filteredUsers = sourceUsers.filter(u => String(u.locale_id || '') === String(localId));

    filteredUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = String(user.rut || '');
        option.textContent = `${user.names || ''} ${user.last_names || ''}`.trim() || String(user.worker_code || user.rut || '');
        if (String(user.rut || '') === String(selectedWorkerRut)) {
            option.selected = true;
        } else if (!selectedWorkerRut && String(user.rut || '') === String(currentUser?.rut || '')) {
            option.selected = true;
        }
        workerSelect.appendChild(option);
    });
}

function initAdminControls(user) {
    if (!isSuperAdminUser(user)) return;

    const settings = JSON.parse(localStorage.getItem('button_settings') || '{}');
    const gridItems = document.querySelectorAll('.home-card-col');

    gridItems.forEach(item => {
        const pageId = item.getAttribute('data-page');
        const homeBtn = item.querySelector('.home-btn');
        const itemSettings = settings[pageId] || { visibility: 'TODOS', status: 'Omega' };

        const controls = document.createElement('div');
        controls.className = 'admin-controls';
        homeBtn.classList.add('home-btn-admin');
        controls.innerHTML = `
            <div class="control-group">
                <label>Visibilidad</label>
                <select class="visibility-select" data-page="${pageId}">
                    <option value="solo SA" ${itemSettings.visibility === 'solo SA' ? 'selected' : ''}>Solo SA</option>
                    <option value="SA + QF" ${itemSettings.visibility === 'SA + QF' ? 'selected' : ''}>SA + QF</option>
                    <option value="SA + AF" ${itemSettings.visibility === 'SA + AF' ? 'selected' : ''}>SA + AF</option>
                    <option value="TODOS" ${itemSettings.visibility === 'TODOS' ? 'selected' : ''}>Todos</option>
                </select>
            </div>
            <div class="control-group">
                <label>Estado</label>
                <select class="status-select" data-page="${pageId}">
                    <option value="Alfa" ${itemSettings.status === 'Alfa' ? 'selected' : ''}>Alfa</option>
                    <option value="Beta" ${itemSettings.status === 'Beta' ? 'selected' : ''}>Beta</option>
                    <option value="Omega" ${itemSettings.status === 'Omega' ? 'selected' : ''}>Omega</option>
                </select>
            </div>
        `;

        // Block the <a> tag navigation if any child of admin-controls is clicked
        homeBtn.addEventListener('click', (e) => {
            if (e.target.closest('.admin-controls')) {
                e.preventDefault();
            }
        });

        homeBtn.appendChild(controls);

        // Event Listeners for select changes
        controls.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', () => {
                const currentSettings = JSON.parse(localStorage.getItem('button_settings') || '{}');
                const page = select.getAttribute('data-page');

                if (!currentSettings[page]) currentSettings[page] = {};

                if (select.classList.contains('visibility-select')) {
                    currentSettings[page].visibility = select.value;
                } else {
                    currentSettings[page].status = select.value;
                }

                localStorage.setItem('button_settings', JSON.stringify(currentSettings));
            });
        });
    });
}

function applyVisibilitySettings(user) {
    const settings = JSON.parse(localStorage.getItem('button_settings') || '{}');
    const gridItems = document.querySelectorAll('.home-card-col');

    gridItems.forEach(item => {
        const pageId = item.getAttribute('data-page');
        const itemSettings = settings[pageId] || { visibility: 'TODOS', status: 'Omega' };
        const visibleByVisibility = canUserSeeByVisibility(user, itemSettings.visibility);
        const visibleByStatus = canUserSeeByStatus(user, itemSettings.status);
        const isVisible = visibleByVisibility && visibleByStatus;
        item.style.display = isVisible ? '' : 'none';
    });
}

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });
    }
}

// Simple Theme Toggle
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Apply theme on load
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
