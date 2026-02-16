import { Auth } from "/core/js/auth.js";
import { showLoadingOverlay, hideLoadingOverlay } from "/core/js/ui-feedback.js";

const STORAGE_KEY = "fondo_records_v1";
const DENOMINACIONES = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 10];

const baseRecord = {
    id: "seed-2025-12-22-12-36",
    date: "2025-12-22",
    time: "12:36",
    fondoLocal: 400000,
    fondoFijo: [
        { den: 20000, units: 3, direct: 0 },
        { den: 10000, units: 1, direct: 0 },
        { den: 5000, units: 9, direct: 0 },
        { den: 2000, units: 0, direct: 0 },
        { den: 1000, units: 50, direct: 0 },
        { den: 500, units: 0, direct: 25000 },
        { den: 100, units: 0, direct: 80000 },
        { den: 50, units: 0, direct: 28000 },
        { den: 10, units: 0, direct: 12000 }
    ],
    sencillo: DENOMINACIONES.map((den) => ({ den, units: 0, direct: 0 })),
    gastos: Array.from({ length: 10 }, (_, index) => ({ label: `Gasto ${index + 1}`, amount: 0 })),
    fondosAf: [{ label: "", amount: 0 }],
    worker: "Mauro",
    comment: "0"
};

const state = {
    records: [],
    selectedDate: "",
    selectedTime: "",
    editingRecordId: null,
    modalDraft: null,
    modalMode: "create",
    currentUser: null
};

const els = {
    fechaSelect: document.getElementById("fecha-select"),
    horaSelect: document.getElementById("hora-select"),
    btnNew: document.getElementById("btn-new"),
    btnEdit: document.getElementById("btn-edit"),
    btnReport: document.getElementById("btn-report"),
    previewFixedBody: document.querySelector("#preview-fixed-table tbody"),
    previewGastosBody: document.querySelector("#preview-gastos-table tbody"),
    previewAfBody: document.querySelector("#preview-af-table tbody"),
    previewComment: document.getElementById("preview-comment"),
    topWorker: document.getElementById("top-worker"),
    topFondoLocal: document.getElementById("top-fondo-local"),
    topFondoFijo: document.getElementById("top-fondo-fijo"),
    topSencillo: document.getElementById("top-sencillo"),
    topGastos: document.getElementById("top-gastos"),
    topAf: document.getElementById("top-af"),
    topDiferencia: document.getElementById("top-diferencia"),
    modal: document.getElementById("fondo-modal"),
    closeModal: document.getElementById("close-modal"),
    cancelModal: document.getElementById("cancel-modal"),
    saveModal: document.getElementById("save-modal"),
    modalTitle: document.getElementById("modal-title"),
    modalDate: document.getElementById("modal-date"),
    modalTime: document.getElementById("modal-time"),
    modalWorker: document.getElementById("modal-worker"),
    modalTabs: document.getElementById("fondo-tabs"),
    tabFijo: document.getElementById("tab-fijo"),
    tabSencillo: document.getElementById("tab-sencillo"),
    tabGastos: document.getElementById("tab-gastos"),
    tabAf: document.getElementById("tab-af"),
    tabLocal: document.getElementById("tab-local"),
    summaryBody: document.querySelector("#modal-summary-table tbody"),
    summaryStatus: document.getElementById("summary-status"),
    modalComment: document.getElementById("modal-comment"),
    reportModal: document.getElementById("report-modal"),
    closeReportModal: document.getElementById("close-report-modal"),
    closeReport: document.getElementById("close-report"),
    printReport: document.getElementById("print-report"),
    reportContent: document.getElementById("report-content")
};

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function money(value) {
    return `$${new Intl.NumberFormat("es-CL").format(Math.round(toNumber(value)))}`;
}

function cloneRecord(record) {
    return JSON.parse(JSON.stringify(record));
}

function getCurrentWorkerName() {
    if (state.currentUser) {
        const names = state.currentUser.names || state.currentUser.name || "";
        const lastNames = state.currentUser.last_names || "";
        const fullName = `${names} ${lastNames}`.trim();
        if (fullName) {
            return fullName;
        }
    }

    const headerName = document.getElementById("user-name-text")?.textContent?.trim();
    if (headerName && headerName !== "Cargando...") {
        return headerName;
    }

    return "Sin usuario";
}

