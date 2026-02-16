import { Auth } from "/core/js/auth.js";
import { showToast, showLoadingOverlay, hideLoadingOverlay } from "/core/js/ui-feedback.js";

let currentUser = null;
let localeName = "";
let localeId = "";
let reportDate = new Date();
let reports = [];

document.addEventListener("DOMContentLoaded", async () => {
    showLoadingOverlay("Cargando reportes...");
    currentUser = Auth.checkAuth();
    if (!currentUser) {
        hideLoadingOverlay();
        return;
    }

    try {
        setupHeader(currentUser);
        localeId = String(currentUser.locale_id || "").toUpperCase();
        await loadReportsForLocale(localeId);
        setupActions();
        lucide.createIcons();
    } finally {
        hideLoadingOverlay();
    }
});

function setupHeader(user) {
    const userSigla = document.getElementById("user-sigla");
    const userName = document.getElementById("user-name-text");
    const userCargo = document.getElementById("user-cargo-text");
    const logoutBtn = document.getElementById("logout-btn");

    const initials = (user.names || user.name || "")
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("");
    userSigla.textContent = initials.toUpperCase().substring(0, 2) || "--";
    userName.textContent = `${user.names || user.name || ""} ${user.last_names || ""}`.trim();
    userCargo.textContent = user.cargo || "";

    logoutBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        Auth.logout();
    });
}

function setupActions() {
    document.getElementById("export-all-btn")?.addEventListener("click", async () => {
        if (!reports.length) {
            showToast("No hay listas para exportar.", "info");
            return;
        }

        for (const report of reports) {
            exportReportToPdf(report);
            await delay(150);
        }
        showToast("Exportación de reportes completada.", "success");
    });
}

async function loadReportsForLocale(localId) {
    try {
        const [localeInfo, catalogMap, assignmentProducts, transitItems, customLists] = await Promise.all([
            fetchLocaleName(localId),
            fetchCatalogPriceMap(localId),
            fetchAssignmentProducts(localId),
            fetchTransitItems(localId),
            fetchCustomLists(localId)
        ]);

        localeName = localeInfo || localId;
        const mappedDiffs = assignmentProducts.map((product) => mapAssignmentRow(product, catalogMap));

        const diferencias = mappedDiffs.filter((row) => row.unidades !== 0);
        const faltantes = mappedDiffs.filter((row) => row.unidades < 0);
        const sobrantes = mappedDiffs.filter((row) => row.unidades > 0);
        const transito = transitItems.map((item) => mapTransitRow(item, catalogMap));
        const otros = loadOtrosListFromLocalStorage().map((item) => mapTransitRow(item, catalogMap));

        const customReports = customLists.map((list) => ({
            id: list.id,
            name: list.name || "Lista Personalizada",
            rows: (Array.isArray(list.items) ? list.items : []).map((item) => mapTransitRow(item, catalogMap))
        }));

        reports = [
            { id: "diferencias", name: "Diferencias", rows: diferencias },
            { id: "faltantes", name: "Faltantes", rows: faltantes },
            { id: "sobrantes", name: "Sobrantes", rows: sobrantes },
            { id: "transito", name: "Tránsito", rows: transito },
            { id: "otros", name: "Otros", rows: otros },
            ...customReports
        ];

        renderContext();
        renderReports();
    } catch (error) {
        console.error("Error loading reports:", error);
        showToast("No se pudieron cargar los reportes.", "error");
        document.getElementById("reports-grid").innerHTML = '<div class="card">Error al cargar reportes.</div>';
    }
}

function renderContext() {
    const contextNode = document.getElementById("report-context");
    const formattedDate = reportDate.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });
    contextNode.innerHTML = `
        <div class="report-context-item">
            <span class="label">Reporte</span>
            <span class="value">Diferencias de Inventario</span>
        </div>
        <div class="report-context-item">
            <span class="label">Local</span>
            <span class="value">${escapeHtml(localeName)} (${escapeHtml(localeId)})</span>
        </div>
        <div class="report-context-item">
            <span class="label">Fecha</span>
            <span class="value">${escapeHtml(formattedDate)}</span>
        </div>
    `;
}

