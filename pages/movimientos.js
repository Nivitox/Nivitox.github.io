import { Auth } from '/core/js/auth.js';
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs';
import { showToast, showConfirmDialog, showLoadingOverlay, hideLoadingOverlay } from '/core/js/ui-feedback.js';

// --- DOM ELEMENTS ---
const page = {
    title: document.getElementById('page-title'),
    backButton: document.getElementById('back-button'),
    pdfUpload: document.getElementById('pdf-upload'),
    pdfUploadLabel: document.querySelector('label[for="pdf-upload"]'),
    addCustomListBtn: document.getElementById('add-custom-list-btn'),
    configureMotivesBtn: document.getElementById('configure-motives-btn'),
    customListsContainer: document.getElementById('custom-lists'),
    addManualProductBtn: document.getElementById('add-manual-product-btn'),
    predefinedListContent: document.getElementById('predefined-list-content'),
    // Manual Product Modal elements
    manualProductModal: document.getElementById('manual-product-modal'),
    modalCloseButton: document.querySelector('#manual-product-modal .close-button'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalAddBtn: document.getElementById('modal-add-btn'),
    modalProductCode: document.getElementById('modal-product-code'),
    modalProductName: document.getElementById('modal-product-name'),
    modalUnits: document.getElementById('modal-units'),
    modalUnitPrice: document.getElementById('modal-unit-price'),
    modalMotivo: document.getElementById('modal-motivo'), // New motive select
    modalSubtotal: document.getElementById('modal-subtotal'),
    productSuggestions: document.getElementById('product-suggestions'),
    transitListTableBody: document.getElementById('transito-table-body'),
    otrosTableBody: document.getElementById('otros-table-body'),
    // New transit summary and bulk actions elements
    transitTotalCodes: document.getElementById('transit-total-codes'),
    transitTotalQuantity: document.getElementById('transit-total-quantity'),
    transitTotalPrice: document.getElementById('transit-total-price'),
    transitCurrentDate: document.getElementById('transit-current-date'),
    bulkActionsBtn: document.getElementById('bulk-actions-btn'),
    bulkActionsDropdown: document.getElementById('bulk-actions-dropdown'),
    bulkDeleteBtn: document.getElementById('bulk-delete-btn'),
    bulkMoveBtn: document.getElementById('bulk-move-btn'),
    // Move to List Modal elements
    moveToListModal: document.getElementById('move-to-list-modal'),
    modalMoveCloseButton: document.querySelector('#move-to-list-modal .close-button'),
    modalTargetList: document.getElementById('modal-target-list'),
    modalMoveCancelBtn: document.getElementById('modal-move-cancel-btn'),
    modalMoveConfirmBtn: document.getElementById('modal-move-confirm-btn'),
    motivesConfigModal: document.getElementById('motives-config-modal'),
    motivesConfigClose: document.getElementById('motives-config-close'),
    motivesConfigCancel: document.getElementById('motives-config-cancel'),
    motivesConfigSave: document.getElementById('motives-config-save'),
    motivesInputList: document.getElementById('motives-input-list'),
    imageModal: document.getElementById('image-modal'),
    modalImage: document.getElementById('modal-image'),
    modalLoader: document.getElementById('modal-loader'),
    modalProductCodeLabel: document.getElementById('image-modal-product-code'),
    modalProductNameLabel: document.getElementById('image-modal-product-name'),
    modalSourceBadge: document.getElementById('modal-source-badge'),
    modalMessage: document.getElementById('modal-message'),
    dataUploadInput: document.getElementById('data-upload-input'),
    diferenciasTableBody: document.getElementById('diferencias-table-body'),
    faltantesTableBody: document.getElementById('faltantes-table-body'),
    sobrantesTableBody: document.getElementById('sobrantes-table-body')
};

// Configure the workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

// --- STATE ---
let currentUser = null;
let customLists = [];
let allProducts = []; // To store all products for autocomplete
let editingIndex = -1; // -1 for adding new, >=0 for editing existing
let editingListId = 'transito';
const DEFAULT_TRANSIT_REASONS = [
    'Seleccione Motivo', // Default option
    'Reparación',
    'Revisión',
    'Traspaso a otra sucursal',
    'Devolución a proveedor',
    'Baja por caducidad',
    'Baja por daño',
    'Inventario',
    'Otro'
];
let transitReasons = [...DEFAULT_TRANSIT_REASONS];

let transitList = []; // To store products added to the transit list
let otherList = [];
let selectedTransitItems = []; // To store indices of selected items
let selectedProduct = null;
let activeSuggestionField = "code";
let predefinedMovementLists = {
    diferencias: [],
    faltantes: [],
    sobrantes: []
};

// --- Helper Functions ---
async function fetchProducts(localId) {
    if (!localId) {
        console.error('No locale ID provided for fetching products.');
        return;
    }
    try {
        const response = await fetch(`/api/products/list/${localId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allProducts = (await response.json()).productos || [];
        console.log(`Fetched ${allProducts.length} products for locale ${localId}.`);
    } catch (error) {
        console.error(`Error fetching products for locale ${localId}:`, error);
        allProducts = []; // Ensure it's empty on error
    }
}



function parsePrice(priceString) {
    if (typeof priceString !== 'string') {
        return parseFloat(priceString); // Already a number or can be parsed directly
    }
    // Remove currency symbols, thousand separators ('.'), and replace comma (',') with dot ('.') for decimals
    const cleanedString = priceString.replace(/[$.]/g, '').replace(',', '.');
    return parseInt(cleanedString, 10); // Convert to integer
}

function normalizeProductCode(code) {
    return String(code || '')
        .replace(/\s*\*/g, '')
        .trim()
        .toUpperCase();
}

function getUnitPriceFromCatalog(productCode) {
    const normalizedCode = normalizeProductCode(productCode);
    const match = allProducts.find(item => normalizeProductCode(item.codigo) === normalizedCode);
    return match ? parsePrice(match.precio) : 0;
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
    return `$${toNumber(value).toLocaleString('es-CL')}`;
}

function formatSummaryMoney(value) {
    return `$${toNumber(value).toLocaleString('es-CL')}.`;
}

function renderDateBubbles(dateString) {
    if (!dateString || dateString === 'Pendiente' || dateString === 'N/A') {
        return '<span class="bubble-gray">--/--/--</span> <span class="bubble-gray">--:--</span>';
    }
    const parts = String(dateString).split(' ');
    if (parts.length >= 2) {
        return `<span class="bubble-gray">${parts[0]}</span> <span class="bubble-gray">${parts[1]}</span>`;
    }
    return `<span class="bubble-gray">${dateString}</span>`;
}

function mapAssignmentProductToMovementRow(product) {
    const units = toNumber(product.diferencia);
    const unitPrice = getUnitPriceFromCatalog(product.codigo);

    return {
        codigo: product.codigo || '',
        nombre: product.nombre || '',
        estado: product.estado || '',
        diferencia: units,
        unidades: units,
        precio: unitPrice,
        subtotal: units * unitPrice,
        fecha: product.fecha_revision || 'Pendiente',
        sourceProduct: product
    };
}

function enrichTransitItemPricing(item) {
    const qty = toNumber(item?.cantidad);
    const catalogPrice = getUnitPriceFromCatalog(item?.codigo);
    const currentPrice = toNumber(item?.precioUnitario);
    const unitPrice = catalogPrice > 0 ? catalogPrice : currentPrice;

    return {
        ...item,
        precioUnitario: unitPrice,
        subtotal: unitPrice * qty
    };
}

function getActivePredefinedTabId() {
    const activeTab = document.querySelector('#predefined-lists .tab-item.active');
    return activeTab ? activeTab.dataset.listId : null;
}

function getActiveTabDisplayName() {
    const activeTab = document.querySelector('#predefined-lists .tab-item.active a');
    return activeTab ? activeTab.textContent.trim() : 'Tránsito';
}

function getListDisplayName(listId) {
    if (listId === 'transito') return 'Tránsito';
    if (listId === 'otros') return 'Otros';
    if (listId === 'diferencias') return 'Diferencias';
    if (listId === 'faltantes') return 'Faltantes';
    if (listId === 'sobrantes') return 'Sobrantes';
    const custom = getCustomListById(listId);
    return custom?.name || listId;
}

function getDestinationListOptionsHtml(sourceListId) {
    const options = [
        { id: 'transito', name: 'Tránsito' },
        { id: 'otros', name: 'Otros' },
        ...customLists.map(list => ({ id: list.id, name: list.name }))
    ].filter(opt => opt.id !== sourceListId);

    return options.map(opt => `<option value="${opt.id}">${opt.name}</option>`).join('');
}

function openRevisionForCode(codigo) {
    const code = normalizeProductCode(codigo);
    if (!code) return;
    const params = new URLSearchParams({
        filter: 'todos',
        code,
        edit: '1'
    });
    window.location.href = `/pages/revision.html?${params.toString()}`;
}

function showUndoToast(message, onUndo) {
    showToast(message, 'success', 5200, {
        actionLabel: 'Deshacer',
        onAction: async () => {
            await onUndo();
            showToast('Acción deshecha.', 'info');
        }
    });
}

function updateManualButtonVisibility() {
    if (!page.addManualProductBtn) return;
    const tabId = getActivePredefinedTabId();
    const shouldHide = ['diferencias', 'faltantes', 'sobrantes'].includes(tabId);
    page.addManualProductBtn.style.display = shouldHide ? 'none' : '';
    page.addManualProductBtn.disabled = shouldHide;
}

function loadTransitReasons() {
    const raw = localStorage.getItem('inventory_transit_reasons');
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            transitReasons = parsed;
        }
    } catch (error) {
        console.error('Error loading transit reasons:', error);
    }
}

function saveTransitReasons() {
    localStorage.setItem('inventory_transit_reasons', JSON.stringify(transitReasons));
}

function createMotiveConfigRow(value = '') {
    const row = document.createElement('div');
    row.className = 'motive-config-row flex items-center gap-md mb-sm';
    row.innerHTML = `
        <input type="text" class="form-control motive-config-input" value="${String(value).replace(/"/g, '&quot;')}" placeholder="Nombre del motivo">
        <button type="button" class="btn btn-danger motive-config-delete" title="Eliminar motivo">
            <i data-lucide="trash-2"></i>
        </button>
    `;
    return row;
}

function ensureTrailingEmptyMotiveRow() {
    if (!page.motivesInputList) return;
    const rows = Array.from(page.motivesInputList.querySelectorAll('.motive-config-input'));
    if (rows.length === 0 || rows[rows.length - 1].value.trim() !== '') {
        page.motivesInputList.appendChild(createMotiveConfigRow(''));
    }
}

function renderMotivesConfigRows() {
    if (!page.motivesInputList) return;
    page.motivesInputList.innerHTML = '';

    transitReasons.forEach((reason) => {
        page.motivesInputList.appendChild(createMotiveConfigRow(reason));
    });
    ensureTrailingEmptyMotiveRow();
    lucide.createIcons();
}

function openMotivesConfigModal() {
    renderMotivesConfigRows();
    page.motivesConfigModal.style.display = 'flex';
}

function closeMotivesConfigModal() {
    page.motivesConfigModal.style.display = 'none';
}

function saveMotivesFromModal() {
    if (!page.motivesInputList) return;
    const values = Array.from(page.motivesInputList.querySelectorAll('.motive-config-input'))
        .map((input) => input.value.trim())
        .filter(Boolean);

    transitReasons = values.length > 0 ? values : [...DEFAULT_TRANSIT_REASONS];
    saveTransitReasons();
    renderListById('transito');
    renderListById('otros');
    customLists.forEach(list => renderListById(list.id));
    closeMotivesConfigModal();
}

function getCustomListById(listId) {
    return customLists.find(list => list.id === listId) || null;
}

function getListItemsById(listId) {
    if (listId === 'transito') return transitList;
    if (listId === 'otros') return otherList;
    const customList = getCustomListById(listId);
    if (!customList) return [];
    if (!Array.isArray(customList.items)) customList.items = [];
    return customList.items;
}

function setListItemsById(listId, items) {
    if (listId === 'transito') {
        transitList = items;
        return;
    }
    if (listId === 'otros') {
        otherList = items;
        return;
    }
    const customList = getCustomListById(listId);
    if (customList) {
        customList.items = items;
    }
}

function saveOtherList() {
    localStorage.setItem('inventory_otros_list', JSON.stringify(otherList));
}

function loadOtherList() {
    try {
        const raw = localStorage.getItem('inventory_otros_list');
        otherList = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(otherList)) otherList = [];
    } catch (error) {
        console.error('Error loading otros list:', error);
        otherList = [];
    }
}

function findProductMatches(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return allProducts.filter(product =>
        String(product.codigo || '').toLowerCase().includes(q) ||
        String(product.nombre || '').toLowerCase().includes(q)
    ).slice(0, 8);
}

function resolveSelectedProductFromInputs() {
    const codeQuery = normalizeProductCode(page.modalProductCode.value);
    const nameQuery = String(page.modalProductName.value || '').trim().toLowerCase();

    const exactByCode = allProducts.find(p => normalizeProductCode(p.codigo) === codeQuery);
    if (exactByCode) return exactByCode;

    const exactByName = allProducts.find(p => String(p.nombre || '').trim().toLowerCase() === nameQuery);
    if (exactByName) return exactByName;

    return null;
}

function syncProductByExactInput(sourceField) {
    const matched = resolveSelectedProductFromInputs();
    if (!matched) return false;

    selectedProduct = matched;
    page.modalProductCode.value = matched.codigo || '';
    page.modalProductName.value = matched.nombre || '';
    page.modalUnitPrice.value = parsePrice(matched.precio);
    updateSubtotal();
    return true;
}

function refreshAllListPricesFromCatalog() {
    transitList = transitList.map(enrichTransitItemPricing);
    otherList = otherList.map(enrichTransitItemPricing);
    customLists = (customLists || []).map((list) => {
        if (!Array.isArray(list.items)) return list;
        return {
            ...list,
            items: list.items.map((item) => enrichTransitItemPricing(item))
        };
    });
}

function renderMovementTableRows(tableBody, rows, emptyLabel) {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const sourceListId = tableBody.id.replace('-table-body', '');
    const destinationListOptions = getDestinationListOptionsHtml(sourceListId);

    if (!Array.isArray(rows) || rows.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">${emptyLabel}</td>
            </tr>
        `;
        return;
    }

    rows.forEach((row) => {
        const mainRow = document.createElement('tr');
        mainRow.className = 'predefined-item-row';
        const rowCode = String(row.codigo || '').replace(/"/g, '&quot;');
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'predefined-details-row transit-details-row';
        detailsRow.style.display = 'none';

        mainRow.innerHTML = `
            <td>
                <button class="product-code-link predefined-code-link" data-source-list="${sourceListId}" data-code="${rowCode}">
                    ${row.codigo}
                </button>
            </td>
            <td>${row.nombre}</td>
            <td>${row.unidades}</td>
            <td>${formatMoney(row.subtotal)}</td>
            <td>
                <button class="btn btn-sm btn-danger predefined-delete-btn" type="button" data-source-list="${sourceListId}" data-code="${rowCode}" title="Eliminar diferencia">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
            <td class="text-center">
                <i data-lucide="chevron-down" class="expand-icon"></i>
            </td>
        `;

        detailsRow.innerHTML = `
            <td colspan="6">
                <div class="transit-details-content horizontal-details">
                    <div class="detail-group">
                        <span class="detail-label">Estado</span>
                        <span class="info-bubble ${row.estado === 'Revisado' ? 'info-bubble-green' : 'info-bubble-red'}">${row.estado || 'Pendiente'}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Precio Unitario</span>
                        <span class="bubble-blue">${formatMoney(row.precio)}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Fecha</span>
                        <span>${renderDateBubbles(row.fecha || 'Pendiente')}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Añadir a Lista</span>
                        <div class="custom-list-controls">
                            <select class="form-control predefined-target-list" data-source-list="${sourceListId}" data-code="${rowCode}">
                                <option value="">Seleccionar...</option>
                                ${destinationListOptions}
                            </select>
                            <button class="btn btn-sm btn-primary predefined-add-btn" type="button" data-source-list="${sourceListId}" data-code="${rowCode}" title="Añadir a lista">
                                <i data-lucide="plus"></i>
                            </button>
                            <button class="btn btn-sm btn-primary predefined-open-revision-btn" type="button" data-code="${rowCode}" title="Editar en Revisión">
                                <i data-lucide="square-pen"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </td>
        `;

        tableBody.appendChild(mainRow);
        tableBody.appendChild(detailsRow);

        mainRow.addEventListener('click', (event) => {
            if (event.target.closest('button') || event.target.closest('select')) return;
            const expanded = mainRow.classList.toggle('expanded');
            detailsRow.style.display = expanded ? 'table-row' : 'none';
        });
    });
}

function findPredefinedRow(sourceListId, codigo) {
    const list = predefinedMovementLists[sourceListId];
    if (!Array.isArray(list)) return null;
    return list.find(item => normalizeProductCode(item.codigo) === normalizeProductCode(codigo)) || null;
}

function getImageProductFromMovementItem(item) {
    if (!item) return null;
    const normalizedCode = normalizeProductCode(item.codigo);
    const catalogMatch = allProducts.find(p => normalizeProductCode(p.codigo) === normalizedCode);

    return {
        codigo: item.codigo || catalogMatch?.codigo || '',
        nombre: item.nombre || catalogMatch?.nombre || '',
        link: item.link || catalogMatch?.link || (normalizedCode ? `https://www.drsimi.cl/${normalizedCode}` : ''),
        link2: item.link2 || catalogMatch?.link2 || (normalizedCode ? `images/${normalizedCode}.webp` : '')
    };
}

async function addPredefinedRowToTargetList(sourceListId, codigo, targetListId) {
    if (!targetListId) {
        showToast('Seleccione una lista válida.', 'info');
        return;
    }

    const row = findPredefinedRow(sourceListId, codigo);
    if (!row) {
        showToast('No se encontró el registro seleccionado.', 'error');
        return;
    }

    const targetItems = getListItemsById(targetListId);
    if (targetItems.some(item => String(item.codigo) === String(row.codigo))) {
        showToast(`El producto ${row.nombre} ya existe en "${getListDisplayName(targetListId)}".`, 'info');
        return;
    }

    const item = enrichTransitItemPricing({
        codigo: row.codigo,
        nombre: row.nombre,
        cantidad: Math.abs(toNumber(row.diferencia)),
        precioUnitario: row.precio,
        motivo: transitReasons[0] || 'Otro',
        fechaEdicion: new Date().toISOString()
    });

    targetItems.push(item);
    setListItemsById(targetListId, targetItems);
    persistListById(targetListId);
    renderListById(targetListId);
    showUndoToast(`Producto ${row.nombre} agregado a "${getListDisplayName(targetListId)}".`, () => {
        const currentItems = getListItemsById(targetListId);
        const removeIndex = currentItems.findIndex(x => normalizeProductCode(x.codigo) === normalizeProductCode(item.codigo));
        if (removeIndex >= 0) {
            currentItems.splice(removeIndex, 1);
            setListItemsById(targetListId, currentItems);
            persistListById(targetListId);
            renderListById(targetListId);
        }
    });
}

async function resolvePredefinedRowDifference(codigo) {
    if (!currentUser?.locale_id) return;
    try {
        const response = await fetch(`/api/assignment/resolve-difference/${currentUser.locale_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo })
        });
        if (!response.ok) {
            const raw = await response.text();
            throw new Error(raw || `HTTP ${response.status}`);
        }
        await loadPredefinedMovementLists();
    } catch (error) {
        console.error('Error resolving difference:', error);
        showToast('No se pudo eliminar la diferencia.', 'error');
    }
}

function extractImageSrc(htmlContent) {
    const regex = /<img[^>]+src="([^"]*vtexassets[^"]*)"[^>]*class="[^"]*vtex-product-summary-2-x-imageNormal[^"]*"/;
    const match = htmlContent.match(regex);
    if (match && match[1]) return match[1];
    return '';
}

function tryLoadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
    });
}

async function openProductImageModal(product) {
    if (!page.imageModal || !page.modalImage) return;

    page.imageModal.style.display = 'flex';
    if (page.modalProductCodeLabel) page.modalProductCodeLabel.textContent = product.codigo || 'N/A';
    if (page.modalProductNameLabel) page.modalProductNameLabel.textContent = product.nombre || 'Sin Nombre';

    if (page.modalLoader) page.modalLoader.style.display = 'block';
    if (page.modalImage) {
        page.modalImage.style.display = 'none';
        page.modalImage.src = '';
    }
    if (page.modalSourceBadge) page.modalSourceBadge.style.display = 'none';
    if (page.modalMessage) page.modalMessage.style.display = 'none';

    const setUIState = (src, label) => {
        if (page.modalLoader) page.modalLoader.style.display = 'none';
        page.modalImage.src = src;
        page.modalImage.style.display = 'block';
        if (page.modalSourceBadge) {
            page.modalSourceBadge.textContent = label;
            page.modalSourceBadge.style.display = 'block';
        }
    };

    const showError = (msg) => {
        if (page.modalLoader) page.modalLoader.style.display = 'none';
        if (page.modalMessage) {
            page.modalMessage.textContent = msg;
            page.modalMessage.style.display = 'block';
        }
    };

    const internetPageUrl = product.link ? `/api/proxy?url=${encodeURIComponent(product.link)}` : null;
    const localUrl = product.link2 ? `/${String(product.link2).replace(/^\/+/, '')}` : null;

    let loaded = false;
    if (internetPageUrl) {
        try {
            const response = await fetch(internetPageUrl);
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                let finalImageUrl = null;
                if (contentType.includes('text/html')) {
                    const html = await response.text();
                    finalImageUrl = extractImageSrc(html);
                } else {
                    finalImageUrl = internetPageUrl;
                }

                if (finalImageUrl) {
                    await tryLoadImage(finalImageUrl);
                    setUIState(finalImageUrl, 'Internet');
                    loaded = true;
                }
            }
        } catch {
            // fallback to local
        }
    }

    if (!loaded && localUrl) {
        try {
            await tryLoadImage(localUrl);
            setUIState(localUrl, 'Local');
            loaded = true;
        } catch {
            // fallthrough
        }
    }

    if (!loaded) {
        showError('No hay imágenes disponibles');
    }
}

function renderPredefinedMovementLists() {
    renderMovementTableRows(
        page.diferenciasTableBody,
        predefinedMovementLists.diferencias,
        'No hay productos con diferencias.'
    );
    renderMovementTableRows(
        page.faltantesTableBody,
        predefinedMovementLists.faltantes,
        'No hay faltantes para mostrar.'
    );
    renderMovementTableRows(
        page.sobrantesTableBody,
        predefinedMovementLists.sobrantes,
        'No hay sobrantes para mostrar.'
    );
    updateActiveListSummary();
    lucide.createIcons();
}

async function loadPredefinedMovementLists() {
    if (!currentUser || !currentUser.locale_id) return;

    try {
        const response = await fetch(`/api/assignment/latest/${currentUser.locale_id}`);
        if (!response.ok) {
            throw new Error(`Error cargando asignacion: ${response.status}`);
        }

        const assignmentData = await response.json();
        const products = Array.isArray(assignmentData.productos) ? assignmentData.productos : [];
        const withDifferences = products.filter(item => toNumber(item.diferencia) !== 0);

        predefinedMovementLists.diferencias = withDifferences.map(mapAssignmentProductToMovementRow);
        predefinedMovementLists.faltantes = withDifferences
            .filter(item => toNumber(item.diferencia) < 0)
            .map(mapAssignmentProductToMovementRow);
        predefinedMovementLists.sobrantes = withDifferences
            .filter(item => toNumber(item.diferencia) > 0)
            .map(mapAssignmentProductToMovementRow);

        renderPredefinedMovementLists();
    } catch (error) {
        console.error('Error loading predefined movement lists:', error);
        predefinedMovementLists = { diferencias: [], faltantes: [], sobrantes: [] };
        renderPredefinedMovementLists();
    }
}

async function fetchAndDisplayLastUpdate(localId) {
    const lastUpdateDisplay = document.getElementById('last-update-display');

    if (!localId) {
        if (lastUpdateDisplay) lastUpdateDisplay.textContent = 'Última actualización: No hay local asignado.';
        return;
    }

    try {
        const response = await fetch(`/api/inventory/last-update/${localId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.lastUpdate) {
                const lastUpdateDate = new Date(data.lastUpdate);
                const now = new Date();

                // Format date to "dd/mm/yyyy hh:mm" using a specific locale and 24-hour format
                const formattedDateTime = lastUpdateDate.toLocaleString('es-CL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hourCycle: 'h23' // Use 24-hour format
                });

                if (lastUpdateDisplay) lastUpdateDisplay.textContent = `Última actualización: ${formattedDateTime}`;

            } else {
                if (lastUpdateDisplay) lastUpdateDisplay.textContent = 'Última actualización: No disponible.';
            }
        } else if (response.status === 404) {
            if (lastUpdateDisplay) lastUpdateDisplay.textContent = 'Última actualización: No se ha procesado el inventario.';
        } else {
            console.error('Error fetching last update:', await response.text());
            if (lastUpdateDisplay) lastUpdateDisplay.textContent = 'Última actualización: Error.';
        }
    } catch (error) {
        console.error('Network error fetching last update:', error);
        if (lastUpdateDisplay) lastUpdateDisplay.textContent = 'Última actualización: Error de conexión.';
    }
}

