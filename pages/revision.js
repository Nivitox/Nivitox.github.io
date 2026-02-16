import { Auth } from '/core/js/auth.js';
import { showLoadingOverlay, hideLoadingOverlay } from '/core/js/ui-feedback.js';

let allUsers = []; // Global variable to store all users
let allProducts = []; // Global variable to store all products

function normalizeProductCode(code) {
    return String(code || '')
        .replace(/\s*\*/g, '')
        .trim()
        .toUpperCase();
}

/**
 * Applies the specified filter to the product list and renders the results.
 * Also manages the 'active' class on the filter buttons.
 * @param {string} filterType The type of filter to apply (e.g., 'asignados', 'pendientes', 'todos').
 * @param {object} user The currently logged-in user object.
 */
function applyFilter(filterType, user) {
    const filterControls = document.getElementById('filter-controls');
    if (filterControls) {
        filterControls.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        const targetButton = filterControls.querySelector(`.filter-btn[data-filter="${filterType}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
    }

    let filteredProducts = [];
    if (filterType === 'todos') {
        filteredProducts = allProducts;
    } else if (filterType === 'destacados') {
        filteredProducts = allProducts.filter(p => p.destacado === 'SI');
    } else if (filterType === 'asignados') {
        filteredProducts = allProducts.filter(p => p.asignado === user.worker_code);
    } else if (filterType === 'pendientes') {
        filteredProducts = allProducts.filter(p => p.asignado === user.worker_code && p.estado === 'Pendiente');
    } else if (filterType === 'revisados') {
        filteredProducts = allProducts.filter(p => p.asignado === user.worker_code && p.estado === 'Revisado');
    }

    renderProductList(filteredProducts);
}

/**
 * Helper function to generate HTML for worker code with a colored bubble.
 */
function getWorkerDisplayHtml(workerCode, users) {
    if (!workerCode || workerCode === "Pendiente") {
        return `
            <div style="display: flex; align-items: center; gap: 5px;">
                <span class="info-bubble info-bubble-red">Pendiente</span>
            </div>
        `;
    }
    // Safety check for users array
    const worker = Array.isArray(users) ? users.find(u => u.worker_code === workerCode) : null;
    if (worker) {
        const workerNames = worker.names ? `${worker.names}` : '';
        return `
            <div style="display: flex; align-items: center; gap: 5px;">
                <span style="background-color: ${worker.color || '#ccc'}; color: white; border-radius: 12px; padding: 2px 8px; font-size: 0.8em; font-weight: bold;">
                    ${worker.worker_code}
                </span>
                <span>${workerNames}</span>
            </div>
        `;
    }
    return workerCode;
}

/**
 * Helper to render split date bubbles.
 */
function renderDateBubbles(dateString) {
    if (!dateString || dateString === 'Pendiente' || dateString === 'N/A') {
        return '<span class="bubble-gray">--/--/--</span> <span class="bubble-gray">--:--</span>';
    }
    try {
        const parts = String(dateString).split(' ');
        if (parts.length >= 2) {
            return `<span class="bubble-gray">${parts[0]}</span> <span class="bubble-gray">${parts[1]}</span>`;
        }
        return `<span class="bubble-gray">${dateString}</span>`;
    } catch (e) {
        return `<span class="bubble-gray">${dateString}</span>`;
    }
}

/**
 * Renders a list of products to the page.
 */
function renderProductList(products) {
    const productList = document.getElementById('product-list');
    const template = document.getElementById('product-card-template');

    if (!productList || !template) {
        console.error("Missing product list container or template.");
        return;
    }

    // Clear any existing content
    productList.innerHTML = '';

    if (products && products.length > 0) {
        products.forEach((product, index) => {
            try {
                const card = createProductCard(template, product, index + 1);
                if (card) {
                    productList.appendChild(card);
                    initializeCard(card, product);
                }
            } catch (err) {
                console.error("Error creating card for product:", product, err);
            }
        });
    } else {
        productList.innerHTML = `<div class="error-message">No se encontraron productos que coincidan con el filtro.</div>`;
    }

    // Re-initialize icons after rendering
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Fetches the latest assignment data from the server.
 */
async function fetchLatestAssignment(localId) {
    try {
        const response = await fetch(`/api/assignment/latest/${localId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        allProducts = data.productos || [];

        if (Array.isArray(allProducts) && allProducts.length > 0) {
            // Check for an active filter button in the UI (default is usually 'asignados')
            const activeBtn = document.querySelector('#filter-controls .filter-btn.active');
            if (activeBtn) {
                // If there's an active button, simulate a click or call applyFilter
                // Using click ensures the UI logic runs exactly as if the user clicked it
                activeBtn.click();
            } else {
                // Fallback: Default to 'asignados' if no button is active
                const user = Auth.getUser();
                if (user) {
                    applyFilter('asignados', user);
                } else {
                    renderProductList(allProducts);
                }
            }
        } else {
            showNoInventoryError();
        }
    } catch (error) {
        console.error("Error fetching latest inventory:", error);
        showNoInventoryError();
    }
}

function createProductCard(template, product, index) {
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.product-card');
    if (!card) return null;
    populateCard(card, product, index);
    return card;
}

function populateCard(card, product, index) {
    const codeEl = card.querySelector('.product-code');
    const nameEl = card.querySelector('.product-name');
    const systemQtyEl = card.querySelector('.btn-sistema .quantity-value');
    const inventoryIndexEl = card.querySelector('.inventory-index');
    const realValueElement = card.querySelector('.btn-real .quantity-value');
    card.dataset.productCode = normalizeProductCode(product.codigo);

    if (codeEl) codeEl.textContent = product.codigo || 'N/A';
    if (nameEl) nameEl.textContent = product.nombre || 'Sin Nombre';
    if (systemQtyEl) systemQtyEl.textContent = product.cantidad !== undefined ? product.cantidad : 0;
    if (inventoryIndexEl) inventoryIndexEl.textContent = `#${index}`;

    // Set unique IDs
    const statusEl = card.querySelector('#status-1');
    if (statusEl) statusEl.id = `status-${index}`;

    const reviewerNameEl = card.querySelector('#reviewer-name-1');
    if (reviewerNameEl) reviewerNameEl.id = `reviewer-name-${index}`;

    const reviewDateEl = card.querySelector('#review-date-1');
    if (reviewDateEl) reviewDateEl.id = `review-date-${index}`;

    const transitEl = card.querySelector('#transit-val-1');
    if (transitEl) transitEl.id = `transit-val-${index}`;

    const expiryEl = card.querySelector('#expiry-val-1');
    if (expiryEl) expiryEl.id = `expiry-val-${index}`;

    // Initialize real value
    if (realValueElement) {
        const initialReal = product.real !== undefined ? product.real : (product.cantidad || 0);
        realValueElement.textContent = initialReal;
    }

    // Almacenamiento (Storage Type)
    const storageTypeBubble = card.querySelector('.card-section.info-grid .info-item:first-child .info-bubble');
    if (storageTypeBubble) {
        const storageValue = product.almacenamiento || 'Estándar'; // Default to "Estándar" if not defined
        storageTypeBubble.textContent = storageValue;
        storageTypeBubble.className = 'info-bubble'; // Reset class
        if (storageValue === 'Estándar') {
            storageTypeBubble.classList.add('info-bubble-gray');
        } else {
            storageTypeBubble.classList.add('info-bubble-red');
        }
    }

    // Ensure product.estado is always set
    if (!product.estado) {
        product.estado = 'Pendiente';
    }

    if (reviewerNameEl) {
        reviewerNameEl.innerHTML = getWorkerDisplayHtml(product.encargado, allUsers);
    }

    if (reviewDateEl) {
        reviewDateEl.innerHTML = renderDateBubbles(product.fecha_revision || 'Pendiente');
    }

    // Status Bubble
    if (statusEl) {
        const bubble = statusEl;
        bubble.textContent = product.estado;
        bubble.className = 'info-bubble';
        if (product.estado === 'Revisado') {
            bubble.classList.add('info-bubble-green');
        } else if (product.estado === 'Pendiente') {
            bubble.classList.add('info-bubble-red');
        } else {
            bubble.classList.add('info-bubble-blue');
        }
    }

    // Transit
    if (transitEl) {
        const transitVal = product.transito !== undefined ? product.transito : 0;
        transitEl.textContent = transitVal;
        transitEl.className = '';
        if (parseInt(transitVal) === 0) {
            transitEl.classList.add('bubble-gray');
        } else {
            transitEl.classList.add('bubble-red');
        }
    }

    // Expiry
    if (expiryEl) {
        const expiryVal = product.vencimiento ? product.vencimiento : 'NO';
        expiryEl.textContent = expiryVal;
        expiryEl.className = '';
        if (expiryVal === 'NO') {
            expiryEl.classList.add('bubble-gray');
        } else {
            expiryEl.classList.add('bubble-green');
        }
    }
}

function showNoInventoryError() {
    const productList = document.getElementById('product-list');
    if (!productList) return;
    productList.innerHTML = `<div class="error-message">No se encontró inventario para este local.</div>`;
}

function initializeCard(card, product) {
    const user = Auth.getUser();
    const realValueElement = card.querySelector('.btn-real .quantity-value');
    const systemValueElement = card.querySelector('.btn-sistema .quantity-value');
    const diferenciaValueElement = card.querySelector('.btn-diferencia .quantity-value');
    const diferenciaButton = card.querySelector('.btn-diferencia');
    const systemButton = card.querySelector('.btn-sistema');
    const realButton = card.querySelector('.btn-real');
    const extraCountsContainer = card.querySelector('.extra-counts-container');

    const btnPlus = card.querySelector('.btn-plus');
    const btnMinus = card.querySelector('.btn-minus');
    const btnClear = card.querySelector('.btn-clear');
    const btnStar = card.querySelector('.favorite-star');
    const actionBtnStar = card.querySelector('.btn-star');
    const codeEl = card.querySelector('.product-code');

    // Robust ID extraction
    let cardIndex = 0;
    const inventoryIndexEl = card.querySelector('.inventory-index');
    if (inventoryIndexEl && inventoryIndexEl.textContent) {
        cardIndex = parseInt(inventoryIndexEl.textContent.replace('#', '')) || 0;
    }

    // Select via IDs
    const reviewDateElement = card.querySelector(`#review-date-${cardIndex}`);
    const reviewerNameElement = card.querySelector(`#reviewer-name-${cardIndex}`);
    const estadoElement = card.querySelector(`#status-${cardIndex}`);

    let baseRealValue = product.real !== undefined ? product.real : (product.cantidad || 0);

    // Initial logic to sync specific elements if needed
    // (Most work done in populateCard, but interactive logic needs baseRealValue)

    // Helper to Save
    async function saveProductRevision(updatedProduct) {
        if (!user || !user.locale_id) return false;
        try {
            const response = await fetch(`/api/inventory/revision/${user.locale_id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${user.token}`
                },
                body: JSON.stringify(updatedProduct)
            });
            if (!response.ok) return false;
            return true;
        } catch (error) {
            console.error("Error saving:", error);
            return false;
        }
    }

    async function updateReviewInfo(performSave = false, isClearAction = false) {
        const now = new Date();
        const formattedDate = now.toLocaleString('es-CL');

        const originalEstado = product.estado;
        const originalEncargado = product.encargado;
        const originalFechaRevision = product.fecha_revision;

        if (performSave) {
            if (!isClearAction) {
                product.fecha_revision = formattedDate;
                product.encargado = user.worker_code;
                product.estado = 'Revisado';
            }
        }

        product.real = parseInt(realValueElement.textContent) || 0;
        product.diferencia = parseInt(diferenciaValueElement.textContent) || 0;

        // Update UI
        if (reviewDateElement) reviewDateElement.innerHTML = renderDateBubbles(product.fecha_revision);
        if (reviewerNameElement) reviewerNameElement.innerHTML = getWorkerDisplayHtml(product.encargado, allUsers);

        if (estadoElement) {
            const bubble = estadoElement;
            bubble.textContent = product.estado;
            bubble.className = 'info-bubble';
            if (product.estado === 'Revisado') bubble.classList.add('info-bubble-green');
            else if (product.estado === 'Pendiente') bubble.classList.add('info-bubble-red');
            else bubble.classList.add('info-bubble-blue');
        }

        if (performSave) {
            const saveSuccessful = await saveProductRevision(product);
            if (!saveSuccessful) {
                // Revert
                product.estado = originalEstado;
                product.encargado = originalEncargado;
                product.fecha_revision = originalFechaRevision;

                // Re-render
                if (reviewDateElement) reviewDateElement.innerHTML = renderDateBubbles(product.fecha_revision);
                if (reviewerNameElement) reviewerNameElement.innerHTML = getWorkerDisplayHtml(product.encargado, allUsers);
                if (estadoElement) {
                    const bubble = estadoElement;
                    bubble.textContent = product.estado;
                    bubble.className = 'info-bubble';
                    if (product.estado === 'Revisado') bubble.classList.add('info-bubble-green');
                    else if (product.estado === 'Pendiente') bubble.classList.add('info-bubble-red');
                    else bubble.classList.add('info-bubble-blue');
                }
            }
        }
    }

    function updateDiferencia() {
        const real = parseInt(realValueElement.textContent) || 0;
        const sistema = parseInt(systemValueElement.textContent) || 0;
        const diferencia = real - sistema;
        diferenciaValueElement.textContent = diferencia;

        diferenciaButton.classList.remove('diferencia-zero', 'diferencia-positive', 'diferencia-negative');

        if (diferencia === 0) {
            diferenciaButton.classList.add('diferencia-zero');
        } else if (diferencia > 0) {
            diferenciaButton.classList.add('diferencia-positive');
        } else {
            diferenciaButton.classList.add('diferencia-negative');
        }
    }

    function clearExtraCounts() {
        while (extraCountsContainer.firstChild) {
            extraCountsContainer.removeChild(extraCountsContainer.firstChild);
        }
        extraCountsContainer.style.display = 'none';
        recalculateRealValueAndDiferencia(true);
    }

    function recalculateRealValueAndDiferencia(performSave = false, isClearAction = false) {
        let extraSum = 0;
        const hasExtraInputs = extraCountsContainer.style.display !== 'none' && extraCountsContainer.children.length > 0;

        if (hasExtraInputs) {
            extraCountsContainer.querySelectorAll('.extra-count-input').forEach(input => {
                const val = parseInt(input.value);
                if (!isNaN(val) && val >= 0) {
                    extraSum += val;
                }
            });
            realValueElement.textContent = extraSum;
        } else {
            realValueElement.textContent = baseRealValue;
        }
        updateDiferencia();
        updateReviewInfo(performSave, isClearAction);
    }

    function createExtraCountInput(initialValue = '') {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('extra-count-item');

        const input = document.createElement('input');
        input.type = 'number';
        input.classList.add('extra-count-input');
        input.value = initialValue;
        input.placeholder = 'Cantidad';
        input.min = "0";

        const deleteButton = document.createElement('button');
        deleteButton.classList.add('remove-extra-count-btn');
        deleteButton.innerHTML = '<i data-lucide="x"></i>';
        if (window.lucide) window.lucide.createIcons();

        input.addEventListener('input', () => {
            let val = parseInt(input.value);
            if (isNaN(val) || val < 0) {
                input.value = Math.max(0, val || 0);
            }
            recalculateRealValueAndDiferencia(true);
        });

        input.addEventListener('blur', () => {
            if (!document.body.contains(input)) return;
            if (input.value.trim() !== '' && input.parentElement === extraCountsContainer.lastElementChild) {
                createExtraCountInput();
            }
            recalculateRealValueAndDiferencia(true);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (input.value.trim() !== '') {
                    const nextInput = input.parentElement.nextElementSibling?.querySelector('input');
                    if (nextInput) {
                        nextInput.focus();
                    } else {
                        createExtraCountInput();
                    }
                }
            }
        });

        deleteButton.addEventListener('click', () => {
            itemDiv.remove();
            recalculateRealValueAndDiferencia(true);
            if (extraCountsContainer.style.display !== 'none' && extraCountsContainer.children.length === 0) {
                clearExtraCounts();
            }
        });

        itemDiv.appendChild(input);
        itemDiv.appendChild(deleteButton);
        extraCountsContainer.appendChild(itemDiv);
        input.focus();
    }

    if (systemButton) {
        systemButton.addEventListener('click', () => {
            baseRealValue = parseInt(systemValueElement.textContent) || 0;
            clearExtraCounts();
        });
    }

    if (realButton) {
        realButton.addEventListener('click', () => {
            realValueElement.contentEditable = true;
            realValueElement.classList.add('editing');
            realValueElement.focus();
            document.execCommand('selectAll', false, null);

            function handleValueUpdate() {
                realValueElement.contentEditable = false;
                realValueElement.classList.remove('editing');
                let parsedValue = parseInt(realValueElement.textContent);
                if (isNaN(parsedValue) || parsedValue < 0) parsedValue = 0;
                baseRealValue = parsedValue;
                recalculateRealValueAndDiferencia(true);
            }

            realValueElement.addEventListener('blur', handleValueUpdate, { once: true });
            realValueElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    realValueElement.blur();
                }
            });
        });
    }

    // Trigger animations
    const triggerAnimation = (btn, animationClass) => {
        if (!btn) return;
        btn.classList.remove(animationClass);
        void btn.offsetWidth;
        btn.classList.add(animationClass);
        setTimeout(() => btn.classList.remove(animationClass), 400);
    };

    if (btnPlus) {
        btnPlus.addEventListener('click', () => {
            triggerAnimation(btnPlus, 'animate-success');
            baseRealValue++;
            recalculateRealValueAndDiferencia(true);
        });
    }

    if (btnMinus) {
        btnMinus.addEventListener('click', () => {
            triggerAnimation(btnMinus, 'animate-primary');
            if (baseRealValue > 0) baseRealValue--;
            recalculateRealValueAndDiferencia(true);
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            triggerAnimation(btnClear, 'animate-danger');
            baseRealValue = 0;

            product.estado = 'Pendiente';
            product.encargado = 'Pendiente';
            product.fecha_revision = 'Pendiente';

            recalculateRealValueAndDiferencia(true, true);
        });
    }

    if (diferenciaButton) {
        diferenciaButton.addEventListener('click', () => {
            if (extraCountsContainer.style.display === 'none') {
                extraCountsContainer.style.display = 'block';
                if (extraCountsContainer.children.length === 0) createExtraCountInput();
            } else {
                clearExtraCounts();
            }
        });
    }

    const toggleFavorite = () => {
        product.destacado = (product.destacado === 'SI') ? 'NO' : 'SI';

        const headerStar = card.querySelector('.favorite-star');
        const buttonStar = card.querySelector('.btn-star');

        if (headerStar) headerStar.classList.toggle('favorited', product.destacado === 'SI');
        if (buttonStar) buttonStar.classList.toggle('favorited', product.destacado === 'SI');

        recalculateRealValueAndDiferencia(true);
    };

    if (btnStar) btnStar.addEventListener('click', toggleFavorite);
    if (actionBtnStar) actionBtnStar.addEventListener('click', toggleFavorite);

    recalculateRealValueAndDiferencia();

    // --- Modal ---
    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image');
    const modalLoader = document.getElementById('modal-loader');

    if (codeEl && imageModal) {
        codeEl.addEventListener('click', async () => {
            // 1. Reset & Setup UI
            imageModal.style.display = 'flex';

            const modalCode = document.getElementById('modal-product-code');
            const modalName = document.getElementById('modal-product-name');
            const modalBadge = document.getElementById('modal-source-badge');
            const modalMsg = document.getElementById('modal-message');

            if (modalCode) modalCode.textContent = product.codigo || 'N/A';
            if (modalName) modalName.textContent = product.nombre || 'Sin Nombre';

            if (modalLoader) modalLoader.style.display = 'block';
            if (modalImage) {
                modalImage.style.display = 'none';
                modalImage.src = '';
                modalImage.onload = null;
                modalImage.onerror = null;
            }
            if (modalBadge) modalBadge.style.display = 'none';
            if (modalMsg) {
                modalMsg.style.display = 'none';
                modalMsg.textContent = 'No hay imágenes disponibles';
            }

            // Helpers
            const setUIState = (src, label) => {
                if (modalLoader) modalLoader.style.display = 'none';
                if (modalImage) {
                    modalImage.src = src;
                    modalImage.style.display = 'block';
                }
                if (modalBadge) {
                    modalBadge.textContent = label;
                    modalBadge.style.display = 'block';
                }
            };

            const showError = (msg) => {
                if (modalLoader) modalLoader.style.display = 'none';
                if (modalMsg) {
                    modalMsg.textContent = msg;
                    modalMsg.style.display = 'block';
                    setTimeout(() => {
                        imageModal.style.display = 'none';
                    }, 1500);
                }
            };

            const tryLoad = (src) => {
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(src);
                    img.onerror = () => reject();
                    img.src = src;
                });
            };

            // // 2. Logic: Internet -> Local -> Error
            // const internetUrl = product.link ? `/api/proxy?url=${encodeURIComponent(product.link)}` : null;
            // const localUrl = product.link2 ? `../${product.link2}` : null;

            // let loaded = false;

            // // Scenario 1: Try Internet first
            // if (internetUrl) {
            //     try {
            //         await tryLoad(internetUrl);
            //         setUIState(internetUrl, 'Internet');
            //         loaded = true;
            //     } catch (e) {
            //         // Fallthrough to local
            //     }
            // }

            // // Scenario 2: Try Local (only if not already loaded)
            // if (!loaded && localUrl) {
            //     try {
            //         await tryLoad(localUrl);
            //         setUIState(localUrl, 'Archivo Local');
            //         loaded = true;
            //     } catch (e) {
            //         // Fallthrough to error
            //     }
            // }

            // // Scenario 3: Neither worked
            // if (!loaded) {
            //     showError('No hay imágenes disponibles');
            // }

            // 2. Logic: Internet (html o imagen directa) -> Local -> Error

            const internetPageUrl = product.link
                ? `/api/proxy?url=${encodeURIComponent(product.link)}`
                : null;

            const localUrl = product.link2 ? `../${product.link2}` : null;

            let loaded = false;

            /* =========================
            INTERNET (HTML o imagen)
            ========================= */
            if (internetPageUrl) {
                try {
                    const response = await fetch(internetPageUrl);

                    if (response.ok) {
                        const contentType = response.headers.get("content-type") || "";

                        let finalImageUrl = null;

                        // 👉 Si el proxy devuelve HTML, extraemos la imagen
                        if (contentType.includes("text/html")) {

                            const html = await response.text();
                            const extracted = extractImageSrc(html);

                            if (extracted) {
                                finalImageUrl = extracted;
                            }

                        } else {
                            // 👉 Si no es HTML, asumimos que ya es una imagen directa
                            finalImageUrl = internetPageUrl;
                        }

                        if (finalImageUrl) {
                            await tryLoad(finalImageUrl);
                            setUIState(finalImageUrl, 'Internet');
                            loaded = true;
                        }
                    }

                } catch (e) {
                    // fallback a local
                }
            }

            /* =========================
            LOCAL
            ========================= */
            if (!loaded && localUrl) {
                try {
                    await tryLoad(localUrl);
                    setUIState(localUrl, 'Archivo Local');
                    loaded = true;
                } catch (e) {
                    // fallback a error
                }
            }

            /* =========================
            ERROR
            ========================= */
            if (!loaded) {
                showError('No hay imágenes disponibles');
            }



        });
    }
}

