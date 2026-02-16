import { Auth } from '/core/js/auth.js';
import { showToast, showLoadingOverlay, hideLoadingOverlay } from '/core/js/ui-feedback.js';
import { updateButtonState, processPdfFile } from './inventario-pdf-processor.js';


document.addEventListener('DOMContentLoaded', async () => {
    Auth.init();
    const currentUser = Auth.checkAuth();
    if (!currentUser) {
        return;
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

    setupHeader(currentUser);
    const pdfUploadInventario = document.getElementById('pdf-upload-inventario');
    const experimentalPdfBtn = document.getElementById('experimental-pdf-btn');
    const experimentalLastUpdate = document.getElementById('experimental-last-update');


    lucide.createIcons();

    const logoutButton = document.getElementById('logout-btn');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            Auth.logout();
        });
    }

    // Get references for collapsible table
    const toggleButton = document.getElementById('toggle-inventory-table');
    const tableContainer = document.getElementById('inventory-table-container');
    const toggleButtonIcon = toggleButton.querySelector('.icon-toggle');
    const toggleButtonText = toggleButton.querySelector('span');

    if (toggleButton && tableContainer) {
        toggleButton.addEventListener('click', () => {
            if (tableContainer.style.display === 'none') {
                tableContainer.style.display = 'block';
                toggleButtonText.textContent = 'Ocultar Detalles';
                toggleButtonIcon.setAttribute('data-lucide', 'chevron-up');
            } else {
                tableContainer.style.display = 'none';
                toggleButtonText.textContent = 'Mostrar Detalles';
                toggleButtonIcon.setAttribute('data-lucide', 'chevron-down');
            }
            lucide.createIcons(); // Re-render icon
        });
    }


    // Get references for collapsible workers list
    const toggleWorkersButton = document.getElementById('toggle-workers-list');
    const workersListContainer = document.getElementById('workers-list-container');
    const toggleWorkersButtonIcon = toggleWorkersButton.querySelector('.icon-toggle');
    const toggleWorkersButtonText = toggleWorkersButton.querySelector('span');

    if (toggleWorkersButton && workersListContainer) {
        toggleWorkersButton.addEventListener('click', () => {
            if (workersListContainer.style.display === 'none') {
                workersListContainer.style.display = 'block';
                toggleWorkersButtonText.textContent = 'Ocultar Personal';
                toggleWorkersButtonIcon.setAttribute('data-lucide', 'chevron-up');
            } else {
                workersListContainer.style.display = 'none';
                toggleWorkersButtonText.textContent = 'Mostrar Personal';
                toggleWorkersButtonIcon.setAttribute('data-lucide', 'users'); // Changed to 'users' to imply showing the list
            }
            lucide.createIcons(); // Re-render icon
        });
    }


    // Get references for collapsible storage management
    const toggleStorageButton = document.getElementById('toggle-storage-management');
    const storageManagementContainer = document.getElementById('storage-management-container');
    const toggleStorageButtonIcon = toggleStorageButton ? toggleStorageButton.querySelector('.icon-toggle') : null;
    const toggleStorageButtonText = toggleStorageButton ? toggleStorageButton.querySelector('span') : null;

    if (toggleStorageButton && storageManagementContainer) {
        toggleStorageButton.addEventListener('click', () => {
            if (storageManagementContainer.style.display === 'none') {
                storageManagementContainer.style.display = 'block';
                if (toggleStorageButtonText) toggleStorageButtonText.textContent = 'Ocultar Gestión';
                if (toggleStorageButtonIcon) toggleStorageButtonIcon.setAttribute('data-lucide', 'package-minus'); // Changed icon for "hide"
            } else {
                storageManagementContainer.style.display = 'none';
                if (toggleStorageButtonText) toggleStorageButtonText.textContent = 'Mostrar Gestión';
                if (toggleStorageButtonIcon) toggleStorageButtonIcon.setAttribute('data-lucide', 'package'); // Changed icon for "show"
            }
            lucide.createIcons(); // Re-render icon
        });
    }


    let inventoryData = { productos: [] };
    let localWorkers = [];

    // Predetermined storage locations
    const PREDETERMINED_STORAGE_LOCATIONS = ["Estándar", "Refrigerador", "Controlados"];
    let customStorageLocations = []; // To store custom locations loaded from /data/almacenamiento.json
    let allStorageLocations = []; // Combined list of all storage locations

    // UI elements for custom storage
    const customStorageListElement = document.getElementById('custom-storage-list');
    const customStorageInput = document.getElementById('custom-storage-input');
    const addCustomStorageBtn = document.getElementById('add-custom-storage-btn');
    const saveCustomStorageBtn = document.getElementById('save-custom-storage-btn');


    // --- Storage Location Management ---

    // Function to load custom storage locations from the server
    async function loadCustomStorageLocations() {
        try {
            // Assuming a new API endpoint for fetching custom storage locations
            const response = await fetch(`/api/storage/custom/${currentUser.locale_id}`);
            if (response.ok) {
                customStorageLocations = await response.json();
            } else if (response.status === 404) {
                customStorageLocations = [];
            } else {
                throw new Error(`Error loading custom storage: ${response.statusText}`);
            }
        } catch (error) {
            customStorageLocations = []; // Fallback to empty array on error
        }
        renderCustomStorageLocations();
        updateAllStorageLocations();
    }

    // Function to save custom storage locations to the server
    async function saveCustomStorageLocationsToServer() {
        try {
            // Assuming a new API endpoint for saving custom storage locations
            const response = await fetch(`/api/storage/custom/${currentUser.locale_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customStorageLocations)
            });
            if (response.ok) {
                showToast("Lugares de almacenamiento personalizados guardados.", 'success');
            } else {
                throw new Error(`Error saving custom storage: ${response.statusText}`);
            }
        } catch (error) {
            showToast("Error al guardar lugares personalizados.", 'error');
        }
    }

    // Function to render the list of custom storage locations in the UI
    function renderCustomStorageLocations() {
        customStorageListElement.innerHTML = '';
        customStorageLocations.forEach(location => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.textContent = location;
            // Add a delete button for custom locations
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'x';
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.style.marginLeft = '10px';
            deleteBtn.onclick = () => {
                customStorageLocations = customStorageLocations.filter(loc => loc !== location);
                renderCustomStorageLocations();
                updateAllStorageLocations();
            };
            li.appendChild(deleteBtn);
            customStorageListElement.appendChild(li);
        });
    }

    // Function to combine predetermined and custom locations
    function updateAllStorageLocations() {
        allStorageLocations = [...PREDETERMINED_STORAGE_LOCATIONS, ...customStorageLocations];
        // Ensure uniqueness
        allStorageLocations = [...new Set(allStorageLocations)];
    }

    // Event Listeners for custom storage management
    if (addCustomStorageBtn) {
        addCustomStorageBtn.addEventListener('click', () => {
            const newLocation = customStorageInput.value.trim();
            if (newLocation && !allStorageLocations.includes(newLocation)) {
                customStorageLocations.push(newLocation);
                customStorageInput.value = '';
                renderCustomStorageLocations();
                updateAllStorageLocations();
            } else if (newLocation && allStorageLocations.includes(newLocation)) {
                showToast("Ese lugar de almacenamiento ya existe.", 'info');
            }
        });
    }

    if (saveCustomStorageBtn) {
        saveCustomStorageBtn.addEventListener('click', saveCustomStorageLocationsToServer);
    }
    
    // Function to render the list of products with storage selectors
    function renderProductStorageList() {
        const productStorageListElement = document.getElementById('product-storage-list');
        productStorageListElement.innerHTML = ''; // Clear previous content

        if (!inventoryData || !inventoryData.productos || inventoryData.productos.length === 0) {
            productStorageListElement.innerHTML = '<p>No hay productos para asignar almacenamiento.</p>';
            return;
        }

        inventoryData.productos.forEach((product, index) => {
            const productItem = document.createElement('div');
            // Add conditional class for highlighting
            productItem.className = `product-item-storage ${product.almacenamiento !== "Estándar" ? 'non-standard-storage' : ''}`;

            const productNameSpan = document.createElement('span');
            productNameSpan.textContent = `${product.codigo} - ${product.nombre}`;
            productItem.appendChild(productNameSpan);

            const selectElement = document.createElement('select');
            selectElement.className = 'form-control';
            selectElement.dataset.productIndex = index; // Store index to easily update product data

            // Populate select options
            allStorageLocations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                selectElement.appendChild(option);
            });

            // Set selected option
            // Default to "Estándar" if no storage is defined for the product
            selectElement.value = product.almacenamiento || "Estándar";

            selectElement.addEventListener('change', (e) => {
                product.almacenamiento = e.target.value;
                // Re-render the specific product item to update its highlighting
                // This is a more efficient approach than re-rendering the entire list.
                if (e.target.value !== "Estándar") {
                    productItem.classList.add('non-standard-storage');
                } else {
                    productItem.classList.remove('non-standard-storage');
                }
                // Since this changes a product property, we should save the assignment
                // A debounce might be good here for performance if many changes happen rapidly
                saveAssignment(); 
            });

            productItem.appendChild(selectElement);
            productStorageListElement.appendChild(productItem);
        });
    }

    // Call loadCustomStorageLocations and renderProductStorageList after initial data load
    // This will be called in DOMContentLoaded after all initial data is fetched.

    // Function to render the inventory table
    function renderInventoryTable() {
        const tableDiv = document.getElementById('inventory-table-container');
        if (!inventoryData || !inventoryData.productos || inventoryData.productos.length === 0) {
            tableDiv.innerHTML = '<p>No hay productos para mostrar.</p>';
            return;
        }

        let tableHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>N°</th>
                            <th>Código</th>
                            <th>Nombre</th>
                            <th>Cantidad</th>
                            <th>Real</th>
                            <th>Diferencia</th>
                            <th>Asignado</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        inventoryData.productos.forEach((product, index) => {
            // Calculate diferencia for display purposes immediately
            const productCantidad = product.cantidad || 0;
            const productReal = product.real || 0; // Use product.real if it exists, otherwise 0
            const diferenciaValue = productReal - productCantidad;

            let assignedToHtml = '<input type="checkbox" disabled>';
            if (product.assigned_to) {
                const worker = product.assigned_to;
                assignedToHtml = `
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <span style="background-color: ${worker.color || '#ccc'}; color: white; border-radius: 12px; padding: 2px 8px; font-size: 0.8em; font-weight: bold;">
                            ${worker.worker_code || 'N/A'}
                        </span>
                        <span>${worker.names} ${worker.last_names || ''}</span>
                    </div>
                `;
            }
            tableHtml += `
                        <tr class="${diferenciaValue === 0 ? 'reviewed-row' : ''}">
                            <td>${product.n}</td>
                            <td>${product.codigo}</td>
                            <td>${product.nombre}</td>
                            <td>${product.cantidad}</td>
                            <td><input type="number" class="form-control inventory-real-input" data-product-index="${index}" value="${product.real || ''}" style="width: 80px;"></td>
                            <td>${diferenciaValue}</td>
                            <td>${assignedToHtml}</td>
                        </tr>
            `;
        });
        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;
        tableDiv.innerHTML = tableHtml;

        // Add event listeners to the new real input fields
        document.querySelectorAll('.inventory-real-input').forEach(input => {
            input.addEventListener('change', (e) => updateProductReal(e.target));
        });
    }

    // Function to update product real value and trigger save
    async function updateProductReal(inputElement) {
        const index = parseInt(inputElement.dataset.productIndex, 10);
        const newRealValue = parseInt(inputElement.value, 10);

        if (isNaN(newRealValue)) {
            inputElement.value = 0; // Reset input to 0 for invalid entries
            inventoryData.productos[index].real = 0; // Set product real to 0
            // Continue with 0 value for the rest of the logic
        } else {
             inventoryData.productos[index].real = newRealValue;
        }

        if (inventoryData && inventoryData.productos && inventoryData.productos[index]) {
            // Update estado, revisado, fecha_revision
            if (inventoryData.productos[index].real !== 0) { // Use the updated real value
                inventoryData.productos[index].estado = "Revisado";
                inventoryData.productos[index].encargado = currentUser.names; // Assuming currentUser.names is the reviewer
                inventoryData.productos[index].fecha_revision = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            } else {
                inventoryData.productos[index].estado = "Pendiente";
                inventoryData.productos[index].encargado = "Pendiente";
                inventoryData.productos[index].fecha_revision = "Pendiente";
            }

            // Re-render the table to reflect changes including diferencia and estado
            renderInventoryTable(); 
            // Trigger save after a small delay to avoid excessive calls on rapid typing
            // This is a simple debounce, for more robust solution, a proper debounce function should be used
            clearTimeout(inputElement.saveTimer);
            inputElement.saveTimer = setTimeout(async () => { // Made async to await saveAssignment
                await saveAssignment();
            }, 500); // Save after 500ms of no further input
        }
    }

    // Function to load and display the latest inventory data
    async function loadLatestInventoryData() {
        const summaryDiv = document.getElementById('inventory-summary-display');
        const tableDiv = document.getElementById('inventory-table-container');

        summaryDiv.innerHTML = '<p>Cargando datos del inventario...</p>';
        tableDiv.innerHTML = ''; // Clear previous table content

        if (!currentUser || !currentUser.locale_id) {
            summaryDiv.innerHTML = '<p class="error-message">Error: No se pudo obtener la información del local del usuario.</p>';
            return;
        }

        const localCode = currentUser.locale_id.toUpperCase();
        let finalInventoryData = null;
        let dataSource = '';

        try {
            const assignmentResponse = await fetch(`/api/assignment/latest/${currentUser.locale_id}`, { cache: 'no-store' });
            if (assignmentResponse.ok) {
                finalInventoryData = await assignmentResponse.json();
                dataSource = 'assignment';
            } else if (assignmentResponse.status !== 404) {
                throw new Error(`Error cargando asignación: ${assignmentResponse.status}`);
            }
        } catch {
        }

        if (!finalInventoryData) {
            try {
                const inventoryResponse = await fetch(`/api/inventory/latest/${currentUser.locale_id}`, { cache: 'no-store' });
                if (inventoryResponse.ok) {
                    finalInventoryData = await inventoryResponse.json();
                    dataSource = 'inventory';
                } else if (inventoryResponse.status === 404) {
                    summaryDiv.innerHTML = `<p class="info-message">No se encontró inventario ni asignación para el local ${localCode}.</p>`;
                    return;
                } else {
                    throw new Error(`Error cargando inventario: ${inventoryResponse.status}`);
                }
            } catch (error) {
                summaryDiv.innerHTML = `<p class="error-message">Error al cargar datos: ${error.message}.</p>`;
                return;
            }
        }

        if (finalInventoryData && finalInventoryData.productos && finalInventoryData.productos.length > 0) {
            inventoryData = finalInventoryData; // Set the global inventoryData
            
            // This is a crucial step: if we loaded from asignacion.json, we need to map the worker codes
            // back to full worker objects using the already loaded `localWorkers` array.
            // This ensures the `renderInventoryTable` function can display worker names and colors.
            if (localWorkers.length > 0) {
                inventoryData.productos.forEach(product => {
                    if (product.asignado && product.asignado !== 0 && typeof product.asignado === 'string') {
                        const assignedWorker = localWorkers.find(worker => worker.worker_code === product.asignado);
                        if (assignedWorker) {
                            product.assigned_to = assignedWorker;
                        } else {
                            // If worker_code not found, set assigned_to to a placeholder or null
                            product.assigned_to = { worker_code: product.asignado, names: 'Desconocido', color: '#888' }; 
                        }
                    } else if (product.asignado === 0) {
                        product.assigned_to = null;
                    }
                });
            }


            const dateProcessed = new Date(inventoryData.fecha_procesado || new Date().toISOString()).toLocaleDateString('es-ES', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            
            // Display summary info
            summaryDiv.innerHTML = `
                <h3>Inventario del ${dateProcessed} (${dataSource === 'assignment' ? 'Asignación' : 'Inventario'})</h3>
                <p>Total de productos: ${inventoryData.total_productos}</p>
            `;

            // Render the table
            renderInventoryTable();
        } else {
            summaryDiv.innerHTML = `<p class="info-message">No hay productos en el inventario/asignación para el local ${localCode}.</p>`;
        }
    }

    async function fetchAndDisplayExperimentalLastUpdate(localId) {
        if (!experimentalLastUpdate) return;
        if (!localId) {
            experimentalLastUpdate.textContent = 'N/A';
            return;
        }
        try {
            const response = await fetch(`/api/exp/last-update/${localId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.lastUpdate) {
                    setExperimentalLastUpdateFromIso(data.lastUpdate);
                    return;
                }
            }
            experimentalLastUpdate.textContent = 'Nunca';
            experimentalLastUpdate.classList.remove('today', 'outdated');
        } catch {
            experimentalLastUpdate.textContent = 'Error';
            experimentalLastUpdate.classList.remove('today', 'outdated');
        }
    }

    function setExperimentalLastUpdateFromIso(isoDate) {
        if (!experimentalLastUpdate || !isoDate) return;
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

        experimentalLastUpdate.textContent = formattedDateTime;
        const isToday = lastUpdateDate.getFullYear() === now.getFullYear() &&
            lastUpdateDate.getMonth() === now.getMonth() &&
            lastUpdateDate.getDate() === now.getDate();
        experimentalLastUpdate.classList.remove('today', 'outdated');
        experimentalLastUpdate.classList.add(isToday ? 'today' : 'outdated');
    }

    // Function to load and display workers for the current local
    async function loadWorkersData() {
        const qfList = document.getElementById('qf-list');
        const afList = document.getElementById('af-list');
        const saList = document.getElementById('sa-list');
        const saListContainer = document.getElementById('sa-list-container');
        const noWorkersMessage = document.getElementById('no-workers-message');

        qfList.innerHTML = '';
        afList.innerHTML = '';
        saList.innerHTML = '';
        noWorkersMessage.style.display = 'none'; // Hide by default

        try {
            if (!currentUser || !currentUser.locale_id) {
                workersListContainer.innerHTML = '<p class="error-message">Error: No se pudo obtener la información del local del usuario para cargar el personal.</p>';
                return;
            }

            const allUsers = await Auth.fetchUsers();
            const localCode = currentUser.locale_id;
            
            // Filter users by current local and store them
            localWorkers = allUsers.filter(user => user.locale_id === localCode);

            const qfWorkers = localWorkers.filter(worker => worker.cargo === 'Químico Farmacéutico');
            const afWorkers = localWorkers.filter(worker => worker.cargo === 'Auxiliar de Farmacia');
            const saWorkers = localWorkers.filter(worker => worker.cargo === 'Super Admin'); // Include Super Admins for the local

            if (qfWorkers.length === 0 && afWorkers.length === 0 && saWorkers.length === 0) {
                noWorkersMessage.style.display = 'block';
            } else {
                // Populate QF list
                qfWorkers.forEach(worker => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item';

                    const codeBubble = document.createElement('span');
                    codeBubble.textContent = worker.worker_code || 'N/A';
                    codeBubble.style.cssText = `
                        background-color: ${worker.color || '#ccc'};
                        color: white; /* Assuming white text is readable on colored backgrounds */
                        border-radius: 12px;
                        padding: 2px 8px;
                        margin-right: 8px;
                        font-size: 0.8em;
                        font-weight: bold;
                    `;
                    li.appendChild(codeBubble);
                    li.innerHTML += `${worker.names} ${worker.last_names || ''} (${worker.rut})`;
                    qfList.appendChild(li);
                });

                // Populate AF list
                afWorkers.forEach(worker => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item';

                    const codeBubble = document.createElement('span');
                    codeBubble.textContent = worker.worker_code || 'N/A';
                    codeBubble.style.cssText = `
                        background-color: ${worker.color || '#ccc'};
                        color: white; /* Assuming white text is readable on colored backgrounds */
                        border-radius: 12px;
                        padding: 2px 8px;
                        margin-right: 8px;
                        font-size: 0.8em;
                        font-weight: bold;
                    `;
                    li.appendChild(codeBubble);
                    li.innerHTML += `${worker.names} ${worker.last_names || ''} (${worker.rut})`;
                    afList.appendChild(li);
                });

                // Populate SA list and display container if there are SAs
                if (saWorkers.length > 0) {
                    saListContainer.style.display = 'block';
                    saWorkers.forEach(worker => {
                        const li = document.createElement('li');
                        li.className = 'list-group-item';

                        const codeBubble = document.createElement('span');
                        codeBubble.textContent = worker.worker_code || 'N/A';
                        codeBubble.style.cssText = `
                            background-color: ${worker.color || '#ccc'};
                            color: white; /* Assuming white text is readable on colored backgrounds */
                            border-radius: 12px;
                            padding: 2px 8px;
                            margin-right: 8px;
                            font-size: 0.8em;
                            font-weight: bold;
                        `;
                        li.appendChild(codeBubble);
                        li.innerHTML += `${worker.names} ${worker.last_names || ''} (${worker.rut})`;
                        saList.appendChild(li);
                    });
                } else {
                    saListContainer.style.display = 'none'; // Hide if no Super Admins
                }
            }

        } catch (error) {
            workersListContainer.innerHTML = `<p class="error-message">Error al cargar el personal: ${error.message}.</p>`;
        }
    }

    showLoadingOverlay('Cargando asignación...');
    try {
        await loadWorkersData(); // Ensure workers are loaded before inventory
        await loadCustomStorageLocations(); // Load custom storage locations
        await loadLatestInventoryData(); // Load inventory/assignment data
        await fetchAndDisplayExperimentalLastUpdate(currentUser.locale_id);
    } finally {
        hideLoadingOverlay();
    }

    // Call renderProductStorageList after all necessary data is loaded
    renderProductStorageList();

    // --- Assignment Logic ---
    const repartoRadios = document.querySelectorAll('input[name="reparto"]');
    const metodoRadios = document.querySelectorAll('input[name="metodo"]');
    const autoOptions = document.getElementById('auto-options');
    const manualOptions = document.getElementById('manual-options');
    const assignButton = document.getElementById('assign-button');

    function resetProductsForNewAssignment() {
        if (!inventoryData || !Array.isArray(inventoryData.productos)) return;
        inventoryData.productos.forEach((product) => {
            product.assigned_to = null;
            product.real = 0;
            product.estado = "Pendiente";
            product.encargado = "Pendiente";
            product.revisado = "Pendiente";
            product.fecha_revision = "Pendiente";
            product.transito = 0;
            const qty = product.cantidad || 0;
            product.diferencia = 0 - qty;
        });
    }

    function getWorkersByReparto() {
        const reparto = document.querySelector('input[name="reparto"]:checked').value;
        if (reparto === 'af') {
            return localWorkers.filter(w => w.cargo === 'Auxiliar de Farmacia');
        }
        return localWorkers.filter(w => w.cargo === 'Auxiliar de Farmacia' || w.cargo === 'Químico Farmacéutico');
    }

    function distributeInventoryAmongWorkers(workersToAssign) {
        if (!Array.isArray(workersToAssign) || workersToAssign.length === 0) {
            throw new Error('No hay personal disponible para la asignación.');
        }

        const startIndex = parseInt(document.getElementById('start-index').value, 10) - 1;
        if (isNaN(startIndex) || startIndex < 0 || startIndex >= inventoryData.productos.length) {
            throw new Error('Índice de inicio inválido.');
        }

        resetProductsForNewAssignment();

        const productIndicesToAssign = [];
        for (let i = startIndex; i < inventoryData.productos.length; i++) productIndicesToAssign.push(i);
        for (let i = 0; i < startIndex; i++) productIndicesToAssign.push(i);

        if (productIndicesToAssign.length === 0) {
            throw new Error('No se han seleccionado productos para asignar.');
        }

        const rangesByWorker = {};
        const totalItems = productIndicesToAssign.length;
        const totalWorkers = workersToAssign.length;
        const itemsPerWorker = Math.floor(totalItems / totalWorkers);
        let remainder = totalItems % totalWorkers;
        let currentItemIndexInList = 0;

        for (let i = 0; i < totalWorkers; i++) {
            const worker = workersToAssign[i];
            let itemsToAssignForThisWorker = itemsPerWorker;
            if (remainder > 0) {
                itemsToAssignForThisWorker++;
                remainder--;
            }

            const startPos = currentItemIndexInList;
            const endPosExclusive = currentItemIndexInList + itemsToAssignForThisWorker;
            for (let j = startPos; j < endPosExclusive; j++) {
                if (j < totalItems) {
                    const productIndex = productIndicesToAssign[j];
                    inventoryData.productos[productIndex].assigned_to = worker;
                }
            }

            if (itemsToAssignForThisWorker > 0 && startPos < totalItems) {
                const firstCorrelative = productIndicesToAssign[startPos] + 1;
                const lastCorrelative = productIndicesToAssign[Math.min(endPosExclusive - 1, totalItems - 1)] + 1;
                rangesByWorker[worker.worker_code] = {
                    desde: firstCorrelative,
                    hasta: lastCorrelative
                };
            } else {
                rangesByWorker[worker.worker_code] = { desde: '', hasta: '' };
            }
            currentItemIndexInList = endPosExclusive;
        }

        return rangesByWorker;
    }

    function formatProductForSave(product) {
        const cleanedCodigo = product.codigo ? product.codigo.replace(/[\s\*]/g, '') : "";
        const generatedLink = cleanedCodigo ? `https://www.drsimi.cl/${cleanedCodigo}` : "";
        const generatedLink2 = cleanedCodigo ? `images/${cleanedCodigo}.webp` : "";

        const productCantidad = product.cantidad || 0;
        const productReal = product.real || 0;
        const diferenciaValue = productReal - productCantidad;

        return {
            n: product.n || 0,
            codigo: product.codigo || "",
            nombre: product.nombre || "",
            cantidad: productCantidad,
            asignado: product.assigned_to ? product.assigned_to.worker_code : 0, // Assuming assigned_to will be worker_code
            destacado: product.destacado || "NO",
            link: generatedLink,
            link2: generatedLink2,
            almacenamiento: product.almacenamiento || "Estándar",
            estado: product.estado || "Pendiente",
            encargado: product.encargado || product.revisado || "Pendiente",
            fecha_revision: product.fecha_revision || "Pendiente",
            transito: product.transito || 0,
            vencimiento: product.vencimiento || "NO",
            real: productReal,
            diferencia: diferenciaValue
        };
    }

    // Function to save the current assignment state
    async function saveAssignment() {
        if (!inventoryData || !currentUser || !currentUser.locale_id) {
            return;
        }

        try {
            const formattedProducts = inventoryData.productos.map(product => formatProductForSave(product));
            const dataToSend = {
                fecha_procesado: inventoryData.fecha_procesado,
                total_productos: inventoryData.total_productos,
                total_asignados: formattedProducts.filter(p => p.asignado !== 0).length, // Calculate based on formatted products
                productos: formattedProducts
            };

            const response = await fetch(`/api/assignment/save/${currentUser.locale_id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(dataToSend),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            await response.json();
            showToast('Asignación guardada con éxito.', 'success');
        } catch {
            showToast('Hubo un error al guardar la asignación.', 'error');
        }
    }

    function renderManualAssignmentUI() {
        const workersToDisplay = getWorkersByReparto();

        if (workersToDisplay.length === 0) {
            manualOptions.innerHTML = '<p>No hay personal disponible para la asignación.</p>';
            return;
        }

        let manualHtml = '<ul>';
        workersToDisplay.forEach(worker => {
            manualHtml += `
                <li class="list-group-item" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="btn btn-sm btn-secondary manual-include-toggle" data-worker-code="${worker.worker_code}" data-included="true">Incluir</button>
                        <span style="background-color: ${worker.color || '#ccc'}; color: white; border-radius: 12px; padding: 2px 8px; font-size: 0.8em; font-weight: bold;">
                            ${worker.worker_code || 'N/A'}
                        </span>
                        <span>${worker.names} ${worker.last_names || ''}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <input type="text" placeholder="Desde" class="form-control" style="width: 80px;" id="manual-desde-${worker.worker_code}" readonly>
                        <input type="text" placeholder="Hasta" class="form-control" style="width: 80px;" id="manual-hasta-${worker.worker_code}" readonly>
                    </div>
                </li>
            `;
        });
        manualHtml += '</ul><div style="display:flex; justify-content:flex-end; margin-top: 12px;"><button id="manual-distribute-btn" class="btn btn-primary">Repartir Inventario</button></div>';
        manualOptions.innerHTML = manualHtml;

        document.querySelectorAll('.manual-include-toggle').forEach((button) => {
            button.addEventListener('click', () => {
                const included = button.dataset.included === 'true';
                button.dataset.included = included ? 'false' : 'true';
                button.textContent = included ? 'Excluir' : 'Incluir';
                button.classList.toggle('btn-danger', included);
                button.classList.toggle('btn-secondary', !included);
            });
        });

        const manualDistributeBtn = document.getElementById('manual-distribute-btn');
        if (manualDistributeBtn) {
            manualDistributeBtn.addEventListener('click', async () => {
                try {
                    const includeButtons = Array.from(document.querySelectorAll('.manual-include-toggle'));
                    const includedWorkerCodes = includeButtons
                        .filter(btn => btn.dataset.included === 'true')
                        .map(btn => btn.dataset.workerCode);

                    const workersToAssign = workersToDisplay.filter(worker => includedWorkerCodes.includes(worker.worker_code));
                    const ranges = distributeInventoryAmongWorkers(workersToAssign);

                    workersToDisplay.forEach((worker) => {
                        const desdeInput = document.getElementById(`manual-desde-${worker.worker_code}`);
                        const hastaInput = document.getElementById(`manual-hasta-${worker.worker_code}`);
                        const data = ranges[worker.worker_code] || { desde: '', hasta: '' };
                        if (desdeInput) desdeInput.value = data.desde;
                        if (hastaInput) hastaInput.value = data.hasta;
                    });

                    renderInventoryTable();
                    await saveAssignment();
                    showToast('Reparto manual completado.', 'success');
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        }
    }
    
    repartoRadios.forEach(radio => radio.addEventListener('change', () => {
         if (document.querySelector('input[name="metodo"]:checked').value === 'manual') {
            renderManualAssignmentUI();
         }
    }));

    metodoRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'auto') {
                autoOptions.style.display = 'block';
                manualOptions.style.display = 'none';
                assignButton.style.display = 'block';
            } else {
                autoOptions.style.display = 'none';
                manualOptions.style.display = 'block';
                assignButton.style.display = 'none';
                renderManualAssignmentUI();
            }
        });
    });


    assignButton.addEventListener('click', async () => { // This now only handles AUTO assignment
        try {
            const workersToAssign = getWorkersByReparto();
            distributeInventoryAmongWorkers(workersToAssign);
            renderInventoryTable();
            showToast('Asignación automática completada.', 'success');
            await saveAssignment();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    if (experimentalPdfBtn && pdfUploadInventario) {
        experimentalPdfBtn.addEventListener('click', () => {
            const btnSpan = experimentalPdfBtn.querySelector('span');
            updateButtonState(experimentalPdfBtn, btnSpan, 'idle', 'Cargando...');
            pdfUploadInventario.value = null;
            pdfUploadInventario.click();
        });

        pdfUploadInventario.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            const btnSpan = experimentalPdfBtn.querySelector('span');
            if (!currentUser || !currentUser.locale_id) {
                updateButtonState(experimentalPdfBtn, btnSpan, 'error', 'Error (Auth)');
                return;
            }
            try {
                const result = await processPdfFile(file, currentUser.locale_id, experimentalPdfBtn, btnSpan);
                if (result?.fechaProcesado) {
                    setExperimentalLastUpdateFromIso(result.fechaProcesado);
                }
                showToast('Archivo procesado y guardado correctamente.', 'success');
                await loadLatestInventoryData();
                renderProductStorageList();
                await fetchAndDisplayExperimentalLastUpdate(currentUser.locale_id);
            } catch (error) {
                if (error?.message) showToast(error.message, 'error');
            }
        });
    }
});
