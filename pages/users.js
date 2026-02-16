import { Auth } from '../core/js/auth.js';
import { showLoadingOverlay, hideLoadingOverlay } from '/core/js/ui-feedback.js';

// State
let usersList = [];
let availableLocales = [];
let predefinedColors = [
    { hex: "#B71C1C" }, { hex: "#E53935" }, { hex: "#D81B60" }, { hex: "#8E24AA" },
    { hex: "#5E35B1" }, { hex: "#3949AB" }, { hex: "#1E88E5" }, { hex: "#039BE5" },
    { hex: "#00ACC1" }, { hex: "#00897B" }, { hex: "#43A047" }, { hex: "#7CB342" },
    { hex: "#C0CA33" }, { hex: "#FDD835" }, { hex: "#FFB300" }, { hex: "#FB8C00" },
    { hex: "#F4511E" }, { hex: "#6D4C41" }, { hex: "#546E7A" }, { hex: "#78909C" }
];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay('Cargando usuarios...');
    // 1. Check Auth
    currentUser = Auth.getUser();
    if (!currentUser) {
        hideLoadingOverlay();
        window.location.href = 'home.html';
        return;
    }

    // Initialize Icons
    lucide.createIcons();

    // Setup Header User Info
    setupHeader(currentUser);
    setupPasswordToggle();

    // SA Controls
    if (currentUser.cargo === 'Super Admin') {
        // document.getElementById('context-bar').style.display = 'flex'; // This is handled by subheader-fixed already being visible
        document.getElementById('type-group').style.display = 'block';
    } else {
        // Hide Locale Selector in form for non-admins if they shouldn't change it
        // Or disable it. Code below handles logic.
    }

    try {
        // 2. Load Data
        await loadLocales();
        renderColorGrid();
        await loadUsers();

        // 3. Setup Listeners
        setupFormListeners();
        setupRUTFormatter();

        // Check for Edit Param
        const urlParams = new URLSearchParams(window.location.search);
        const editCode = urlParams.get('edit');
        if (editCode) {
            // Find user by RUT or Code
            const u = usersList.find(x => x.rut === editCode);
            if (u) editUser(u.rut);
        }
    } finally {
        hideLoadingOverlay();
    }
});

// --- DATA LOADING ---

async function loadLocales() {
    try {
        // Fetch from API (Assuming standard /api/locales endpoint exists based on exampe)
        // If not, we might need to mock or use Auth defaults
        const response = await fetch('/api/locales');
        if (response.ok) {
            availableLocales = await response.json();
            availableLocales.sort((a, b) => a.id.localeCompare(b.id));
        } else {
            console.warn("Could not fetch locales, using Auth defaults or empty.");
            // Fallback if needed
            availableLocales = [{ id: 'SCL', name: 'Santiago' }, { id: 'VAL', name: 'Valparaiso' }];
        }

        // Populate Form Select
        const select = document.getElementById('locale_id');
        select.innerHTML = '';

        availableLocales.forEach(loc => {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = `${loc.name} (${loc.id})`;
            select.appendChild(opt);
        });

        // Populate Context Bar (SA Only)
        if (currentUser.cargo === 'Super Admin') {
            const container = document.getElementById('locale-selector-container');
            const matchSelect = document.createElement('select');
            matchSelect.className = 'context-select';

            const allOpt = document.createElement('option');
            allOpt.value = 'ALL';
            allOpt.textContent = 'TODOS';
            matchSelect.appendChild(allOpt);

            availableLocales.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.textContent = loc.id;
                matchSelect.appendChild(opt);
            });

            // Set current context
            const currentCtx = localStorage.getItem('context_locale') || 'ALL';
            matchSelect.value = currentCtx;

            matchSelect.addEventListener('change', (e) => {
                localStorage.setItem('context_locale', e.target.value);
                renderUsers(); // Re-render logic
            });

            container.appendChild(matchSelect);
        }

    } catch (e) {
        console.error("Error loading locales:", e);
    }
}

async function loadUsers() {
    try {
        usersList = await Auth.fetchUsers();
        renderUsers();
    } catch (e) {
        console.error("Error loading users:", e);
        document.getElementById('users-grid').innerHTML = '<div class="p-4 text-red-500">Error al cargar usuarios.</div>';
    }
}

// --- RENDERING ---

