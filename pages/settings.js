import { Auth } from '../core/js/auth.js';
import { showToast } from '../core/js/ui-feedback.js';

const MODULES = [
    { id: 'caja', name: 'Caja', path: '/pages/caja.html' },
    { id: 'diario', name: 'Diario', path: '/pages/diario.html' },
    { id: 'inventario', name: 'Inventario', path: '/pages/inventario.html' },
    { id: 'revision', name: 'Revisión de Inventario', path: '/pages/revision.html' },
    { id: 'fondo', name: 'Fondo', path: '/pages/fondo.html' },
    { id: 'recon', name: 'Recon', path: '/pages/recon.html' },
    { id: 'locales', name: 'Locales', path: '/pages/locales.html' },
    { id: 'info', name: 'Información', path: '/pages/info.html' },
    { id: 'trabajadores', name: 'Trabajadores', path: '/pages/trabajadores.html' },
    { id: 'calendario', name: 'Calendario', path: '/pages/calendario.html' },
    { id: 'formatos', name: 'Formatos', path: '/pages/formatos.html' },
    { id: 'settings', name: 'Ajustes', path: '/pages/settings.html' },
    { id: 'users', name: 'Usuarios', path: '/pages/users.html' }
];

const DEFAULT_BUTTON_SETTINGS = { visibility: 'TODOS', status: 'Omega' };
const QF_SETTINGS_TAB_VISIBILITY_KEY = 'settings_qf_tab_visibility';
const DEFAULT_TRANSIT_REASONS = [
    'Seleccione Motivo',
    'Reparación',
    'Revisión',
    'Traspaso a otra sucursal',
    'Devolución a proveedor',
    'Baja por caducidad',
    'Baja por daño',
    'Inventario',
    'Otro'
];
const PREDETERMINED_STORAGE_LOCATIONS = ['Estándar', 'Refrigerador', 'Controlados'];
const DENOMINACIONES = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 10];
const FONDO_LOCAL_OPTIONS = [300000, 400000, 500000];
let currentOrder = [];
let currentQfTabVisibility = {};
let draggedIndex = null;
let currentUser = null;
let tabsDragActive = false;
let tabsDragStartX = 0;
let tabsDragStartLeft = 0;
let settingsTransitReasons = [...DEFAULT_TRANSIT_REASONS];
let settingsStorageInventoryData = { productos: [] };
let settingsStorageWorkers = [];
let settingsCustomStorageLocations = [];
let settingsAllStorageLocations = [...PREDETERMINED_STORAGE_LOCATIONS];
let settingsStorageSectionVisible = false;
let settingsFondoAfVisible = false;
let settingsFondoLocalVisible = false;
let settingsFondoRecords = [];
let settingsFondoDraft = null;

document.addEventListener('DOMContentLoaded', () => {
    const user = Auth.checkAuth();
    if (!user) return;
    currentUser = user;

    setupHeader(user);
    setupLogout();
    setupTabsNavigation();
    setupTabsRailControls();
    setupInventorySettingsBindings();
    loadTransitReasonsForSettings();

    currentOrder = normalizeOrder(loadButtonOrder());
    currentQfTabVisibility = normalizeQfTabVisibility(loadQfTabVisibility());
    renderUserTabsAndPanels();

    if (user.cargo === 'Super Admin') {
        initSuperAdminPanel();
    } else {
        const saPanel = document.getElementById('tab-sa');
        if (saPanel) saPanel.classList.remove('active');
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
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

function setupTabsNavigation() {
    const tabsNav = document.getElementById('settings-tabs-nav');
    if (!tabsNav) return;

    tabsNav.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-tab-target]');
        if (!btn) return;
        activateTab(btn.getAttribute('data-tab-target'));
    });
}

function setupTabsRailControls() {
    const scroller = document.getElementById('settings-tabs-scroller');
    const leftBtn = document.getElementById('tabs-scroll-left');
    const rightBtn = document.getElementById('tabs-scroll-right');
    if (!scroller || !leftBtn || !rightBtn) return;

    const step = () => Math.max(180, Math.floor(scroller.clientWidth * 0.65));

    leftBtn.addEventListener('click', () => {
        scroller.scrollBy({ left: -step(), behavior: 'smooth' });
    });

    rightBtn.addEventListener('click', () => {
        scroller.scrollBy({ left: step(), behavior: 'smooth' });
    });

    scroller.addEventListener('scroll', updateTabsArrowState);
    window.addEventListener('resize', updateTabsArrowState);

    scroller.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const target = event.target instanceof Element ? event.target : null;
        if (
            target && (
                target.closest('.tab-item') ||
                target.closest('button') ||
                target.closest('a') ||
                target.closest('input') ||
                target.closest('select')
            )
        ) {
            return;
        }
        tabsDragActive = true;
        tabsDragStartX = event.clientX;
        tabsDragStartLeft = scroller.scrollLeft;
        scroller.classList.add('dragging');
        scroller.setPointerCapture(event.pointerId);
    });

    scroller.addEventListener('pointermove', (event) => {
        if (!tabsDragActive) return;
        const delta = event.clientX - tabsDragStartX;
        scroller.scrollLeft = tabsDragStartLeft - delta;
    });

    const finishDrag = () => {
        tabsDragActive = false;
        scroller.classList.remove('dragging');
    };
    scroller.addEventListener('pointerup', finishDrag);
    scroller.addEventListener('pointercancel', finishDrag);
    scroller.addEventListener('pointerleave', finishDrag);
}

