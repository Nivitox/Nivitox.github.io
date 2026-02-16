import { Auth } from '/core/js/auth.js';

let currentProducts = [];
let reportDate = "";

function parsePrice(priceString) {
    if (typeof priceString !== 'string') {
        return parseInt(priceString, 10); // Already a number or can be parsed directly
    }
    // Remove currency symbols, thousand separators ('.'), and replace comma (',') with dot ('.') for decimals
    const cleanedString = priceString.replace(/[$.]/g, '').replace(',', '.');
    return parseInt(cleanedString, 10); // Convert to integer
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Auth & Header
    const user = Auth.checkAuth();
    if (!user) return;
    setupHeader(user);

    // 2. Load data from localStorage and process it
    const pdfData = localStorage.getItem('processedPdfData');
    if (pdfData) {
        parseAndDisplayData(pdfData);
        // Clean up the storage so it's not reused accidentally
        // localStorage.removeItem('processedPdfData'); // Keep it for debugging until we are sure
    } else {
        const tableBody = document.getElementById('products-table-body');
        tableBody.innerHTML = `<tr><td colspan="4">No se encontraron datos de PDF. Por favor, vuelva y cargue un archivo.</td></tr>`;
    }

    // 3. Initialize icons
    lucide.createIcons();
});

/**
 * Parses the raw text data and displays it.
 * This version handles both Price-First and Code-First layouts.
 */
function parseAndDisplayData(data) {
    const tableBody = document.getElementById('products-table-body');
    const dateDisplay = document.getElementById('report-date');
    const saveBtn = document.getElementById('save-btn');

    // 1. Extract Date
    const dateMatch = data.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) {
        reportDate = dateMatch[1];
        dateDisplay.textContent = `Fecha: ${reportDate}`;
    }

    // 2. Extract Sucursal
    const sucursalMatch = data.match(/SUCURSAL\s+(CL\d+)/);
    if (sucursalMatch) {
        console.log("Sucursal encontrada en PDF:", sucursalMatch[1]);
        // This could be used to validate against user.local if needed
    }

    // 3. Extract All Products
    currentProducts = [];
    const lines = data.split('\n');

    /**
     * More robust regex for the product line:
     * 1. Capture the code (alphanumeric at start)
     * 2. Capture the middle section (name and family)
     * 3. Capture the price (starts with $ at the end)
     */
    const productLineRegex = /^([A-Z0-9]+)\s+(.+)\s+(\$\s?[\d.,]+)$/;

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine.includes('$')) return;

        // Try to match the line structure
        const match = trimmedLine.match(productLineRegex);
        if (match) {
            const [_, codigo, middle, precio] = match;

            // Heuristic to split Name and Family:
            // Usually the family is the last block of 3+ uppercase letters
            // separated by at least 2 spaces, or just the last uppercase word.
            let nombre = middle;
            let familia = "GENERAL";

            const parts = middle.split(/\s{2,}/);
            if (parts.length >= 2) {
                nombre = parts.slice(0, -1).join('  ');
                familia = parts[parts.length - 1];
            } else {
                // Fallback: split by last space if no double space exists
                const lastSpace = middle.lastIndexOf(' ');
                if (lastSpace !== -1) {
                    nombre = middle.substring(0, lastSpace);
                    familia = middle.substring(lastSpace + 1);
                }
            }

            // Exclude headers or noise
            if (nombre.toLowerCase().includes('nombre') || familia.toLowerCase().includes('familia')) return;
            if (codigo.length < 1 || nombre.length < 2) return;

            currentProducts.push({
                codigo: codigo.trim(),
                nombre: nombre.trim(),
                familia: familia.trim(),
                precio: parsePrice(precio.trim())
            });
        } else {
            // Check for multi-column layout on this line
            const subParts = trimmedLine.split(/(?=\$\s?\d)/).filter(p => p.includes('$'));
            if (subParts.length > 1) {
                // Process each part if it matches the code-first pattern
                subParts.forEach(part => {
                    const subTrimmed = part.trim();
                    const subMatch = subTrimmed.match(/^([A-Z0-9]+)\s+(.+)\s+(\$\s?[\d.,]+)$/);
                    if (subMatch) {
                        const [__, c, m, p] = subMatch;
                        currentProducts.push({
                            codigo: c.trim(),
                            nombre: m.trim(),
                            familia: "GENERAL",
                            precio: parsePrice(p.trim())
                        });
                    }
                });
            }
        }
    });

    if (currentProducts.length > 0) {
        renderTable();
        // Show and setup save button
        saveBtn.style.display = 'flex';
        saveBtn.onclick = () => saveInventory(false);

        // AUTO-SAVE as requested
        saveInventory(true);
    } else {
        showParsingError(data);
    }
}