function renderReports() {
    const container = document.getElementById("reports-grid");
    container.innerHTML = "";

    if (!reports.length) {
        container.innerHTML = '<div class="card">No hay reportes disponibles.</div>';
        return;
    }

    reports.forEach((report) => {
        const totals = calculateTotals(report.rows);
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <div class="flex justify-between items-center mb-md">
                <h3 style="margin: 0;">${escapeHtml(report.name)}</h3>
                <button class="btn btn-primary btn-sm export-report-btn" data-id="${report.id}">
                    <i data-lucide="download" style="width:14px; height:14px; margin-right:4px;"></i>
                    Exportar PDF
                </button>
            </div>
            <div class="report-card-meta">
                <div class="report-meta-pill">
                    <span class="label">Ítems</span>
                    <span class="value">${report.rows.length}</span>
                </div>
                <div class="report-meta-pill">
                    <span class="label">Suma Unidades</span>
                    <span class="value">${formatNumber(calculateAbsoluteUnits(report.rows))}</span>
                </div>
                <div class="report-meta-pill">
                    <span class="label">Total Valorizado</span>
                    <span class="value">${formatMoney(totals.total)}</span>
                </div>
            </div>
            <div style="max-height: 190px; overflow: auto; border: 1px solid var(--border-color); border-radius: 8px;">
                <table class="table" style="margin: 0;">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Nombre</th>
                            <th>Unidades</th>
                            <th>P. Unit.</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderReportRowsPreview(report.rows)}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll(".export-report-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const report = reports.find((entry) => entry.id === btn.dataset.id);
            if (report) exportReportToPdf(report);
        });
    });

    lucide.createIcons();
}

function renderReportRowsPreview(rows) {
    if (!rows.length) {
        return '<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Sin productos</td></tr>';
    }

    return rows
        .slice(0, 18)
        .map((row) => `
            <tr>
                <td>${escapeHtml(row.codigo)}</td>
                <td>${escapeHtml(row.nombre)}</td>
                <td>${formatNumber(row.unidades)}</td>
                <td>${formatMoney(row.precioUnitario)}</td>
                <td>${formatMoney(row.subtotal)}</td>
            </tr>
        `)
        .join("");
}