function extractImageSrc(htmlContent) {
    const regex = /<img[^>]+src="([^"]*vtexassets[^"]*)"[^>]*class="[^"]*vtex-product-summary-2-x-imageNormal[^"]*"/;
    const match = htmlContent.match(regex);
    if (match && match[1]) {
        return match[1];
    }
    return '';
}

function focusProductFromQuery(user) {
    const params = new URLSearchParams(window.location.search);
    let requestedFilter = String(params.get('filter') || '').trim().toLowerCase();
    const requestedCode = normalizeProductCode(params.get('code'));
    const shouldAutoEdit = params.get('edit') === '1';
    const validFilters = new Set(['asignados', 'pendientes', 'revisados', 'destacados', 'todos']);

    if (requestedCode && !requestedFilter) requestedFilter = 'todos';
    if (requestedFilter && validFilters.has(requestedFilter)) {
        applyFilter(requestedFilter, user);
    }

    if (!requestedCode) return;

    const findCard = () => {
        return Array.from(document.querySelectorAll('.product-card'))
            .find(card => normalizeProductCode(card.dataset.productCode) === requestedCode);
    };

    let card = findCard();
    if (!card && requestedFilter !== 'todos') {
        applyFilter('todos', user);
        card = findCard();
    }
    if (!card) return;

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('product-card-target');
    setTimeout(() => card.classList.remove('product-card-target'), 2400);

    const realButton = card.querySelector('.btn-real');
    if (!realButton) return;
    realButton.focus({ preventScroll: true });
    if (shouldAutoEdit) realButton.click();
}

