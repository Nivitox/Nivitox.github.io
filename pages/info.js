import { Auth } from '../core/js/auth.js';
import { showLoadingOverlay, hideLoadingOverlay } from '../core/js/ui-feedback.js';

let currentUser = null;
let locales = [];
let users = [];

document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay('Cargando información...');
    const user = Auth.checkAuth();
    if (!user) {
        hideLoadingOverlay();
        return;
    }
    currentUser = user;

    setupHeader(user);
    setupLogout();
    try {
        await loadData();
        setupLocaleContext();
        setupCopyHandlers();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } finally {
        hideLoadingOverlay();
    }
});

function setupHeader(user) {
    const userSigla = document.getElementById('user-sigla');
    const userName = document.getElementById('user-name-text');
    const userCargo = document.getElementById('user-cargo-text');

    const initials = (user.names || user.name || '')
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .join('');

    userSigla.textContent = `${initials}${user.last_names ? user.last_names[0] : ''}`.toUpperCase().substring(0, 2) || '--';
    userName.textContent = `${user.names || user.name || ''} ${user.last_names || ''}`.trim();
    userCargo.textContent = user.cargo || '';
}

function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', (event) => {
        event.preventDefault();
        Auth.logout();
    });
}

async function loadData() {
    try {
        const [localeRes, allUsers] = await Promise.all([
            fetch('/api/locales'),
            Auth.fetchUsers()
        ]);

        locales = localeRes.ok ? await localeRes.json() : [];
        users = Array.isArray(allUsers) ? allUsers : [];
    } catch (error) {
        console.error('Error loading info data:', error);
        locales = [];
        users = [];
    }
}

function setupLocaleContext() {
    const localeSelect = document.getElementById('info-locale-select');
    const localeFixed = document.getElementById('info-locale-fixed');
    const localeLabel = document.getElementById('locale-label');
    if (!localeSelect || !localeFixed || !localeLabel || !currentUser) return;

    const isSuperAdmin = currentUser.cargo === 'Super Admin';
    const orderedLocales = [...locales].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

    if (isSuperAdmin) {
        localeFixed.classList.add('hidden');
        localeSelect.classList.remove('hidden');

        localeSelect.innerHTML = '';
        orderedLocales.forEach(locale => {
            const option = document.createElement('option');
            option.value = locale.id;
            option.textContent = `${locale.id} - ${locale.name || 'Sin nombre'}`;
            localeSelect.appendChild(option);
        });

        const preferredLocaleId = orderedLocales.some(l => l.id === currentUser.locale_id)
            ? currentUser.locale_id
            : orderedLocales[0]?.id;

        if (preferredLocaleId) {
            localeSelect.value = preferredLocaleId;
            renderLocaleData(preferredLocaleId);
        } else {
            renderLocaleData('');
        }

        localeSelect.addEventListener('change', () => {
            renderLocaleData(localeSelect.value);
        });
    } else {
        localeLabel.textContent = 'Local asignado:';
        localeSelect.classList.add('hidden');
        localeFixed.classList.remove('hidden');

        const locale = orderedLocales.find(l => l.id === currentUser.locale_id);
        localeFixed.textContent = locale ? `${locale.id} - ${locale.name || ''}` : (currentUser.locale_id || 'Sin local');
        renderLocaleData(currentUser.locale_id || '');
    }
}

function renderLocaleData(localeId) {
    renderLocaleInfo(localeId);
    renderLocaleSchedule(localeId);
    renderWorkers(localeId);
}

function renderLocaleInfo(localeId) {
    const localeInfoGrid = document.getElementById('locale-info-grid');
    if (!localeInfoGrid) return;

    const locale = locales.find(l => l.id === localeId);
    if (!locale) {
        localeInfoGrid.innerHTML = '<p class="empty-message">No hay información de local disponible.</p>';
        return;
    }

    const rows = [
        { label: 'ID', value: locale.id, copyable: true },
        { label: 'Nombre', value: locale.name, copyable: true },
        { label: 'Tipo', value: locale.tipo },
        { label: 'Número', value: locale.numero },
        { label: 'Dirección', value: locale.direccion, copyable: true },
        { label: 'Comuna', value: locale.comuna, copyable: true },
        { label: 'Región', value: locale.region, copyable: true },
        { label: 'Teléfono', value: locale.telefono, copyable: true },
        { label: 'Anexo', value: locale.anexo, copyable: true },
        { label: 'Correo oficial', value: locale.correo_oficial, copyable: true },
        { label: 'Correo alternativo', value: locale.correo_alternativo, copyable: true }
    ];

    localeInfoGrid.innerHTML = rows
        .map(row => `
            <div class="info-item">
                <span class="info-label">${row.label}</span>
                ${renderInfoValue(row.value, row.copyable)}
            </div>
        `)
        .join('');
}

