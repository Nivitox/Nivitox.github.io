import { Auth } from '/core/js/auth.js';
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs';
import { showLoadingOverlay, hideLoadingOverlay } from '/core/js/ui-feedback.js';

// Configure the workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

let currentUser = null;

// --- Helper Functions (Copied from inventario.js for PDF processing) ---

function parsePrice(priceString) {
    if (typeof priceString !== 'string') {
        return parseFloat(priceString); // Already a number or can be parsed directly
    }
    // Remove currency symbols, thousand separators ('.'), and replace comma (',') with dot ('.') for decimals
    const cleanedString = priceString.replace(/[$.]/g, '').replace(',', '.');
    return parseInt(cleanedString, 10); // Convert to integer
}

const codeBlocklist = ['sucursal', 'reporte', 'farmacias', 'código', 'información', 'pagina'];

function parseRawPdfText(data) {
    const lines = data.split('\n');
    const items = [];

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Split by tab for q.txt format
        const columns = trimmedLine.split('\t');

        if (columns.length >= 3) {
            const quantity = columns[0].trim();
            const name = columns[1].trim();
            const code_val = columns[2].trim();

            // Clean code for blocklist check (remove asterisks and trim)
            const cleanCodeForBlocklist = code_val.replace(/\*|\s/g, '').trim();
            if (codeBlocklist.includes(cleanCodeForBlocklist.toLowerCase())) {
                continue;
            }

            items.push({
                code: code_val,
                name: name,
                quantity: parseInt(quantity, 10)
            });
        } else {
             // console.warn(`Line did not match expected format (tab-separated with at least 3 columns): ${trimmedLine}`);
        }
    }
    return items;
}

function finalizeProcessedData(preliminaryItems, priceMap) {
    return preliminaryItems.map((item, index) => {
        const code = item.code || '';
        const systemValue = item.quantity || 0;
        const realValue = 0;

        const cleanCode = code.replace(/\*|\s/g, '').trim(); // Remove all asterisks and spaces for cleanCode

        return {
            correlative: index + 1,
            code: code, // Keep the original code with asterisk for item.code
            name: item.name || 'N/A',
            systemValue: systemValue,
            favorite: false,
            link: `www.drsimi.cl/${cleanCode}`,
            link2: `/images/${cleanCode}.webp`,
            storage: 'Estándar',
            status: 'Pendiente',
            revisadoPor: '',
            fechaRevision: '',
            transit: 0,
            expiry: 'NO',
            realValue: realValue,
            diferenciaValue: realValue - systemValue,
            precio: priceMap.get(cleanCode) || ''
        };
    });
}

async function processAndDisplayPdf(pdfDataURL, localeId) {
    try {
        const base64 = pdfDataURL.split(',')[1];
        const typedarray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const pdfPage = await pdf.getPage(i);
            const textContent = await pdfPage.getTextContent();
            
            const lines = {};
            const TOLERANCE = 5;
            textContent.items.forEach(item => {
                const y = Math.round(item.transform[5] / TOLERANCE) * TOLERANCE;
                if (!lines[y]) lines[y] = [];
                lines[y].push({ text: item.str, x: item.transform[4] });
            });
            const sortedLines = Object.keys(lines).sort((a, b) => b - a).map(y => lines[y].sort((a, b) => a.x - b.x).map(item => item.text).join(' '));
            fullText += sortedLines.join('\n') + '\n';
        }

        // VALIDATION: This can be improved to be more robust
        const expectedPhrase = "EXISTENCIAS";
        if (!fullText.substring(0, 100).toUpperCase().includes(expectedPhrase)) {
            alert(`Archivo incorrecto. Use el reporte "${expectedPhrase}". Redirigiendo...`);
            window.location.href = '/pages/inventario.html';
            return;
        }

        const preliminaryItems = parseRawPdfText(fullText);
        console.log('Preliminary Items from PDF:', preliminaryItems); // Added for debugging
        

        const pricesUrl = `/data/${localeId}/inventario/listadeproductos.json`;
        const pricesResponse = await fetch(pricesUrl);
        if (!pricesResponse.ok) {
            throw new Error(`Error del servidor al cargar lista de precios: ${pricesResponse.status} ${pricesResponse.statusText}`);
        }
        const pricesData = await pricesResponse.json();
        const priceMap = new Map(pricesData.productos.map(p => [p.codigo, p.precio]));

        const processedItems = finalizeProcessedData(preliminaryItems, priceMap);
        console.log('Processed Items from PDF:', processedItems); // Added for debugging
        renderProcessedInventory(processedItems, document.getElementById('inventory-table-body'));
        await saveInventoryData(processedItems, localeId);

    } catch (error) {
        console.error('Error processing PDF in invefull.js:', error);
        alert('Error al procesar el PDF. Asegúrese de que es un archivo válido. Redirigiendo...');
        window.location.href = '/pages/inventario.html';
    }
}




