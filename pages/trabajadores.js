import { Auth } from "/core/js/auth.js";
import { showToast, showConfirmDialog, showLoadingOverlay, hideLoadingOverlay } from "/core/js/ui-feedback.js";

const state = {
    currentUser: null,
    users: [],
    locales: []
};

const els = {
    tableBody: document.getElementById("trabajadores-table-body"),
    subtitle: document.getElementById("trabajadores-subtitle"),
    logoutBtn: document.getElementById("logout-btn")
};

function isSuperAdmin(user) {
    const cargo = String(user?.cargo || "").toLowerCase();
    return cargo.includes("super admin");
}

function isQf(user) {
    const cargo = String(user?.cargo || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    return cargo.includes("quimico") || cargo.includes("qf");
}

function normalizeCargo(value = "") {
    const ascii = String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    if (ascii.includes("super admin")) return "super_admin";
    if (ascii.includes("quimico") || ascii.includes("qf")) return "qf";
    if (ascii.includes("af") || ascii.includes("auxiliar")) return "af";
    return "other";
}

function roleClassByCargo(cargo = "") {
    const role = normalizeCargo(cargo);
    if (role === "super_admin") return "role-super";
    if (role === "qf") return "role-qf";
    if (role === "af") return "role-af";
    return "role-other";
}

function sanitizeColor(value = "") {
    const color = String(value || "").trim();
    if (!color) return "";
    // Allow common CSS color formats and names, block dangerous characters.
    const safePattern = /^[#a-zA-Z0-9(),.%\s-]+$/;
    return safePattern.test(color) ? color : "";
}

function fallbackColorByRoleClass(roleClass) {
    if (roleClass === "role-super") return "var(--danger-color)";
    if (roleClass === "role-qf") return "var(--primary-color)";
    if (roleClass === "role-af") return "var(--accent-color)";
    return "var(--secondary-color)";
}

function workerCodeBubbleStyle(user, roleClass) {
    const fromUser = sanitizeColor(user?.color);
    const bgColor = fromUser || fallbackColorByRoleClass(roleClass);
    return `background-color:${bgColor};`;
}

function normalizeType(value = "") {
    const text = String(value || "").trim().toLowerCase();
    if (text.includes("beta")) return "Beta Tester";
    return "Estandar";
}

function setupHeader(user) {
    const userSigla = document.getElementById("user-sigla");
    const userName = document.getElementById("user-name-text");
    const userCargo = document.getElementById("user-cargo-text");

    const initials = (user.names || user.name || "")
        .split(" ")
        .filter(Boolean)
        .map((name) => name[0] || "")
        .join("") + (user.last_names ? user.last_names[0] : "");

    userSigla.textContent = (initials || "--").toUpperCase().substring(0, 2);
    userName.textContent = `${user.names || user.name || ""} ${user.last_names || ""}`.trim() || "Sin usuario";
    userCargo.textContent = user.cargo || "";
}

function localeLabelById(localeId) {
    const locale = state.locales.find((item) => String(item?.id || "") === String(localeId || ""));
    if (!locale) {
        return String(localeId || "Sin local");
    }
    const name = String(locale?.name || locale?.nombre || "").trim();
    return `${locale.id} ${name}`.trim();
}

function getVisibleUsers() {
    if (isSuperAdmin(state.currentUser)) {
        return [...state.users];
    }
    const currentLocale = String(state.currentUser?.locale_id || "");
    return state.users.filter((user) => String(user?.locale_id || "") === currentLocale);
}

function getLocaleSelectHtml(selectedLocaleId, workerRut) {
    const optionsHtml = state.locales
        .map((locale) => {
            const localeId = String(locale?.id || "");
            const selected = localeId === String(selectedLocaleId || "") ? "selected" : "";
            return `<option value="${localeId}" ${selected}>${localeLabelById(localeId)}</option>`;
        })
        .join("");

    return `<select class="form-control form-select-sm worker-locale-select" data-worker-rut="${workerRut}" data-current-locale="${String(selectedLocaleId || "")}">
        ${optionsHtml}
    </select>`;
}

function getTypeSelectHtml(selectedType, workerRut) {
    const normalized = normalizeType(selectedType);
    return `<select class="form-control form-select-sm worker-type-select" data-worker-rut="${workerRut}" data-current-type="${normalized}">
        <option value="Estandar" ${normalized === "Estandar" ? "selected" : ""}>Estandar</option>
        <option value="Beta Tester" ${normalized === "Beta Tester" ? "selected" : ""}>Beta Tester</option>
    </select>`;
}

function renderTable() {
    if (!els.tableBody) return;
    const visibleUsers = getVisibleUsers();

    if (isSuperAdmin(state.currentUser)) {
        els.subtitle.textContent = `Mostrando todos los trabajadores (${visibleUsers.length}).`;
    } else if (isQf(state.currentUser)) {
        els.subtitle.textContent = `Mostrando trabajadores de tu local (${visibleUsers.length}). Si mueves uno a otro local, dejarás de verlo.`;
    } else {
        els.subtitle.textContent = `Mostrando trabajadores de tu local (${visibleUsers.length}).`;
    }

    if (!visibleUsers.length) {
        els.tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-muted">No hay trabajadores para mostrar.</td>
            </tr>
        `;
        return;
    }

    els.tableBody.innerHTML = visibleUsers
        .sort((a, b) => String(a.worker_code || "").localeCompare(String(b.worker_code || "")))
        .map((user) => {
            const fullName = `${user.names || ""} ${user.last_names || ""}`.trim() || "Sin nombre";
            const roleClass = roleClassByCargo(user.cargo || "");
            const typeValue = normalizeType(user.type);
            return `
                <tr>
                    <td><span class="worker-code-bubble" style="${workerCodeBubbleStyle(user, roleClass)}">${user.worker_code || "-"}</span></td>
                    <td>${fullName}</td>
                    <td><span class="worker-role-chip ${roleClass}">${user.cargo || "-"}</span></td>
                    <td>${getTypeSelectHtml(typeValue, user.rut)}</td>
                    <td>${getLocaleSelectHtml(user.locale_id, user.rut)}</td>
                </tr>
            `;
        })
        .join("");
}

async function updateWorkerField(workerRut, updates, confirmMessage, successMessage) {
    const worker = state.users.find((user) => String(user?.rut || "") === String(workerRut || ""));
    if (!worker) {
        showToast("No se encontró el trabajador seleccionado.", "error");
        return false;
    }
    const confirmed = await showConfirmDialog(confirmMessage, "Confirmar cambio");

    if (!confirmed) {
        return false;
    }

    try {
        const merged = { ...worker, ...updates };
        await Auth.saveUser(merged);
        Object.assign(worker, updates);
        showToast(successMessage, "success");
        renderTable();
        return true;
    } catch {
        showToast("No se pudo guardar el cambio.", "error");
        return false;
    }
}

function bindEvents() {
    els.logoutBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        Auth.logout();
    });

    els.tableBody?.addEventListener("change", async (event) => {
        const select = event.target.closest(".worker-locale-select");
        if (select) {
            const workerRut = String(select.dataset.workerRut || "");
            const previousLocaleId = String(select.dataset.currentLocale || "");
            const newLocaleId = String(select.value || "");
            if (!workerRut || !newLocaleId || newLocaleId === previousLocaleId) {
                return;
            }

            const worker = state.users.find((user) => String(user?.rut || "") === workerRut);
            const workerName = `${worker?.names || ""} ${worker?.last_names || ""}`.trim() || "Trabajador";
            const previousLabel = localeLabelById(previousLocaleId);
            const newLabel = localeLabelById(newLocaleId);
            const success = await updateWorkerField(
                workerRut,
                { locale_id: newLocaleId },
                `¿Deseas mover a ${workerName} de "${previousLabel}" a "${newLabel}"?`,
                "Trabajador movido correctamente."
            );
            if (!success) {
                select.value = previousLocaleId;
                return;
            }
            select.dataset.currentLocale = newLocaleId;
            return;
        }

        const typeSelect = event.target.closest(".worker-type-select");
        if (typeSelect) {
            const workerRut = String(typeSelect.dataset.workerRut || "");
            const previousType = String(typeSelect.dataset.currentType || "Estandar");
            const newType = String(typeSelect.value || "Estandar");
            if (!workerRut || newType === previousType) {
                return;
            }

            const worker = state.users.find((user) => String(user?.rut || "") === workerRut);
            const workerName = `${worker?.names || ""} ${worker?.last_names || ""}`.trim() || "Trabajador";
            const success = await updateWorkerField(
                workerRut,
                { type: newType },
                `¿Deseas cambiar el tipo de ${workerName} de "${previousType}" a "${newType}"?`,
                "Tipo de trabajador actualizado."
            );
            if (!success) {
                typeSelect.value = previousType;
                return;
            }
            typeSelect.dataset.currentType = newType;
            return;
        }
    });
}

async function loadData() {
    const [usersResponse, localesResponse] = await Promise.all([
        Auth.fetchUsers(),
        fetch("/api/locales")
    ]);
    const localesData = localesResponse.ok ? await localesResponse.json() : [];

    state.users = Array.isArray(usersResponse) ? usersResponse : [];
    state.locales = Array.isArray(localesData) ? localesData : [];
}

async function init() {
    showLoadingOverlay("Cargando trabajadores...");
    const user = Auth.checkAuth();
    if (!user) {
        hideLoadingOverlay();
        return;
    }

    try {
        state.currentUser = user;
        setupHeader(user);
        await loadData();
        renderTable();
        bindEvents();
        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    } catch {
        showToast("No se pudo cargar la lista de trabajadores.", "error");
    } finally {
        hideLoadingOverlay();
    }
}

void init();
