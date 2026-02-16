import { Auth } from "/core/js/auth.js";
import { showLoadingOverlay, hideLoadingOverlay } from "/core/js/ui-feedback.js";

const state = {
    user: null,
    allUsers: [],
    locales: [],
    events: [],
    view: "month",
    cursorDate: new Date(),
    selectedDate: toDateKey(new Date()),
    editingEvent: null,
    saViewAll: false,
    saFilterLocale: "all",
    saFilterDate: "",
    saFilterRole: "all"
};

const els = {
    periodLabel: document.getElementById("period-label"),
    prevBtn: document.getElementById("prev-period"),
    nextBtn: document.getElementById("next-period"),
    todayBtn: document.getElementById("today-btn"),
    viewSwitch: document.getElementById("view-switch"),
    board: document.getElementById("calendar-board"),
    selectedDateLabel: document.getElementById("selected-date-label"),
    selectedDayList: document.getElementById("selected-day-list"),
    newBtn: document.getElementById("new-reminder-btn"),
    modal: document.getElementById("calendar-modal"),
    modalTitle: document.getElementById("calendar-modal-title"),
    closeModal: document.getElementById("close-calendar-modal"),
    cancelModal: document.getElementById("cancel-event-btn"),
    saveModal: document.getElementById("save-event-btn"),
    title: document.getElementById("event-title"),
    date: document.getElementById("event-date"),
    startTime: document.getElementById("event-start-time"),
    endTime: document.getElementById("event-end-time"),
    importance: document.getElementById("event-importance"),
    type: document.getElementById("event-type"),
    scope: document.getElementById("event-scope"),
    assigneeWrap: document.getElementById("task-assignee-wrap"),
    assignee: document.getElementById("task-assignee"),
    description: document.getElementById("event-description"),
    notes: document.getElementById("event-notes"),
    logout: document.getElementById("logout-btn"),
    saFiltersBar: document.getElementById("sa-filters-bar"),
    saViewAllToggle: document.getElementById("sa-view-all-toggle"),
    saFilterLocale: document.getElementById("sa-filter-locale"),
    saFilterDate: document.getElementById("sa-filter-date"),
    saFilterRole: document.getElementById("sa-filter-role"),
    saFilterClear: document.getElementById("sa-filter-clear"),
    viewModal: document.getElementById("calendar-view-modal"),
    viewModalBody: document.getElementById("calendar-view-body"),
    viewModalTitle: document.getElementById("calendar-view-title"),
    viewModalClose: document.getElementById("close-calendar-view-modal"),
    viewCloseBtn: document.getElementById("view-close-btn"),
    viewToggleStateBtn: document.getElementById("view-toggle-state-btn"),
    viewEditBtn: document.getElementById("view-edit-btn")
};