function renderUserTabsAndPanels(preferredActiveTabId) {
    const tabsNav = document.getElementById('settings-tabs-nav');
    const modulePanels = document.getElementById('module-panels-container');
    const accessMessage = document.getElementById('settings-access-message');
    if (!tabsNav || !modulePanels || !currentUser) return;

    const previousActive = document.querySelector('#settings-tabs-nav .tab-item.active')?.getAttribute('data-tab-target');
    const targetActive = preferredActiveTabId || previousActive;
    const visibleModules = getVisibleModulesForUser(currentUser);

    tabsNav.innerHTML = '';
    modulePanels.innerHTML = '';
    if (accessMessage) accessMessage.classList.remove('active');

    if (currentUser.cargo === 'Super Admin') {
        const saTabButton = document.createElement('button');
        saTabButton.className = 'tab-item';
        saTabButton.setAttribute('data-tab-target', 'tab-sa');
        saTabButton.textContent = 'Especial SA';
        tabsNav.appendChild(saTabButton);
    }

    visibleModules.forEach((module, index) => {
        const tabTarget = `tab-module-${module.id}`;
        const isDefaultActive = !targetActive && currentUser.cargo !== 'Super Admin' && index === 0;

        const tabButton = document.createElement('button');
        tabButton.className = `tab-item ${isDefaultActive ? 'active' : ''}`;
        tabButton.setAttribute('data-tab-target', tabTarget);
        tabButton.textContent = module.name;
        tabsNav.appendChild(tabButton);

        const section = document.createElement('section');
        section.id = tabTarget;
        section.className = `settings-tab ${isDefaultActive ? 'active' : ''}`;
        section.innerHTML = `
            <div class="card">
                <h2 class="card-title">${module.name}</h2>
                <p class="subtitle">Aqui ira a futuro la configuracion especifica de ${module.name}.</p>
                <article class="module-setting-item">
                    <div class="module-head">
                        <div>
                            <h3>${module.name}</h3>
                            <p class="module-path">${module.path}</p>
                        </div>
                        <a class="btn btn-sm" href="${module.path}">Abrir</a>
                    </div>
                </article>
                ${module.id === 'inventario' ? `
                <article class="module-setting-item">
                    <div class="module-head">
                        <div>
                            <h3>Movimientos</h3>
                            <p class="module-path">Configura motivos para Tránsito y otras listas</p>
                        </div>
                        <button type="button" class="btn btn-secondary" data-action="open-movements-config">Configuración</button>
                    </div>
                </article>
                <article class="module-setting-item">
                    <div class="module-head">
                        <div>
                            <h3>Asignación</h3>
                            <p class="module-path">Gestión de Almacenamiento</p>
                        </div>
                        <button type="button" class="btn btn-sm btn-secondary" data-action="toggle-settings-storage-management">
                            <i data-lucide="${settingsStorageSectionVisible ? 'package-minus' : 'package'}" style="width:14px; height:14px;"></i>
                            <span>${settingsStorageSectionVisible ? 'Ocultar Gestión' : 'Mostrar Gestión'}</span>
                        </button>
                    </div>
                    <div id="settings-storage-management-root" class="settings-storage-management-root" style="display: ${settingsStorageSectionVisible ? 'block' : 'none'};">
                        <h4>Lugares de Almacenamiento Predeterminados</h4>
                        <ul class="list-group mb-3">
                            ${PREDETERMINED_STORAGE_LOCATIONS.map(location => `<li class="list-group-item">${location}</li>`).join('')}
                        </ul>

                        <h4>Lugares de Almacenamiento Personalizados</h4>
                        <div class="input-group mb-3">
                            <input type="text" id="settings-custom-storage-input" class="form-control" placeholder="Añadir nuevo lugar (Ej: Bodega)">
                            <button type="button" id="settings-add-custom-storage-btn" class="btn btn-primary" data-action="settings-add-custom-storage">Añadir</button>
                        </div>
                        <ul id="settings-custom-storage-list" class="list-group mb-3"></ul>
                        <button type="button" id="settings-save-custom-storage-btn" class="btn btn-secondary mt-3" data-action="settings-save-custom-storage">
                            Guardar Lugares Personalizados
                        </button>

                        <h4 class="mt-4">Asignación de Almacenamiento por Producto</h4>
                        <div id="settings-product-storage-list" class="product-list-storage"></div>
                    </div>
                </article>
                ` : ''}
                ${module.id === 'fondo' ? `
                <article class="module-setting-item">
                    <div class="module-head">
                        <div>
                            <h3>Asignación</h3>
                            <p class="module-path">Configuraciones de Fondo (sin modal)</p>
                        </div>
                    </div>

                    <div class="settings-fondo-sections">
                        <section class="settings-fondo-block">
                            <div class="module-head">
                                <div>
                                    <h4>Fondos AF</h4>
                                </div>
                                <button type="button" class="btn btn-sm btn-secondary" data-action="toggle-settings-fondo-af">
                                    <i data-lucide="${settingsFondoAfVisible ? 'chevron-up' : 'chevron-down'}" style="width:14px; height:14px;"></i>
                                    <span>${settingsFondoAfVisible ? 'Ocultar' : 'Mostrar'}</span>
                                </button>
                            </div>
                            <div id="settings-fondo-af-content" class="settings-fondo-content" style="display: ${settingsFondoAfVisible ? 'block' : 'none'};"></div>
                        </section>

                        <section class="settings-fondo-block">
                            <div class="module-head">
                                <div>
                                    <h4>Fondo Local</h4>
                                </div>
                                <button type="button" class="btn btn-sm btn-secondary" data-action="toggle-settings-fondo-local">
                                    <i data-lucide="${settingsFondoLocalVisible ? 'chevron-up' : 'chevron-down'}" style="width:14px; height:14px;"></i>
                                    <span>${settingsFondoLocalVisible ? 'Ocultar' : 'Mostrar'}</span>
                                </button>
                            </div>
                            <div id="settings-fondo-local-content" class="settings-fondo-content" style="display: ${settingsFondoLocalVisible ? 'block' : 'none'};"></div>
                        </section>
                    </div>

                    <div class="settings-fondo-actions">
                        <button type="button" class="btn btn-primary" data-action="settings-save-fondo-config">Guardar cambios de Fondo</button>
                    </div>
                </article>
                ` : ''}
            </div>
        `;
        modulePanels.appendChild(section);
    });

    initializeSettingsInventoryStorageSection();
    initializeSettingsFondoSection();
    if (typeof lucide !== 'undefined') lucide.createIcons();

    if (targetActive && document.getElementById(targetActive)) {
        activateTab(targetActive);
        updateTabsArrowState();
        return;
    }

    if (currentUser.cargo === 'Super Admin') {
        activateTab('tab-sa');
        updateTabsArrowState();
        return;
    }

    const firstVisibleModule = visibleModules[0];
    if (firstVisibleModule) {
        activateTab(`tab-module-${firstVisibleModule.id}`);
    } else if (accessMessage) {
        accessMessage.classList.add('active');
    }
    updateTabsArrowState();
}