function getTableBodyForListId(listId) {
    if (listId === 'transito') return page.transitListTableBody;
    if (listId === 'otros') return page.otrosTableBody;
    return document.getElementById(`table-body-${listId}`);
}

function addCustomListItem(sourceListId, itemIndex, customListId) {
    const sourceItems = getListItemsById(sourceListId);
    const itemToAdd = sourceItems[itemIndex];
    if (!itemToAdd) {
        console.error('Item not found in source list:', sourceListId, itemIndex);
        return;
    }

    const targetListId = customListId;
    const targetItems = getListItemsById(targetListId);
    if (!Array.isArray(targetItems)) {
        console.error('Target list not found:', targetListId);
        return;
    }

    // Check if item already exists in the target list to prevent duplicates
    if (!targetItems.some(existingItem => existingItem.codigo === itemToAdd.codigo)) {
        const pricedItem = enrichTransitItemPricing(itemToAdd);
        const newItem = {
            codigo: pricedItem.codigo,
            nombre: pricedItem.nombre,
            cantidad: pricedItem.cantidad,
            precioUnitario: pricedItem.precioUnitario,
            subtotal: pricedItem.subtotal,
            motivo: pricedItem.motivo,
            fechaAdicion: new Date().toISOString() // Date when added to custom list
        };
        targetItems.push(newItem);
        setListItemsById(targetListId, targetItems);
        persistListById(targetListId);
        renderListById(targetListId);
        showUndoToast(`Producto ${itemToAdd.nombre} añadido a "${getListDisplayName(targetListId)}".`, () => {
            const currentItems = getListItemsById(targetListId);
            const removeIndex = currentItems.findIndex(x => normalizeProductCode(x.codigo) === normalizeProductCode(newItem.codigo));
            if (removeIndex >= 0) {
                currentItems.splice(removeIndex, 1);
                setListItemsById(targetListId, currentItems);
                persistListById(targetListId);
                renderListById(targetListId);
            }
        });
    } else {
        showToast(`El producto ${itemToAdd.nombre} ya existe en "${getListDisplayName(targetListId)}".`, 'info');
    }
}