function setupHeader(user) {
    const userSigla = document.getElementById("user-sigla");
    const userName = document.getElementById("user-name-text");
    const userCargo = document.getElementById("user-cargo-text");

    if (!user) {
        return;
    }

    const names = user.names || user.name || "";
    const lastNames = user.last_names || "";
    const initials = (names || "")
        .split(" ")
        .map((n) => n[0] || "")
        .join("") + (lastNames ? lastNames[0] : "");

    if (userSigla) {
        userSigla.textContent = (initials || "--").toUpperCase().substring(0, 2);
    }
    if (userName) {
        userName.textContent = `${names} ${lastNames}`.trim() || "Sin usuario";
    }
    if (userCargo) {
        userCargo.textContent = user.cargo || "";
    }
}

function setupLogout() {
    const logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) {
        return;
    }

    logoutBtn.addEventListener("click", (event) => {
        event.preventDefault();
        Auth.logout();
    });
}

function blankRecord() {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
    const hh = `${now.getHours()}`.padStart(2, "0");
    const mm = `${now.getMinutes()}`.padStart(2, "0");

    return {
        id: `rec-${Date.now()}`,
        date: isoDate,
        time: `${hh}:${mm}`,
        fondoLocal: 400000,
        fondoFijo: DENOMINACIONES.map((den) => ({ den, units: 0, direct: 0 })),
        sencillo: DENOMINACIONES.map((den) => ({ den, units: 0, direct: 0 })),
        gastos: [createDynamicRow("gastos", 0)],
        fondosAf: [createDynamicRow("fondosAf", 0)],
        worker: getCurrentWorkerName(),
        comment: ""
    };
}

function getLatestRecord() {
    if (!state.records.length) {
        return null;
    }

    const sorted = [...state.records].sort((a, b) => {
        const da = `${a.date} ${a.time}`;
        const db = `${b.date} ${b.time}`;
        return da < db ? 1 : -1;
    });

    return sorted[0] || null;
}

function rowSubtotal(row) {
    return toNumber(row.den) * toNumber(row.units) + toNumber(row.direct);
}

function totalFromRows(rows) {
    return rows.reduce((sum, row) => sum + rowSubtotal(row), 0);
}

function totalAmounts(rows) {
    return rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
}

function gastoLabel(index) {
    return `Gasto ${index + 1}`;
}

function fondoAfLabel(index) {
    return `Fondo ${index + 1}`;
}

function createDynamicRow(key, index) {
    if (key === "gastos") {
        return { label: gastoLabel(index), amount: 0 };
    }
    if (key === "fondosAf") {
        return { label: fondoAfLabel(index), amount: 0 };
    }
    return { label: "", amount: 0 };
}

function isDynamicRowEmpty(row, index, key) {
    const label = (row?.label || "").trim();
    const amount = toNumber(row?.amount);
    if (key === "gastos") {
        return amount === 0 && (label === "" || label === gastoLabel(index));
    }
    if (key === "fondosAf") {
        return amount === 0 && (label === "" || label === fondoAfLabel(index));
    }
    return amount === 0 && label === "";
}

function compactDynamicRows(rows, key) {
    return (Array.isArray(rows) ? rows : [])
        .filter((row, index) => !isDynamicRowEmpty(row, index, key))
        .map((row, index) => ({
            label:
                key === "gastos"
                    ? ((row.label || "").trim() || gastoLabel(index))
                    : key === "fondosAf"
                        ? ((row.label || "").trim() || fondoAfLabel(index))
                        : (row.label || ""),
            amount: toNumber(row.amount)
        }));
}

function compute(record) {
    const fondoFijo = totalFromRows(record.fondoFijo);
    const sencillo = totalFromRows(record.sencillo);
    const gastos = totalAmounts(record.gastos);
    const af = totalAmounts(record.fondosAf);
    const total = fondoFijo + sencillo + gastos + af;
    const diferencia = toNumber(record.fondoLocal) - total;

    return { fondoFijo, sencillo, gastos, af, total, diferencia };
}