function activateTab(targetId) {
    const tabButtons = document.querySelectorAll('#settings-tabs-nav .tab-item');
    const tabs = document.querySelectorAll('.settings-tab');

    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab-target') === targetId);
    });

    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.id === targetId);
    });
}

function initSuperAdminPanel() {
    renderOrderList();

    const saveBtn = document.getElementById('save-order-btn');
    const resetBtn = document.getElementById('reset-order-btn');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            localStorage.setItem('home_button_order', JSON.stringify(currentOrder));
            localStorage.setItem(QF_SETTINGS_TAB_VISIBILITY_KEY, JSON.stringify(currentQfTabVisibility));
            renderUserTabsAndPanels('tab-sa');
            showToast('Orden y visibilidad QF guardados correctamente.', 'success');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentOrder = MODULES.map(m => m.id);
            localStorage.setItem('home_button_order', JSON.stringify(currentOrder));
            renderOrderList();
            renderUserTabsAndPanels('tab-sa');
            showToast('Orden restablecido.', 'info');
        });
    }
}

function renderOrderList() {
    const list = document.getElementById('module-order-list');
    if (!list) return;

    list.innerHTML = '';

    currentOrder.forEach((moduleId, index) => {
        const module = MODULES.find(m => m.id === moduleId);
        if (!module) return;

        const li = document.createElement('li');
        const qfVisible = currentQfTabVisibility[module.id] !== false;
        li.className = 'order-item';
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-index', String(index));
        const qfButtonClass = `btn btn-sm qf-visibility-toggle ${qfVisible ? 'btn-primary' : 'btn-secondary'}`;
        li.innerHTML = `
            <div class="order-name-wrap">
                <span class="drag-handle" title="Arrastrar para ordenar">☰</span>
                <div class="order-name">${index + 1}. ${module.name}</div>
            </div>
            <div class="order-buttons">
                <button class="${qfButtonClass}" data-module-id="${module.id}" data-visible="${qfVisible ? '1' : '0'}" title="Mostrar en Ajustes para QF">
                    <i data-lucide="${qfVisible ? 'toggle-right' : 'toggle-left'}" style="width:16px; height:16px;"></i>
                    <span>Mostrar</span>
                </button>
                <button class="btn btn-sm move-up" ${index === 0 ? 'disabled' : ''}>Subir</button>
                <button class="btn btn-sm move-down" ${index === currentOrder.length - 1 ? 'disabled' : ''}>Bajar</button>
            </div>
        `;

        const qfToggleButton = li.querySelector('.qf-visibility-toggle');
        const upButton = li.querySelector('.move-up');
        const downButton = li.querySelector('.move-down');

        if (qfToggleButton) {
            qfToggleButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const moduleId = String(qfToggleButton.getAttribute('data-module-id') || '');
                if (!moduleId) return;
                const toggledVisible = !(currentQfTabVisibility[moduleId] !== false);
                currentQfTabVisibility[moduleId] = toggledVisible;
                renderOrderList();
                const toastMessage = toggledVisible
                    ? 'La visualizacion esta activa.'
                    : 'La visualizacion de esta pestaña esta desactivada.';
                const toastType = toggledVisible ? 'success' : 'info';
                showToast(toastMessage, toastType);
            });
        }

        upButton.addEventListener('click', () => {
            moveItem(index, index - 1);
        });

        downButton.addEventListener('click', () => {
            moveItem(index, index + 1);
        });

        li.addEventListener('dragstart', (event) => {
            draggedIndex = index;
            li.classList.add('dragging');
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(index));
            }
        });

        li.addEventListener('dragover', (event) => {
            event.preventDefault();
            if (draggedIndex === null || draggedIndex === index) return;
            li.classList.add('drag-over');
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over');
        });

        li.addEventListener('drop', (event) => {
            event.preventDefault();
            li.classList.remove('drag-over');
            if (draggedIndex === null || draggedIndex === index) return;
            moveItem(draggedIndex, index);
        });

        li.addEventListener('dragend', () => {
            draggedIndex = null;
            list.querySelectorAll('.order-item').forEach(node => {
                node.classList.remove('dragging');
                node.classList.remove('drag-over');
            });
        });

        list.appendChild(li);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function moveItem(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= currentOrder.length) return;
    const next = [...currentOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    currentOrder = next;
    renderOrderList();
    renderUserTabsAndPanels('tab-sa');
    showToast('Orden modificado. Recuerda guardar.', 'info');
}

function getVisibleModulesForUser(user) {
    const orderedModules = getOrderedModulesFromCurrent();
    if (user.cargo === 'Super Admin') return orderedModules;

    const settings = JSON.parse(localStorage.getItem('button_settings') || '{}');
    const roleFiltered = orderedModules.filter(module => canUserSeeModule(user, settings[module.id] || DEFAULT_BUTTON_SETTINGS));
    if (user.cargo !== 'Químico Farmacéutico') return roleFiltered;
    const qfVisibility = normalizeQfTabVisibility(currentQfTabVisibility);
    return roleFiltered.filter(module => qfVisibility[module.id] !== false);
}