function renderTable() {
    const tableBody = document.getElementById('products-table-body');
    tableBody.innerHTML = '';
    currentProducts.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.codigo}</td>
            <td>${p.nombre}</td>
            <td>${p.familia}</td>
            <td>${p.precio.toFixed(0)}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function showParsingError(data) {
    const tableBody = document.getElementById('products-table-body');
    tableBody.innerHTML = `
        <tr><td colspan="4" style="color: var(--danger-color); font-weight: bold; text-align: center; padding: 2rem;">
            No se pudieron extraer productos del PDF automáticamente.
        </td></tr>
        <tr><td colspan="4">
            <div style="background: var(--background-muted); padding: 1rem; border-radius: 4px; font-size: 0.8rem;">
                <strong>Sugerencia:</strong> Verifique que el archivo sea el reporte de "Lista de Productos" estándar.
                <br><br>
                <strong>Datos en bruto (inicio):</strong><br>
                <pre style="white-space: pre-wrap; margin-top: 0.5rem; border: 1px solid var(--border-color); padding: 0.5rem;">${data.substring(0, 800)}...</pre>
            </div>
        </td></tr>`;
}

/**
 * Sends the parsed products to the server.
 * @param {boolean} isAuto - If true, it won't show alerts unless it's an error.
 */
async function saveInventory(isAuto = false) {
    const user = Auth.getUser();
    if (!user || !user.locale_id) {
        if (!isAuto) alert('No se pudo identificar el local del usuario.');
        return;
    }

    const saveBtn = document.getElementById('save-btn');
    const originalContent = saveBtn.innerHTML;

    if (!isAuto) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i><span>Guardando...</span>';
        lucide.createIcons();
    }

    try {
        const response = await fetch('/api/inventory/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                local: user.locale_id,
                products: currentProducts,
                date: reportDate
            })
        });

        if (response.ok) {
            const result = await response.json();
            if (!isAuto) {
                alert(`¡Éxito! La lista ha sido guardada.`);
            } else {
                console.log('Auto-guardado exitoso:', result.path);
                saveBtn.classList.add('bg-success');
                saveBtn.innerHTML = '<i data-lucide="check"></i><span>Guardado Auto.</span>';
                lucide.createIcons();
            }
        } else {
            const err = await response.json();
            throw new Error(err.error || 'Error al guardar.');
        }
    } catch (error) {
        console.error('Error saving inventory:', error);
        if (!isAuto) alert('Error: ' + error.message);
    } finally {
        if (!isAuto) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalContent;
            lucide.createIcons();
        }
    }
}

/**
 * Populates the header with the logged-in user's information.
 */
function setupHeader(user) {
    const userSigla = document.getElementById('user-sigla');
    const userName = document.getElementById('user-name-text');
    const userCargo = document.getElementById('user-cargo-text');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        const initials = (user.names || user.name).split(' ').map(n => n[0]).join('') + (user.last_names ? user.last_names.split(' ').map(n => n[0]).join('') : '');
        userSigla.textContent = initials.toUpperCase().substring(0, 2);
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