import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs";

// Set the workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs`;

document.getElementById('pdf-upload').addEventListener('change', async function(event) {
    const file = event.target.files[0];
    const fileContentEl = document.getElementById('file-content');
    
    if (!file || file.type !== 'application/pdf') {
        fileContentEl.textContent = 'Por favor, seleccione un archivo PDF.';
        return;
    }

    fileContentEl.textContent = 'Cargando y procesando el PDF...';

    const reader = new FileReader();
    reader.onload = async function(e) {
        const typedarray = new Uint8Array(e.target.result);
        
        try {
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            let debugOutput = "--- DEBUG: Reconstructed Lines ---\n\n";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                if (textContent.items.length === 0) continue;

                // Group by y-coordinate
                const lines = new Map();
                textContent.items.forEach(item => {
                    const y = Math.round(item.transform[5]);
                    if (!lines.has(y)) lines.set(y, []);
                    lines.get(y).push({x: Math.round(item.transform[4]), text: item.str});
                });

                // Sort lines by y-coordinate
                const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);

                // Create line strings
                const pageLines = [];
                for (const y of sortedY) {
                    const lineText = lines.get(y).sort((a,b) => a.x - b.x).map(item => item.text).join(' ');
                    pageLines.push(lineText);
                }
                
                debugOutput += `--- Page ${i} ---\n` + pageLines.join('\n') + '\n\n';
            }

            fileContentEl.textContent = debugOutput;

        } catch (error) {
            console.error('Error procesando el PDF:', error);
            fileContentEl.textContent = 'Error al procesar el archivo PDF. Verifique que el archivo no esté dañado.';
        }
    };
    
    reader.readAsArrayBuffer(file);
});