async function saveInventoryData(items, localeId) {
    try {
        const response = await fetch(`/api/inventory/save-daily/${localeId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(items) // Send just the items array
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Inventario guardado:', result);
        alert('Inventario guardado exitosamente.');

    } catch (error) {
        console.error('Error al guardar los datos del inventario:', error);
        alert('Error al guardar el inventario. Verifique la consola para más detalles.');
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
            <td>${item.correlative}</td>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td>${item.systemValue}</td>
            <td>${item.realValue}</td>
            <td>${item.diferenciaValue}</td>
            <td>${priceFormatted}</td>
            <td>${item.transit}</td>
            <td>${item.expiry}</td>
            <td class="status-${item.status.toLowerCase()}">${item.status}</td>
            <td>${item.revisadoPor}</td>
            <td>${item.fechaRevision}</td>
            <td>${favIcon}</td>
            <td>${item.storage}</td>
            <td><a href="http://${item.link}" target="_blank" title="${item.link}">Ver</a></td>
            <td><a href="${item.link2}" target="_blank" title="${item.link2}">Imagen</a></td>
        `;
        fragment.appendChild(row);
    });

    container.appendChild(fragment);
    lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', async () => {
    showLoadingOverlay('Cargando inventario completo...');
    currentUser = Auth.checkAuth();
    if (!currentUser) {
        console.error('Authentication failed. Redirecting to login.');
        Auth.logout();
        hideLoadingOverlay();
        return;
    }
    try {
        setupHeader(currentUser);

        const pdfDataURL = sessionStorage.getItem('uploadedPdfDataURL');
        const pdfFileName = sessionStorage.getItem('uploadedPdfFileName');
        sessionStorage.removeItem('uploadedPdfDataURL'); // Clear after use
        sessionStorage.removeItem('uploadedPdfFileName'); // Clear after use

        const rawTextInput = document.getElementById('raw-text-input');
        const processRawTextBtn = document.getElementById('process-raw-text-btn');
        const inputSection = document.querySelector('.input-section'); // The card containing the raw text input

        if (pdfDataURL) {
            // If PDF data is present, process it and hide the raw text input section
            inputSection.style.display = 'none';
            // Display filename (optional, for user feedback)
            const pageTitle = document.querySelector('h1');
            if (pageTitle) {
                pageTitle.textContent = `Inventario Completo - ${pdfFileName}`;
            }
            await processAndDisplayPdf(pdfDataURL, currentUser.locale_id.toLowerCase());
        } else {
            // If no PDF data, show the raw text input section and set up its event listener
            inputSection.style.display = 'block';
            const pageTitle = document.querySelector('h1');
            if (pageTitle) {
                pageTitle.textContent = `Inventario Completo - Entrada Manual`;
            }

            processRawTextBtn.addEventListener('click', async () => {
                const rawText = rawTextInput.value.trim();
                if (rawText) {
                    await processRawTextInput(rawText, currentUser.locale_id.toLowerCase());
                } else {
                    alert('Por favor, pegue el texto del inventario en el área proporcionada.');
                }
            });
        }
    } finally {
        hideLoadingOverlay();
    }
});