function canUserSeeModule(user, moduleSettings) {
    let isVisible = true;

    if (moduleSettings.visibility === 'solo SA') {
        isVisible = false;
    } else if (moduleSettings.visibility === 'SA + QF') {
        if (user.cargo !== 'Químico Farmacéutico') isVisible = false;
    } else if (moduleSettings.visibility === 'SA + AF') {
        if (user.cargo !== 'Auxiliar de Farmacia') isVisible = false;
    }

    if (isVisible) {
        if (moduleSettings.status === 'Alfa') {
            isVisible = false;
        } else if (moduleSettings.status === 'Beta') {
            if (user.type !== 'Beta Tester') isVisible = false;
        }
    }

    return isVisible;
}

function loadButtonOrder() {
    return JSON.parse(localStorage.getItem('home_button_order') || '[]');
}

function loadQfTabVisibility() {
    return JSON.parse(localStorage.getItem(QF_SETTINGS_TAB_VISIBILITY_KEY) || '{}');
}

function normalizeOrder(order) {
    const valid = new Set(MODULES.map(m => m.id));
    const seen = new Set();
    const normalized = [];

    if (Array.isArray(order)) {
        order.forEach(id => {
            if (!valid.has(id) || seen.has(id)) return;
            normalized.push(id);
            seen.add(id);
        });
    }

    MODULES.forEach(module => {
        if (!seen.has(module.id)) {
            normalized.push(module.id);
            seen.add(module.id);
        }
    });

    return normalized;
}

function normalizeQfTabVisibility(visibilityMap) {
    const normalized = {};
    const source = visibilityMap && typeof visibilityMap === 'object' ? visibilityMap : {};
    MODULES.forEach((module) => {
        normalized[module.id] = source[module.id] !== false;
    });
    return normalized;
}

function getOrderedModulesFromCurrent() {
    const map = new Map(MODULES.map(module => [module.id, module]));
    return currentOrder.map(id => map.get(id)).filter(Boolean);
}

function updateTabsArrowState() {
    const scroller = document.getElementById('settings-tabs-scroller');
    const leftBtn = document.getElementById('tabs-scroll-left');
    const rightBtn = document.getElementById('tabs-scroll-right');
    if (!scroller || !leftBtn || !rightBtn) return;

    const maxLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const current = scroller.scrollLeft;
    leftBtn.disabled = current <= 1;
    rightBtn.disabled = current >= (maxLeft - 1);
}

function setupInventorySettingsBindings() {
    const modulePanels = document.getElementById('module-panels-container');
    const modal = document.getElementById('settings-motives-config-modal');
    const closeBtn = document.getElementById('settings-motives-config-close');
    const cancelBtn = document.getElementById('settings-motives-config-cancel');
    const saveBtn = document.getElementById('settings-motives-config-save');
    const inputList = document.getElementById('settings-motives-input-list');
    if (!modulePanels || !modal || !inputList) return;

    modulePanels.addEventListener('click', (event) => {
        const openBtn = event.target.closest('[data-action="open-movements-config"]');
        if (openBtn) {
            openMotivesConfigModal();
            return;
        }

        const addStorageBtn = event.target.closest('[data-action="settings-add-custom-storage"]');
        if (addStorageBtn) {
            addSettingsCustomStorageLocation();
            return;
        }

        const toggleStorageBtn = event.target.closest('[data-action="toggle-settings-storage-management"]');
        if (toggleStorageBtn) {
            toggleSettingsStorageManagement(toggleStorageBtn);
            return;
        }

        const saveStorageBtn = event.target.closest('[data-action="settings-save-custom-storage"]');
        if (saveStorageBtn) {
            void saveSettingsCustomStorageLocationsToServer();
            return;
        }

        const delStorageBtn = event.target.closest('[data-action="settings-delete-custom-storage"]');
        if (delStorageBtn) {
            const location = String(delStorageBtn.getAttribute('data-location') || '');
            if (!location) return;
            settingsCustomStorageLocations = settingsCustomStorageLocations.filter(loc => loc !== location);
            updateSettingsAllStorageLocations();
            renderSettingsCustomStorageLocations();
            renderSettingsProductStorageList();
            void saveSettingsCustomStorageLocationsToServer();
            return;
        }

        const toggleFondoAfBtn = event.target.closest('[data-action="toggle-settings-fondo-af"]');
        if (toggleFondoAfBtn) {
            settingsFondoAfVisible = !settingsFondoAfVisible;
            const content = document.getElementById('settings-fondo-af-content');
            if (content) content.style.display = settingsFondoAfVisible ? 'block' : 'none';
            const text = toggleFondoAfBtn.querySelector('span');
            const icon = toggleFondoAfBtn.querySelector('i');
            if (text) text.textContent = settingsFondoAfVisible ? 'Ocultar' : 'Mostrar';
            if (icon) icon.setAttribute('data-lucide', settingsFondoAfVisible ? 'chevron-up' : 'chevron-down');
            if (typeof lucide !== 'undefined') lucide.createIcons();
            if (settingsFondoAfVisible) renderSettingsFondoAfSection();
            return;
        }

        const toggleFondoLocalBtn = event.target.closest('[data-action="toggle-settings-fondo-local"]');
        if (toggleFondoLocalBtn) {
            settingsFondoLocalVisible = !settingsFondoLocalVisible;
            const content = document.getElementById('settings-fondo-local-content');
            if (content) content.style.display = settingsFondoLocalVisible ? 'block' : 'none';
            const text = toggleFondoLocalBtn.querySelector('span');
            const icon = toggleFondoLocalBtn.querySelector('i');
            if (text) text.textContent = settingsFondoLocalVisible ? 'Ocultar' : 'Mostrar';
            if (icon) icon.setAttribute('data-lucide', settingsFondoLocalVisible ? 'chevron-up' : 'chevron-down');
            if (typeof lucide !== 'undefined') lucide.createIcons();
            if (settingsFondoLocalVisible) renderSettingsFondoLocalSection();
            return;
        }

        const saveFondoBtn = event.target.closest('[data-action="settings-save-fondo-config"]');
        if (saveFondoBtn) {
            void saveSettingsFondoConfig();
            return;
        }

        const delFondoRowBtn = event.target.closest('.settings-fondo-row-delete');
        if (delFondoRowBtn) {
            const key = String(delFondoRowBtn.getAttribute('data-key') || '');
            const index = Number(delFondoRowBtn.getAttribute('data-index'));
            if (!settingsFondoDraft || !Number.isInteger(index)) return;
            if (key !== 'fondosAf') return;
            const rows = Array.isArray(settingsFondoDraft[key]) ? settingsFondoDraft[key] : [];
            rows.splice(index, 1);
            if (rows.length === 0) rows.push(createSettingsDynamicFondoRow(key, 0));
            ensureTrailingEmptySettingsRows(key);
            pruneTrailingEmptySettingsRows(key);
            if (settingsFondoAfVisible) renderSettingsFondoAfSection();
            return;
        }
    });

    modulePanels.addEventListener('change', (event) => {
        const select = event.target.closest('.settings-product-storage-select');
        if (select) {
            const index = Number(select.getAttribute('data-product-index'));
            if (!Number.isInteger(index)) return;
            const product = settingsStorageInventoryData.productos?.[index];
            if (!product) return;
            product.almacenamiento = select.value || 'Estándar';
            const productItem = select.closest('.product-item-storage');
            if (productItem) {
                productItem.classList.toggle('non-standard-storage', product.almacenamiento !== 'Estándar');
            }
            void saveSettingsAssignmentStorage();
            return;
        }

        const localChoice = event.target.closest('input[name="settings-fondo-local-choice"]');
        if (localChoice && settingsFondoDraft) {
            if (localChoice.value === 'custom') {
                const customInput = document.getElementById('settings-fondo-local-custom');
                if (customInput) {
                    customInput.disabled = false;
                    customInput.focus();
                }
            } else {
                settingsFondoDraft.fondoLocal = toNumberSafe(localChoice.value);
                if (settingsFondoLocalVisible) renderSettingsFondoLocalSection();
            }
        }
    });

    modulePanels.addEventListener('input', (event) => {
        const afInput = event.target.closest('.settings-fondo-af-input');
        if (afInput) {
            handleSettingsFondoAfInput(afInput);
            return;
        }

        const localCustomInput = event.target.closest('#settings-fondo-local-custom');
        if (localCustomInput && settingsFondoDraft) {
            settingsFondoDraft.fondoLocal = toNumberSafe(localCustomInput.value);
            if (settingsFondoLocalVisible) renderSettingsFondoLocalSection();
        }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeMotivesConfigModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeMotivesConfigModal);
    if (saveBtn) saveBtn.addEventListener('click', saveTransitReasonsFromSettingsModal);

    inputList.addEventListener('input', (event) => {
        const input = event.target.closest('.motive-config-input');
        if (!input) return;
        ensureTrailingEmptyMotiveRow();
    });

    inputList.addEventListener('click', (event) => {
        const del = event.target.closest('.motive-config-delete');
        if (!del) return;
        const row = del.closest('.motive-config-row');
        if (!row) return;
        row.remove();
        ensureTrailingEmptyMotiveRow();
    });

    window.addEventListener('click', (event) => {
        if (event.target === modal) closeMotivesConfigModal();
    });
}

function loadTransitReasonsForSettings() {
    const raw = localStorage.getItem('inventory_transit_reasons');
    if (!raw) {
        settingsTransitReasons = [...DEFAULT_TRANSIT_REASONS];
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) settingsTransitReasons = parsed;
        else settingsTransitReasons = [...DEFAULT_TRANSIT_REASONS];
    } catch {
        settingsTransitReasons = [...DEFAULT_TRANSIT_REASONS];
    }
}