function renderLocaleSchedule(localeId) {
    const scheduleGrid = document.getElementById('locale-schedule-grid');
    if (!scheduleGrid) return;

    const locale = locales.find(l => l.id === localeId);
    if (!locale) {
        scheduleGrid.innerHTML = '<p class="empty-message">No hay horario disponible.</p>';
        return;
    }

    const scheduleRows = Array.isArray(locale?.horario_atencion) ? locale.horario_atencion : [];
    if (!scheduleRows.length) {
        const fallback = formatLocaleSchedule(locale);
        scheduleGrid.innerHTML = `
            <article class="schedule-row schedule-row-fallback">
                <span class="schedule-day">Horario general</span>
                <span class="schedule-hours">${escapeHtml(fallback)}</span>
            </article>
        `;
        return;
    }

    scheduleGrid.innerHTML = scheduleRows
        .map((row) => {
            const dias = formatValue(row?.dias);
            if (row?.cerrado) {
                return `
                    <article class="schedule-row">
                        <span class="schedule-day">${escapeHtml(dias)}</span>
                        <span class="schedule-status">Cerrado</span>
                    </article>
                `;
            }

            const apertura = String(row?.apertura || '').trim() || '--:--';
            const cierre = String(row?.cierre || '').trim() || '--:--';
            return `
                <article class="schedule-row">
                    <span class="schedule-day">${escapeHtml(dias)}</span>
                    <span class="schedule-hours">${escapeHtml(`${apertura} - ${cierre}`)}</span>
                </article>
            `;
        })
        .join('');
}

function formatLocaleSchedule(locale) {
    const rows = Array.isArray(locale?.horario_atencion) ? locale.horario_atencion : [];
    if (rows.length) {
        return rows
            .map((row) => {
                const dias = String(row?.dias || '').trim();
                if (!dias) return '';
                if (row?.cerrado) return `${dias}: Cerrado`;
                const apertura = String(row?.apertura || '').trim() || '--:--';
                const cierre = String(row?.cierre || '').trim() || '--:--';
                return `${dias}: ${apertura} - ${cierre}`;
            })
            .filter(Boolean)
            .join(' | ');
    }

    const fallback = String(locale?.horario || locale?.horario_apertura || '').trim();
    return fallback || '-';
}

function renderWorkers(localeId) {
    const workersGrid = document.getElementById('workers-grid');
    const workersCountBadge = document.getElementById('workers-count-badge');
    if (!workersGrid || !workersCountBadge) return;

    const localeWorkers = users
        .filter(worker => String(worker.locale_id || '') === String(localeId || ''))
        .sort((a, b) => {
            const na = `${a.last_names || ''} ${a.names || ''}`.trim();
            const nb = `${b.last_names || ''} ${b.names || ''}`.trim();
            return na.localeCompare(nb);
        });

    workersCountBadge.textContent = `${localeWorkers.length} trabajadores`;

    if (localeWorkers.length === 0) {
        workersGrid.innerHTML = '<p class="empty-message">No hay trabajadores registrados en este local.</p>';
        return;
    }

    workersGrid.innerHTML = localeWorkers
        .map(worker => {
            const roleBadge = getRoleBadge(worker.cargo);
            const workerCode = getWorkerCodeLabel(worker.worker_code);
            const codeStyle = getWorkerCodeStyle(worker.color);
            const editUrl = `/pages/users.html?edit=${encodeURIComponent(String(worker.rut || ''))}`;
            const fullName = `${worker.names || ''} ${worker.last_names || ''}`.trim();
            return `
            <article class="worker-card">
                <div class="worker-head">
                    <h3>${renderCopyValue(fullName)}</h3>
                    <div class="worker-head-actions">
                        <div class="worker-badges">
                            <span class="role-badge ${roleBadge.className}">${escapeHtml(roleBadge.label)}</span>
                            <span class="worker-code-badge" style="${codeStyle}">${escapeHtml(workerCode)}</span>
                        </div>
                        <a class="btn btn-sm worker-edit-btn" href="${editUrl}">Editar</a>
                    </div>
                </div>
                <div class="worker-details">
                    ${renderWorkerDetailRow('RUT', worker.rut, true)}
                    ${renderWorkerDetailRow('Código', worker.worker_code, true)}
                    <div><strong>Estado:</strong> ${formatValue(worker.estado)}</div>
                    <div><strong>Tipo:</strong> ${formatValue(worker.type)}</div>
                    ${renderWorkerDetailRow('F. Nacimiento', worker.birth_date, true)}
                    ${renderWorkerDetailRow('F. Incorporación', worker.incorporation_date, true)}
                    ${renderWorkerDetailRow('Teléfono', worker.contact_number, true)}
                    ${renderWorkerDetailRow('Email', worker.contact_email, true)}
                    ${renderWorkerDetailRow('Dirección', worker.address, true)}
                </div>
            </article>
        `;
        })
        .join('');
}