async function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
    const localeId = String(state.currentUser?.locale_id || "global").toLowerCase();

    try {
        const response = await fetch(`/api/fondo/list/${localeId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.records)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error("No se pudo guardar Fondo en Firebase (API), se mantiene local:", error);
    }
}

function readLocalRecords() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function loadRecords() {
    const localRecords = readLocalRecords();
    let remoteRecords = [];

    try {
        const localeId = String(state.currentUser?.locale_id || "global").toLowerCase();
        const response = await fetch(`/api/fondo/list/${localeId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        remoteRecords = Array.isArray(payload) ? payload : [];
    } catch (error) {
        console.error("No se pudo cargar Fondo desde Firebase (API), usando local:", error);
    }

    if (Array.isArray(remoteRecords) && remoteRecords.length) {
        state.records = remoteRecords;
    } else if (localRecords.length) {
        state.records = localRecords;
    } else {
        state.records = [cloneRecord(baseRecord)];
    }

    const fallbackWorker = getCurrentWorkerName();
    state.records = state.records.map((record) => ({
        ...record,
        worker: record.worker || fallbackWorker
    }));

    await saveRecords();
}

function getUniqueDates() {
    return [...new Set(state.records.map((record) => record.date))].sort((a, b) => (a < b ? 1 : -1));
}

function getTimesForDate(date) {
    return state.records
        .filter((record) => record.date === date)
        .map((record) => record.time)
        .filter(Boolean)
        .sort();
}

function getCurrentRecord() {
    return state.records.find((record) => record.date === state.selectedDate && record.time === state.selectedTime) || null;
}

function renderDateSelect() {
    const dates = getUniqueDates();

    if (!dates.length) {
        els.fechaSelect.innerHTML = `<option value="">Sin registros</option>`;
        els.horaSelect.innerHTML = `<option value="">Sin horas</option>`;
        return;
    }

    if (!dates.includes(state.selectedDate)) {
        state.selectedDate = dates[0];
    }

    els.fechaSelect.innerHTML = dates
        .map((date) => `<option value="${date}" ${date === state.selectedDate ? "selected" : ""}>${date}</option>`)
        .join("");

    renderTimeSelect();
}

function renderTimeSelect() {
    const times = getTimesForDate(state.selectedDate);

    if (!times.length) {
        els.horaSelect.innerHTML = `<option value="">Sin horas</option>`;
        state.selectedTime = "";
        renderPreview();
        return;
    }

    if (!times.includes(state.selectedTime)) {
        state.selectedTime = times[0];
    }

    els.horaSelect.innerHTML = times
        .map((time) => `<option value="${time}" ${time === state.selectedTime ? "selected" : ""}>${time}</option>`)
        .join("");

    renderPreview();
}

function renderPreview() {
    const record = getCurrentRecord();
    if (!record) {
        els.previewFixedBody.innerHTML = "";
        els.previewGastosBody.innerHTML = "";
        els.previewAfBody.innerHTML = "";
        els.previewComment.textContent = "Sin comentario.";
        els.topWorker.textContent = "-";
        return;
    }

    const totals = compute(record);

    const fixedRows = record.fondoFijo.map((row) => ({
        name: money(row.den),
        units: row.units,
        direct: row.direct,
        subtotal: rowSubtotal(row)
    }));

    const gastosRows = record.gastos.filter((row) => row.label || toNumber(row.amount) !== 0);
    const afRows = record.fondosAf.filter((row) => row.label || toNumber(row.amount) !== 0);

    const maxRows = Math.max(fixedRows.length, gastosRows.length, afRows.length, 1);

    const fixedPadded = [
        ...fixedRows,
        ...Array.from({ length: Math.max(0, maxRows - fixedRows.length) }, () => ({
            name: "\u00a0",
            units: "\u00a0",
            direct: "\u00a0",
            subtotal: "\u00a0"
        }))
    ];

    const gastosPadded = [
        ...gastosRows,
        ...Array.from({ length: Math.max(0, maxRows - gastosRows.length) }, () => ({
            label: "\u00a0",
            amount: "\u00a0"
        }))
    ];

    const afPadded = [
        ...afRows,
        ...Array.from({ length: Math.max(0, maxRows - afRows.length) }, () => ({
            label: "\u00a0",
            amount: "\u00a0"
        }))
    ];

    els.previewFixedBody.innerHTML = `${fixedPadded
        .map(
            (row) => `<tr>
                <td>${row.name}</td>
                <td class="center">${row.units === "\u00a0" ? "\u00a0" : new Intl.NumberFormat("es-CL").format(toNumber(row.units))}</td>
                <td class="money">${row.direct === "\u00a0" ? "\u00a0" : money(row.direct)}</td>
                <td class="money">${row.subtotal === "\u00a0" ? "\u00a0" : money(row.subtotal)}</td>
            </tr>`
        )
        .join("")}
        <tr class="total-row"><td colspan="3">Total Fondo en Efectivo</td><td class="money">${money(totals.fondoFijo)}</td></tr>`;

    els.previewGastosBody.innerHTML = `${gastosPadded
        .map(
            (row) => `<tr>
                <td>${row.label || "-"}</td>
                <td class="money">${row.amount === "\u00a0" ? "\u00a0" : money(row.amount)}</td>
            </tr>`
        )
        .join("")}
        <tr class="total-row"><td>Total Gastos</td><td class="money">${money(totals.gastos)}</td></tr>`;

    els.previewAfBody.innerHTML = `${afPadded
        .map(
            (row) => `<tr>
                <td>${row.label || "-"}</td>
                <td class="money">${row.amount === "\u00a0" ? "\u00a0" : money(row.amount)}</td>
            </tr>`
        )
        .join("")}
        <tr class="total-row"><td>Total Fondo AF</td><td class="money">${money(totals.af)}</td></tr>`;

    els.previewComment.textContent = record.comment?.trim() || "Sin comentario.";

    els.topWorker.textContent = record.worker || "Sin usuario";
    els.topFondoLocal.textContent = money(record.fondoLocal);
    els.topFondoFijo.textContent = money(totals.fondoFijo);
    els.topSencillo.textContent = money(totals.sencillo);
    els.topGastos.textContent = money(totals.gastos);
    els.topAf.textContent = money(totals.af);
    els.topDiferencia.textContent = money(totals.diferencia);

    const diffPill = els.topDiferencia.closest(".summary-pill");
    diffPill.classList.toggle("is-ok", Math.round(totals.diferencia) === 0);
    diffPill.classList.toggle("is-bad", Math.round(totals.diferencia) !== 0);
}

function renderInputTable(rows, options) {
    const { id, title, labels = {}, readOnlySubtotal = true } = options;
    return `
        <h4>${title}</h4>
        <div class="table-scroll">
            <table class="input-table" id="${id}">
                <thead>
                    <tr>
                        <th>${labels.concept ?? "Denominación"}</th>
                        <th>${labels.units ?? "Unidades"}</th>
                        <th>${labels.direct ?? "Directo"}</th>
                        <th class="money">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows
                        .map(
                            (row, index) => `<tr data-index="${index}">
                                <td>${money(row.den)}</td>
                                <td><input type="number" data-key="units" value="${toNumber(row.units)}"></td>
                                <td><input type="number" data-key="direct" value="${toNumber(row.direct)}"></td>
                                <td class="readonly money" data-subtotal>${money(rowSubtotal(row))}</td>
                            </tr>`
                        )
                        .join("")}
                    <tr class="total-row"><td colspan="3">Total</td><td class="readonly money" data-total>${money(totalFromRows(rows))}</td></tr>
                </tbody>
            </table>
        </div>`;
}

function renderDynamicRows(rows, options) {
    const { id, title, keyLabel, showDelete = false } = options;
    return `
        <h4>${title}</h4>
        <div class="table-scroll">
            <table class="input-table" id="${id}">
                <thead>
                    <tr>
                        <th>${keyLabel}</th>
                        <th class="money">Monto</th>
                        ${showDelete ? '<th class="center">Eliminar</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${rows
                        .map(
                            (row, index) => `<tr data-index="${index}">
                                <td><input type="text" data-key="label" value="${row.label ?? ""}" placeholder="${keyLabel}"></td>
                                <td><input type="text" inputmode="numeric" pattern="[0-9]*" data-key="amount" value="${toNumber(row.amount)}"></td>
                                ${showDelete ? `<td class="center"><button type="button" class="btn btn-sm btn-danger row-delete-btn" data-index="${index}" title="Eliminar">x</button></td>` : ''}
                            </tr>`
                        )
                        .join("")}
                </tbody>
            </table>
        </div>`;
}

function ensureTrailingEmpty(rows, key) {
    if (!rows.length) {
        rows.push(createDynamicRow(key, 0));
        return;
    }

    const lastIndex = rows.length - 1;
    const last = rows[lastIndex];
    if (!isDynamicRowEmpty(last, lastIndex, key)) {
        rows.push(createDynamicRow(key, rows.length));
    }
}

function pruneTrailingEmpty(rows, key) {
    while (rows.length > 1) {
        const lastIndex = rows.length - 1;
        const prevIndex = rows.length - 2;
        const last = rows[lastIndex];
        const prev = rows[prevIndex];
        const lastEmpty = isDynamicRowEmpty(last, lastIndex, key);
        const prevEmpty = isDynamicRowEmpty(prev, prevIndex, key);
        if (lastEmpty && prevEmpty) {
            rows.pop();
        } else {
            break;
        }
    }
}

function attachFijoHandlers() {
    const table = document.getElementById("modal-fijo-table");
    if (!table) {
        return;
    }

    table.addEventListener("input", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        const rowEl = input.closest("tr[data-index]");
        if (!rowEl) {
            return;
        }
        const index = toNumber(rowEl.dataset.index);
        const key = input.dataset.key;
        state.modalDraft.fondoFijo[index][key] = toNumber(input.value);

        const subtotalCell = rowEl.querySelector("[data-subtotal]");
        if (subtotalCell) {
            subtotalCell.textContent = money(rowSubtotal(state.modalDraft.fondoFijo[index]));
        }

        const totalCell = table.querySelector("[data-total]");
        if (totalCell) {
            totalCell.textContent = money(totalFromRows(state.modalDraft.fondoFijo));
        }

        renderSummary();
    });
}