function exportReportToPdf(report) {
    const jsPdfLib = window.jspdf?.jsPDF;
    if (!jsPdfLib) {
        showToast("No se pudo cargar el motor PDF.", "error");
        return;
    }

    const doc = new jsPdfLib({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 40;
    const top = 45;
    const dateText = reportDate.toLocaleString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });
    const totals = calculateTotals(report.rows);
    const totalsAbsUnits = calculateAbsoluteUnits(report.rows);

    doc.setTextColor(19, 32, 51);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(`Reporte: ${report.name}`, pageWidth / 2, top, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Local: ${localeName} (${localeId})`, pageWidth - left, top + 18, { align: "right" });
    doc.text(`Fecha: ${dateText}`, pageWidth - left, top + 32, { align: "right" });

    const summaryY = top + 50;
    const boxGap = 10;
    const boxWidth = (pageWidth - (left * 2) - (boxGap * 2)) / 3;
    const boxHeight = 44;
    const summaryBoxes = [
        { label: "Cantidad de ítems", value: String(report.rows.length) },
        { label: "Suma de unidades", value: formatNumber(totalsAbsUnits) },
        { label: "Total valorizado", value: formatMoney(totals.total) }
    ];

    summaryBoxes.forEach((box, index) => {
        const x = left + index * (boxWidth + boxGap);
        doc.setDrawColor(217, 226, 236);
        doc.setFillColor(248, 251, 255);
        doc.roundedRect(x, summaryY, boxWidth, boxHeight, 6, 6, "FD");
        doc.setFontSize(8);
        doc.setTextColor(93, 106, 122);
        doc.text(box.label, x + 10, summaryY + 14);
        doc.setFontSize(12);
        doc.setTextColor(19, 32, 51);
        doc.text(box.value, x + 10, summaryY + 32);
    });

    doc.setTextColor(19, 32, 51);
    const body = report.rows.map((row) => [
        row.codigo,
        row.nombre,
        formatNumber(row.unidades),
        formatMoney(row.precioUnitario),
        formatMoney(row.subtotal)
    ]);

    doc.autoTable({
        head: [["Código", "Nombre", "Unidades", "Precio Unitario", "Subtotal"]],
        body,
        startY: summaryY + boxHeight + 18,
        margin: { left, right: left },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [11, 95, 255] },
        theme: "grid"
    });

    const safeName = sanitizeFileName(report.name);
    const dateTag = toDateTag(reportDate);
    doc.save(`Reporte_${localeId}_${safeName}_${dateTag}.pdf`);
}

async function fetchLocaleName(localId) {
    const response = await fetch("/api/locales");
    if (!response.ok) return localId;
    const locales = await response.json();
    const match = locales.find((item) => String(item.id || "").toUpperCase() === localId);
    return match?.name || match?.short_name || localId;
}

async function fetchCatalogPriceMap(localId) {
    const map = new Map();
    const response = await fetch(`/api/products/list/${localId}`);
    if (!response.ok) return map;
    const data = await response.json();
    const productos = Array.isArray(data?.productos) ? data.productos : [];
    productos.forEach((item) => {
        const code = normalizeCode(item.codigo);
        if (!code) return;
        map.set(code, parsePrice(item.precio));
    });
    return map;
}

async function fetchAssignmentProducts(localId) {
    const response = await fetch(`/api/assignment/latest/${localId}`);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.productos) ? data.productos : [];
}

async function fetchTransitItems(localId) {
    const response = await fetch(`/api/transit-list/latest/${localId}`);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function fetchCustomLists(localId) {
    const response = await fetch(`/api/movements/custom-lists/${localId}`);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

function loadOtrosListFromLocalStorage() {
    try {
        const raw = localStorage.getItem("inventory_otros_list");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function mapAssignmentRow(product, catalogMap) {
    const codigo = String(product?.codigo || "");
    const unidades = toNumber(product?.diferencia);
    const precioUnitario = toNumber(catalogMap.get(normalizeCode(codigo)));
    return {
        codigo,
        nombre: String(product?.nombre || ""),
        unidades,
        precioUnitario,
        subtotal: unidades * precioUnitario
    };
}

function mapTransitRow(item, catalogMap) {
    const codigo = String(item?.codigo || "");
    const unidades = toNumber(item?.cantidad ?? item?.unidades ?? item?.diferencia);
    const explicitPrice = toNumber(item?.precioUnitario ?? item?.precio);
    const catalogPrice = toNumber(catalogMap.get(normalizeCode(codigo)));
    const precioUnitario = explicitPrice > 0 ? explicitPrice : catalogPrice;
    return {
        codigo,
        nombre: String(item?.nombre || ""),
        unidades,
        precioUnitario,
        subtotal: toNumber(item?.subtotal) || (unidades * precioUnitario)
    };
}

function calculateTotals(rows) {
    return rows.reduce(
        (acc, row) => {
            acc.unidades += toNumber(row.unidades);
            acc.total += toNumber(row.subtotal);
            return acc;
        },
        { unidades: 0, total: 0 }
    );
}

function calculateAbsoluteUnits(rows) {
    return rows.reduce((acc, row) => acc + Math.abs(toNumber(row.unidades)), 0);
}

function normalizeCode(code) {
    return String(code || "").replace(/\s*\*/g, "").trim().toUpperCase();
}

function parsePrice(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value || "").replace(/[$.\s]/g, "").replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
    return `$${toNumber(value).toLocaleString("es-CL")}`;
}

function formatNumber(value) {
    return toNumber(value).toLocaleString("es-CL");
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function sanitizeFileName(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w\-]/g, "");
}

function toDateTag(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}${m}${d}_${hh}${mm}`;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