function createSettingsMotiveRow(value = '') {
    const safe = String(value || '').replaceAll('"', '&quot;');
    const row = document.createElement('div');
    row.className = 'motive-config-row';
    row.innerHTML = `
        <input type="text" class="form-control motive-config-input" value="${safe}" placeholder="Nombre del motivo">
        <button type="button" class="btn btn-danger motive-config-delete" title="Eliminar motivo">
            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
        </button>
    `;
    return row;
}

function ensureTrailingEmptyMotiveRow() {
    const inputList = document.getElementById('settings-motives-input-list');
    if (!inputList) return;
    const rows = Array.from(inputList.querySelectorAll('.motive-config-input'));
    if (rows.length === 0 || rows[rows.length - 1].value.trim() !== '') {
        inputList.appendChild(createSettingsMotiveRow(''));
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function renderSettingsMotiveRows() {
    const inputList = document.getElementById('settings-motives-input-list');
    if (!inputList) return;
    inputList.innerHTML = '';
    settingsTransitReasons.forEach(reason => {
        inputList.appendChild(createSettingsMotiveRow(reason));
    });
    ensureTrailingEmptyMotiveRow();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function openMotivesConfigModal() {
    const modal = document.getElementById('settings-motives-config-modal');
    if (!modal) return;
    renderSettingsMotiveRows();
    modal.style.display = 'flex';
}

function closeMotivesConfigModal() {
    const modal = document.getElementById('settings-motives-config-modal');
    if (!modal) return;
    modal.style.display = 'none';
}

function saveTransitReasonsFromSettingsModal() {
    const inputList = document.getElementById('settings-motives-input-list');
    if (!inputList) return;

    const values = Array.from(inputList.querySelectorAll('.motive-config-input'))
        .map(input => input.value.trim())
        .filter(Boolean);

    settingsTransitReasons = values.length > 0 ? values : [...DEFAULT_TRANSIT_REASONS];
    localStorage.setItem('inventory_transit_reasons', JSON.stringify(settingsTransitReasons));
    closeMotivesConfigModal();
    showToast('Configuración de Movimientos guardada.', 'success');
}

function initializeSettingsInventoryStorageSection() {
    const root = document.getElementById('settings-storage-management-root');
    if (!root || !currentUser) return;
    if (!settingsStorageSectionVisible) return;
    void loadSettingsStorageManagementData();
}

function toggleSettingsStorageManagement(button) {
    const root = document.getElementById('settings-storage-management-root');
    if (!button || !root) return;

    settingsStorageSectionVisible = !settingsStorageSectionVisible;
    root.style.display = settingsStorageSectionVisible ? 'block' : 'none';

    const text = button.querySelector('span');
    const icon = button.querySelector('i');
    if (text) text.textContent = settingsStorageSectionVisible ? 'Ocultar Gestión' : 'Mostrar Gestión';
    if (icon) icon.setAttribute('data-lucide', settingsStorageSectionVisible ? 'package-minus' : 'package');
    if (typeof lucide !== 'undefined') lucide.createIcons();

    if (settingsStorageSectionVisible) {
        void loadSettingsStorageManagementData();
    }
}

async function loadSettingsStorageManagementData() {
    if (!currentUser?.locale_id) {
        renderSettingsCustomStorageLocations();
        renderSettingsProductStorageList();
        return;
    }

    await Promise.all([
        loadSettingsCustomStorageLocations(),
        loadSettingsWorkersData(),
        loadSettingsLatestInventoryData()
    ]);

    renderSettingsCustomStorageLocations();
    renderSettingsProductStorageList();
}

async function loadSettingsCustomStorageLocations() {
    try {
        const response = await fetch(`/api/storage/custom/${currentUser.locale_id}`);
        if (response.ok) {
            const parsed = await response.json();
            settingsCustomStorageLocations = Array.isArray(parsed) ? parsed : [];
        } else if (response.status === 404) {
            settingsCustomStorageLocations = [];
        } else {
            throw new Error(`Error loading custom storage: ${response.status}`);
        }
    } catch {
        settingsCustomStorageLocations = [];
    }
    updateSettingsAllStorageLocations();
}

async function saveSettingsCustomStorageLocationsToServer() {
    if (!currentUser?.locale_id) return;
    try {
        const response = await fetch(`/api/storage/custom/${currentUser.locale_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsCustomStorageLocations)
        });
        if (!response.ok) throw new Error(`Error saving custom storage: ${response.status}`);
        showToast('Lugares de almacenamiento personalizados guardados.', 'success');
    } catch {
        showToast('Error al guardar lugares personalizados.', 'error');
    }
}

function updateSettingsAllStorageLocations() {
    settingsAllStorageLocations = [...new Set([...PREDETERMINED_STORAGE_LOCATIONS, ...settingsCustomStorageLocations])];
}

function addSettingsCustomStorageLocation() {
    const input = document.getElementById('settings-custom-storage-input');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;
    if (settingsAllStorageLocations.includes(value)) {
        showToast('Ese lugar de almacenamiento ya existe.', 'info');
        return;
    }
    settingsCustomStorageLocations.push(value);
    updateSettingsAllStorageLocations();
    input.value = '';
    renderSettingsCustomStorageLocations();
    renderSettingsProductStorageList();
}

function renderSettingsCustomStorageLocations() {
    const list = document.getElementById('settings-custom-storage-list');
    if (!list) return;
    list.innerHTML = '';
    settingsCustomStorageLocations.forEach(location => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `
            <span>${escapeHtml(location)}</span>
            <button type="button" class="btn btn-sm btn-danger" data-action="settings-delete-custom-storage" data-location="${escapeHtmlAttr(location)}">x</button>
        `;
        list.appendChild(li);
    });
}

async function loadSettingsWorkersData() {
    if (!currentUser?.locale_id) {
        settingsStorageWorkers = [];
        return;
    }
    try {
        const allUsers = await Auth.fetchUsers();
        settingsStorageWorkers = (Array.isArray(allUsers) ? allUsers : [])
            .filter(user => String(user.locale_id || '') === String(currentUser.locale_id));
    } catch {
        settingsStorageWorkers = [];
    }
}

async function loadSettingsLatestInventoryData() {
    if (!currentUser?.locale_id) {
        settingsStorageInventoryData = { productos: [] };
        return;
    }

    let finalInventoryData = null;
    try {
        const assignmentResponse = await fetch(`/api/assignment/latest/${currentUser.locale_id}`, { cache: 'no-store' });
        if (assignmentResponse.ok) {
            finalInventoryData = await assignmentResponse.json();
        }
    } catch {
    }

    if (!finalInventoryData) {
        try {
            const inventoryResponse = await fetch(`/api/inventory/latest/${currentUser.locale_id}`, { cache: 'no-store' });
            if (inventoryResponse.ok) {
                finalInventoryData = await inventoryResponse.json();
            }
        } catch {
        }
    }

    settingsStorageInventoryData = finalInventoryData && Array.isArray(finalInventoryData.productos)
        ? finalInventoryData
        : { productos: [] };

    if (settingsStorageWorkers.length > 0) {
        settingsStorageInventoryData.productos.forEach(product => {
            if (product.asignado && product.asignado !== 0 && typeof product.asignado === 'string') {
                const worker = settingsStorageWorkers.find(w => w.worker_code === product.asignado);
                product.assigned_to = worker || null;
            }
        });
    }
}

function renderSettingsProductStorageList() {
    const list = document.getElementById('settings-product-storage-list');
    if (!list) return;

    const products = Array.isArray(settingsStorageInventoryData?.productos) ? settingsStorageInventoryData.productos : [];
    if (!products.length) {
        list.innerHTML = '<p>No hay productos para asignar almacenamiento.</p>';
        return;
    }

    list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    products.forEach((product, index) => {
        const item = document.createElement('div');
        const selectedStorage = product.almacenamiento || 'Estándar';
        item.className = `product-item-storage ${selectedStorage !== 'Estándar' ? 'non-standard-storage' : ''}`;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${product.codigo || ''} - ${product.nombre || ''}`;
        item.appendChild(nameSpan);

        const select = document.createElement('select');
        select.className = 'form-control settings-product-storage-select';
        select.setAttribute('data-product-index', String(index));
        settingsAllStorageLocations.forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            select.appendChild(option);
        });
        select.value = settingsAllStorageLocations.includes(selectedStorage) ? selectedStorage : 'Estándar';
        item.appendChild(select);
        fragment.appendChild(item);
    });
    list.appendChild(fragment);
}

function formatSettingsProductForSave(product) {
    const cleanedCodigo = product.codigo ? String(product.codigo).replace(/[\s\*]/g, '') : '';
    const generatedLink = cleanedCodigo ? `https://www.drsimi.cl/${cleanedCodigo}` : '';
    const generatedLink2 = cleanedCodigo ? `images/${cleanedCodigo}.webp` : '';
    const cantidad = Number(product.cantidad || 0);
    const real = Number(product.real || 0);
    return {
        n: product.n || 0,
        codigo: product.codigo || '',
        nombre: product.nombre || '',
        cantidad,
        asignado: product.assigned_to ? product.assigned_to.worker_code : (product.asignado || 0),
        destacado: product.destacado || 'NO',
        link: generatedLink,
        link2: generatedLink2,
        almacenamiento: product.almacenamiento || 'Estándar',
        estado: product.estado || 'Pendiente',
        encargado: product.encargado || product.revisado || 'Pendiente',
        fecha_revision: product.fecha_revision || 'Pendiente',
        transito: product.transito || 0,
        vencimiento: product.vencimiento || 'NO',
        real,
        diferencia: real - cantidad
    };
}

async function saveSettingsAssignmentStorage() {
    if (!currentUser?.locale_id || !Array.isArray(settingsStorageInventoryData?.productos)) return;
    try {
        const formattedProducts = settingsStorageInventoryData.productos.map(formatSettingsProductForSave);
        const payload = {
            fecha_procesado: settingsStorageInventoryData.fecha_procesado,
            total_productos: settingsStorageInventoryData.total_productos || formattedProducts.length,
            total_asignados: formattedProducts.filter(p => p.asignado !== 0).length,
            productos: formattedProducts
        };

        const response = await fetch(`/api/assignment/save/${currentUser.locale_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
        showToast('Hubo un error al guardar la asignación de almacenamiento.', 'error');
    }
}

function initializeSettingsFondoSection() {
    const afContent = document.getElementById('settings-fondo-af-content');
    const localContent = document.getElementById('settings-fondo-local-content');
    if (!afContent || !localContent || !currentUser) return;
    void loadSettingsFondoData();
}

async function loadSettingsFondoData() {
    settingsFondoRecords = [];
    settingsFondoDraft = null;
    if (!currentUser?.locale_id) return;

    try {
        const localeId = String(currentUser.locale_id || 'global').toLowerCase();
        const response = await fetch(`/api/fondo/list/${localeId}`);
        if (response.ok) {
            const payload = await response.json();
            settingsFondoRecords = Array.isArray(payload) ? payload : [];
        }
    } catch {
        settingsFondoRecords = [];
    }

    const latest = getLatestSettingsFondoRecord(settingsFondoRecords) || createBlankSettingsFondoRecord();
    settingsFondoDraft = cloneDeep(latest);
    if (!Array.isArray(settingsFondoDraft.fondosAf) || settingsFondoDraft.fondosAf.length === 0) {
        settingsFondoDraft.fondosAf = [createSettingsDynamicFondoRow('fondosAf', 0)];
    }
    ensureTrailingEmptySettingsRows('fondosAf');

    if (settingsFondoAfVisible) renderSettingsFondoAfSection();
    if (settingsFondoLocalVisible) renderSettingsFondoLocalSection();
}

function getLatestSettingsFondoRecord(records) {
    if (!Array.isArray(records) || records.length === 0) return null;
    const sorted = [...records].sort((a, b) => {
        const da = `${a.date || ''} ${a.time || ''}`;
        const db = `${b.date || ''} ${b.time || ''}`;
        return da < db ? 1 : -1;
    });
    return sorted[0] || null;
}

function settingsFondoAfLabel(index) {
    return `Fondo ${index + 1}`;
}

function createSettingsDynamicFondoRow(key, index) {
    if (key === 'fondosAf') {
        return { label: settingsFondoAfLabel(index), amount: 0 };
    }
    return { label: '', amount: 0 };
}

function isSettingsDynamicFondoRowEmpty(row, index, key) {
    const label = String(row?.label || '').trim();
    const amount = toNumberSafe(row?.amount);
    if (key === 'fondosAf') {
        return amount === 0 && (label === '' || label === settingsFondoAfLabel(index));
    }
    return amount === 0 && label === '';
}

function compactSettingsDynamicFondoRows(rows, key) {
    return (Array.isArray(rows) ? rows : [])
        .filter((row, index) => !isSettingsDynamicFondoRowEmpty(row, index, key))
        .map((row, index) => ({
            label: key === 'fondosAf'
                ? (String(row.label || '').trim() || settingsFondoAfLabel(index))
                : String(row.label || ''),
            amount: toNumberSafe(row.amount)
        }));
}

function createBlankSettingsFondoRecord() {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const hh = `${now.getHours()}`.padStart(2, '0');
    const mm = `${now.getMinutes()}`.padStart(2, '0');
    const workerName = `${currentUser?.names || currentUser?.name || ''} ${currentUser?.last_names || ''}`.trim() || 'Sin usuario';

    return {
        id: `rec-${Date.now()}`,
        date: isoDate,
        time: `${hh}:${mm}`,
        fondoLocal: 0,
        fondoFijo: DENOMINACIONES.map(den => ({ den, units: 0, direct: 0 })),
        sencillo: DENOMINACIONES.map(den => ({ den, units: 0, direct: 0 })),
        gastos: [{ label: '', amount: 0 }],
        fondosAf: [createSettingsDynamicFondoRow('fondosAf', 0)],
        worker: workerName,
        comment: ''
    };
}

function renderSettingsFondoAfSection() {
    const container = document.getElementById('settings-fondo-af-content');
    if (!container || !settingsFondoDraft) return;

    ensureTrailingEmptySettingsRows('fondosAf');
    pruneTrailingEmptySettingsRows('fondosAf');

    const rows = settingsFondoDraft.fondosAf || [];
    const total = rows.reduce((sum, row) => sum + toNumberSafe(row.amount), 0);

    container.innerHTML = `
        <div class="table-scroll">
            <table class="input-table" id="settings-fondo-af-table">
                <thead>
                    <tr>
                        <th>Concepto</th>
                        <th class="money">Monto</th>
                        <th class="center">Eliminar</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, index) => `
                    <tr data-index="${index}">
                        <td><input type="text" class="settings-fondo-af-input" data-key="label" data-index="${index}" value="${escapeHtmlAttr(String(row.label || '').trim() || settingsFondoAfLabel(index))}" placeholder="Concepto"></td>
                        <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="settings-fondo-af-input" data-key="amount" data-index="${index}" value="${toNumberSafe(row.amount)}"></td>
                        <td class="center"><button type="button" class="btn btn-sm btn-danger settings-fondo-row-delete" data-key="fondosAf" data-index="${index}" title="Eliminar">x</button></td>
                    </tr>
                    `).join('')}
                    <tr class="total-row"><td colspan="2">Total Fondo AF</td><td class="money">${formatMoneySafe(total)}</td></tr>
                </tbody>
            </table>
        </div>
    `;
}

function renderSettingsFondoLocalSection() {
    const container = document.getElementById('settings-fondo-local-content');
    if (!container || !settingsFondoDraft) return;
    const current = toNumberSafe(settingsFondoDraft.fondoLocal);
    const isPreset = FONDO_LOCAL_OPTIONS.includes(current);

    container.innerHTML = `
        <div class="settings-fondo-local-picker">
            <p class="settings-fondo-local-hint">Selecciona un monto base o usa un valor personalizado.</p>
            ${FONDO_LOCAL_OPTIONS.map(option => `
            <label class="settings-fondo-local-option ${current === option ? 'is-active' : ''}">
                <input type="radio" name="settings-fondo-local-choice" value="${option}" ${current === option ? 'checked' : ''}>
                <span>${formatMoneySafe(option)}</span>
            </label>
            `).join('')}
            <label class="settings-fondo-local-option ${!isPreset ? 'is-active' : ''}">
                <input type="radio" name="settings-fondo-local-choice" value="custom" ${!isPreset ? 'checked' : ''}>
                <span>Personalizado</span>
            </label>
        </div>
        <div class="form-group settings-fondo-local-custom-wrap ${!isPreset ? 'is-active' : ''}">
            <label class="form-label" for="settings-fondo-local-custom">Monto personalizado</label>
            <input id="settings-fondo-local-custom" class="form-control" type="number" value="${current}" ${isPreset ? 'disabled' : ''}>
        </div>
    `;
}

function handleSettingsFondoAfInput(input) {
    if (!settingsFondoDraft) return;
    const index = Number(input.getAttribute('data-index'));
    const key = input.getAttribute('data-key');
    if (!Number.isInteger(index) || !key) return;

    const rows = settingsFondoDraft.fondosAf || [];
    if (!rows[index]) return;
    rows[index][key] = key === 'amount' ? toNumberSafe(input.value) : String(input.value || '');
    ensureTrailingEmptySettingsRows('fondosAf');
    pruneTrailingEmptySettingsRows('fondosAf');
    if (settingsFondoAfVisible) renderSettingsFondoAfSection();
}

function ensureTrailingEmptySettingsRows(key) {
    if (!settingsFondoDraft) return;
    if (!Array.isArray(settingsFondoDraft[key])) settingsFondoDraft[key] = [];
    const rows = settingsFondoDraft[key];
    if (rows.length === 0) {
        rows.push(createSettingsDynamicFondoRow(key, 0));
        return;
    }
    const lastIndex = rows.length - 1;
    const last = rows[lastIndex];
    if (!isSettingsDynamicFondoRowEmpty(last, lastIndex, key)) {
        rows.push(createSettingsDynamicFondoRow(key, rows.length));
    }
}

function pruneTrailingEmptySettingsRows(key) {
    if (!settingsFondoDraft || !Array.isArray(settingsFondoDraft[key])) return;
    const rows = settingsFondoDraft[key];
    while (rows.length > 1) {
        const lastIndex = rows.length - 1;
        const prevIndex = rows.length - 2;
        const last = rows[lastIndex];
        const prev = rows[prevIndex];
        const lastEmpty = isSettingsDynamicFondoRowEmpty(last, lastIndex, key);
        const prevEmpty = isSettingsDynamicFondoRowEmpty(prev, prevIndex, key);
        if (lastEmpty && prevEmpty) rows.pop();
        else break;
    }
}

async function saveSettingsFondoConfig() {
    if (!currentUser?.locale_id || !settingsFondoDraft) return;
    const localeId = String(currentUser.locale_id || 'global').toLowerCase();
    settingsFondoDraft.fondosAf = compactSettingsDynamicFondoRows(settingsFondoDraft.fondosAf, 'fondosAf');

    const index = settingsFondoRecords.findIndex(r => r.id === settingsFondoDraft.id);
    if (index >= 0) settingsFondoRecords[index] = cloneDeep(settingsFondoDraft);
    else settingsFondoRecords.push(cloneDeep(settingsFondoDraft));

    try {
        const response = await fetch(`/api/fondo/list/${localeId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsFondoRecords)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        showToast('Configuración de Fondo guardada.', 'success');
    } catch {
        showToast('No se pudo guardar la configuración de Fondo.', 'error');
    } finally {
        ensureTrailingEmptySettingsRows('fondosAf');
        if (settingsFondoAfVisible) renderSettingsFondoAfSection();
        if (settingsFondoLocalVisible) renderSettingsFondoLocalSection();
    }
}

function toNumberSafe(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneySafe(value) {
    return `$${new Intl.NumberFormat('es-CL').format(Math.round(toNumberSafe(value)))}`;
}

function cloneDeep(value) {
    return JSON.parse(JSON.stringify(value));
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