function attachSencilloHandlers() {
    const table = document.getElementById("modal-sencillo-table");
    if (!table) {
        return;
    }

    table.addEventListener("input", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        const rowEl = input.closest("tr[data-index]");
        if (!rowEl) {
            return;
        }
        const index = toNumber(rowEl.dataset.index);
        const key = input.dataset.key;
        state.modalDraft.sencillo[index][key] = toNumber(input.value);

        const subtotalCell = rowEl.querySelector("[data-subtotal]");
        if (subtotalCell) {
            subtotalCell.textContent = money(rowSubtotal(state.modalDraft.sencillo[index]));
        }

        const totalCell = table.querySelector("[data-total]");
        if (totalCell) {
            totalCell.textContent = money(totalFromRows(state.modalDraft.sencillo));
        }

        renderSummary();
    });
}

function preserveAndRender(focusInput) {
    const tableId = focusInput?.closest("table")?.id;
    const rowIndex = focusInput?.closest("tr[data-index]")?.dataset?.index;
    const key = focusInput?.dataset?.key;
    const cursor = focusInput?.selectionStart;
    const activeTab = document.querySelector(".fondo-tab-content .tab-pane.active")?.id;

    renderModal(false);

    if (activeTab) {
        activateTab(activeTab);
    }

    if (tableId && rowIndex !== undefined && key) {
        const nextInput = document.querySelector(`#${tableId} tr[data-index="${rowIndex}"] input[data-key="${key}"]`);
        if (nextInput) {
            nextInput.focus();
            if (typeof cursor === "number") {
                nextInput.setSelectionRange(cursor, cursor);
            }
        }
    }
}

