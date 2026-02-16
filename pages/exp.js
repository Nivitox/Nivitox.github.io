import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs";
import { Auth } from '/core/js/auth.js';

// Set the workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs`;

document.addEventListener('DOMContentLoaded', () => {
    const user = Auth.checkAuth();
    if (!user) return; // Stop if not authenticated

    const localId = user.locale_id;
    if (!localId) {
        console.error("El usuario no tiene un 'local_id' asignado.");
        alert("Error: No tiene un local asignado. No se pueden guardar archivos.");
        return;
    }

    const processBtn = document.getElementById('process-pdf-btn');
    const pdfUpload = document.getElementById('pdf-upload');
    const resultsContainer = document.getElementById('results-container');
    const fileContentEl = document.getElementById('file-content');
    const btnIcon = processBtn.querySelector('i');
    const btnSpan = processBtn.querySelector('span');

    const updateButtonState = (state, message) => {
        processBtn.disabled = state === 'processing';
        processBtn.classList.remove('btn-primary', 'btn-success', 'btn-danger');

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
                icon = 'file-scan';
                btnClass = 'btn-primary';
                break;
        }
        
        btnSpan.textContent = message;
        btnIcon.setAttribute('data-lucide', icon);
        processBtn.classList.add(btnClass);
        lucide.createIcons(); // Redraw icons
    };

    processBtn.addEventListener('click', () => {
        // Reset state when user wants to try again
        updateButtonState('idle', 'Procesar PDF de Inventario');
        resultsContainer.style.display = 'none';
        fileContentEl.textContent = '';
        pdfUpload.value = null; // Allow selecting the same file again
        pdfUpload.click();
    });

    pdfUpload.addEventListener('change', async function(event) {
        const file = event.target.files[0];
        
        if (!file) {
            return; // User cancelled the file dialog
        }
        
        if (file.type !== 'application/pdf') {
            resultsContainer.style.display = 'block';
            fileContentEl.textContent = 'Por favor, seleccione un archivo PDF.';
            updateButtonState('error', 'Archivo no válido');
            return;
        }

        resultsContainer.style.display = 'block';
        fileContentEl.textContent = 'Cargando y procesando el PDF...';
        updateButtonState('processing', 'Procesando...');

        const reader = new FileReader();
        reader.onload = async function(e) {
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
                        lines.get(y).push({x: Math.round(item.transform[4]), text: item.str.trim()});
                    });

                    const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);
                    for (const y of sortedY) {
                        const lineText = lines.get(y).sort((a,b) => a.x - b.x).map(item => item.text).join(' ').trim();
                        if (lineText) allReconstructedLines.push(lineText);
                    }
                }

                const allParsedItems = [];
                const codigoRegex = /^([A-Z]{2,}\d+(?: \*)?|\d+)$/;
                const nombreCantidadRegex = /^(.+?)\s+(\d+)$/;
                let reportDate = new Date();

                for (let i = 0; i < allReconstructedLines.length; i++) {
                    const currentLine = allReconstructedLines[i];
                    const dateMatch = currentLine.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/);
                    if (dateMatch) {
                        const dateParts = dateMatch[1].split(/[\/-]/);
                        if(dateParts.length === 3) {
                           reportDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0]);
                        }
                    }
                    if (i < allReconstructedLines.length - 1) {
                        const nextLine = allReconstructedLines[i+1];
                        const codigoMatch = currentLine.match(codigoRegex);
                        if (codigoMatch) {
                            const nombreCantidadMatch = nextLine.match(nombreCantidadRegex);
                            if (nombreCantidadMatch) {
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

                    fileContentEl.textContent = 'Guardando archivos procesados...';

                    try {
                        const response = await fetch('/api/exp/save-processed', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ local: localId, jsonContent: jsonContent, tableContent: tableForDisplay })
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        
                        const result = await response.json();
                        if (result.success) {
                            fileContentEl.innerHTML = `¡Archivos guardados con éxito!<br>JSON: ${result.jsonPath}`;
                            updateButtonState('success', 'Completado');
                        } else {
                            throw new Error(result.error || 'Error desconocido al guardar.');
                        }
                    } catch (saveError) {
                        console.error('Error al guardar los archivos:', saveError);
                        fileContentEl.textContent = `Error al guardar: ${saveError.message}. Los datos extraídos se muestran abajo para guardado manual.`;
                        const manualFallback = `\n\n--- COPIAR Y PEGAR ESTE BLOQUE JSON ---\n${jsonContent}\n--- FIN ---\n\n` +
                                           `Ruta sugerida: data/${localId}-Inventario.json`;
                        const dataArea = document.createElement('pre');
                        dataArea.textContent = manualFallback;
                        fileContentEl.appendChild(dataArea);
                        updateButtonState('error', 'Error al Guardar');
                    }
                } else {
                    fileContentEl.textContent = 'No se encontraron ítems con el formato esperado en el PDF.';
                    updateButtonState('error', 'No se encontraron datos');
                }
            } catch (error) {
                console.error('Error procesando el PDF:', error);
                fileContentEl.textContent = 'Error al procesar el archivo PDF. Verifique que el archivo no esté dañado.';
                updateButtonState('error', 'Error de PDF');
            }
        };
        reader.readAsArrayBuffer(file);
    });
});

