import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs";

// Set the workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs`;

export const updateButtonState = (button, btnSpan, state, message, isTemporary = false) => {
    button.disabled = state === 'processing';
    button.classList.remove('btn-primary', 'btn-success', 'btn-danger');

    let icon;
    let btnClass;

    switch (state) {
        case 'success':
            icon = 'check-circle';
            btnClass = 'btn-success';
            break;
        case 'error':
            icon = 'x-circle';
            btnClass = 'btn-danger';
            break;
        case 'processing':
            icon = 'refresh-cw'; // A spinning icon could be set with CSS
            btnClass = 'btn-primary';
            break;
        default: // idle
            icon = 'upload'; // New icon for "Cargar Datos"
            btnClass = 'btn-primary';
            break;
    }
    
    btnSpan.textContent = message;

    // Find and remove the old icon (which is likely an SVG after the first render)
    const oldIcon = button.querySelector('svg');
    if (oldIcon) {
        oldIcon.remove();
    }
    
    // Remove any lingering <i> tag if it exists
    const oldI = button.querySelector('i');
    if (oldI) {
        oldI.remove();
    }

    // Create and prepend the new icon element
    const newIcon = document.createElement('i');
    newIcon.setAttribute('data-lucide', icon);
    button.prepend(newIcon);

    button.classList.add(btnClass);
    lucide.createIcons();

    if (isTemporary && (state === 'success' || state === 'error')) {
        setTimeout(() => {
            updateButtonState(button, btnSpan, 'idle', 'Cargar Datos');
        }, 2000); // 2 seconds
    }
};

export const processPdfFile = (file, localId, experimentalPdfBtn, btnSpan) => {
    return new Promise((resolve, reject) => {
        if (!file || file.type !== 'application/pdf') {
            updateButtonState(experimentalPdfBtn, btnSpan, 'error', 'Seleccione un PDF', true);
            console.error('No file selected or invalid file type.');
            return reject('Invalid file');
        }

        updateButtonState(experimentalPdfBtn, btnSpan, 'processing', 'Procesando...');

        const reader = new FileReader();
        reader.onload = async function (e) {
            const typedarray = new Uint8Array(e.target.result);

            try {
                const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
                const allReconstructedLines = [];
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    if (textContent.items.length === 0) continue;

                    const lines = new Map();
                    textContent.items.forEach(item => {
                        const y = Math.round(item.transform[5]);
                        if (!lines.has(y)) lines.set(y, []);
                        lines.get(y).push({ x: Math.round(item.transform[4]), text: item.str.trim() });
                    });

                    const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);
                    for (const y of sortedY) {
                        const lineText = lines.get(y).sort((a, b) => a.x - b.x).map(item => item.text).join(' ').trim();
                        if (lineText) allReconstructedLines.push(lineText);
                    }
                }

                const reconstructedText = allReconstructedLines.join(' ').replace(/\s+/g, ' ').trim();
                const first70Chars = reconstructedText.slice(0, 70).toUpperCase();
                if (!first70Chars.includes('EXISTENCIAS')) {
                    const invalidMsg = 'Archivo incorrecto: se espera un archivo de Inventario en formato PDF.';
                    updateButtonState(experimentalPdfBtn, btnSpan, 'error', 'Archivo incorrecto', true);
                    return reject(new Error(invalidMsg));
                }

                const allParsedItems = [];
                const codigoRegex = /^([A-Z]{2,}\d+(?: \*)?|\d+)/;
                const nombreCantidadRegex = /^(.+?)\s+(\d+)$/;
                let reportDate = new Date();

                for (let i = 0; i < allReconstructedLines.length; i++) {
                    const currentLine = allReconstructedLines[i];
                    const dateMatch = currentLine.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);
                    if (dateMatch) {
                        const dateParts = dateMatch[1].split(/[\/-]/);
                        if (dateParts.length === 3) {
                            reportDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
                        }
                    }
                    if (i < allReconstructedLines.length - 1) {
                        const nextLine = allReconstructedLines[i + 1];
                        const codigoMatch = currentLine.match(codigoRegex);
                        if (codigoMatch) {
                            const nombreCantidadMatch = nextLine.match(nombreCantidadRegex);
                            if (nombreCantidadMatch) {
                                if (nombreCantidadMatch[1].toUpperCase().includes('SUCURSAL')) {
                                    continue;
                                }
                                allParsedItems.push({
                                    codigo: codigoMatch[1].trim(),
                                    nombre: nombreCantidadMatch[1].trim(),
                                    cantidad: nombreCantidadMatch[2].trim()
                                });
                                i++;
                            }
                        }
                    }
                }

                if (allParsedItems.length > 0) {
                    const processingDate = new Date();
                    const originalDate = reportDate;
                    const fileNameDate = `${processingDate.getFullYear()}.${(processingDate.getMonth() + 1).toString().padStart(2, '0')}.${processingDate.getDate().toString().padStart(2, '0')}`;
                    const originalDateFormatted = `${originalDate.getFullYear()}-${(originalDate.getMonth() + 1).toString().padStart(2, '0')}-${originalDate.getDate().toString().padStart(2, '0')}`;

                    const jsonToSave = {
                        fecha_procesado: processingDate.toISOString(),
                        fecha_original: originalDateFormatted,
                        total_productos: allParsedItems.length,
                        productos: allParsedItems.map((item, index) => ({
                            n: index + 1,
                            codigo: item.codigo,
                            nombre: item.nombre,
                            cantidad: parseInt(item.cantidad, 10)
                        }))
                    };
                    const jsonContent = JSON.stringify(jsonToSave, null, 2);
                    const tableForDisplay = "N\tCódigo\tNombre\tCantidad\n" + allParsedItems.map((item, index) => `${index + 1}\t${item.codigo}\t${item.nombre}\t${item.cantidad}`).join('\n');

                    try {
                        const response = await fetch('/api/exp/save-processed', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ local: localId, date: fileNameDate, jsonContent: jsonContent, tableContent: tableForDisplay })
                        });
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                        const result = await response.json();
                        if (result.success) {
                            console.log(`Archivos guardados: JSON: ${result.jsonPath}, TXT: ${result.txtPath}`);
                            updateButtonState(experimentalPdfBtn, btnSpan, 'success', 'Procesado correctamente', true);
                            resolve({
                                productos: jsonToSave.productos,
                                fechaProcesado: jsonToSave.fecha_procesado
                            });
                        } else {
                            throw new Error(result.error || 'Error desconocido al guardar.');
                        }
                    } catch (saveError) {
                        console.error('Error al guardar los archivos:', saveError);
                        updateButtonState(experimentalPdfBtn, btnSpan, 'error', 'Error al Guardar', true);
                        reject(saveError.message);
                    }
                } else {
                    console.log('No se encontraron ítems con el formato esperado en el PDF.');
                    updateButtonState(experimentalPdfBtn, btnSpan, 'error', 'No se encontraron datos', true);
                    resolve({
                        productos: [],
                        fechaProcesado: null
                    });
                }
            } catch (error) {
                console.error('Error procesando el PDF:', error);
                updateButtonState(experimentalPdfBtn, btnSpan, 'error', 'Error de PDF', true);
                reject(error.message);
            }
        };
        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            updateButtonState(experimentalPdfBtn, btnSpan, 'error', 'Error de lectura', true);
            reject('File reading error');
        };
        reader.readAsArrayBuffer(file);
    });
};