function attachDynamicHandlers(tableId, key) {
    const table = document.getElementById(tableId);
    if (!table) {
        return;
    }

    table.addEventListener("input", (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        const rowEl = input.closest("tr[data-index]");
        if (!rowEl) {
            return;
        }

        const rowIndex = toNumber(rowEl.dataset.index);
        const field = input.dataset.key;
        const previousLength = state.modalDraft[key].length;
        state.modalDraft[key][rowIndex][field] = field === "amount" ? toNumber(input.value) : input.value;
        ensureTrailingEmpty(state.modalDraft[key], key);
        pruneTrailingEmpty(state.modalDraft[key], key);
        if (state.modalDraft[key].length !== previousLength) {
            preserveAndRender(input);
        } else {
            renderSummary();
        }
    });

    table.addEventListener("click", (event) => {
        const deleteBtn = event.target.closest(".row-delete-btn");
        if (!deleteBtn) return;
        const rowIndex = toNumber(deleteBtn.dataset.index);
        if (!Array.isArray(state.modalDraft[key])) return;
        state.modalDraft[key].splice(rowIndex, 1);
        if (state.modalDraft[key].length === 0) {
            state.modalDraft[key].push(createDynamicRow(key, 0));
        }
        ensureTrailingEmpty(state.modalDraft[key], key);
        pruneTrailingEmpty(state.modalDraft[key], key);
        renderModal(false);
        const activeTab = document.querySelector(".fondo-tab-content .tab-pane.active")?.id;
        if (activeTab) activateTab(activeTab);
    });
}

