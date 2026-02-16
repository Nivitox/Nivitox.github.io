import { Auth } from '/core/js/auth.js';
import { updateButtonState, processPdfFile } from './inventario-pdf-processor.js';
import { showToast, showConfirmDialog, showLoadingOverlay, hideLoadingOverlay } from '/core/js/ui-feedback.js';

let page = {};

// --- STATE ---
let currentUser = null;
let currentView = 'main'; // 'main' or 'movements'
let customLists = [];
let allProducts = []; // To store all products for autocomplete
let editingIndex = -1; // -1 for adding new, >=0 for editing existing
const transitReasons = [
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

let transitList = []; // To store products added to the transit list
let selectedTransitItems = []; // To store indices of selected items

async function fetchWithRetry(url, options = {}, retries = 1, delayMs = 450) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await fetch(url, options);
        } catch (error) {
            if (error?.name === 'AbortError') throw error;
            lastError = error;
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    throw lastError;
}

// --- Helper Functions ---
async function fetchProducts(localId) {
    if (!localId) {
        console.error('No locale ID provided for fetching products.');
        return;
    }
    try {
        const response = await fetchWithRetry(`/api/products/list/${localId}`, {}, 1, 500);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allProducts = (await response.json()).productos || [];
        console.log(`Fetched ${allProducts.length} products for locale ${localId}.`);
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.warn(`Error fetching products for locale ${localId}:`, error);
        }
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

// Function to parse raw text from PDF into preliminary product items (from invefull.js)
const codeBlocklist = ['sucursal', 'reporte', 'farmacias', 'código', 'información', 'pagina']; // Moved from invefull.js

function parseRawPdfText(data) {
    const lines = data.split('\n');
    const items = [];
    const itemRegex = /^(\S+)\s+(.*?)\s+(\d+)$/;
    

    for (const line of lines) {
        const trimmedLine = line.trim();
        const match = trimmedLine.match(itemRegex);

        if (match) {
            let [_, code, name, quantity] = match;
            
            // Check if the extracted code is in the blocklist
            if (codeBlocklist.includes(code.toLowerCase())) {
                continue;
            }

            // The code might sometimes be followed by a '*', which gets included in the name.
            // Let's check for that and adjust.
            if (name.startsWith('* ')) {
                code += ' *';
                name = name.substring(2);
            }

            items.push({
                code: code,
                name: name,
                quantity: parseInt(quantity, 10)
            });
        }
    }
    return items;
}

// Function to finalize data with prices and structure (from invefull.js)
function finalizeProcessedData(preliminaryItems, priceMap) {
    return preliminaryItems.map((item, index) => {
        const code = item.code || '';
        const systemValue = item.quantity || 0;
        const realValue = 0; // Starts at 0 as per q.txt

        // Clean code for links
        const cleanCode = code.replace(/\s\*/g, '').trim();

        return {
            correlative: index + 1,
            code: cleanCode, // Use cleanCode here to match product list keys
            name: item.name || 'N/A',
            systemValue: systemValue,
            favorite: false,
            link: `www.drsimi.cl/${cleanCode}`,
            link2: `/images/${cleanCode}.webp`,
            storage: 'Estándar', // Default value
            status: 'Pendiente',
            revisadoPor: '',
            fechaRevision: '',
            transit: 0, // Default value
            expiry: 'NO', // Default value
            realValue: realValue,
            diferenciaValue: realValue - systemValue,
            precio: priceMap.get(cleanCode) || '' // Use cleanCode here for price lookup
        };
    });
}




async function fetchAndDisplayExperimentalLastUpdate(localId) {
    const experimentalLastUpdate = page.experimentalLastUpdate;

    if (!localId) {
        if (experimentalLastUpdate) experimentalLastUpdate.textContent = 'N/A';
        return;
    }

    try {
        const response = await fetchWithRetry(`/api/exp/last-update/${localId}`, {}, 1, 500);
        if (response.ok) {
            const data = await response.json();
            if (data.lastUpdate) {
                const lastUpdateDate = new Date(data.lastUpdate);
                const now = new Date();
                
                const formattedDateTime = lastUpdateDate.toLocaleString('es-CL', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
                });

                if (experimentalLastUpdate) {
                    experimentalLastUpdate.textContent = formattedDateTime;
                    
                    const isToday = lastUpdateDate.getFullYear() === now.getFullYear() &&
                                    lastUpdateDate.getMonth() === now.getMonth() &&
                                    lastUpdateDate.getDate() === now.getDate();

                    experimentalLastUpdate.classList.remove('today', 'outdated');
                    experimentalLastUpdate.classList.add(isToday ? 'today' : 'outdated');
                }
            } else {
                if (experimentalLastUpdate) {
                    experimentalLastUpdate.textContent = 'Nunca';
                    experimentalLastUpdate.classList.remove('today', 'outdated');
                }
            }
        } else if (response.status === 404) {
            if (experimentalLastUpdate) {
                experimentalLastUpdate.textContent = 'Nunca';
                experimentalLastUpdate.classList.remove('today', 'outdated');
            }
        } else {
            console.error('Error fetching experimental last update:', await response.text());
            if (experimentalLastUpdate) {
                experimentalLastUpdate.textContent = 'Error';
                experimentalLastUpdate.classList.remove('today', 'outdated');
            }
        }
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.warn('Network error fetching experimental last update:', error);
        }
        if (experimentalLastUpdate) {
            experimentalLastUpdate.textContent = 'Error';
            experimentalLastUpdate.classList.remove('today', 'outdated');
        }
    }
}