function renderUsers() {
    const grid = document.getElementById('users-grid');
    grid.innerHTML = '';

    // Filter Logic
    let filtered = [...usersList];

    if (currentUser.cargo === 'Super Admin') {
        const ctx = localStorage.getItem('context_locale') || 'ALL';
        if (ctx !== 'ALL') {
            filtered = filtered.filter(u => u.locale_id === ctx);
        }
    } else {
        // QF/AF only see their locale
        filtered = filtered.filter(u => u.locale_id === currentUser.locale_id);
    }

    // Sort by Worker Code (Alpha or Numeric)
    filtered.sort((a, b) => {
        const codeA = parseInt(a.worker_code) || 0;
        const codeB = parseInt(b.worker_code) || 0;
        return codeA - codeB;
    });

    document.getElementById('user-count').textContent = filtered.length;

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; color: var(--text-muted);">No se encontraron usuarios.</div>';
        return;
    }

    filtered.forEach(u => {
        const card = document.createElement('div');
        card.className = `user-card ${u.estado === 'Deshabilitado' ? 'disabled' : ''}`;

        // Badges Map
        const roleMap = {
            'Super Admin': { short: 'SA', class: 'badge-super' },
            'Químico Farmacéutico': { short: 'QF', class: 'badge-qf' },
            'Auxiliar de Farmacia': { short: 'AF', class: 'badge-af' }
        };
        const roleInfo = roleMap[u.cargo] || { short: u.cargo, class: 'badge-role' };

        // Avatar Initials or Number
        // Example used Number from worker_code
        const bubbleContent = (u.worker_code || '').replace(/\D/g, '').slice(-4) || (u.names ? u.names[0] : '?');

        card.innerHTML = `
            <div class="user-card-header">
                <div class="user-avatar-circle" style="background-color: ${u.color || '#888'}">
                    ${bubbleContent}
                </div>
                <div class="user-card-info">
                    <span class="user-name" title="${u.names} ${u.last_names}">${u.names} ${u.last_names}</span>
                    <div class="user-badges">
                        <span class="badge ${roleInfo.class}">${roleInfo.short}</span>
                        <span class="badge badge-locale">${u.locale_id}</span>
                        ${u.type === 'Beta Tester' ? '<span class="badge" style="background:#FFA000; color:white;">BETA</span>' : ''}
                    </div>
                </div>
            </div>
            
            <div class="user-card-details">
                <div class="detail-row"><span>RUT:</span> <span>${u.rut}</span></div>
                <div class="detail-row"><span>Código:</span> <span>${u.worker_code || '--'}</span></div>
                <div class="detail-row"><span>Email:</span> <span style="font-size:0.8em; overflow:hidden; text-overflow:ellipsis;">${u.contact_email || '--'}</span></div>
            </div>

            <div class="user-card-actions">
                <button class="btn btn-primary btn-block" style="flex:1;" onclick="window.editUser('${u.rut}')">
                    <i data-lucide="edit-2" style="width:14px; height:14px; margin-right:4px;"></i> Editar
                </button>
                ${u.rut !== currentUser.rut && currentUser.cargo === 'Super Admin' ? `
                <button class="btn btn-danger" style="padding: 0.5rem;" onclick="window.deleteUser('${u.rut}')">
                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                </button>
                ` : ''}
            </div>
        `;

        grid.appendChild(card);
    });

    lucide.createIcons();
}

// --- FORM HANDLING ---

function renderColorGrid() {
    const grid = document.getElementById('color-grid');
    grid.innerHTML = '';
    predefinedColors.forEach(c => {
        const div = document.createElement('div');
        div.className = 'color-swatch';
        div.style.backgroundColor = c.hex;
        div.onclick = () => selectColor(c.hex);
        grid.appendChild(div);
    });
}

function selectColor(hex) {
    document.getElementById('user-color').value = hex;
    document.getElementById('current-color-preview').style.backgroundColor = hex;
}

window.resetForm = () => {
    document.getElementById('user-form').reset();
    document.getElementById('edit-rut').value = '';
    document.getElementById('rut').disabled = false; // Enable RUT for new
    document.getElementById('form-action-text').textContent = 'Crear Usuario';
    selectColor('#888888');
    setPasswordVisibility(false);

    // Set default locale if QF
    if (currentUser.cargo !== 'Super Admin') {
        document.getElementById('locale_id').value = currentUser.locale_id;
        document.getElementById('locale_id').disabled = true;
    }
};