function renderLocalTab() {
    const options = [300000, 400000, 500000];
    const current = toNumber(state.modalDraft.fondoLocal);
    const isPreset = options.includes(current);

    els.tabLocal.innerHTML = `
        <h4>Fondo Local</h4>
        <div class="inline-choice">
            ${options
                .map(
                    (option) => `<label>
                        <input type="radio" name="fondo-local-choice" value="${option}" ${current === option ? "checked" : ""}>
                        ${money(option)}
                    </label>`
                )
                .join("")}
            <label>
                <input type="radio" name="fondo-local-choice" value="custom" ${!isPreset ? "checked" : ""}>
                Personalizado
            </label>
        </div>
        <div class="form-group">
            <label class="form-label" for="fondo-local-custom">Monto personalizado</label>
            <input id="fondo-local-custom" class="form-control" type="number" value="${current}" ${isPreset ? "disabled" : ""}>
        </div>`;

    els.tabLocal.querySelectorAll("input[name='fondo-local-choice']").forEach((input) => {
        input.addEventListener("change", () => {
            if (input.value === "custom") {
                const custom = document.getElementById("fondo-local-custom");
                custom.disabled = false;
                custom.focus();
                return;
            }

            state.modalDraft.fondoLocal = toNumber(input.value);
            const custom = document.getElementById("fondo-local-custom");
            if (custom) {
                custom.value = String(state.modalDraft.fondoLocal);
                custom.disabled = true;
            }
            renderSummary();
        });
    });

    const customInput = document.getElementById("fondo-local-custom");
    customInput?.addEventListener("input", () => {
        state.modalDraft.fondoLocal = toNumber(customInput.value);
        renderSummary();
    });
}

function renderSummary() {
    const { fondoFijo, sencillo, gastos, af, diferencia } = compute(state.modalDraft);

    const lines = [
        ["Fondo Local", state.modalDraft.fondoLocal],
        ["- Fondo en Efectivo", fondoFijo],
        ["- Sencillo", sencillo],
        ["- Gastos", gastos],
        ["- Fondo AF", af],
        ["Diferencia", diferencia]
    ];

    els.summaryBody.innerHTML = lines
        .map(([label, value]) => `<tr><td>${label}</td><td class="money">${money(value)}</td></tr>`)
        .join("");

    const ok = Math.round(diferencia) === 0;
    els.summaryStatus.textContent = ok ? "Cuadrado (diferencia 0)" : `Diferencia actual: ${money(diferencia)}`;
    els.summaryStatus.classList.toggle("ok", ok);
    els.summaryStatus.classList.toggle("bad", !ok);
}

function renderModal(updateComment = true) {
    els.tabFijo.innerHTML = renderInputTable(state.modalDraft.fondoFijo, {
        id: "modal-fijo-table",
        title: "Fondo en Efectivo"
    });

    els.tabSencillo.innerHTML = renderInputTable(state.modalDraft.sencillo, {
        id: "modal-sencillo-table",
        title: "Sencillo"
    });

    ensureTrailingEmpty(state.modalDraft.gastos, "gastos");
    pruneTrailingEmpty(state.modalDraft.gastos, "gastos");
    ensureTrailingEmpty(state.modalDraft.fondosAf, "fondosAf");
    pruneTrailingEmpty(state.modalDraft.fondosAf, "fondosAf");

    els.tabGastos.innerHTML = renderDynamicRows(state.modalDraft.gastos, {
        id: "modal-gastos-table",
        title: "Gastos",
        keyLabel: "Concepto"
    });

    els.tabAf.innerHTML = renderDynamicRows(state.modalDraft.fondosAf, {
        id: "modal-af-table",
        title: "Fondos AF",
        keyLabel: "Concepto",
        showDelete: true
    });

    renderLocalTab();

    attachFijoHandlers();
    attachSencilloHandlers();
    attachDynamicHandlers("modal-gastos-table", "gastos");
    attachDynamicHandlers("modal-af-table", "fondosAf");

    renderSummary();

    if (updateComment) {
        els.modalComment.value = state.modalDraft.comment ?? "";
    }
}