function setExperimentalLastUpdateFromIso(isoDate) {
    if (!page.experimentalLastUpdate || !isoDate) return;
    const lastUpdateDate = new Date(isoDate);
    const now = new Date();
    const formattedDateTime = lastUpdateDate.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    });

    page.experimentalLastUpdate.textContent = formattedDateTime;
    const isToday = lastUpdateDate.getFullYear() === now.getFullYear() &&
        lastUpdateDate.getMonth() === now.getMonth() &&
        lastUpdateDate.getDate() === now.getDate();

    page.experimentalLastUpdate.classList.remove('today', 'outdated');
    page.experimentalLastUpdate.classList.add(isToday ? 'today' : 'outdated');
}

function addCustomListItem(itemIndex, customListId) {
    const itemToAdd = transitList[itemIndex];
    if (!itemToAdd) {
        console.error('Item not found in transit list:', itemIndex);
        return;
    }

    const targetList = customLists.find(list => list.id === customListId);
    if (!targetList) {
        console.error('Custom list not found:', customListId);
        return;
    }

    // Assuming custom lists store product codes or full product objects
    if (!targetList.items) {
        targetList.items = [];
    }
    // Check if item already exists in the custom list to prevent duplicates
    if (!targetList.items.some(existingItem => existingItem.codigo === itemToAdd.codigo)) {
        targetList.items.push({
            codigo: itemToAdd.codigo,
            nombre: itemToAdd.nombre,
            cantidad: itemToAdd.cantidad,
            precioUnitario: itemToAdd.precioUnitario,
            motivo: itemToAdd.motivo,
            fechaAdicion: new Date().toISOString() // Date when added to custom list
        });
        saveCustomLists();
        showToast(`Producto ${itemToAdd.nombre} añadido a "${targetList.name}".`, 'success');
    } else {
        showToast(`El producto ${itemToAdd.nombre} ya existe en "${targetList.name}".`, 'info');
    }
}


