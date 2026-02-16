import { Auth } from "../core/js/auth.js";
import { showLoadingOverlay, hideLoadingOverlay } from "../core/js/ui-feedback.js";

let localesList = [];
let currentUser = null;

const DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
const CHILE_REGIONS = [
    "Arica y Parinacota",
    "Tarapaca",
    "Antofagasta",
    "Atacama",
    "Coquimbo",
    "Valparaiso",
    "Metropolitana de Santiago",
    "Libertador General Bernardo O'Higgins",
    "Maule",
    "Nuble",
    "Biobio",
    "La Araucania",
    "Los Rios",
    "Los Lagos",
    "Aysen del General Carlos Ibanez del Campo",
    "Magallanes y de la Antartica Chilena"
];
const COMMUNES_BY_REGION = {
    "Arica y Parinacota": ["Arica", "Camarones", "General Lagos", "Putre"],
    Tarapaca: ["Alto Hospicio", "Camina", "Colchane", "Huara", "Iquique", "Pica", "Pozo Almonte"],
    Antofagasta: ["Antofagasta", "Calama", "Maria Elena", "Mejillones", "Ollague", "San Pedro de Atacama", "Sierra Gorda", "Taltal", "Tocopilla"],
    Atacama: ["Alto del Carmen", "Caldera", "Chanaral", "Copiapo", "Diego de Almagro", "Freirina", "Huasco", "Tierra Amarilla", "Vallenar"],
    Coquimbo: ["Andacollo", "Canela", "Combarbala", "Coquimbo", "Illapel", "La Higuera", "La Serena", "Los Vilos", "Monte Patria", "Ovalle", "Paihuano", "Punitaqui", "Rio Hurtado", "Salamanca", "Vicuna"],
    Valparaiso: ["Algarrobo", "Cabildo", "Calera", "Calle Larga", "Cartagena", "Casablanca", "Catemu", "Concon", "El Quisco", "El Tabo", "Hijuelas", "Isla de Pascua", "Juan Fernandez", "La Cruz", "La Ligua", "Limache", "Llaillay", "Los Andes", "Nogales", "Olmue", "Panquehue", "Papudo", "Petorca", "Puchuncavi", "Putaendo", "Quillota", "Quilpue", "Quintero", "Rinconada", "San Antonio", "San Esteban", "San Felipe", "Santa Maria", "Santo Domingo", "Valparaiso", "Villa Alemana", "Vina del Mar", "Zapallar"],
    "Metropolitana de Santiago": ["Alhue", "Buin", "Calera de Tango", "Cerrillos", "Cerro Navia", "Colina", "Conchali", "Curacavi", "El Bosque", "El Monte", "Estacion Central", "Huechuraba", "Independencia", "Isla de Maipo", "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina", "Lampa", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipu", "Maria Pinto", "Melipilla", "Nunoa", "Padre Hurtado", "Paine", "Pedro Aguirre Cerda", "Penaflor", "Penalolen", "Pirque", "Providencia", "Pudahuel", "Puente Alto", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Bernardo", "San Joaquin", "San Jose de Maipo", "San Miguel", "San Pedro", "San Ramon", "Santiago", "Talagante", "Tiltil", "Vitacura"],
    "Libertador General Bernardo O'Higgins": ["Chepica", "Chimbarongo", "Codegua", "Coinco", "Coltauco", "Donihue", "Graneros", "La Estrella", "Las Cabras", "Litueche", "Lolol", "Machali", "Malloa", "Marchihue", "Mostazal", "Nancagua", "Navidad", "Olivar", "Palmilla", "Paredones", "Peralillo", "Peumo", "Pichidegua", "Pichilemu", "Placilla", "Pumanque", "Quinta de Tilcoco", "Rancagua", "Rengo", "Requinoa", "San Fernando", "San Vicente"],
    Maule: ["Cauquenes", "Chanco", "Colbun", "Constitucion", "Curepto", "Curico", "Empedrado", "Hualane", "Licanten", "Linares", "Longavi", "Maule", "Molina", "Parral", "Pelarco", "Pelluhue", "Pencahue", "Rauco", "Retiro", "Rio Claro", "Romeral", "Sagrada Familia", "San Clemente", "San Javier", "San Rafael", "Talca", "Teno", "Vichuquen", "Villa Alegre", "Yerbas Buenas"],
    Nuble: ["Bulnes", "Chillan", "Chillan Viejo", "Cobquecura", "Coelemu", "Coihueco", "El Carmen", "Ninhue", "Niquen", "Pemuco", "Pinto", "Portezuelo", "Quillon", "Quirihue", "Ranquil", "San Carlos", "San Fabian", "San Ignacio", "San Nicolas", "Treguaco", "Yungay"],
    Biobio: ["Alto Biobio", "Antuco", "Arauco", "Cabrero", "Canete", "Chiguayante", "Concepcion", "Contulmo", "Coronel", "Curanilahue", "Florida", "Hualpen", "Hualqui", "Laja", "Lebu", "Los Alamos", "Los Angeles", "Lota", "Mulchen", "Nacimiento", "Negrete", "Penco", "Quilaco", "Quilleco", "San Pedro de la Paz", "San Rosendo", "Santa Barbara", "Santa Juana", "Talcahuano", "Tirua", "Tome", "Tucapel", "Yumbel"],
    "La Araucania": ["Angol", "Carahue", "Cholchol", "Collipulli", "Cunco", "Curacautin", "Curarrehue", "Ercilla", "Freire", "Galvarino", "Gorbea", "Lautaro", "Loncoche", "Lonquimay", "Los Sauces", "Lumaco", "Melipeuco", "Nueva Imperial", "Padre Las Casas", "Perquenco", "Pitrufquen", "Pucon", "Purén", "Renaico", "Saavedra", "Temuco", "Teodoro Schmidt", "Tolten", "Traiguen", "Victoria", "Vilcun", "Villarrica"],
    "Los Rios": ["Corral", "Futrono", "La Union", "Lago Ranco", "Lanco", "Los Lagos", "Mariquina", "Mafil", "Paillaco", "Panguipulli", "Rio Bueno", "Valdivia"],
    "Los Lagos": ["Ancud", "Calbuco", "Castro", "Chaiten", "Chonchi", "Cochamo", "Curaco de Velez", "Dalcahue", "Fresia", "Frutillar", "Futaleufu", "Hualaihue", "Llanquihue", "Los Muermos", "Maullin", "Osorno", "Palena", "Puerto Montt", "Puerto Octay", "Puerto Varas", "Puqueldon", "Purranque", "Puyehue", "Queilen", "Quellon", "Quemchi", "Quinchao", "Rio Negro", "San Juan de la Costa", "San Pablo"],
    "Aysen del General Carlos Ibanez del Campo": ["Aysen", "Chile Chico", "Cisnes", "Cochrane", "Coyhaique", "Guaitecas", "Lago Verde", "O'Higgins", "Rio Ibanez", "Tortel"],
    "Magallanes y de la Antartica Chilena": ["Antartica", "Cabo de Hornos", "Laguna Blanca", "Natales", "Porvenir", "Primavera", "Punta Arenas", "Rio Verde", "San Gregorio", "Timaukel", "Torres del Paine"]
};