function renderListById(listId) {
    const tableBody = getTableBodyForListId(listId);
    if (!tableBody) return;

    tableBody.innerHTML = '';
    const listItems = getListItemsById(listId);
    let totalQuantity = 0;
    let totalPrice = 0;

    listItems.forEach((item, index) => {
        const pricedItem = enrichTransitItemPricing(item);
        listItems[index] = pricedItem;
        totalQuantity += toNumber(pricedItem.cantidad);
        totalPrice += toNumber(pricedItem.subtotal);

        const motivoOptions = transitReasons.map(reason =>
            `<option value="${reason}" ${item.motivo === reason ? 'selected' : ''}>${reason}</option>`
        ).join('');

        const customListOptions = customLists.map(list => `<option value="${list.id}">${list.name}</option>`).join('');

        // 1. Main Row (Essential: Checkbox, Código, Nombre, Cantidad, Motivo, Eliminar, Expand)
        const mainRow = document.createElement('tr');
        mainRow.classList.add('transit-item-row');
        mainRow.dataset.index = index;
        mainRow.innerHTML = `
            <td><input type="checkbox" class="transit-select-checkbox" data-index="${index}" ${selectedTransitItems.includes(index) ? 'checked' : ''}></td>
            <td>
                <button class="product-code-link movement-code-link" data-list-id="${listId}" data-index="${index}">
                    ${pricedItem.codigo}
                </button>
            </td>
            <td>${pricedItem.nombre}</td>
            <td class="text-center">${pricedItem.cantidad}</td>
            <td>
                <select class="form-control transit-motivo-selector transit-motivo-main" data-index="${index}">
                    ${motivoOptions}
                </select>
            </td>
            <td class="text-center">
                <button class="btn btn-sm btn-danger remove-item-btn" data-index="${index}" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
            <td class="text-center">
                <i data-lucide="chevron-down" class="expand-icon"></i>
            </td>
        `;

        // 2. Details Row (Secondary: P. Unitario, Subtotal, Custom List, Fecha, Editar)
        const detailsRow = document.createElement('tr');
        detailsRow.classList.add('transit-details-row');
        detailsRow.style.display = 'none';
        detailsRow.dataset.index = index;
        detailsRow.innerHTML = `
            <td colspan="7">
                <div class="transit-details-content horizontal-details">
                    <div class="detail-group">
                        <span class="detail-label">P. Unitario</span>
                    <span class="detail-value">$${toNumber(pricedItem.precioUnitario).toFixed(0)}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Subtotal</span>
                        <span class="detail-value font-medium">$${toNumber(pricedItem.subtotal).toFixed(0)}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Añadir a Lista</span>
                        <div class="custom-list-controls">
                            <select class="form-control custom-list-selector" data-index="${index}">
                                <option value="">Seleccionar...</option>
                                ${getDestinationListOptionsHtml(listId)}
                            </select>
                            <button class="btn btn-sm btn-primary add-to-custom-list-btn" data-index="${index}">
                                <i data-lucide="plus"></i>
                            </button>
                        </div>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Última Edición</span>
                        <span class="detail-value">${item.fechaEdicion ? new Date(item.fechaEdicion).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Acciones</span>
                        <div class="item-actions">
                            <button class="btn btn-sm btn-info edit-item-btn" data-index="${index}">
                                <i data-lucide="edit-3"></i> 
                            </button>
                        </div>
                    </div>
                </div>
            </td>
        `;

        mainRow.dataset.listId = listId;
        detailsRow.dataset.listId = listId;
        tableBody.appendChild(mainRow);
        tableBody.appendChild(detailsRow);

        mainRow.addEventListener('click', (event) => {
            if (event.target.closest('button') || event.target.closest('select') || event.target.closest('input')) return;
            const isExpanded = mainRow.classList.toggle('expanded');
            detailsRow.style.display = isExpanded ? 'table-row' : 'none';
        });
    });

    if (getActivePredefinedTabId() === listId) updateActiveListSummary();

    lucide.createIcons();
    updateBulkActionsButtonVisibility(); // Update button visibility after rendering
}