function toDateKey(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function fromDateKey(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function startOfWeek(date) {
    const copy = new Date(date);
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function endOfWeek(date) {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

function monthRange(date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const end = endOfWeek(last);
    return { start, end };
}

function normalizeCargo(value = "") {
    const ascii = String(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    if (ascii.includes("super admin")) return "super_admin";
    if (ascii.includes("quimico") || ascii.includes("qf")) return "qf";
    if (ascii.includes("af") || ascii.includes("auxiliar")) return "af";
    return "other";
}

function getScopeOptions() {
    const role = normalizeCargo(state.user?.cargo);
    const localeId = String(state.user?.locale_id || "").toLowerCase();

    if (role === "super_admin") {
        return [
            { value: "global_all", label: "Todos los trabajadores (todos los locales)", localeId: "all" },
            { value: "global_af", label: "Solo AF (todos los locales)", localeId: "all" },
            { value: "global_qf", label: "Solo QF (todos los locales)", localeId: "all" }
        ];
    }

    if (role === "qf") {
        return [
            { value: "local_qf", label: "Solo QF (tu local)", localeId },
            { value: "local_af", label: "Solo AF (tu local)", localeId },
            { value: "local_qf_af", label: "QF y AF (tu local)", localeId }
        ];
    }

    if (role === "af") {
        return [{ value: "local_qf_af", label: "QF y AF (tu local)", localeId }];
    }

    return [];
}

function isEditable(event) {
    const role = normalizeCargo(state.user?.cargo);
    return role === "super_admin" || String(event?.createdBy?.rut || "") === String(state.user?.rut || "");
}

function importanceClass(value) {
    return `importance-${value || "media"}`;
}

function eventTimeText(event) {
    if (!event.startTime && !event.endTime) return "Todo el día";
    if (event.startTime && event.endTime) return `${event.startTime} - ${event.endTime}`;
    return event.startTime || event.endTime;
}

function formatDateLabel(dateKey) {
    const date = fromDateKey(dateKey);
    return new Intl.DateTimeFormat("es-CL", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(date);
}

function scopeTypeLabel(scopeType) {
    const map = {
        global_all: "Todos los trabajadores (todos los locales)",
        global_qf: "Solo QF (todos los locales)",
        global_af: "Solo AF (todos los locales)",
        local_qf: "Solo QF (local)",
        local_af: "Solo AF (local)",
        local_qf_af: "QF y AF (local)"
    };
    return map[scopeType] || scopeType || "-";
}

function normalizeLocaleId(value) {
    return String(value || "").toLowerCase();
}

function localeLabelById(value) {
    const localeId = normalizeLocaleId(value);
    if (!localeId || localeId === "all") return "Todos los locales";
    const locale = state.locales.find((item) => normalizeLocaleId(item?.id) === localeId);
    if (!locale) return String(value || "-");
    const name = String(locale?.name || locale?.nombre || "").trim();
    return `${locale.id} ${name}`.trim();
}

function creatorWorkerCode(event) {
    const rut = String(event?.createdBy?.rut || "");
    if (!rut) return "-";
    const user = state.allUsers.find((item) => String(item?.rut || "") === rut);
    return user?.worker_code || "-";
}

function creatorRoleKey(event) {
    const rut = String(event?.createdBy?.rut || "");
    const matchedUser = rut ? state.allUsers.find((item) => String(item?.rut || "") === rut) : null;
    const cargo = matchedUser?.cargo || event?.createdBy?.cargo || "";
    return normalizeCargo(cargo);
}

function creatorCodeBadge(event) {
    const role = creatorRoleKey(event);
    const code = role === "super_admin" ? "Admin" : creatorWorkerCode(event);
    const roleClass = role === "super_admin" ? "role-super" : role === "qf" ? "role-qf" : role === "af" ? "role-af" : "role-other";
    return `<span class="worker-code-pill ${roleClass}">${code}</span>`;
}

function isTaskEvent(event) {
    return String(event?.publicationType || "") === "tarea";
}

function isEventResolvedForUser(event) {
    if (isTaskEvent(event)) {
        return Array.isArray(event.completedBy) && event.completedBy.includes(state.user?.rut);
    }
    return Array.isArray(event.readBy) && event.readBy.includes(state.user?.rut);
}

function stateButtonConfig(event) {
    const resolved = isEventResolvedForUser(event);
    if (isTaskEvent(event)) {
        return {
            action: "complete",
            nextValue: !resolved,
            label: resolved ? "Marcar pendiente" : "Completar"
        };
    }
    return {
        action: "read",
        nextValue: !resolved,
        label: resolved ? "Marcar sin leer" : "Marcar leído"
    };
}

function eventById(eventId) {
    return getFilteredEvents().find((item) => String(item.id) === String(eventId)) || null;
}

function renderEventDetailModal(event) {
    if (!els.viewModalBody || !event) return;
    const creatorName = String(event?.createdBy?.name || "").trim() || "Sin nombre";
    const creatorCargo = String(event?.createdBy?.cargo || "").trim() || "-";
    const creatorRut = String(event?.createdBy?.rut || "").trim() || "-";
    const creatorCode = creatorRoleKey(event) === "super_admin" ? "Admin" : creatorWorkerCode(event);
    const createdLocale = localeLabelById(event?.createdBy?.localeId);
    const scopeLocale = localeLabelById(event?.scope?.localeId);
    const readBy = Array.isArray(event.readBy) ? event.readBy.join(", ") : "";
    const completedBy = Array.isArray(event.completedBy) ? event.completedBy.join(", ") : "";
    const assignedNames = (Array.isArray(event.assignedTo) ? event.assignedTo : [])
        .map((rut) => {
            const user = state.allUsers.find((u) => String(u.rut || "") === String(rut));
            return user ? `${user.names || ""} ${user.last_names || ""}`.trim() : String(rut || "");
        })
        .filter(Boolean)
        .join(", ");
    const isRead = Array.isArray(event.readBy) && event.readBy.includes(state.user?.rut);
    const isDone = Array.isArray(event.completedBy) && event.completedBy.includes(state.user?.rut);
    const statusText = isRead && isDone
        ? "Leído y completado"
        : isRead
            ? "Leído y pendiente"
            : isDone
                ? "Sin leer y completado"
                : "Sin leer y sin completar";

    els.viewModalTitle.textContent = event.title || "Detalle del Mensaje";
    els.viewModalBody.innerHTML = `
        <div class="calendar-view-item"><label>Título</label><p>${event.title || "-"}</p></div>
        <div class="calendar-view-item"><label>Fecha</label><p>${event.date || "-"}</p></div>
        <div class="calendar-view-item"><label>Inicio</label><p>${event.startTime || "-"}</p></div>
        <div class="calendar-view-item"><label>Término</label><p>${event.endTime || "-"}</p></div>
        <div class="calendar-view-item"><label>Importancia</label><p>${event.importance || "-"}</p></div>
        <div class="calendar-view-item"><label>Tipo</label><p>${event.publicationType || "-"}</p></div>
        <div class="calendar-view-item"><label>Publicación</label><p>${scopeTypeLabel(event?.scope?.type)}</p></div>
        <div class="calendar-view-item"><label>Local del mensaje</label><p>${scopeLocale}</p></div>
        <div class="calendar-view-item"><label>Redactado por</label><p>${creatorName}</p></div>
        <div class="calendar-view-item"><label>Cargo redactor</label><p>${creatorCargo}</p></div>
        <div class="calendar-view-item"><label>RUT redactor</label><p>${creatorRut}</p></div>
        <div class="calendar-view-item"><label>Código redactor</label><p>${creatorCode}</p></div>
        <div class="calendar-view-item"><label>Local redactor</label><p>${createdLocale}</p></div>
        <div class="calendar-view-item"><label>Estado lectura</label><p>${isRead ? "Leído" : "Sin leer"}</p></div>
        <div class="calendar-view-item"><label>Estado completado</label><p>${isDone ? "Completado" : "Sin completar"}</p></div>
        <div class="calendar-view-item full"><label>Estado general</label><p>${statusText}</p></div>
        <div class="calendar-view-item full"><label>Descripción</label><p>${event.description || "-"}</p></div>
        <div class="calendar-view-item full"><label>Notas</label><p>${event.notes || "-"}</p></div>
        <div class="calendar-view-item full"><label>Asignado a</label><p>${assignedNames || "-"}</p></div>
        <div class="calendar-view-item full"><label>Leído por</label><p>${readBy || "-"}</p></div>
        <div class="calendar-view-item full"><label>Completado por</label><p>${completedBy || "-"}</p></div>
        <div class="calendar-view-item"><label>Creado en</label><p>${event.createdAt || "-"}</p></div>
        <div class="calendar-view-item"><label>Última actualización</label><p>${event.updatedAt || "-"}</p></div>
    `;
    const canEdit = isEditable(event);

    if (els.viewToggleStateBtn) {
        const config = stateButtonConfig(event);
        els.viewToggleStateBtn.textContent = config.label;
        els.viewToggleStateBtn.dataset.eventId = String(event.id || "");
        els.viewToggleStateBtn.dataset.action = config.action;
        els.viewToggleStateBtn.dataset.nextValue = config.nextValue ? "1" : "0";
    }

    if (els.viewEditBtn) {
        els.viewEditBtn.disabled = !canEdit;
        els.viewEditBtn.dataset.eventId = String(event.id || "");
    }
}

function openViewModal(event) {
    if (!event || !els.viewModal) return;
    renderEventDetailModal(event);
    els.viewModal.classList.remove("hidden");
    els.viewModal.setAttribute("aria-hidden", "false");
}

function closeViewModal() {
    if (!els.viewModal) return;
    els.viewModal.classList.add("hidden");
    els.viewModal.setAttribute("aria-hidden", "true");
}

function eventVisibleForSelectedDate(event) {
    return String(event.date) === String(state.selectedDate);
}

function eventsForDate(dateKey) {
    return getFilteredEvents().filter((event) => String(event.date) === String(dateKey));
}

function isSuperAdminView() {
    return normalizeCargo(state.user?.cargo) === "super_admin";
}

function getEventTargetRoles(event) {
    const scopeType = String(event?.scope?.type || "");
    if (scopeType === "global_qf" || scopeType === "local_qf") return ["qf"];
    if (scopeType === "global_af" || scopeType === "local_af") return ["af"];
    if (scopeType === "global_all" || scopeType === "local_qf_af") return ["qf", "af"];
    return [];
}

function eventMatchesRoleFilter(event, roleFilter) {
    if (roleFilter === "all") return true;
    const targets = getEventTargetRoles(event);
    return targets.includes(roleFilter);
}

function getFilteredEvents() {
    if (!isSuperAdminView() || !state.saViewAll) {
        return state.events;
    }

    return state.events.filter((event) => {
        const eventLocale = String(event?.scope?.localeId || "").toLowerCase();
        const localeMatch = state.saFilterLocale === "all"
            ? true
            : eventLocale === state.saFilterLocale || eventLocale === "all";
        const dateMatch = state.saFilterDate ? String(event?.date || "") === state.saFilterDate : true;
        const roleMatch = eventMatchesRoleFilter(event, state.saFilterRole);
        return localeMatch && dateMatch && roleMatch;
    });
}

function getFetchRange() {
    if (state.view === "month") {
        const range = monthRange(state.cursorDate);
        return { from: toDateKey(range.start), to: toDateKey(range.end) };
    }

    if (state.view === "week") {
        const start = startOfWeek(state.cursorDate);
        const end = endOfWeek(state.cursorDate);
        return { from: toDateKey(start), to: toDateKey(end) };
    }

    const day = toDateKey(state.cursorDate);
    return { from: day, to: day };
}

async function fetchEvents() {
    const { from, to } = getFetchRange();
    const params = new URLSearchParams({
        from,
        to,
        user_rut: String(state.user?.rut || ""),
        user_cargo: String(state.user?.cargo || ""),
        user_locale_id: String(state.user?.locale_id || "")
    });

    if (isSuperAdminView() && state.saViewAll) {
        params.set("sa_view_all", "1");
    }

    const response = await fetch(`/api/calendar/events?${params.toString()}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    state.events = Array.isArray(data) ? data : [];
}

async function fetchLocales() {
    if (!isSuperAdminView()) return;
    try {
        const response = await fetch("/api/locales");
        if (!response.ok) return;
        const data = await response.json();
        state.locales = Array.isArray(data) ? data : [];
    } catch {
        state.locales = [];
    }
}

function renderSaFilters() {
    if (!isSuperAdminView() || !els.saFiltersBar) return;
    els.saFiltersBar.classList.remove("hidden");

    if (els.saViewAllToggle) {
        els.saViewAllToggle.checked = state.saViewAll;
    }

    if (els.saFilterLocale) {
        const selectedValue = state.saFilterLocale || "all";
        els.saFilterLocale.innerHTML = `<option value="all">Todos los locales</option>${state.locales
            .map((local) => {
                const id = String(local?.id || "").toLowerCase();
                const name = String(local?.name || local?.nombre || "").trim();
                return `<option value="${id}">${local?.id || ""} ${name}</option>`;
            })
            .join("")}`;
        els.saFilterLocale.value = selectedValue;
    }

    if (els.saFilterDate) {
        els.saFilterDate.value = state.saFilterDate || "";
        els.saFilterDate.disabled = !state.saViewAll;
    }
    if (els.saFilterLocale) {
        els.saFilterLocale.disabled = !state.saViewAll;
    }
    if (els.saFilterRole) {
        els.saFilterRole.value = state.saFilterRole || "all";
        els.saFilterRole.disabled = !state.saViewAll;
    }
    if (els.saFilterClear) {
        els.saFilterClear.disabled = !state.saViewAll;
    }
}

function renderPeriodLabel() {
    if (state.view === "month") {
        els.periodLabel.textContent = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(state.cursorDate);
        return;
    }

    if (state.view === "week") {
        const s = startOfWeek(state.cursorDate);
        const e = endOfWeek(state.cursorDate);
        els.periodLabel.textContent = `${s.getDate()}-${e.getDate()} ${new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(e)}`;
        return;
    }

    els.periodLabel.textContent = formatDateLabel(toDateKey(state.cursorDate));
}

function renderMonthView() {
    const { start, end } = monthRange(state.cursorDate);
    const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    let html = weekdays.map((d) => `<div class="weekday">${d}</div>`).join("");

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = toDateKey(cursor);
        const todayKey = toDateKey(new Date());
        const dayEvents = eventsForDate(key);
        const isOther = cursor.getMonth() !== state.cursorDate.getMonth();
        const classes = ["day-cell"];
        if (isOther) classes.push("is-other");
        if (key === todayKey) classes.push("is-today");
        if (key === state.selectedDate) classes.push("is-selected");

        html += `
            <div class="${classes.join(" ")}" data-date="${key}">
                <div class="day-head">
                    <span class="day-number">${cursor.getDate()}</span>
                    <span class="day-count">${dayEvents.length || ""}</span>
                </div>
                <div class="day-events">
                    ${dayEvents
                        .slice(0, 3)
                        .map((event) => {
                            const resolved = isEventResolvedForUser(event);
                            return `<div class="event-chip ${importanceClass(event.importance)} ${resolved ? "resolved" : "pending"} event-open-detail" data-id="${event.id}">
                                <span class="chip-status-dot ${resolved ? "resolved" : "pending"}"></span>
                                ${event.title}
                            </div>`;
                        })
                        .join("")}
                    ${dayEvents.length > 3 ? `<div class="event-chip">+${dayEvents.length - 3} más</div>` : ""}
                </div>
            </div>`;
    }

    els.board.innerHTML = `<div class="month-grid">${html}</div>`;

    els.board.querySelectorAll(".day-cell").forEach((cell) => {
        cell.addEventListener("click", () => {
            state.selectedDate = cell.dataset.date;
            state.cursorDate = fromDateKey(state.selectedDate);
            renderAll();
        });
    });

    els.board.querySelectorAll(".event-open-detail").forEach((chip) => {
        chip.addEventListener("click", (event) => {
            event.stopPropagation();
            const selected = eventById(chip.dataset.id);
            if (selected) openViewModal(selected);
        });
    });
}

function renderWeekView() {
    const start = startOfWeek(state.cursorDate);
    let html = '<div class="week-grid">';

    for (let i = 0; i < 7; i += 1) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        const key = toDateKey(day);
        const items = eventsForDate(key);

        html += `
            <div class="week-col" data-date="${key}">
                <h4>${new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "2-digit", month: "2-digit" }).format(day)}</h4>
                <div class="day-list">
                    ${items
                        .map((event) => {
                            const resolved = isEventResolvedForUser(event);
                            return `<div class="event-chip ${importanceClass(event.importance)} ${resolved ? "resolved" : "pending"} event-open-detail" data-id="${event.id}">
                                <span class="chip-status-dot ${resolved ? "resolved" : "pending"}"></span>
                                ${eventTimeText(event)} · ${event.title}
                            </div>`;
                        })
                        .join("") || '<p class="text-muted">Sin eventos</p>'}
                </div>
            </div>`;
    }

    html += "</div>";
    els.board.innerHTML = html;

    els.board.querySelectorAll(".week-col").forEach((cell) => {
        cell.addEventListener("click", () => {
            state.selectedDate = cell.dataset.date;
            renderSelectedDayList();
        });
    });

    els.board.querySelectorAll(".event-open-detail").forEach((chip) => {
        chip.addEventListener("click", (event) => {
            event.stopPropagation();
            const selected = eventById(chip.dataset.id);
            if (selected) openViewModal(selected);
        });
    });
}

function renderDayView() {
    const key = toDateKey(state.cursorDate);
    const items = eventsForDate(key);
    els.board.innerHTML = `
        <div class="day-list">
            ${items.map((event) => {
                const canEdit = isEditable(event);
                const localText = localeLabelById(event?.scope?.localeId);
                const resolved = isEventResolvedForUser(event);
                const config = stateButtonConfig(event);
                return `<div class="event-card clickable-card ${importanceClass(event.importance)} ${resolved ? "is-resolved" : "is-pending"}" data-id="${event.id}">
                <h4>${event.title}</h4>
                <div class="event-meta">
                    ${creatorCodeBadge(event)}
                    <span class="event-local-pill">Local: ${localText}</span>
                    <span class="event-state-pill ${resolved ? "resolved" : "pending"}">${resolved ? "Resuelto" : "Pendiente"}</span>
                </div>
                <p>${event.description || "Sin descripción"}</p>
                <div class="event-actions">
                    <button class="btn day-toggle-state-btn" data-id="${event.id}" data-action="${config.action}" data-next-value="${config.nextValue ? "1" : "0"}">${config.label}</button>
                    ${canEdit ? `<button class="btn edit-event-btn" data-id="${event.id}">Editar</button>` : ""}
                </div>
            </div>`;
            }).join("") || '<p class="text-muted">Sin eventos para este día.</p>'}
        </div>`;

    els.board.querySelectorAll(".clickable-card").forEach((card) => {
        card.addEventListener("click", () => {
            const selected = eventById(card.dataset.id);
            if (selected) openViewModal(selected);
        });
    });

    els.board.querySelectorAll(".day-toggle-state-btn").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            if (button.dataset.action === "complete") {
                await markComplete(button.dataset.id, button.dataset.nextValue === "1");
            } else {
                await markRead(button.dataset.id, button.dataset.nextValue === "1");
            }
        });
    });

    els.board.querySelectorAll(".edit-event-btn").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const selected = eventById(button.dataset.id);
            if (selected) openModal(selected);
        });
    });
}

async function markRead(eventId, read = true) {
    await fetch(`/api/calendar/events/${eventId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_rut: state.user?.rut, read })
    });
    await reloadAndRender();
}

async function markComplete(eventId, completed) {
    await fetch(`/api/calendar/events/${eventId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_rut: state.user?.rut, completed })
    });
    await reloadAndRender();
}

function renderSelectedDayList() {
    const selectedKey = state.selectedDate;
    const items = eventsForDate(selectedKey);
    els.selectedDateLabel.textContent = `Recordatorios · ${formatDateLabel(selectedKey)}`;

    if (!items.length) {
        els.selectedDayList.innerHTML = '<p class="text-muted">No hay recordatorios para este día.</p>';
        return;
    }

    const role = normalizeCargo(state.user?.cargo);

    els.selectedDayList.innerHTML = items
        .map((event) => {
            const completionInfo = role === "qf" && String(event?.createdBy?.rut || "") === String(state.user?.rut || "")
                ? `<span>${Array.isArray(event.completedBy) ? event.completedBy.length : 0} completadas</span>`
                : "";
            const localText = localeLabelById(event?.scope?.localeId);

            return `
                <article class="event-card clickable-card ${importanceClass(event.importance)} ${isEventResolvedForUser(event) ? "is-resolved" : "is-pending"}" data-id="${event.id}">
                    <h4>${event.title}</h4>
                    <div class="event-meta">
                        ${creatorCodeBadge(event)}
                        <span class="event-local-pill">Local: ${localText}</span>
                        <span class="event-state-pill ${isEventResolvedForUser(event) ? "resolved" : "pending"}">${isEventResolvedForUser(event) ? "Resuelto" : "Pendiente"}</span>
                        ${completionInfo}
                    </div>
                    <p>${event.description || "Sin descripción"}</p>
                    ${event.notes ? `<p><strong>Nota:</strong> ${event.notes}</p>` : ""}
                </article>`;
        })
        .join("");

    els.selectedDayList.querySelectorAll(".event-card").forEach((card) => {
        const eventId = card.dataset.id;
        card.addEventListener("click", () => {
            const event = eventById(eventId);
            if (event) openViewModal(event);
        });
    });
}

function renderBoard() {
    renderPeriodLabel();
    if (state.view === "month") renderMonthView();
    else if (state.view === "week") renderWeekView();
    else renderDayView();
}

function renderAll() {
    renderSaFilters();
    renderBoard();
    renderSelectedDayList();
    els.viewSwitch.querySelectorAll("button").forEach((button) => {
        button.classList.toggle("active", button.dataset.view === state.view);
    });
}

function fillScopeOptions(selected) {
    const options = getScopeOptions();
    els.scope.innerHTML = options
        .map((option, index) => `<option value="${option.value}" data-locale="${option.localeId}" ${selected ? (selected === option.value ? "selected" : "") : index === 0 ? "selected" : ""}>${option.label}</option>`)
        .join("");
}

function fillAssignees(selected = []) {
    const localId = String(state.user?.locale_id || "");
    const afUsers = state.allUsers.filter((user) => String(user.locale_id || "") === localId && normalizeCargo(user.cargo) === "af");

    els.assignee.innerHTML = `<option value="">Sin asignación específica</option>${afUsers
        .map((user) => {
            const fullName = `${user.names || ""} ${user.last_names || ""}`.trim();
            const isSelected = selected.includes(user.rut) ? "selected" : "";
            return `<option value="${user.rut}" ${isSelected}>${fullName || user.rut}</option>`;
        })
        .join("")}`;
}

function openModal(event = null) {
    state.editingEvent = event;
    els.modalTitle.textContent = event ? "Editar Recordatorio" : "Nuevo Recordatorio";

    els.title.value = event?.title || "";
    els.date.value = event?.date || state.selectedDate;
    els.startTime.value = event?.startTime || "";
    els.endTime.value = event?.endTime || "";
    els.importance.value = event?.importance || "media";
    els.type.value = event?.publicationType || "recordatorio";
    els.description.value = event?.description || "";
    els.notes.value = event?.notes || "";

    fillScopeOptions(event?.scope?.type);
    fillAssignees(Array.isArray(event?.assignedTo) ? event.assignedTo : []);

    els.assigneeWrap.style.display = els.type.value === "tarea" ? "block" : "none";

    els.modal.classList.remove("hidden");
    els.modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
    els.modal.classList.add("hidden");
    els.modal.setAttribute("aria-hidden", "true");
}

async function saveEvent() {
    if (!els.title.value.trim()) {
        alert("Debes ingresar título.");
        return;
    }
    if (!els.date.value) {
        alert("Debes ingresar fecha.");
        return;
    }

    const selectedScope = els.scope.options[els.scope.selectedIndex];
    const assignedTo = els.type.value === "tarea" && els.assignee.value ? [els.assignee.value] : [];

    const payload = {
        id: state.editingEvent?.id,
        title: els.title.value.trim(),
        date: els.date.value,
        startTime: els.startTime.value,
        endTime: els.endTime.value,
        importance: els.importance.value,
        publicationType: els.type.value,
        description: els.description.value.trim(),
        notes: els.notes.value.trim(),
        assignedTo,
        scope: {
            type: els.scope.value,
            localeId: selectedScope?.dataset?.locale || String(state.user?.locale_id || "").toLowerCase()
        }
    };

    const actorName = `${state.user?.names || state.user?.name || ""} ${state.user?.last_names || ""}`.trim();
    const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            actor: {
                rut: state.user?.rut,
                cargo: state.user?.cargo,
                locale_id: state.user?.locale_id,
                name: actorName
            },
            event: payload
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error?.error || "No se pudo guardar el recordatorio.");
        return;
    }

    closeModal();
    await reloadAndRender();
}

async function reloadAndRender() {
    await fetchEvents();
    renderAll();
}

function setupHeader(user) {
    const userSigla = document.getElementById("user-sigla");
    const userName = document.getElementById("user-name-text");
    const userCargo = document.getElementById("user-cargo-text");

    const initials = (user.names || user.name || "")
        .split(" ")
        .map((chunk) => chunk[0] || "")
        .join("") + (user.last_names ? user.last_names[0] : "");

    userSigla.textContent = initials.toUpperCase().substring(0, 2);
    userName.textContent = `${user.names || user.name || ""} ${user.last_names || ""}`.trim();
    userCargo.textContent = user.cargo || "";
}

function bindEvents() {
    els.prevBtn.addEventListener("click", async () => {
        if (state.view === "month") state.cursorDate.setMonth(state.cursorDate.getMonth() - 1);
        else if (state.view === "week") state.cursorDate.setDate(state.cursorDate.getDate() - 7);
        else state.cursorDate.setDate(state.cursorDate.getDate() - 1);
        await reloadAndRender();
    });

    els.nextBtn.addEventListener("click", async () => {
        if (state.view === "month") state.cursorDate.setMonth(state.cursorDate.getMonth() + 1);
        else if (state.view === "week") state.cursorDate.setDate(state.cursorDate.getDate() + 7);
        else state.cursorDate.setDate(state.cursorDate.getDate() + 1);
        await reloadAndRender();
    });

    els.todayBtn.addEventListener("click", async () => {
        state.cursorDate = new Date();
        state.selectedDate = toDateKey(state.cursorDate);
        await reloadAndRender();
    });

    els.viewSwitch.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
            state.view = button.dataset.view;
            await reloadAndRender();
        });
    });

    els.newBtn.addEventListener("click", () => openModal());
    els.closeModal.addEventListener("click", closeModal);
    els.cancelModal.addEventListener("click", closeModal);
    els.saveModal.addEventListener("click", () => {
        void saveEvent();
    });

    els.type.addEventListener("change", () => {
        els.assigneeWrap.style.display = els.type.value === "tarea" ? "block" : "none";
    });

    els.logout.addEventListener("click", (event) => {
        event.preventDefault();
        Auth.logout();
    });

    els.viewModalClose?.addEventListener("click", closeViewModal);
    els.viewCloseBtn?.addEventListener("click", closeViewModal);
    els.viewToggleStateBtn?.addEventListener("click", async () => {
        const eventId = els.viewToggleStateBtn.dataset.eventId;
        const action = els.viewToggleStateBtn.dataset.action;
        const nextValue = els.viewToggleStateBtn.dataset.nextValue === "1";
        if (action === "complete") {
            await markComplete(eventId, nextValue);
        } else {
            await markRead(eventId, nextValue);
        }
        const fresh = eventById(eventId);
        if (fresh) openViewModal(fresh);
    });
    els.viewEditBtn?.addEventListener("click", () => {
        const eventId = els.viewEditBtn.dataset.eventId;
        const event = eventById(eventId);
        if (!event || !isEditable(event)) return;
        closeViewModal();
        openModal(event);
    });

    if (isSuperAdminView()) {
        els.saViewAllToggle?.addEventListener("change", async () => {
            state.saViewAll = Boolean(els.saViewAllToggle.checked);
            await reloadAndRender();
        });

        els.saFilterLocale?.addEventListener("change", () => {
            state.saFilterLocale = String(els.saFilterLocale.value || "all").toLowerCase();
            renderAll();
        });

        els.saFilterDate?.addEventListener("change", () => {
            state.saFilterDate = String(els.saFilterDate.value || "");
            renderAll();
        });

        els.saFilterRole?.addEventListener("change", () => {
            state.saFilterRole = String(els.saFilterRole.value || "all");
            renderAll();
        });

        els.saFilterClear?.addEventListener("click", () => {
            state.saFilterLocale = "all";
            state.saFilterDate = "";
            state.saFilterRole = "all";
            renderAll();
        });
    }

    [els.modal, els.viewModal].forEach((modal) => {
        if (!modal) return;
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                if (modal === els.modal) closeModal();
                if (modal === els.viewModal) closeViewModal();
            }
        });
    });
}

async function init() {
    showLoadingOverlay("Cargando calendario...");
    const user = Auth.checkAuth();
    if (!user) {
        hideLoadingOverlay();
        return;
    }

    try {
        state.user = user;
        if (isSuperAdminView()) {
            state.saViewAll = true;
            state.saFilterLocale = "all";
        }
        setupHeader(user);
        state.allUsers = await Auth.fetchUsers().catch(() => []);
        await fetchLocales();

        bindEvents();
        await reloadAndRender();
        lucide.createIcons();
    } finally {
        hideLoadingOverlay();
    }
}

void init();