document.addEventListener("DOMContentLoaded", async () => {
    showLoadingOverlay("Cargando locales...");
    currentUser = Auth.getUser();
    if (!currentUser) {
        hideLoadingOverlay();
        window.location.href = "/pages/home.html";
        return;
    }

    if (currentUser.cargo !== "Super Admin") {
        hideLoadingOverlay();
        alert("Solo Super Admin puede gestionar locales.");
        window.location.href = "/pages/home.html";
        return;
    }

    try {
        setupHeader(currentUser);
        setupRegionSelector();
        setupFormListeners();
        resetForm();
        await loadLocales();

        lucide.createIcons();
    } finally {
        hideLoadingOverlay();
    }
});

async function loadLocales() {
    const grid = document.getElementById("locales-grid");
    try {
        const response = await fetch("/api/locales");
        if (!response.ok) throw new Error("No se pudo cargar locales.");
        localesList = await response.json();
        localesList.sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
        renderLocales();
    } catch (error) {
        console.error("Error loading locales:", error);
        grid.innerHTML =
            '<div style="grid-column: 1/-1; padding: 20px; color: var(--danger-color);">Error al cargar locales.</div>';
    }
}

function renderLocales() {
    const grid = document.getElementById("locales-grid");
    const count = document.getElementById("locale-count");
    count.textContent = localesList.length;
    grid.innerHTML = "";

    if (!localesList.length) {
        grid.innerHTML =
            '<div style="grid-column: 1/-1; padding: 20px; color: var(--text-muted);">No hay locales registrados.</div>';
        return;
    }

    localesList.forEach((locale) => {
        const card = document.createElement("div");
        card.className = "locale-card";
        const resolvedType = resolveType(locale);
        const badgeClass = resolvedType === "Franquicia" ? "badge-franchise" : "badge-branch";

        card.innerHTML = `
            <div class="locale-card-header">
                <div>
                    <span class="badge ${badgeClass}">${resolvedType}</span>
                    <span class="badge badge-id">${locale.id || "--"}</span>
                </div>
            </div>

            <div class="locale-card-details">
                <div class="detail-row"><span>Nombre:</span><span>${escapeHtml(locale.name || "--")}</span></div>
                <div class="detail-row"><span>Numero:</span><span>${pad4(resolveNumber(locale))}</span></div>
                <div class="detail-row"><span>Direccion:</span><span>${escapeHtml(locale.direccion || "--")}</span></div>
                <div class="detail-row"><span>Comuna:</span><span>${escapeHtml(locale.comuna || "--")}</span></div>
                <div class="detail-row"><span>Region:</span><span>${escapeHtml(locale.region || "--")}</span></div>
                <div class="detail-row"><span>Telefono:</span><span>${escapeHtml(locale.telefono || "--")}</span></div>
                <div class="detail-row"><span>Anexo:</span><span>${escapeHtml(locale.anexo || "--")}</span></div>
                <div class="detail-row"><span>Correo oficial:</span><span>${escapeHtml(locale.correo_oficial || "--")}</span></div>
                <div class="detail-row"><span>Correo alternativo:</span><span>${escapeHtml(locale.correo_alternativo || "--")}</span></div>
            </div>

            <div class="schedule-box">
                ${renderSchedule(locale.horario_atencion)}
            </div>

            <div class="locale-card-actions">
                <button class="btn btn-primary btn-block edit-btn" data-id="${locale.id}">
                    <i data-lucide="edit-2" style="width:14px; height:14px; margin-right:4px;"></i> Editar
                </button>
                <button class="btn btn-danger delete-btn" data-id="${locale.id}">
                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });

    grid.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", () => editLocale(btn.dataset.id));
    });
    grid.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => deleteLocale(btn.dataset.id));
    });

    lucide.createIcons();
}

function renderSchedule(rows) {
    const byDay = buildWeeklyMapFromRows(rows);
    return DAYS.map((day) => {
        const item = byDay[day];
        if (!item || item.cerrado) {
            return `<div class="schedule-line"><span>${day}</span><span class="closed-badge">Cerrado</span></div>`;
        }
        return `<div class="schedule-line"><span>${day}</span><span>${escapeHtml(item.apertura || "--:--")} - ${escapeHtml(item.cierre || "--:--")}</span></div>`;
    }).join("");
}

function setupFormListeners() {
    const tipoInput = document.getElementById("tipo");
    const numeroInput = document.getElementById("numero");
    const telefonoInput = document.getElementById("telefono");
    const form = document.getElementById("locale-form");

    tipoInput.addEventListener("change", updateLocaleIdPreview);
    numeroInput.addEventListener("input", () => {
        const current = Number(numeroInput.value);
        if (current <= 0 || !Number.isFinite(current)) {
            numeroInput.value = "";
        }
        updateLocaleIdPreview();
    });

    telefonoInput.addEventListener("input", handlePhoneInput);
    telefonoInput.addEventListener("blur", validatePhoneField);
    document.getElementById("region").addEventListener("change", syncComunaOptions);

    document.getElementById("reset-form-btn").addEventListener("click", resetForm);
    document.getElementById("cancel-btn").addEventListener("click", resetForm);

    form.addEventListener("submit", submitForm);
}

function setupRegionSelector() {
    const regionSelect = document.getElementById("region");
    if (!regionSelect) return;
    regionSelect.innerHTML = '<option value="">Selecciona una región...</option>';
    CHILE_REGIONS.forEach((regionName) => {
        const option = document.createElement("option");
        option.value = regionName;
        option.textContent = regionName;
        regionSelect.appendChild(option);
    });
}

function syncComunaOptions() {
    const region = document.getElementById("region").value;
    const comunaSelect = document.getElementById("comuna");
    if (!comunaSelect) return;
    const currentValue = comunaSelect.value;

    comunaSelect.innerHTML = '<option value="">Selecciona una comuna...</option>';
    const communes = COMMUNES_BY_REGION[region] || [];
    communes.forEach((comunaName) => {
        const option = document.createElement("option");
        option.value = comunaName;
        option.textContent = comunaName;
        if (comunaName === currentValue) option.selected = true;
        comunaSelect.appendChild(option);
    });

    if (currentValue && !communes.includes(currentValue)) {
        const option = document.createElement("option");
        option.value = currentValue;
        option.textContent = `${currentValue} (actual)`;
        option.selected = true;
        comunaSelect.appendChild(option);
    }
}

async function submitForm(event) {
    event.preventDefault();
    const formActionText = document.getElementById("form-action-text");
    const editId = document.getElementById("edit-id").value.trim();
    const data = collectFormData();

    if (!data) return;

    try {
        let response;
        if (editId) {
            response = await fetch(`/api/locales/${editId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch("/api/locales", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });
        }

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("No existe endpoint /api/locales en el servidor activo. Reinicia RUN_FIREBASE.bat para cargar los cambios.");
            }
            if (!editId && response.status === 409) {
                const localeId = document.getElementById("locale-id-preview").value;
                if (confirm(`El local ${localeId} ya existe. ¿Deseas actualizarlo en lugar de crearlo?`)) {
                    const putResponse = await fetch(`/api/locales/${localeId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(data)
                    });
                    const putResult = await putResponse.json().catch(() => ({}));
                    if (!putResponse.ok) {
                        throw new Error(putResult.error || "No se pudo actualizar el local existente.");
                    }
                    alert("Local actualizado exitosamente.");
                    formActionText.textContent = "Crear Local";
                    resetForm();
                    await loadLocales();
                    return;
                }
            }
            throw new Error(result.error || "No se pudo guardar el local.");
        }

        if (result.migrated) {
            alert(`Local actualizado y migrado: ${result.oldId} -> ${result.newId}.`);
        } else {
            alert("Local guardado exitosamente.");
        }
        formActionText.textContent = "Crear Local";
        resetForm();
        await loadLocales();
    } catch (error) {
        console.error("Error saving locale:", error);
        alert(error.message);
    }
}

function collectFormData() {
    const tipo = document.getElementById("tipo").value;
    const numeroRaw = document.getElementById("numero").value;
    const nombreLocal = document.getElementById("nombre_local").value.trim();
    const direccion = document.getElementById("direccion").value.trim();
    const comuna = document.getElementById("comuna").value.trim();
    const region = document.getElementById("region").value.trim();
    const telefonoRaw = document.getElementById("telefono").value.trim();
    const anexo = document.getElementById("anexo").value.trim();
    const correoOficial = document.getElementById("correo_oficial").value.trim();
    const correoAlternativo = document.getElementById("correo_alternativo").value.trim();
    const telefono = telefonoRaw ? formatPhoneDisplay(telefonoRaw) : "";

    const numero = Number(numeroRaw);
    if (!Number.isInteger(numero) || numero <= 0) {
        alert("El numero del local debe ser un entero positivo.");
        return null;
    }

    if (!direccion) {
        alert("La direccion es obligatoria.");
        return null;
    }

    if (!comuna) {
        alert("La comuna es obligatoria.");
        return null;
    }

    if (!region) {
        alert("La region es obligatoria.");
        return null;
    }

    if (telefono && !isValidPhone(telefono)) {
        alert("Telefono invalido. Debe tener entre 8 y 12 digitos.");
        return null;
    }

    if (correoOficial && !isValidEmail(correoOficial)) {
        alert("El correo oficial no es valido.");
        return null;
    }

    if (correoAlternativo && !isValidEmail(correoAlternativo)) {
        alert("El correo alternativo no es valido.");
        return null;
    }

    const horario = [];
    for (const day of DAYS) {
        const key = dayToKey(day);
        const toggle = document.getElementById(`toggle-${key}`);
        const apertura = document.getElementById(`open-${key}`);
        const cierre = document.getElementById(`close-${key}`);
        const abierto = Boolean(toggle?.dataset.active === "1");

        if (abierto) {
            if (!apertura.value || !cierre.value) {
                alert(`Completa apertura y cierre para ${day}.`);
                return null;
            }
            horario.push({ dias: day, apertura: apertura.value, cierre: cierre.value, cerrado: false });
        } else {
            horario.push({ dias: day, apertura: "", cierre: "", cerrado: true });
        }
    }

    return {
        tipo,
        numero,
        name: nombreLocal,
        direccion,
        comuna,
        region,
        telefono,
        anexo,
        correo_oficial: correoOficial,
        correo_alternativo: correoAlternativo,
        horario_atencion: horario
    };
}

function editLocale(localeId) {
    const locale = localesList.find((item) => String(item.id).toUpperCase() === String(localeId).toUpperCase());
    if (!locale) return;

    document.getElementById("edit-id").value = locale.id;
    document.getElementById("tipo").value = resolveType(locale);
    document.getElementById("numero").value = resolveNumber(locale) || "";
    document.getElementById("nombre_local").value = locale.name || "";
    document.getElementById("direccion").value = locale.direccion || "";
    ensureRegionOption(locale.region || "");
    document.getElementById("region").value = locale.region || "";
    syncComunaOptions();
    ensureComunaOption(locale.comuna || "");
    document.getElementById("comuna").value = locale.comuna || "";
    document.getElementById("telefono").value = locale.telefono ? formatPhoneDisplay(locale.telefono) : "";
    document.getElementById("anexo").value = locale.anexo || "";
    document.getElementById("correo_oficial").value = locale.correo_oficial || "";
    document.getElementById("correo_alternativo").value = locale.correo_alternativo || "";

    initializeWeeklySchedule(buildWeeklyMapFromRows(locale.horario_atencion));

    updateLocaleIdPreview();
    document.getElementById("form-action-text").textContent = "Editar Local";
    document.querySelector(".locale-form-container").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteLocale(localeId) {
    if (!confirm(`Eliminar el local ${localeId}?`)) return;

    try {
        const response = await fetch(`/api/locales/${localeId}`, { method: "DELETE" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || "No se pudo eliminar el local.");
        }
        alert("Local eliminado.");
        await loadLocales();
        resetForm();
    } catch (error) {
        console.error("Error deleting locale:", error);
        alert(error.message);
    }
}

function updateLocaleIdPreview() {
    const tipo = document.getElementById("tipo").value;
    const numero = Number(document.getElementById("numero").value);
    const prefix = tipo === "Franquicia" ? "FCL" : "SCL";
    const idInput = document.getElementById("locale-id-preview");
    if (!Number.isInteger(numero) || numero <= 0) {
        idInput.value = `${prefix}0000`;
        return;
    }
    idInput.value = `${prefix}${String(numero).padStart(4, "0")}`;
}

function initializeWeeklySchedule(values = {}) {
    const container = document.getElementById("schedule-weekly");
    container.innerHTML = "";

    DAYS.forEach((day) => {
        const key = dayToKey(day);
        const current = values[day] || { cerrado: true, apertura: "", cierre: "" };
        const isOpen = !current.cerrado;

        const row = document.createElement("div");
        row.className = "week-row";
        row.innerHTML = `
            <button type="button" id="toggle-${key}" class="day-toggle ${isOpen ? "active" : "inactive"}" data-day="${day}" data-active="${isOpen ? "1" : "0"}">
                ${isOpen ? day : "Cerrado"}
            </button>
            <div class="week-time-group">
                <input id="open-${key}" type="time" class="form-control" ${isOpen ? "" : "disabled"} value="${current.apertura || ""}">
                <span>a</span>
                <input id="close-${key}" type="time" class="form-control" ${isOpen ? "" : "disabled"} value="${current.cierre || ""}">
            </div>
            <button type="button" class="copy-day-btn" data-day="${day}" title="Copiar este horario a todos los días">
                <i data-lucide="copy" style="width:14px; height:14px;"></i>
                <span>Copiar</span>
            </button>
        `;

        container.appendChild(row);

        const toggle = row.querySelector(`#toggle-${key}`);
        const openInput = row.querySelector(`#open-${key}`);
        const closeInput = row.querySelector(`#close-${key}`);
        const copyBtn = row.querySelector(".copy-day-btn");

        toggle.addEventListener("click", () => {
            const active = toggle.dataset.active === "1";
            const next = !active;
            toggle.dataset.active = next ? "1" : "0";
            toggle.classList.toggle("active", next);
            toggle.classList.toggle("inactive", !next);
            toggle.textContent = next ? day : "Cerrado";
            openInput.disabled = !next;
            closeInput.disabled = !next;
            if (!next) {
                openInput.value = "";
                closeInput.value = "";
            }
        });

        copyBtn.addEventListener("click", () => {
            copyScheduleToAll(day);
        });
    });
    lucide.createIcons();
}

function copyScheduleToAll(sourceDay) {
    const sourceKey = dayToKey(sourceDay);
    const sourceToggle = document.getElementById(`toggle-${sourceKey}`);
    const sourceOpen = document.getElementById(`open-${sourceKey}`);
    const sourceClose = document.getElementById(`close-${sourceKey}`);
    if (!sourceToggle || !sourceOpen || !sourceClose) return;

    const isOpen = sourceToggle.dataset.active === "1";
    const openValue = sourceOpen.value;
    const closeValue = sourceClose.value;

    if (isOpen && (!openValue || !closeValue)) {
        alert(`Completa primero el horario de ${sourceDay} antes de copiar.`);
        return;
    }

    DAYS.forEach((day) => {
        if (day === sourceDay) return;
        const key = dayToKey(day);
        const toggle = document.getElementById(`toggle-${key}`);
        const open = document.getElementById(`open-${key}`);
        const close = document.getElementById(`close-${key}`);
        if (!toggle || !open || !close) return;

        toggle.dataset.active = isOpen ? "1" : "0";
        toggle.classList.toggle("active", isOpen);
        toggle.classList.toggle("inactive", !isOpen);
        toggle.textContent = isOpen ? day : "Cerrado";

        open.disabled = !isOpen;
        close.disabled = !isOpen;
        open.value = isOpen ? openValue : "";
        close.value = isOpen ? closeValue : "";
    });
}

function buildWeeklyMapFromRows(rows) {
    const map = {};
    DAYS.forEach((day) => {
        map[day] = { cerrado: true, apertura: "", cierre: "" };
    });

    const source = Array.isArray(rows) ? rows : [];
    source.forEach((row) => {
        const days = expandDaysFromText(row?.dias);
        if (!days.length) return;

        days.forEach((day) => {
            map[day] = {
                cerrado: Boolean(row?.cerrado),
                apertura: row?.cerrado ? "" : String(row?.apertura || ""),
                cierre: row?.cerrado ? "" : String(row?.cierre || "")
            };
        });
    });

    return map;
}

function expandDaysFromText(text) {
    const value = normalizeText(text);
    if (!value) return [];

    const indexByDay = new Map(DAYS.map((d, i) => [normalizeText(d), i]));

    const exact = DAYS.find((d) => normalizeText(d) === value);
    if (exact) return [exact];

    const rangeMatch = value.match(/(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*a\s*(lunes|martes|miercoles|jueves|viernes|sabado|domingo)/);
    if (rangeMatch) {
        const start = indexByDay.get(rangeMatch[1]);
        const end = indexByDay.get(rangeMatch[2]);
        if (start !== undefined && end !== undefined) {
            const result = [];
            if (start <= end) {
                for (let i = start; i <= end; i += 1) result.push(DAYS[i]);
            } else {
                for (let i = start; i < DAYS.length; i += 1) result.push(DAYS[i]);
                for (let i = 0; i <= end; i += 1) result.push(DAYS[i]);
            }
            return result;
        }
    }

    const found = DAYS.filter((d) => value.includes(normalizeText(d)));
    return found;
}

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function dayToKey(day) {
    return normalizeText(day);
}

function resetForm() {
    document.getElementById("locale-form").reset();
    document.getElementById("edit-id").value = "";
    document.getElementById("tipo").value = "Sucursal";
    document.getElementById("form-action-text").textContent = "Crear Local";
    syncComunaOptions();

    initializeWeeklySchedule();
    updateLocaleIdPreview();
}

function ensureRegionOption(regionName) {
    if (!regionName) return;
    const regionSelect = document.getElementById("region");
    if (!regionSelect) return;
    const exists = Array.from(regionSelect.options).some((option) => option.value === regionName);
    if (!exists) {
        const option = document.createElement("option");
        option.value = regionName;
        option.textContent = regionName;
        regionSelect.appendChild(option);
    }
}

function ensureComunaOption(comunaName) {
    if (!comunaName) return;
    const comunaSelect = document.getElementById("comuna");
    if (!comunaSelect) return;
    const exists = Array.from(comunaSelect.options).some((option) => option.value === comunaName);
    if (!exists) {
        const option = document.createElement("option");
        option.value = comunaName;
        option.textContent = comunaName;
        comunaSelect.appendChild(option);
    }
}

function setupHeader(user) {
    const userSigla = document.getElementById("user-sigla");
    const userName = document.getElementById("user-name-text");
    const userCargo = document.getElementById("user-cargo-text");
    const logoutBtn = document.getElementById("logout-btn");

    const initials = (user.names || user.name || "")
        .split(" ")
        .filter(Boolean)
        .map((item) => item[0])
        .join("");
    userSigla.textContent = initials.toUpperCase().substring(0, 2) || "--";
    userName.textContent = `${user.names || user.name || ""} ${user.last_names || ""}`.trim();
    userCargo.textContent = user.cargo || "";

    logoutBtn.addEventListener("click", (event) => {
        event.preventDefault();
        Auth.logout();
    });
}

function pad4(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return "0000";
    return String(n).padStart(4, "0");
}

function resolveType(locale) {
    if (locale?.tipo === "Sucursal" || locale?.tipo === "Franquicia") {
        return locale.tipo;
    }
    return String(locale?.id || "").toUpperCase().startsWith("FCL") ? "Franquicia" : "Sucursal";
}

function resolveNumber(locale) {
    if (Number.isInteger(Number(locale?.numero)) && Number(locale.numero) > 0) {
        return Number(locale.numero);
    }
    const id = String(locale?.id || "");
    const match = id.match(/(\d{1,4})$/);
    return match ? Number(match[1]) : 0;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function isValidPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 12;
}

function formatPhoneDisplay(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";

    if (digits.startsWith("56")) {
        const national = digits.slice(2);
        return formatWithCountryCode(national);
    }
    return formatWithCountryCode(digits);
}

function formatWithCountryCode(nationalDigits) {
    const digits = String(nationalDigits || "").slice(0, 10);
    if (!digits) return "";
    if (digits.length <= 1) return `+56 ${digits}`;
    if (digits.length <= 5) return `+56 ${digits[0]} ${digits.slice(1)}`;
    return `+56 ${digits[0]} ${digits.slice(1, 5)} ${digits.slice(5)}`.trim();
}

function handlePhoneInput(event) {
    event.target.value = formatPhoneDisplay(event.target.value);
}

function validatePhoneField(event) {
    const value = event.target.value.trim();
    if (!value) {
        event.target.setCustomValidity("");
        return;
    }

    if (!isValidPhone(value)) {
        event.target.setCustomValidity("Telefono invalido. Debe tener entre 8 y 12 digitos.");
        event.target.reportValidity();
        return;
    }
    event.target.setCustomValidity("");
}

function isValidEmail(value) {
    const email = String(value || "").trim();
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