function getSummaryMetricsForList(listId) {
    const isPredefined = ['diferencias', 'faltantes', 'sobrantes'].includes(listId);
    if (isPredefined) {
        const rows = Array.isArray(predefinedMovementLists[listId]) ? predefinedMovementLists[listId] : [];
        const totals = rows.reduce((acc, row) => {
            acc.codes += 1;
            acc.quantity += Math.abs(toNumber(row.unidades ?? row.diferencia));
            acc.price += Math.abs(toNumber(row.subtotal));
            return acc;
        }, { codes: 0, quantity: 0, price: 0 });
        return totals;
    }

    const items = Array.isArray(getListItemsById(listId)) ? getListItemsById(listId) : [];
    return items.reduce((acc, item) => {
        const pricedItem = enrichTransitItemPricing(item);
        acc.codes += 1;
        acc.quantity += Math.abs(toNumber(pricedItem.cantidad));
        acc.price += Math.abs(toNumber(pricedItem.subtotal));
        return acc;
    }, { codes: 0, quantity: 0, price: 0 });
}

function updateActiveListSummary() {
    const activeListId = getActivePredefinedTabId() || 'transito';
    const metrics = getSummaryMetricsForList(activeListId);

    if (page.transitTotalCodes) page.transitTotalCodes.textContent = metrics.codes;
    if (page.transitTotalQuantity) page.transitTotalQuantity.textContent = metrics.quantity;
    if (page.transitTotalPrice) page.transitTotalPrice.textContent = formatSummaryMoney(metrics.price);
    if (page.transitCurrentDate) {
        page.transitCurrentDate.textContent = new Date().toLocaleDateString('es-CL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }
}

function renderActiveMovementList() {
    const active = getActivePredefinedTabId() || 'transito';
    renderListById(active);
}

function persistListById(listId) {
    if (listId === 'transito') {
        saveTransitList();
        return;
    }
    if (listId === 'otros') {
        saveOtherList();
        return;
    }
    saveCustomLists();
}

function removeItemFromList(listId, index) {
    const listItems = getListItemsById(listId);
    const removedItem = listItems[index];
    if (!removedItem) return;
    listItems.splice(index, 1);
    setListItemsById(listId, listItems);
    renderListById(listId);
    persistListById(listId);

    const removedName = removedItem.nombre || removedItem.codigo || 'Producto';
    showUndoToast(`Producto ${removedName} eliminado de "${getListDisplayName(listId)}".`, () => {
        const currentItems = getListItemsById(listId);
        const insertAt = Math.max(0, Math.min(index, currentItems.length));
        currentItems.splice(insertAt, 0, removedItem);
        setListItemsById(listId, currentItems);
        persistListById(listId);
        renderListById(listId);
    });
}

async function saveTransitList() {
    if (!currentUser || !currentUser.locale_id) {
        console.error('No se puede guardar la lista de tránsito: usuario o locale_id no definidos.');
        return;
    }
    try {
        const response = await fetch(`/api/transit-list/save/${currentUser.locale_id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transitList)
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        console.log('Lista de tránsito guardada:', result);
    } catch (error) {
        console.error('Error al guardar la lista de tránsito:', error);
        showToast('Hubo un error al guardar la lista de tránsito.', 'error');
    }
}

async function loadLatestTransitList() {
    if (!currentUser || !currentUser.locale_id) {
        console.warn('No se puede cargar la lista de tránsito: usuario o locale_id no definidos.');
        return;
    }
    try {
        const response = await fetch(`/api/transit-list/latest/${currentUser.locale_id}`);
        if (response.ok) {
            const data = await response.json();
            transitList = Array.isArray(data) ? data.map(enrichTransitItemPricing) : [];
            renderListById('transito');
            console.log('Última lista de tránsito cargada:', transitList);
        } else if (response.status === 404) {
            console.log('No hay listas de tránsito guardadas para este local.');
            transitList = []; // Ensure list is empty if no saved list
            renderListById('transito');
        } else {
            const raw = await response.text();
            if (raw && raw.toLowerCase().includes('no transit list')) {
                transitList = [];
                renderListById('transito');
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error al cargar la última lista de tránsito:', error);
        transitList = [];
        renderListById('transito');
    }
}

// --- MODAL FUNCTIONS ---
function openModal() {
    console.log('Opening manual product modal.'); // NEW LOG
    page.manualProductModal.style.display = 'flex'; // Use flex to center

    // Populate motive options
    page.modalMotivo.innerHTML = transitReasons.map(reason => `<option value="${reason}">${reason}</option>`).join('');

    // Reset for new item if not editing
    if (editingIndex === -1) {
        page.manualProductModal.querySelector('h2').textContent = `Agregar Producto a ${getActiveTabDisplayName()}`;
        page.modalAddBtn.textContent = 'Agregar';
        page.modalProductCode.readOnly = false;
        page.modalProductName.readOnly = false;
        page.modalProductCode.style.backgroundColor = '';
        page.modalProductName.style.backgroundColor = '';
        selectedProduct = null; // Clear selected product for new entry
        page.modalMotivo.value = transitReasons[0]; // Set default motive for new entry
    }
}

function closeModal() {
    page.manualProductModal.style.display = 'none';
    // Clear form fields when closing
    page.modalProductCode.value = '';
    page.modalProductName.value = '';
    page.modalUnits.value = '1';
    page.modalUnitPrice.value = '';
    page.modalSubtotal.value = '';
    page.productSuggestions.innerHTML = ''; // Clear suggestions
    page.productSuggestions.style.display = 'none'; // Hide suggestions
    page.modalMotivo.value = transitReasons[0]; // Reset motive to default
    selectedProduct = null; // Clear selected product
    editingIndex = -1; // Reset editing index
    editingListId = 'transito';
    page.modalProductCode.readOnly = false; // Ensure it's editable next time
    page.modalProductName.readOnly = false;
    page.modalProductCode.style.backgroundColor = '';
    page.modalProductName.style.backgroundColor = '';
}

function editTransitItem(index) {
    editingIndex = index;
    const sourceListId = editingListId || getActivePredefinedTabId() || 'transito';
    const sourceItems = getListItemsById(sourceListId);
    const item = sourceItems[index];
    if (!item) return;

    page.modalProductCode.value = item.codigo;
    page.modalProductName.value = item.nombre;
    page.modalUnits.value = item.cantidad;
    page.modalUnitPrice.value = item.precioUnitario;
    page.modalSubtotal.value = item.subtotal;
    page.modalMotivo.value = item.motivo; // Set motive

    // Make product code read-only during edit
    page.modalProductCode.readOnly = true;
    page.modalProductName.readOnly = true;
    page.modalProductCode.style.backgroundColor = '#e9ecef'; // Light gray background
    page.modalProductName.style.backgroundColor = '#e9ecef';

    const sourceDisplayName = getListDisplayName(sourceListId);
    page.manualProductModal.querySelector('h2').textContent = `Editar Producto en ${sourceDisplayName}`;
    page.modalAddBtn.textContent = 'Guardar Cambios';

    openModal();
}



function displaySuggestions(suggestions, sourceField = "code") {
    activeSuggestionField = sourceField;
    page.productSuggestions.innerHTML = '';
    const sourceInput = sourceField === "name" ? page.modalProductName : page.modalProductCode;
    if (suggestions.length === 0 || sourceInput.value === '') {
        page.productSuggestions.style.display = 'none';
        return;
    }

    const fragment = document.createDocumentFragment();
    suggestions.forEach(product => {
        const div = document.createElement('div');
        div.classList.add('suggestion-item');
        div.textContent = sourceField === "name"
            ? `${product.nombre} (${product.codigo})`
            : `${product.codigo} - ${product.nombre}`;
        div.dataset.productId = product.codigo; // Store product ID for easy retrieval
        fragment.appendChild(div);
    });

    page.productSuggestions.appendChild(fragment);
    page.productSuggestions.style.display = 'block';
}

function selectSuggestion(productId) {
    selectedProduct = allProducts.find(p => p.codigo === productId);
    if (selectedProduct) {
        page.modalProductCode.value = selectedProduct.codigo;
        page.modalProductName.value = selectedProduct.nombre;
        page.modalUnitPrice.value = parsePrice(selectedProduct.precio); // Corrected: use selectedProduct.precio and parse it
        updateSubtotal(); // Call updateSubtotal after product selection
        page.productSuggestions.style.display = 'none';
    }
}

function updateSubtotal() {
    const units = parseFloat(page.modalUnits.value);
    const unitPrice = parseFloat(page.modalUnitPrice.value);
    if (!isNaN(units) && !isNaN(unitPrice) && units >= 0) {
        page.modalSubtotal.value = (units * unitPrice).toFixed(0);
    } else {
        page.modalSubtotal.value = (0).toFixed(2);
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay('Cargando datos del local...');
    // 1. Auth & Header
    currentUser = Auth.checkAuth();
    if (!currentUser) {
        hideLoadingOverlay();
        return;
    }
    setupHeader(currentUser);
    console.log('Current User Locale ID:', currentUser.locale_id); // Debugging line

    try {
        // 2. Initial Setup
        loadTransitReasons();
        loadOtherList();
        await loadCustomLists();
        renderCustomLists();
        lucide.createIcons();

        // Fetch and display last update
        if (currentUser.locale_id) {
            fetchAndDisplayLastUpdate(currentUser.locale_id);
            await fetchProducts(currentUser.locale_id); // Fetch products here
            refreshAllListPricesFromCatalog();
            await loadPredefinedMovementLists(); // Load Diferencias/Faltantes/Sobrantes
            await loadLatestTransitList(); // Load latest transit list
            renderListById('otros');
            customLists.forEach(list => renderListById(list.id));
        } else {
            document.getElementById('last-update-display').textContent = 'Última actualización: No hay local asignado.';
        }

        // 3. Event Listeners
        setupEventListeners();
        
        // Ensure "Agregar Producto Manual" button is disabled by default for non-Transito tabs
        updateManualButtonVisibility();

        // Fetch and display last update when navigating to movements view
        if (currentUser && currentUser.locale_id) {
            fetchAndDisplayLastUpdate(currentUser.locale_id);
        } else {
            document.getElementById('last-update-display').textContent = 'Última actualización: No hay local asignado.';
        }
        lucide.createIcons();
    } finally {
        hideLoadingOverlay();
    }
});

// --- EVENT LISTENERS ---

function setupEventListeners() {
    page.addCustomListBtn.addEventListener('click', () => {
        const listName = prompt('Ingrese el nombre de la nueva lista:');
        if (listName && listName.trim() !== '') {
            addCustomList(listName.trim());
        }
    });

    page.pdfUpload.addEventListener('change', handlePdfUpload);

    if(page.dataUploadInput) {
        page.dataUploadInput.addEventListener('change', handlePdfUpload);
    }

    // Use event delegation for edit/delete buttons on custom lists
    page.customListsContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const editBtn = target.closest('.edit-btn');
        const deleteBtn = target.closest('.delete-btn');
        const moveUpBtn = target.closest('.move-up-btn');
        const moveDownBtn = target.closest('.move-down-btn');

        if (moveUpBtn) {
            moveCustomList(moveUpBtn.dataset.id, 'up');
            return;
        }

        if (moveDownBtn) {
            moveCustomList(moveDownBtn.dataset.id, 'down');
            return;
        }

        if (editBtn) {
            const listId = editBtn.dataset.id;
            const newName = prompt('Ingrese el nuevo nombre para la lista:');
            if (newName && newName.trim() !== '') {
                renameCustomList(listId, newName.trim());
            }
        }

        if (deleteBtn) {
            const listId = deleteBtn.dataset.id;
            const confirmed = await showConfirmDialog('¿Está seguro de que desea eliminar esta lista?');
            if (confirmed) {
                deleteCustomList(listId);
            }
        }
    });

    // Event listener for predefined tabs
    const predefinedListsContainer = document.getElementById('predefined-lists');
    if (predefinedListsContainer) {
        predefinedListsContainer.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.tab-item');
            if (clickedTab) {
                // Remove active class from all tabs
                predefinedListsContainer.querySelectorAll('.tab-item').forEach(tab => {
                    tab.classList.remove('active');
                });
                // Add active class to the clicked tab
                clickedTab.classList.add('active');

                // Show/hide tab panes based on active tab
                const tabId = clickedTab.dataset.listId; // e.g., 'diferencias'
                document.querySelectorAll('#predefined-list-content .tab-pane').forEach(pane => {
                    if (pane.id === `${tabId}-tab-pane`) {
                        pane.style.display = 'block';
                    } else {
                        pane.style.display = 'none';
                    }
                });

                // Enable/disable "Agregar Producto Manual" button
                updateManualButtonVisibility();
                updateActiveListSummary();
                selectedTransitItems = [];
                updateBulkActionsButtonVisibility();
                if (!['diferencias', 'faltantes', 'sobrantes'].includes(tabId)) {
                    renderListById(tabId);
                }

                console.log('Clicked predefined list:', tabId);
            }
        });
    }

    // Event listener for "Agregar Producto Manualmente" button
    if (page.addManualProductBtn) {
        page.addManualProductBtn.addEventListener('click', () => {
            console.log('Manual Product Button clicked.'); // NEW LOG
            openModal();
        });
    }

    if (page.configureMotivesBtn) {
        page.configureMotivesBtn.addEventListener('click', openMotivesConfigModal);
    }

    if (page.motivesConfigClose) {
        page.motivesConfigClose.addEventListener('click', closeMotivesConfigModal);
    }

    if (page.motivesConfigCancel) {
        page.motivesConfigCancel.addEventListener('click', closeMotivesConfigModal);
    }

    if (page.motivesConfigSave) {
        page.motivesConfigSave.addEventListener('click', saveMotivesFromModal);
    }

    if (page.motivesInputList) {
        page.motivesInputList.addEventListener('click', (event) => {
            const deleteBtn = event.target.closest('.motive-config-delete');
            if (!deleteBtn) return;

            const row = deleteBtn.closest('.motive-config-row');
            if (row) row.remove();
            ensureTrailingEmptyMotiveRow();
        });

        page.motivesInputList.addEventListener('input', (event) => {
            const input = event.target.closest('.motive-config-input');
            if (!input) return;
            ensureTrailingEmptyMotiveRow();
        });
    }

    // Autocomplete for Product Code
    if (page.modalProductCode) {
        page.modalProductCode.addEventListener('input', () => {
            selectedProduct = null;
            const filteredProducts = findProductMatches(page.modalProductCode.value);
            displaySuggestions(filteredProducts, "code");
            syncProductByExactInput("code");
        });

        page.modalProductCode.addEventListener('focus', () => {
            const filteredProducts = findProductMatches(page.modalProductCode.value);
            displaySuggestions(filteredProducts, "code");
        });

        page.modalProductCode.addEventListener('blur', () => {
            // Delay hiding to allow click event on suggestions to fire
            setTimeout(() => {
                page.productSuggestions.style.display = 'none';
            }, 200);
        });
    }

    if (page.modalProductName) {
        page.modalProductName.addEventListener('input', () => {
            selectedProduct = null;
            const filteredProducts = findProductMatches(page.modalProductName.value);
            displaySuggestions(filteredProducts, "name");
            syncProductByExactInput("name");
        });

        page.modalProductName.addEventListener('focus', () => {
            const filteredProducts = findProductMatches(page.modalProductName.value);
            displaySuggestions(filteredProducts, "name");
        });

        page.modalProductName.addEventListener('blur', () => {
            setTimeout(() => {
                page.productSuggestions.style.display = 'none';
            }, 200);
        });
    }

    if (page.productSuggestions) {
        page.productSuggestions.addEventListener('click', (event) => {
            const suggestionItem = event.target.closest('.suggestion-item');
            if (suggestionItem && suggestionItem.dataset.productId) {
                selectSuggestion(suggestionItem.dataset.productId);
            }
        });
    }

    // Real-time subtotal calculation
    if (page.modalUnits) {
        page.modalUnits.addEventListener('input', updateSubtotal);
    }

    // Modal close button
    if (page.modalCloseButton) {
        page.modalCloseButton.addEventListener('click', closeModal);
    }

    // Modal cancel button
    if (page.modalCancelBtn) {
        page.modalCancelBtn.addEventListener('click', closeModal);
    }

    // Modal add button
    if (page.modalAddBtn) {
        page.modalAddBtn.addEventListener('click', () => {
            const units = parseFloat(page.modalUnits.value);
            if (isNaN(units) || units <= 0) {
                showToast('Por favor, ingrese una cantidad válida.', 'info');
                return;
            }

            if (editingIndex > -1) {
                // Editing existing item
                const listId = editingListId || getActivePredefinedTabId() || 'transito';
                const listItems = getListItemsById(listId);
                const existingItem = listItems[editingIndex];
                listItems[editingIndex] = {
                    ...existingItem,
                    codigo: page.modalProductCode.value,
                    nombre: page.modalProductName.value,
                    cantidad: units,
                    precioUnitario: parseFloat(page.modalUnitPrice.value),
                    subtotal: parseFloat(page.modalSubtotal.value),
                    motivo: page.modalMotivo.value, // Get motive from modal
                    fechaEdicion: new Date().toISOString()
                };
                setListItemsById(listId, listItems);
                persistListById(listId);
            } else {
                // Adding new item
                if (!selectedProduct) {
                    selectedProduct = resolveSelectedProductFromInputs();
                }
                if (!selectedProduct) {
                    showToast('Por favor, seleccione un producto válido.', 'info');
                    return;
                }
                const item = {
                    codigo: selectedProduct.codigo,
                    nombre: selectedProduct.nombre,
                    cantidad: units,
                    precioUnitario: parseFloat(page.modalUnitPrice.value),
                    subtotal: parseFloat(page.modalSubtotal.value),
                    motivo: page.modalMotivo.value, // Get motive from modal
                    fechaEdicion: new Date().toISOString()
                };
                const activeTabId = getActivePredefinedTabId();
                const destinationListId = activeTabId || 'transito';
                const items = getListItemsById(destinationListId);
                items.push(item);
                setListItemsById(destinationListId, items);
                persistListById(destinationListId);
            }

            renderActiveMovementList();
            closeModal();
        });
    }

    // Event delegation for removing/editing items, checkbox selection, and adding to custom list
    if (page.predefinedListContent) {
        page.predefinedListContent.addEventListener('click', async (event) => {
            const movementCodeBtn = event.target.closest('.movement-code-link');
            if (movementCodeBtn) {
                const listId = movementCodeBtn.dataset.listId;
                const index = parseInt(movementCodeBtn.dataset.index, 10);
                const items = getListItemsById(listId);
                const item = Number.isInteger(index) ? items[index] : null;
                const imageProduct = getImageProductFromMovementItem(item);
                if (imageProduct) {
                    openProductImageModal(imageProduct);
                }
                return;
            }

            const codeBtn = event.target.closest('.predefined-code-link');
            if (codeBtn) {
                const sourceListId = codeBtn.dataset.sourceList;
                const codigo = codeBtn.dataset.code;
                const row = findPredefinedRow(sourceListId, codigo);
                if (row && row.sourceProduct) {
                    openProductImageModal(row.sourceProduct);
                }
                return;
            }

            const predefinedAddBtn = event.target.closest('.predefined-add-btn');
            const predefinedDeleteBtn = event.target.closest('.predefined-delete-btn');
            const predefinedOpenRevisionBtn = event.target.closest('.predefined-open-revision-btn');

            if (predefinedAddBtn) {
                const sourceListId = predefinedAddBtn.dataset.sourceList;
                const codigo = predefinedAddBtn.dataset.code;
                const row = predefinedAddBtn.closest('tr');
                const targetSelector = row ? row.querySelector('.predefined-target-list') : null;
                const targetListId = targetSelector ? targetSelector.value : '';
                addPredefinedRowToTargetList(sourceListId, codigo, targetListId);
                return;
            }

            if (predefinedDeleteBtn) {
                const codigo = predefinedDeleteBtn.dataset.code;
                const confirmed = await showConfirmDialog(`¿Eliminar diferencia para ${codigo}?`);
                if (confirmed) {
                    resolvePredefinedRowDifference(codigo);
                }
                return;
            }

            if (predefinedOpenRevisionBtn) {
                const codigo = predefinedOpenRevisionBtn.dataset.code;
                openRevisionForCode(codigo);
                return;
            }

            const removeBtn = event.target.closest('.remove-item-btn');
            const editBtn = event.target.closest('.edit-item-btn');
            const addToCustomListBtn = event.target.closest('.add-to-custom-list-btn');
            const row = event.target.closest('tr');
            const listId = row ? row.dataset.listId : (getActivePredefinedTabId() || 'transito');

            if (removeBtn) {
                const index = parseInt(removeBtn.dataset.index);
                if (!isNaN(index)) {
                    removeItemFromList(listId, index);
                }
            } else if (editBtn) {
                const index = parseInt(editBtn.dataset.index);
                if (!isNaN(index)) {
                    editingListId = listId;
                    editTransitItem(index);
                }
            } else if (addToCustomListBtn) {
                const index = parseInt(addToCustomListBtn.dataset.index);
                const parentRow = event.target.closest('.transit-details-row');
                const customListSelector = parentRow ? parentRow.querySelector('.custom-list-selector') : null;
                if (customListSelector && customListSelector.value) {
                    addCustomListItem(listId, index, customListSelector.value);
                } else {
                    showToast('Por favor, seleccione una lista personalizada.', 'info');
                }
            }
            // Removed the row toggling logic
        });

        // Event listener for Motivo selector changes and checkbox
        page.predefinedListContent.addEventListener('change', (event) => {
            const motivoSelector = event.target.closest('.transit-motivo-selector');
            const checkbox = event.target.closest('.transit-select-checkbox');
            const row = event.target.closest('tr');
            const listId = row ? row.dataset.listId : (getActivePredefinedTabId() || 'transito');

            if (motivoSelector) {
                const index = parseInt(motivoSelector.dataset.index);
                const newMotive = motivoSelector.value;
                const listItems = getListItemsById(listId);
                if (!isNaN(index) && listItems[index]) {
                    listItems[index].motivo = newMotive;
                    listItems[index].fechaEdicion = new Date().toISOString();
                    setListItemsById(listId, listItems);
                    persistListById(listId);
                }
            } else if (checkbox) {
                const index = parseInt(checkbox.dataset.index);
                if (checkbox.checked) {
                    if (!selectedTransitItems.includes(index)) { // Prevent adding duplicates
                        selectedTransitItems.push(index);
                    }
                } else {
                    selectedTransitItems = selectedTransitItems.filter(itemIndex => itemIndex !== index);
                }
                updateBulkActionsButtonVisibility(); // Update button visibility
            }
        });
    }

    // New: Bulk Actions Button Listener
    if (page.bulkActionsBtn) {
        page.bulkActionsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation(); // Prevent document click from immediately closing
            page.bulkActionsDropdown.style.display = page.bulkActionsDropdown.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', (event) => {
            if (!page.bulkActionsBtn.contains(event.target) && !page.bulkActionsDropdown.contains(event.target)) {
                page.bulkActionsDropdown.style.display = 'none';
            }
        });
    }

    // New: Bulk Delete Button Listener
    if (page.bulkDeleteBtn) {
        page.bulkDeleteBtn.addEventListener('click', (event) => {
            event.preventDefault();
            if (selectedTransitItems.length === 0) {
                showToast('No hay ítems seleccionados para eliminar.', 'info');
                return;
            }
            showConfirmDialog(`¿Está seguro de que desea eliminar ${selectedTransitItems.length} ítems seleccionados?`).then((confirmed) => {
                if (!confirmed) return;
                const activeListId = getActivePredefinedTabId() || 'transito';
                const listItems = getListItemsById(activeListId);
                // Sort in reverse order to avoid index issues when removing
                selectedTransitItems.sort((a, b) => b - a).forEach(index => {
                    listItems.splice(index, 1);
                });
                setListItemsById(activeListId, listItems);
                persistListById(activeListId);
                selectedTransitItems = []; // Clear selections
                renderListById(activeListId);
                page.bulkActionsDropdown.style.display = 'none';
            });
        });
    }

    // New: Bulk Move Button Listener (Placeholder for now)
    if (page.bulkMoveBtn) {
        page.bulkMoveBtn.addEventListener('click', (event) => {
            event.preventDefault();
            if (selectedTransitItems.length === 0) {
                showToast('No hay ítems seleccionados para mover.', 'info');
                return;
            }
            openMoveToListModal();
            page.bulkActionsDropdown.style.display = 'none'; // Hide bulk actions dropdown
        });
    }

    // New: Move to List Modal Close Button
    if (page.modalMoveCloseButton) {
        page.modalMoveCloseButton.addEventListener('click', closeMoveToListModal);
    }

    // New: Move to List Modal Cancel Button
    if (page.modalMoveCancelBtn) {
        page.modalMoveCancelBtn.addEventListener('click', closeMoveToListModal);
    }

    // New: Move to List Modal Confirm Button
    if (page.modalMoveConfirmBtn) {
        page.modalMoveConfirmBtn.addEventListener('click', () => {
            const targetListId = page.modalTargetList.value;
            if (!targetListId) {
                showToast('Por favor, seleccione una lista de destino.', 'info');
                return;
            }

            if (selectedTransitItems.length === 0) {
                showToast('No hay ítems seleccionados para mover.', 'info');
                closeMoveToListModal();
                return;
            }

            // Collect items to move
            const sourceListId = getActivePredefinedTabId() || 'transito';
            const sourceItems = getListItemsById(sourceListId);
            const itemsToMove = selectedTransitItems.sort((a, b) => b - a).map(index => sourceItems[index]);

            // Add items to the target list (simplified for now, full implementation would save to specific files)
            let targetList = customLists.find(list => list.id === targetListId);
            const isCustomList = !!targetList;

            if (!targetList && !['diferencias', 'faltantes', 'sobrantes', 'otros'].includes(targetListId)) {
                showToast('Lista de destino no válida.', 'error');
                return;
            }
            
            if (isCustomList) {
                if (!targetList.items) {
                    targetList.items = [];
                }
                itemsToMove.forEach(item => {
                    // Check for duplicates before adding
                    if (!targetList.items.some(existingItem => existingItem.codigo === item.codigo)) {
                        targetList.items.push({ ...item, fechaAdicion: new Date().toISOString() });
                    }
                });
                saveCustomLists();
                showToast(`Ítems movidos a la lista personalizada "${targetList.name}".`, 'success');
            } else {
                // For predefined lists, this would typically involve server-side logic
                // For this example, we'll just log and assume a successful "move" for predefined lists
                console.log(`Simulando movimiento a lista predefinida: ${targetListId}`, itemsToMove);
                showToast(`Ítems movidos a la lista predefinida "${targetListId}".`, 'success');
            }

            // Remove moved items from transitList
            const remainingItems = getListItemsById(sourceListId);
            selectedTransitItems.sort((a, b) => b - a).forEach(index => {
                remainingItems.splice(index, 1);
            });
            setListItemsById(sourceListId, remainingItems);
            persistListById(sourceListId);
            selectedTransitItems = []; // Clear selections

            renderListById(sourceListId);
            closeMoveToListModal();
        });
    }

    // Close modal if click outside content
    window.addEventListener('click', (event) => {
        if (event.target === page.manualProductModal) {
            closeModal();
        }
        if (event.target === page.moveToListModal) {
            closeMoveToListModal();
        }
        if (event.target === page.motivesConfigModal) {
            closeMotivesConfigModal();
        }
        if (event.target === page.imageModal) {
            page.imageModal.style.display = 'none';
        }
    });

    if (page.imageModal) {
        const closeImageBtn = page.imageModal.querySelector('.close-button');
        if (closeImageBtn) {
            closeImageBtn.addEventListener('click', () => {
                page.imageModal.style.display = 'none';
            });
        }
    }
}

// Function to open the "Move to List" modal
function openMoveToListModal() {
    page.modalTargetList.innerHTML = ''; // Clear previous options

    // Add predefined list options (excluding 'transito')
    const predefinedListIds = ['diferencias', 'faltantes', 'sobrantes', 'otros'];
    predefinedListIds.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id.charAt(0).toUpperCase() + id.slice(1); // Capitalize first letter
        page.modalTargetList.appendChild(option);
    });

    // Add custom list options
    customLists.forEach(list => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = `Custom: ${list.name}`;
        page.modalTargetList.appendChild(option);
    });

    page.moveToListModal.style.display = 'flex';
}

// Function to close the "Move to List" modal
function closeMoveToListModal() {
    page.moveToListModal.style.display = 'none';
    page.modalTargetList.innerHTML = ''; // Clear options on close
}

// Function to update the visibility of the bulk actions button
function updateBulkActionsButtonVisibility() {
    if (page.bulkActionsBtn) {
        if (selectedTransitItems.length > 0) {
            page.bulkActionsBtn.style.display = 'flex'; // Or 'block', depending on desired layout
        } else {
            page.bulkActionsBtn.style.display = 'none';
        }
        page.bulkActionsDropdown.style.display = 'none'; // Ensure dropdown is hidden when button visibility changes
    }
}

// --- PDF PROCESSING ---

/**
 * Main handler for PDF file uploads.
 * It orchestrates the text extraction, parsing, and saving in the background.
 */
async function handlePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const buttonElement = page.pdfUploadLabel;
    const originalButtonHTML = buttonElement.innerHTML;
    
    // UI Change: Show processing state
    buttonElement.innerHTML = `<i data-lucide="loader" class="animate-spin"></i><span>Procesando...</span>`;
    lucide.createIcons();
    buttonElement.style.pointerEvents = 'none';

    try {
        // 1. Extract text from PDF
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const lines = {};
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5] / 5) * 5;
                if (!lines[y]) lines[y] = [];
                lines[y].push({ text: item.str, x: item.transform[4] });
            });
            fullText += Object.keys(lines).sort((a, b) => b - a).map(y => lines[y].sort((a, b) => a.x - b.x).map(item => item.text).join(' ')).join('\n') + '\n';
        }

        // 2. Validate PDF content
        const expectedPhrase = "LISTA DE PRODUCTOS";
        if (!fullText.substring(0, 150).toUpperCase().includes(expectedPhrase)) {
            throw new Error(`Archivo incorrecto. Use "${expectedPhrase}".`);
        }

        // 3. Parse the data (logic adapted from PrePro.js)
        const { products, reportDate } = parseProductListData(fullText);
        if (products.length === 0) {
            throw new Error("No se extrajeron datos. Verifique el formato.");
        }

        // 4. Save the data (logic adapted from PrePro.js)
        await saveProductListToServer(products, reportDate);

        // 5. Update UI on Success
        buttonElement.innerHTML = `<i data-lucide="check"></i><span>Realizado con éxito</span>`;
        lucide.createIcons();
        await fetchProducts(currentUser.locale_id);
        await loadPredefinedMovementLists();
        refreshAllListPricesFromCatalog();
        renderListById('transito');
        renderListById('otros');
        customLists.forEach(list => renderListById(list.id));
        saveCustomLists();
        await fetchAndDisplayLastUpdate(currentUser.locale_id); // Refresh last update date

    } catch (error) {
        console.error('Error in handlePdfUpload:', error);
        buttonElement.innerHTML = `<i data-lucide="x-circle" style="color: var(--danger-color);"></i><span>${error.message.substring(0, 30)}</span>`;
        lucide.createIcons();
    } finally {
        // Restore the button after a delay
        setTimeout(() => {
            buttonElement.innerHTML = originalButtonHTML;
            buttonElement.style.pointerEvents = 'auto';
            lucide.createIcons();
        }, 5000);
    }
}

/**
 * Parses the raw text from the "Lista de Productos" PDF.
 * Logic is adapted from the working implementation in PrePro.js.
 * @param {string} data - The full text content of the PDF.
 * @returns {{products: Array, reportDate: string}}
 */
function parseProductListData(data) {
    let reportDate = "";
    const dateMatch = data.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) reportDate = dateMatch[1];

    const products = [];
    const lines = data.split('\n');
    const productLineRegex = /^([A-Z0-9]+)\s+(.+)\s+(\$\s?[\d.,]+)$/;

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine.includes('$')) return;

        const match = trimmedLine.match(productLineRegex);
        if (match) {
            const [_, codigo, middle, precio] = match;
            let nombre = middle;
            let familia = "GENERAL";
            
            const parts = middle.split(/\s{2,}/);
            if (parts.length >= 2) {
                nombre = parts.slice(0, -1).join('  ');
                familia = parts[parts.length - 1];
            } else {
                const lastSpace = middle.lastIndexOf(' ');
                if (lastSpace !== -1) {
                    nombre = middle.substring(0, lastSpace);
                    familia = middle.substring(lastSpace + 1);
                }
            }

            if (nombre.toLowerCase().includes('nombre') || familia.toLowerCase().includes('familia') || codigo.length < 1) return;

            products.push({
                codigo: codigo.trim(),
                nombre: nombre.trim(),
                familia: familia.trim(),
                precio: parsePrice(precio.trim())
            });
        }
    });

    return { products, reportDate };
}

/**
 * Sends the parsed product list to the server.
 * Logic is adapted from the working implementation in PrePro.js.
 * @param {Array} products - The array of parsed product objects.
 * @param {string} reportDate - The date extracted from the report.
 */
async function saveProductListToServer(products, reportDate) {
    const user = Auth.getUser();
    if (!user || !user.locale_id) {
        throw new Error('No se pudo identificar el local del usuario.');
    }

    const response = await fetch('/api/inventory/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            local: user.locale_id,
            products: products,
            date: reportDate
        })
    });

    if (!response.ok) {
        const raw = await response.text();
        let message = 'Error del servidor al guardar.';
        try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.error) message = parsed.error;
        } catch {
            if (raw) message = raw.substring(0, 120);
        }
        throw new Error(message);
    }
    
    console.log('Product list saved successfully via background process.');
}


// --- CUSTOM LIST LOGIC ---

async function loadCustomLists() {
    customLists = JSON.parse(localStorage.getItem('inventory_custom_lists')) || [];

    if (currentUser?.locale_id) {
        try {
            const response = await fetch(`/api/movements/custom-lists/${currentUser.locale_id}`);
            if (response.ok) {
                const serverLists = await response.json();
                if (Array.isArray(serverLists)) {
                    customLists = serverLists;
                }
            }
        } catch (error) {
            console.error('Error loading custom lists from server:', error);
        }
    }

    refreshAllListPricesFromCatalog();
}

function saveCustomLists() {
    localStorage.setItem('inventory_custom_lists', JSON.stringify(customLists));

    if (currentUser?.locale_id) {
        fetch(`/api/movements/custom-lists/${currentUser.locale_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customLists)
        }).catch((error) => {
            console.error('Error saving custom lists to server:', error);
        });
    }
}

function renderCustomTabsAndPanes() {
    const tabsContainer = document.getElementById('predefined-lists');
    const contentContainer = document.getElementById('predefined-list-content');
    if (!tabsContainer || !contentContainer) return;

    tabsContainer.querySelectorAll('.tab-item[data-custom-list="true"]').forEach(node => node.remove());
    contentContainer.querySelectorAll('.tab-pane[data-custom-list="true"]').forEach(node => node.remove());

    customLists.forEach((list) => {
        const tab = document.createElement('li');
        tab.className = 'tab-item';
        tab.dataset.listId = list.id;
        tab.dataset.customList = 'true';
        tab.innerHTML = `<a href="#">${list.name}</a>`;
        tabsContainer.appendChild(tab);

        const pane = document.createElement('div');
        pane.id = `${list.id}-tab-pane`;
        pane.className = 'tab-pane';
        pane.style.display = 'none';
        pane.dataset.customList = 'true';
        pane.innerHTML = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Código</th>
                            <th>Nombre</th>
                            <th>Cant.</th>
                            <th>Motivo</th>
                            <th>Eliminar</th>
                            <th>Ver</th>
                        </tr>
                    </thead>
                    <tbody id="table-body-${list.id}"></tbody>
                </table>
            </div>
        `;
        contentContainer.appendChild(pane);
    });
}

function renderCustomLists() {
    page.customListsContainer.innerHTML = ''; // Clear existing
    renderCustomTabsAndPanes();
    if (customLists.length === 0) {
        page.customListsContainer.innerHTML = '<li class="list-group-item">No hay listas personalizadas.</li>';
        updateManualButtonVisibility();
        return;
    }

    customLists.forEach((list, index) => {
        const canMoveUp = index > 0;
        const canMoveDown = index < customLists.length - 1;
        const li = document.createElement('li');
        li.className = 'list-group-item custom-item';
        li.dataset.listId = list.id;
        li.innerHTML = `
            <a href="#">${list.name}</a>
            <div class="list-item-actions">
                <button class="btn btn-sm btn-icon move-up-btn" data-id="${list.id}" ${canMoveUp ? '' : 'disabled'} title="Subir">
                    <i data-lucide="arrow-up"></i>
                </button>
                <button class="btn btn-sm btn-icon move-down-btn" data-id="${list.id}" ${canMoveDown ? '' : 'disabled'} title="Bajar">
                    <i data-lucide="arrow-down"></i>
                </button>
                <button class="btn btn-sm btn-icon edit-btn" data-id="${list.id}"><i data-lucide="edit-3"></i></button>
                <button class="btn btn-sm btn-icon btn-danger delete-btn" data-id="${list.id}"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        page.customListsContainer.appendChild(li);
    });
    lucide.createIcons();
    updateManualButtonVisibility();
}

function addCustomList(name) {
    const newList = {
        id: `custom_${Date.now()}`,
        name: name,
        items: []
    };
    customLists.push(newList);
    saveCustomLists();
    renderCustomLists();
    renderPredefinedMovementLists();
}

function renameCustomList(id, newName) {
    const list = customLists.find(l => l.id === id);
    if (list) {
        list.name = newName;
        saveCustomLists();
        renderCustomLists();
        renderPredefinedMovementLists();
    }
}

function deleteCustomList(id) {
    customLists = customLists.filter(l => l.id !== id);
    saveCustomLists();
    renderCustomLists();
    renderPredefinedMovementLists();
}

function moveCustomList(id, direction) {
    const index = customLists.findIndex(l => l.id === id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customLists.length) return;

    const [item] = customLists.splice(index, 1);
    customLists.splice(targetIndex, 0, item);
    saveCustomLists();
    renderCustomLists();
    renderPredefinedMovementLists();
}


// --- HEADER SETUP ---

/**
 * Populates the header with the logged-in user's information.
 * @param {object} user - The user object from Auth.
 */
function setupHeader(user) {
    const userSigla = document.getElementById('user-sigla');
    const userName = document.getElementById('user-name-text');
    const userCargo = document.getElementById('user-cargo-text');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        // Create initials from user's names
        const initials = (user.names || user.name).split(' ').map(n => n[0]).join('') + (user.last_names ? user.last_names.split(' ').map(n => n[0]).join('') : '');
        userSigla.textContent = initials.toUpperCase().substring(0, 2);

        // Set the full name and role
        userName.textContent = `${user.names || user.name} ${user.last_names || ''}`;
        userCargo.textContent = user.cargo;
    }

    // Attach logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });
    }
}