document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay('Cargando datos de revisión...');
    // Auth Check
    const user = Auth.checkAuth();
    if (!user) {
        hideLoadingOverlay();
        return; // Auth handles redirect
    }

    // Layout
    const toggleBtn = document.getElementById('toggle-filter-btn');
    const filterSubheader = document.getElementById('filter-subheader');
    if (toggleBtn && filterSubheader) {
        toggleBtn.addEventListener('click', () => {
            filterSubheader.classList.toggle('hidden');
            toggleBtn.classList.toggle('active');
        });
    }

    // User Info
    const userNameText = document.getElementById('user-name-text');
    const userCargoText = document.getElementById('user-cargo-text');
    const userSigla = document.getElementById('user-sigla');
    const logoutBtn = document.getElementById('logout-btn');

    if (userNameText) userNameText.textContent = user.names;
    if (userCargoText) userCargoText.textContent = user.cargo;
    if (userSigla && user.names) {
        const parts = user.names.split(' ').filter(Boolean);
        userSigla.textContent = parts.length > 0 ? parts[0].substring(0, 2).toUpperCase() : '--';
    }
    if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

    // Filters logic (Listener moved before fetch)
    const filterControls = document.getElementById('filter-controls');
    if (filterControls) {
        filterControls.addEventListener('click', (event) => {
            const target = event.target.closest('.filter-btn');
            if (target) {
                const filterType = target.dataset.filter;
                applyFilter(filterType, user);
            }
        });
    }

    try {
        // Fetch Users (Non-blocking for UI)
        try {
            allUsers = await Auth.fetchUsers();
        } catch (error) {
            console.warn("Could not load users list:", error);
            allUsers = []; // Continue without users
        }

        // Fetch Inventory
        if (user.locale_id) {
            await fetchLatestAssignment(user.locale_id);
            focusProductFromQuery(user);
        } else {
            showNoInventoryError();
        }

        // Global Modal Events
        const modal = document.getElementById('image-modal');
        if (modal) {
            const closeBtn = modal.querySelector('.close-button');
            if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
            window.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }
    } finally {
        hideLoadingOverlay();
    }
});