function formatValue(value) {
    if (value === undefined || value === null) return '-';
    const text = String(value).trim();
    return text || '-';
}

function renderInfoValue(value, copyable = false) {
    if (copyable) return renderCopyValue(value);
    return `<span class="info-value">${escapeHtml(formatValue(value))}</span>`;
}

function renderWorkerDetailRow(label, value, copyable = false) {
    return `<div><strong>${escapeHtml(label)}:</strong> ${copyable ? renderCopyValue(value) : escapeHtml(formatValue(value))}</div>`;
}

function renderCopyValue(value) {
    const text = formatCopyRaw(value);
    const display = formatValue(value);
    if (!text) {
        return `<span class="info-value">${escapeHtml(display)}</span>`;
    }
    return `<button type="button" class="copy-value" data-copy="${escapeHtmlAttr(text)}" title="Copiar">${escapeHtml(display)}</button>`;
}

function getRoleBadge(cargo) {
    const role = String(cargo || '').toLowerCase();
    const normalized = role
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (normalized.includes('super admin')) {
        return { label: 'Super Admin', className: 'role-sa' };
    }
    if (normalized.includes('quimico') || normalized.includes('qf')) {
        return { label: 'Químico Farmacéutico', className: 'role-qf' };
    }
    if (normalized.includes('auxiliar') || normalized.includes('af')) {
        return { label: 'Auxiliar de Farmacia', className: 'role-af' };
    }
    return { label: formatValue(cargo), className: 'role-other' };
}

function getWorkerCodeLabel(workerCode) {
    const value = String(workerCode || '').trim();
    return value || '--';
}

function getWorkerCodeStyle(color) {
    const hex = String(color || '').trim();
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
        return '';
    }
    const text = getContrastTextColor(hex);
    return `background:${hex}; border-color:${hex}; color:${text};`;
}

function getContrastTextColor(hex) {
    let value = hex.replace('#', '');
    if (value.length === 3) {
        value = value.split('').map(c => c + c).join('');
    }
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
    return luminance > 160 ? '#1f2937' : '#ffffff';
}

function setupCopyHandlers() {
    document.addEventListener('click', async (event) => {
        const copyButton = event.target.closest('.copy-value');
        if (!copyButton) return;

        const text = String(copyButton.getAttribute('data-copy') || '').trim();
        if (!text) return;

        const ok = await copyToClipboard(text);
        if (!ok) return;

        copyButton.classList.add('copied');
        const previousTitle = copyButton.getAttribute('title') || '';
        copyButton.setAttribute('title', 'Copiado');
        window.setTimeout(() => {
            copyButton.classList.remove('copied');
            copyButton.setAttribute('title', previousTitle || 'Copiar');
        }, 900);
    });
}

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (error) {
        console.warn('Clipboard API failed, fallback copy.', error);
    }

    try {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(temp);
        return ok;
    } catch (error) {
        console.error('Fallback copy failed:', error);
        return false;
    }
}

function formatCopyRaw(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeHtmlAttr(value) {
    return escapeHtml(value).replaceAll('\n', '&#10;').replaceAll('\r', '');
}