function openModal(mode) {
    const current = getCurrentRecord();
    state.modalMode = mode;

    if (mode === "edit" && current) {
        state.modalDraft = cloneRecord(current);
        state.editingRecordId = current.id;
        els.modalTitle.textContent = "Editar Registro de Fondo";
    } else {
        const seed = current || getLatestRecord();
        state.modalDraft = blankRecord();
        if (seed) {
            state.modalDraft.fondoLocal = toNumber(seed.fondoLocal);
            state.modalDraft.gastos = cloneRecord(seed.gastos || [createDynamicRow("gastos", 0)]);
            state.modalDraft.fondosAf = cloneRecord(seed.fondosAf || [createDynamicRow("fondosAf", 0)]);
        }
        state.editingRecordId = null;
        els.modalTitle.textContent = "Nuevo Registro de Fondo";
    }

    if (!Array.isArray(state.modalDraft.gastos) || state.modalDraft.gastos.length === 0) {
        state.modalDraft.gastos = [createDynamicRow("gastos", 0)];
    }
    if (!Array.isArray(state.modalDraft.fondosAf) || state.modalDraft.fondosAf.length === 0) {
        state.modalDraft.fondosAf = [createDynamicRow("fondosAf", 0)];
    }
    ensureTrailingEmpty(state.modalDraft.gastos, "gastos");
    pruneTrailingEmpty(state.modalDraft.gastos, "gastos");
    ensureTrailingEmpty(state.modalDraft.fondosAf, "fondosAf");
    pruneTrailingEmpty(state.modalDraft.fondosAf, "fondosAf");

    els.modalDate.value = state.modalDraft.date;
    els.modalTime.value = state.modalDraft.time;
    els.modalWorker.value = getCurrentWorkerName();

    renderModal();
    activateTab("tab-fijo");

    els.modal.classList.remove("hidden");
    els.modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
    els.modal.classList.add("hidden");
    els.modal.setAttribute("aria-hidden", "true");
}

function activateTab(tabId) {
    els.modalTabs.querySelectorAll(".tab-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.tab === tabId);
    });

    document.querySelectorAll(".fondo-tab-content .tab-pane").forEach((pane) => {
        pane.classList.toggle("active", pane.id === tabId);
    });
}

async function saveModal() {
    state.modalDraft.date = els.modalDate.value;
    state.modalDraft.time = els.modalTime.value;
    state.modalDraft.worker = getCurrentWorkerName();
    state.modalDraft.comment = els.modalComment.value || "";

    if (!state.modalDraft.date || !state.modalDraft.time) {
        alert("Debes ingresar fecha y hora para guardar el registro.");
        return;
    }
    state.modalDraft.gastos = compactDynamicRows(state.modalDraft.gastos, "gastos");
    state.modalDraft.fondosAf = compactDynamicRows(state.modalDraft.fondosAf, "fondosAf");

    if (state.modalMode === "edit" && state.editingRecordId) {
        const index = state.records.findIndex((record) => record.id === state.editingRecordId);
        if (index !== -1) {
            state.records[index] = cloneRecord(state.modalDraft);
        }
    } else {
        state.records.push(cloneRecord(state.modalDraft));
    }

    state.records.sort((a, b) => {
        const da = `${a.date} ${a.time}`;
        const db = `${b.date} ${b.time}`;
        return da < db ? 1 : -1;
    });

    await saveRecords();
    state.selectedDate = state.modalDraft.date;
    state.selectedTime = state.modalDraft.time;

    renderDateSelect();
    closeModal();
}