function renderTransitList() {
    page.transitListTableBody.innerHTML = '';
    let totalQuantity = 0;
    let totalPrice = 0;

    transitList.forEach((item, index) => {
        totalQuantity += item.cantidad;
        totalPrice += item.subtotal;

        const motivoOptions = transitReasons.map(reason =>
            `<option value="${reason}" ${item.motivo === reason ? 'selected' : ''}>${reason}</option>`
        ).join('');

        const customListOptions = customLists.map(list => `<option value="${list.id}">${list.name}</option>`).join('');

        // 1. Main Row (Essential: Checkbox, Código, Nombre, Cantidad, Motivo, Eliminar, Expand)
        const mainRow = document.createElement('tr');
        mainRow.classList.add('transit-item-row');
        mainRow.dataset.index = index;
        mainRow.innerHTML = `
            <td onclick="event.stopPropagation()"><input type="checkbox" class="transit-select-checkbox" data-index="${index}" ${selectedTransitItems.includes(index) ? 'checked' : ''}></td>
            <td class="font-bold">${item.codigo}</td>
            <td>${item.nombre}</td>
            <td class="text-center">${item.cantidad}</td>
            <td onclick="event.stopPropagation()">
                <select class="form-control transit-motivo-selector transit-motivo-main" data-index="${index}">
                    ${motivoOptions}
                </select>
            </td>
            <td class="text-center" onclick="event.stopPropagation()">
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
                        <span class="detail-value">$${item.precioUnitario.toFixed(0)}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Subtotal</span>
                        <span class="detail-value font-medium">$${item.subtotal.toFixed(0)}</span>
                    </div>
                    <div class="detail-group">
                        <span class="detail-label">Añadir a Lista Custom</span>
                        <div class="custom-list-controls">
                            <select class="form-control custom-list-selector" data-index="${index}">
                                <option value="">Seleccionar...</option>
                                ${customListOptions}
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

        page.transitListTableBody.appendChild(mainRow);
        page.transitListTableBody.appendChild(detailsRow);

        mainRow.addEventListener('click', () => {
            const isExpanded = mainRow.classList.toggle('expanded');
            detailsRow.style.display = isExpanded ? 'table-row' : 'none';
        });
    });

    // Update summary information
    page.transitTotalQuantity.textContent = totalQuantity;
    page.transitTotalPrice.textContent = `$${totalPrice.toFixed(0)}`;
    page.transitCurrentDate.textContent = new Date().toLocaleDateString(navigator.language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    lucide.createIcons();
    updateBulkActionsButtonVisibility(); // Update button visibility after rendering
}

function removeTransitItem(index) {
    transitList.splice(index, 1);
    renderTransitList();
    saveTransitList(); // Save transit list after removal
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
            transitList = Array.isArray(data) ? data : []; // Update the transitList array
            renderTransitList(); // Render the loaded list
            console.log('Última lista de tránsito cargada:', transitList);
        } else if (response.status === 404) {
            console.log('No hay listas de tránsito guardadas para este local.');
            transitList = []; // Ensure list is empty if no saved list
            renderTransitList(); // Render empty list
        } else {
            const raw = await response.text();
            if (raw && raw.toLowerCase().includes('no transit list')) {
                transitList = [];
                renderTransitList();
                return;
            }
            transitList = [];
            renderTransitList();
        }
    } catch (error) {
        console.error('Error al cargar la última lista de tránsito:', error);
        transitList = [];
        renderTransitList();
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
        page.manualProductModal.querySelector('h2').textContent = 'Agregar Producto a Tránsito';
        page.modalAddBtn.textContent = 'Agregar';
        page.modalProductCode.readOnly = false;
        page.modalProductCode.style.backgroundColor = '';
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
    page.modalProductCode.readOnly = false; // Ensure it's editable next time
    page.modalProductCode.style.backgroundColor = '';
}

function editTransitItem(index) {
    editingIndex = index;
    const item = transitList[index];

    page.modalProductCode.value = item.codigo;
    page.modalProductName.value = item.nombre;
    page.modalUnits.value = item.cantidad;
    page.modalUnitPrice.value = item.precioUnitario;
    page.modalSubtotal.value = item.subtotal;
    page.modalMotivo.value = item.motivo; // Set motive

    // Make product code read-only during edit
    page.modalProductCode.readOnly = true;
    page.modalProductCode.style.backgroundColor = '#e9ecef'; // Light gray background

    page.manualProductModal.querySelector('h2').textContent = 'Editar Producto en Tránsito';
    page.modalAddBtn.textContent = 'Guardar Cambios';

    openModal();
}



function displaySuggestions(suggestions) {
    page.productSuggestions.innerHTML = '';
    if (suggestions.length === 0 || page.modalProductCode.value === '') {
        page.productSuggestions.style.display = 'none';
        return;
    }

    const fragment = document.createDocumentFragment();
    suggestions.forEach(product => {
        const div = document.createElement('div');
        div.classList.add('suggestion-item');
        div.textContent = `${product.codigo} - ${product.nombre}`;
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

function renderProcessedInventory(items, container) {
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<tr><td colspan="16">No hay ítems para mostrar.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        const row = document.createElement('tr');
        const favIcon = item.favorite ? '<i data-lucide="star" class="text-warning"></i>' : '-';
        const priceFormatted = item.precio ? `$${Number(item.precio).toLocaleString('es-CL')}` : '';

        row.innerHTML = `
            <td>${item.n}</td>
            <td>${item.codigo}</td>
            <td>${item.nombre}</td>
            <td>${item.cantidad}</td>
            <td>${item.realValue || 0}</td>
            <td>${(item.realValue || 0) - item.cantidad}</td>
            <td>${priceFormatted}</td>
            <td>${item.transit || 0}</td>
            <td>${item.expiry || 'NO'}</td>
            <td class="status-${(item.status || 'Pendiente').toLowerCase()}">${item.status || 'Pendiente'}</td>
            <td>${item.revisadoPor || ''}</td>
            <td>${item.fechaRevision || ''}</td>
            <td>${favIcon}</td>
            <td>${item.storage || 'Estándar'}</td>
            <td><a href="http://www.drsimi.cl/${item.codigo}" target="_blank" title="www.drsimi.cl/${item.codigo}">Ver</a></td>
            <td><a href="/images/${item.codigo}.webp" target="_blank" title="/images/${item.codigo}.webp">Imagen</a></td>
        `;
        fragment.appendChild(row);
    });

    container.appendChild(fragment);
    lucide.createIcons();
}

function showMainInventoryViewLocal() {
    currentView = 'main';
    page.mainView.style.display = 'block';
    page.movementsView.style.display = 'none';
    page.processedInventoryDisplayView.style.display = 'none';
    page.title.textContent = 'Inventario';
    page.backButton.href = '/pages/home.html';
    lucide.createIcons();
}

function displayProcessedInventory(items) {
    page.mainView.style.display = 'none';
    page.movementsView.style.display = 'none';
    page.processedInventoryDisplayView.style.display = 'block';

    renderProcessedInventory(items, page.processedInventoryTableBody);
    page.clearProcessedInventoryBtn.onclick = () => {
        page.processedInventoryDisplayView.style.display = 'none';
        page.processedInventoryTableBody.innerHTML = '';
        showMainInventoryViewLocal();
    };
}


document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay('Cargando inventario...');
    // --- DOM ELEMENTS ---
    page = {
        title: document.getElementById('page-title'),
        backButton: document.getElementById('back-button'),
        mainView: document.getElementById('inventory-main-view'),
        movementsView: document.getElementById('movements-view'),
        addCustomListBtn: document.getElementById('add-custom-list-btn'),
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
        // New transit summary and bulk actions elements
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
        // Experimental button elements
        pdfUploadInventario: document.getElementById('pdf-upload-inventario'),
        experimentalPdfBtn: document.getElementById('experimental-pdf-btn'),
        experimentalLastUpdate: document.getElementById('experimental-last-update'),
        // New elements for displaying processed inventory
        processedInventoryDisplayView: document.getElementById('processed-inventory-display-view'),
        processedInventoryTableBody: document.getElementById('processed-inventory-table-body'),
        clearProcessedInventoryBtn: document.getElementById('clear-processed-inventory-btn'),
    };

    // 1. Auth & Header
    currentUser = Auth.checkAuth();
    if (!currentUser) {
        console.error('Authentication failed. Redirecting to login.');
        Auth.logout(); // Ensure user is logged out if auth check fails
        hideLoadingOverlay();
        return;
    }
    try {
        setupHeader(currentUser);

        // 2. Initial Setup
        loadCustomLists();
        renderCustomLists();
        lucide.createIcons();

        // Fetch and display last update
        if (currentUser.locale_id) {
            fetchAndDisplayExperimentalLastUpdate(currentUser.locale_id);
            await fetchProducts(currentUser.locale_id); // Fetch products here
            await loadLatestTransitList(); // Load latest transit list
        } else {
            document.getElementById('last-update-display').textContent = 'Última actualización: No hay local asignado.';
        }
        showMainInventoryViewLocal(); // Show the default view

        // 3. Event Listeners
        setupEventListeners();
    } finally {
        hideLoadingOverlay();
    }
});



// --- EVENT LISTENERS ---

function setupEventListeners() {
    page.backButton.addEventListener('click', (e) => {
        if (currentView === 'movements') {
            e.preventDefault();
            showMainView();
        }
    });

    page.addCustomListBtn.addEventListener('click', () => {
        const listName = prompt('Ingrese el nombre de la nueva lista:');
        if (listName && listName.trim() !== '') {
            addCustomList(listName.trim());
        }
    });



    // Experimental PDF button logic
    if (page.experimentalPdfBtn) {
        page.experimentalPdfBtn.addEventListener('click', () => {
            const btnSpan = page.experimentalPdfBtn.querySelector('span');
            updateButtonState(page.experimentalPdfBtn, btnSpan, 'idle', 'Cargando...');
            page.pdfUploadInventario.value = null; 
            page.pdfUploadInventario.click();
        });
    }

    if (page.pdfUploadInventario) {
        page.pdfUploadInventario.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            const btnSpan = page.experimentalPdfBtn.querySelector('span');
            if (currentUser && currentUser.locale_id) {
                try {
                    const result = await processPdfFile(file, currentUser.locale_id, page.experimentalPdfBtn, btnSpan);
                    const processedData = Array.isArray(result) ? result : (result?.productos || []);
                    if (result?.fechaProcesado) {
                        setExperimentalLastUpdateFromIso(result.fechaProcesado);
                    }
                    if (Array.isArray(processedData) && processedData.length > 0) {
                        showToast('Archivo procesado y guardado correctamente.', 'success');
                    } else {
                        showToast('Archivo procesado correctamente.', 'success');
                    }
                    showMainInventoryViewLocal();
                    // Refresh the last update time after processing
                    fetchAndDisplayExperimentalLastUpdate(currentUser.locale_id);
                } catch (error) {
                    console.error('Error processing PDF file:', error);
                    if (error?.message) {
                        showToast(error.message, 'error');
                    }
                    // The button state is already handled in processPdfFile's promise rejection
                }
            } else {
                console.error('No se puede procesar el PDF: usuario o locale_id no definidos.');
                updateButtonState(page.experimentalPdfBtn, btnSpan, 'error', 'Error (Auth)');
            }
        });
    }

    // Use event delegation for edit/delete buttons on custom lists
    page.customListsContainer.addEventListener('click', async (e) => {
        const target = e.target;
        const editBtn = target.closest('.edit-btn');
        const deleteBtn = target.closest('.delete-btn');

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
                predefinedListsContainer.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
                clickedTab.classList.add('active');
                const tabId = clickedTab.dataset.listId;
                document.querySelectorAll('#predefined-list-content .tab-pane').forEach(pane => {
                    pane.style.display = pane.id === `${tabId}-tab-pane` ? 'block' : 'none';
                });
                if (page.addManualProductBtn) {
                    page.addManualProductBtn.disabled = tabId !== 'transito';
                }
            }
        });
    }
    
    if (page.addManualProductBtn) {
        page.addManualProductBtn.addEventListener('click', () => openModal());
    }

    if (page.modalProductCode) {
        page.modalProductCode.addEventListener('input', () => {
            const query = page.modalProductCode.value.toLowerCase();
            const suggestions = query.length > 0
                ? allProducts.filter(p => p.codigo.toLowerCase().includes(query) || p.nombre.toLowerCase().includes(query)).slice(0, 5)
                : [];
            displaySuggestions(suggestions);
        });
        page.modalProductCode.addEventListener('focus', () => {
             const query = page.modalProductCode.value.toLowerCase();
            if(query.length > 0) displaySuggestions(allProducts.filter(p => p.codigo.toLowerCase().includes(query) || p.nombre.toLowerCase().includes(query)).slice(0, 5));
        });
        page.modalProductCode.addEventListener('blur', () => setTimeout(() => page.productSuggestions.style.display = 'none', 200));
    }

    if (page.productSuggestions) {
        page.productSuggestions.addEventListener('click', (event) => {
            const item = event.target.closest('.suggestion-item');
            if (item && item.dataset.productId) selectSuggestion(item.dataset.productId);
        });
    }

    if (page.modalUnits) page.modalUnits.addEventListener('input', updateSubtotal);
    if (page.modalCloseButton) page.modalCloseButton.addEventListener('click', closeModal);
    if (page.modalCancelBtn) page.modalCancelBtn.addEventListener('click', closeModal);
    if (page.modalAddBtn) page.modalAddBtn.addEventListener('click', () => {
        const units = parseFloat(page.modalUnits.value);
        if (isNaN(units) || units <= 0) {
            showToast('Por favor, ingrese una cantidad válida.', 'info');
            return;
        }

        if (editingIndex > -1) {
            const item = transitList[editingIndex];
            transitList[editingIndex] = { ...item, cantidad: units, motivo: page.modalMotivo.value, fechaEdicion: new Date().toISOString(), subtotal: parseFloat(page.modalSubtotal.value) };
        } else {
            if (!selectedProduct) {
                showToast('Por favor, seleccione un producto válido.', 'info');
                return;
            }
            transitList.push({
                codigo: selectedProduct.codigo,
                nombre: selectedProduct.nombre,
                cantidad: units,
                precioUnitario: parseFloat(page.modalUnitPrice.value),
                subtotal: parseFloat(page.modalSubtotal.value),
                motivo: page.modalMotivo.value,
                fechaEdicion: new Date().toISOString()
            });
        }
        renderTransitList();
        closeModal();
        saveTransitList();
    });

    if (page.transitListTableBody) {
        page.transitListTableBody.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.remove-item-btn');
            if (removeBtn) return removeTransitItem(parseInt(removeBtn.dataset.index));
            
            const editBtn = event.target.closest('.edit-item-btn');
            if (editBtn) return editTransitItem(parseInt(editBtn.dataset.index));

            const addToCustomListBtn = event.target.closest('.add-to-custom-list-btn');
            if (addToCustomListBtn) {
                const parentRow = event.target.closest('.transit-details-row');
                const selector = parentRow ? parentRow.querySelector('.custom-list-selector') : null;
                if (selector && selector.value) addCustomListItem(parseInt(addToCustomListBtn.dataset.index), selector.value);
                else showToast('Por favor, seleccione una lista personalizada.', 'info');
            }
        });

        page.transitListTableBody.addEventListener('change', (event) => {
            const motivoSelector = event.target.closest('.transit-motivo-selector');
            if (motivoSelector) {
                const index = parseInt(motivoSelector.dataset.index);
                if (!isNaN(index) && transitList[index]) {
                    transitList[index].motivo = motivoSelector.value;
                    transitList[index].fechaEdicion = new Date().toISOString();
                    saveTransitList();
                }
            }
            const checkbox = event.target.closest('.transit-select-checkbox');
            if (checkbox) {
                const index = parseInt(checkbox.dataset.index);
                if (checkbox.checked) {
                    if (!selectedTransitItems.includes(index)) selectedTransitItems.push(index);
                } else {
                    selectedTransitItems = selectedTransitItems.filter(i => i !== index);
                }
                updateBulkActionsButtonVisibility();
            }
        });
    }

    if (page.bulkActionsBtn) {
        page.bulkActionsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            page.bulkActionsDropdown.style.display = page.bulkActionsDropdown.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (event) => {
            if (!page.bulkActionsBtn.contains(event.target) && !page.bulkActionsDropdown.contains(event.target)) {
                page.bulkActionsDropdown.style.display = 'none';
            }
        });
    }

    if (page.bulkDeleteBtn) page.bulkDeleteBtn.addEventListener('click', async (event) => {
        event.preventDefault();
        if (selectedTransitItems.length === 0) {
            showToast('No hay ítems seleccionados para eliminar.', 'info');
            return;
        }
        const confirmed = await showConfirmDialog(`¿Está seguro de que desea eliminar ${selectedTransitItems.length} ítems seleccionados?`);
        if (confirmed) {
            selectedTransitItems.sort((a, b) => b - a).forEach(index => transitList.splice(index, 1));
            selectedTransitItems = [];
            renderTransitList();
            saveTransitList();
            page.bulkActionsDropdown.style.display = 'none';
        }
    });

    if (page.bulkMoveBtn) page.bulkMoveBtn.addEventListener('click', (event) => {
        event.preventDefault();
        if (selectedTransitItems.length === 0) {
            showToast('No hay ítems seleccionados para mover.', 'info');
            return;
        }
        openMoveToListModal();
        page.bulkActionsDropdown.style.display = 'none';
    });

    if (page.modalMoveCloseButton) page.modalMoveCloseButton.addEventListener('click', closeMoveToListModal);
    if (page.modalMoveCancelBtn) page.modalMoveCancelBtn.addEventListener('click', closeMoveToListModal);
    if (page.modalMoveConfirmBtn) page.modalMoveConfirmBtn.addEventListener('click', () => {
        const targetListId = page.modalTargetList.value;
        if (!targetListId) {
            showToast('Por favor, seleccione una lista de destino.', 'info');
            return;
        }
        if (selectedTransitItems.length === 0) return closeMoveToListModal();

        const targetList = customLists.find(list => list.id === targetListId);
        if (targetList) {
            const itemsToMove = selectedTransitItems.map(index => transitList[index]);
            if (!targetList.items) targetList.items = [];
            itemsToMove.forEach(item => {
                if (!targetList.items.some(existing => existing.codigo === item.codigo)) {
                    targetList.items.push({ ...item, fechaAdicion: new Date().toISOString() });
                }
            });
            saveCustomLists();
            showToast(`Ítems movidos a la lista personalizada "${targetList.name}".`, 'success');
        } else {
            console.log(`Simulando movimiento a lista predefinida: ${targetListId}`, selectedTransitItems.map(i => transitList[i]));
            showToast(`Ítems movidos a la lista predefinida "${targetListId}".`, 'success');
        }
        
        selectedTransitItems.sort((a, b) => b - a).forEach(index => transitList.splice(index, 1));
        selectedTransitItems = [];
        
        renderTransitList();
        saveTransitList();
        closeMoveToListModal();
    });

    window.addEventListener('click', (event) => {
        if (event.target === page.manualProductModal) closeModal();
        if (event.target === page.moveToListModal) closeMoveToListModal();
    });
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











function loadCustomLists() {
    customLists = JSON.parse(localStorage.getItem('inventory_custom_lists')) || [];
}

function saveCustomLists() {
    localStorage.setItem('inventory_custom_lists', JSON.stringify(customLists));
}

function renderCustomLists() {
    page.customListsContainer.innerHTML = ''; // Clear existing
    if (customLists.length === 0) {
        page.customListsContainer.innerHTML = '<li class="list-group-item">No hay listas custom.</li>';
        return;
    }

    customLists.forEach(list => {
        const li = document.createElement('li');
        li.className = 'list-group-item custom-item';
        li.dataset.listId = list.id;
        li.innerHTML = `
            <a href="#">${list.name}</a>
            <div class="list-item-actions">
                <button class="btn btn-sm btn-icon edit-btn" data-id="${list.id}"><i data-lucide="edit-3"></i></button>
                <button class="btn btn-sm btn-icon btn-danger delete-btn" data-id="${list.id}"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        page.customListsContainer.appendChild(li);
    });
    lucide.createIcons();
}

function addCustomList(name) {
    const newList = {
        id: `custom_${Date.now()}`,
        name: name,
    };
    customLists.push(newList);
    saveCustomLists();
    renderCustomLists();
}

function renameCustomList(id, newName) {
    const list = customLists.find(l => l.id === id);
    if (list) {
        list.name = newName;
        saveCustomLists();
        renderCustomLists();
    }
}

function deleteCustomList(id) {
    customLists = customLists.filter(l => l.id !== id);
    saveCustomLists();
    renderCustomLists();
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