window.editUser = (rut) => {
    const user = usersList.find(u => u.rut === rut);
    if (!user) return;

    resetForm();

    document.getElementById('edit-rut').value = user.rut;
    document.getElementById('rut').value = user.rut;
    document.getElementById('rut').disabled = true; // No changing RUT

    document.getElementById('worker_code').value = user.worker_code || '';
    document.getElementById('names').value = user.names || '';
    document.getElementById('last_names').value = user.last_names || '';
    document.getElementById('password').value = user.password || '';
    setPasswordVisibility(false);
    document.getElementById('cargo').value = user.cargo;
    document.getElementById('locale_id').value = user.locale_id;
    document.getElementById('estado').value = user.estado || 'Habilitado';
    document.getElementById('type').value = user.type || 'Estandar';

    document.getElementById('birth_date').value = user.birth_date || '';
    document.getElementById('incorporation_date').value = user.incorporation_date || '';
    document.getElementById('contact_number').value = user.contact_number || '';
    document.getElementById('contact_email').value = user.contact_email || '';
    document.getElementById('address').value = user.address || '';

    selectColor(user.color || '#888888');
    document.getElementById('form-action-text').textContent = 'Editar Usuario';

    // Scroll to form if on mobile
    if (window.innerWidth < 1024) {
        document.querySelector('.user-form-container').scrollIntoView({ behavior: 'smooth' });
    }
};

window.deleteUser = async (rut) => {
    if (!confirm(`¿Eliminar al usuario ${rut}?`)) return;

    try {
        await Auth.deleteUser(rut);
        await loadUsers(); // Refresh
        alert('Usuario eliminado.');
    } catch (e) {
        alert(e.message);
    }
};

function setupFormListeners() {
    document.getElementById('user-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            rut: document.getElementById('rut').value.trim(),
            worker_code: document.getElementById('worker_code').value.trim(),
            names: document.getElementById('names').value.trim(),
            last_names: document.getElementById('last_names').value.trim(),
            password: document.getElementById('password').value.trim(),
            cargo: document.getElementById('cargo').value,
            locale_id: document.getElementById('locale_id').value,
            estado: document.getElementById('estado').value,
            type: document.getElementById('type').value,
            color: document.getElementById('user-color').value,
            birth_date: document.getElementById('birth_date').value,
            incorporation_date: document.getElementById('incorporation_date').value,
            contact_number: document.getElementById('contact_number').value,
            contact_email: document.getElementById('contact_email').value,
            address: document.getElementById('address').value
        };

        try {
            await Auth.saveUser(data);
            alert('Usuario guardado exitosamente.');
            await loadUsers();
            resetForm();
        } catch (err) {
            console.error(err);
            alert('Error al guardar: ' + err.message);
        }
    });
}

function setupRUTFormatter() {
    const rutInput = document.getElementById('rut');
    rutInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/[^0-9kK]/g, '');
        if (value.length > 1) {
            const dv = value.slice(-1);
            let body = value.slice(0, -1);
            body = parseInt(body).toLocaleString('de-DE'); // Dots for thousands
            e.target.value = `${body}-${dv}`;
        } else {
            e.target.value = value;
        }
    });
}

function setupPasswordToggle() {
    const toggleBtn = document.getElementById('toggle-password-visibility');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const passwordInput = document.getElementById('password');
        if (!passwordInput) return;
        const isVisible = passwordInput.type === 'text';
        setPasswordVisibility(!isVisible);
    });
}

function setPasswordVisibility(visible) {
    const passwordInput = document.getElementById('password');
    const showIcon = document.getElementById('password-icon-show');
    const hideIcon = document.getElementById('password-icon-hide');
    const toggleBtn = document.getElementById('toggle-password-visibility');
    if (!passwordInput || !showIcon || !hideIcon || !toggleBtn) return;

    passwordInput.type = visible ? 'text' : 'password';
    showIcon.classList.toggle('hidden', visible);
    hideIcon.classList.toggle('hidden', !visible);
    toggleBtn.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    toggleBtn.setAttribute('title', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
}

function setupHeader(user) {
    const userSigla = document.getElementById('user-sigla');
    const userName = document.getElementById('user-name-text');
    const userCargo = document.getElementById('user-cargo-text');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        // Initials for mobile
        const initials = (user.names || user.name).split(' ').map(n => n[0]).join('') + (user.last_names ? user.last_names[0] : '');
        userSigla.textContent = initials.toUpperCase().substring(0, 2);

        // Full name and cargo for PC
        userName.textContent = `${user.names || user.name} ${user.last_names || ''}`;
        userCargo.textContent = user.cargo;
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });
    }
}