function renderReport() {
    const record = getCurrentRecord();
    if (!record) {
        return;
    }

    const totals = compute(record);
    const fixedRows = record.fondoFijo
        .map(
            (row) => `<tr>
                <td>${money(row.den)}</td>
                <td class="money">${new Intl.NumberFormat("es-CL").format(toNumber(row.units))}</td>
                <td class="money">${money(row.direct)}</td>
                <td class="money">${money(rowSubtotal(row))}</td>
            </tr>`
        )
        .join("");

    els.reportContent.innerHTML = `
        <div class="print-sheet">
            <div class="report-block">
                <h4>Encabezado</h4>
                <div class="print-header-grid">
                    <p><strong>Fecha:</strong> ${record.date}</p>
                    <p><strong>Hora:</strong> ${record.time}</p>
                    <p><strong>Trabajador:</strong> ${record.worker || "Sin usuario"}</p>
                    <p><strong>Fondo Local:</strong> ${money(record.fondoLocal)}</p>
                    <p><strong>Fondo en Efectivo:</strong> ${money(totals.fondoFijo)}</p>
                    <p><strong>Sencillo:</strong> ${money(totals.sencillo)}</p>
                    <p><strong>Gastos:</strong> ${money(totals.gastos)}</p>
                    <p><strong>Fondo AF:</strong> ${money(totals.af)}</p>
                    <p><strong>Diferencia:</strong> ${money(totals.diferencia)}</p>
                </div>
            </div>

            <div class="report-block">
                <h4>Registros Previos</h4>
                <table class="table fondo-table compact print-fixed-table">
                    <thead>
                        <tr>
                            <th>Denominación</th>
                            <th class="money">Unidades</th>
                            <th class="money">Directo</th>
                            <th class="money">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${fixedRows}
                        <tr class="total-row">
                            <td colspan="3">Total Fondo en Efectivo</td>
                            <td class="money">${money(totals.fondoFijo)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="report-block">
                <h4>Comentario</h4>
                <p>${record.comment || "Sin comentario."}</p>
            </div>
        </div>
    `;

    els.reportModal.classList.remove("hidden");
    els.reportModal.setAttribute("aria-hidden", "false");
}

function closeReportModal() {
    els.reportModal.classList.add("hidden");
    els.reportModal.setAttribute("aria-hidden", "true");
}

function bindEvents() {
    els.fechaSelect.addEventListener("change", () => {
        state.selectedDate = els.fechaSelect.value;
        renderTimeSelect();
    });

    els.horaSelect.addEventListener("change", () => {
        state.selectedTime = els.horaSelect.value;
        renderPreview();
    });

    els.btnNew.addEventListener("click", () => openModal("create"));
    els.btnEdit.addEventListener("click", () => openModal("edit"));
    els.btnReport.addEventListener("click", renderReport);

    els.closeModal.addEventListener("click", closeModal);
    els.cancelModal.addEventListener("click", closeModal);
    els.saveModal.addEventListener("click", () => {
        void saveModal();
    });

    els.closeReportModal.addEventListener("click", closeReportModal);
    els.closeReport.addEventListener("click", closeReportModal);
    els.printReport.addEventListener("click", () => window.print());

    els.modalTabs.querySelectorAll(".tab-item").forEach((item) => {
        item.addEventListener("click", (event) => {
            event.preventDefault();
            activateTab(item.dataset.tab);
        });
    });

    els.modalComment.addEventListener("input", () => {
        if (state.modalDraft) {
            state.modalDraft.comment = els.modalComment.value;
        }
    });

    [els.modal, els.reportModal].forEach((modal) => {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                modal.classList.add("hidden");
                modal.setAttribute("aria-hidden", "true");
            }
        });
    });
}

async function init() {
    showLoadingOverlay("Cargando fondo...");
    const user = Auth.checkAuth();
    if (!user) {
        hideLoadingOverlay();
        return;
    }
    try {
        state.currentUser = user;
        setupHeader(user);
        setupLogout();

        await loadRecords();
        state.selectedDate = getUniqueDates()[0] || "";
        state.selectedTime = getTimesForDate(state.selectedDate)[0] || "";

        bindEvents();
        renderDateSelect();
        lucide.createIcons();
    } finally {
        hideLoadingOverlay();
    }
}

void init();
