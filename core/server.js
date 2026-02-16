const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { URL } = require("url");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 3000;

function initFirestore() {
    const keyPath =
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        path.resolve(__dirname, "../../images/servicekey.json");
    const projectId = process.env.FIREBASE_PROJECT_ID;

    try {
        const raw = fs.readFileSync(keyPath, "utf8");
        const serviceAccount = JSON.parse(raw);
        const finalProjectId = projectId || serviceAccount.project_id;

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: finalProjectId
        });
        console.log(`Firestore enabled (${finalProjectId}).`);
        return admin.firestore();
    } catch (error) {
        console.error("Firestore disabled:", error.message);
        return null;
    }
}

const db = initFirestore();

function ensureFirestore(res) {
    if (!db) {
        res.status(500).json({
            error: "Firestore no configurado. Define FIREBASE_SERVICE_ACCOUNT_KEY y FIREBASE_PROJECT_ID."
        });
        return false;
    }
    return true;
}

function ymdDot(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}.${m}.${d}`;
}

function localeDoc(localId) {
    return db.collection("locales").doc(String(localId || "").toLowerCase());
}

function productListRef(localId) {
    return localeDoc(localId).collection("product_lists").doc("latest");
}

function movementsCustomListsRef(localId) {
    return localeDoc(localId).collection("movements").doc("custom_lists");
}

function calendarEventsCollection() {
    return db.collection("calendar_events");
}

function parseDateKey(value) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return text;
}

function normalizeText(value, fallback = "") {
    return String(value ?? fallback).trim();
}

function normalizeCargo(value = "") {
    const source = String(value || "").toLowerCase();
    const ascii = source
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (ascii.includes("super admin")) return "super_admin";
    if (ascii.includes("quimico") || ascii.includes("qf")) return "qf";
    if (ascii.includes("af") || ascii.includes("auxiliar")) return "af";
    return "other";
}

function canCreateScope(role, scopeType) {
    const allowedByRole = {
        super_admin: ["global_all", "global_af", "global_qf"],
        qf: ["local_qf", "local_af", "local_qf_af"],
        af: ["local_qf_af"]
    };
    return Array.isArray(allowedByRole[role]) && allowedByRole[role].includes(scopeType);
}

function isVisibleForUser(event, viewer) {
    const scopeType = event?.scope?.type;
    const eventLocale = String(event?.scope?.localeId || "").toLowerCase();
    const viewerLocale = String(viewer?.localeId || "").toLowerCase();
    const viewerRole = normalizeCargo(viewer?.cargo || "");
    const viewerRut = String(viewer?.rut || "");

    if (event?.createdBy?.rut && String(event.createdBy.rut) === viewerRut) {
        return true;
    }

    if (scopeType === "global_all") return true;
    if (scopeType === "global_af") return viewerRole === "af";
    if (scopeType === "global_qf") return viewerRole === "qf";

    if (!eventLocale || !viewerLocale || eventLocale !== viewerLocale) {
        return false;
    }

    if (scopeType === "local_qf") return viewerRole === "qf";
    if (scopeType === "local_af") return viewerRole === "af";
    if (scopeType === "local_qf_af") return viewerRole === "qf" || viewerRole === "af";

    return false;
}

function normalizeCalendarEventPayload(raw = {}, actor = {}) {
    const title = normalizeText(raw.title);
    const date = parseDateKey(raw.date);
    const scopeType = normalizeText(raw?.scope?.type);
    const importance = normalizeText(raw.importance || "media").toLowerCase();
    const publicationType = normalizeText(raw.publicationType || "recordatorio").toLowerCase();
    const role = normalizeCargo(actor.cargo || "");

    if (!title) return { error: "El título es obligatorio." };
    if (!date) return { error: "La fecha es obligatoria (YYYY-MM-DD)." };
    if (!canCreateScope(role, scopeType)) return { error: "No tienes permisos para este tipo de publicación." };
    if (!["baja", "media", "alta"].includes(importance)) return { error: "Importancia inválida." };
    if (!["recordatorio", "tarea", "aviso"].includes(publicationType)) return { error: "Tipo de publicación inválido." };

    const actorLocale = String(actor.locale_id || actor.localeId || "").toLowerCase();
    const targetLocale = String(raw?.scope?.localeId || actorLocale || "").toLowerCase();
    const isGlobalScope = scopeType.startsWith("global_");
    const finalLocale = isGlobalScope ? "all" : targetLocale;

    const readBy = Array.isArray(raw.readBy) ? raw.readBy.filter(Boolean) : [];
    const completedBy = Array.isArray(raw.completedBy) ? raw.completedBy.filter(Boolean) : [];
    const assignedTo = Array.isArray(raw.assignedTo) ? raw.assignedTo.filter(Boolean) : [];

    return {
        value: {
            title,
            description: normalizeText(raw.description),
            notes: normalizeText(raw.notes),
            date,
            startTime: normalizeText(raw.startTime),
            endTime: normalizeText(raw.endTime),
            allDay: Boolean(raw.allDay),
            importance,
            publicationType,
            scope: {
                type: scopeType,
                localeId: finalLocale
            },
            assignedTo,
            readBy,
            completedBy
        }
    };
}

const VALID_LOCALE_TYPES = new Set(["Sucursal", "Franquicia"]);

function normalizeScheduleRows(value) {
    const rows = Array.isArray(value) ? value : [];
    return rows
        .map((row) => ({
            dias: String(row?.dias || "").trim(),
            apertura: String(row?.apertura || "").trim(),
            cierre: String(row?.cierre || "").trim(),
            cerrado: Boolean(row?.cerrado)
        }))
        .filter((row) => row.dias);
}

function normalizePhone(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const cleaned = raw.replace(/\s+/g, " ");
    const validChars = /^[\d+\-\s()]+$/.test(cleaned);
    const digits = cleaned.replace(/\D/g, "");
    if (!validChars || digits.length < 8 || digits.length > 12) {
        return null;
    }
    return cleaned;
}

function normalizeEmail(value) {
    const email = String(value || "").trim().toLowerCase();
    if (!email) return "";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    return valid ? email : null;
}

async function copyDocTree(sourceRef, targetRef) {
    const sourceSnap = await sourceRef.get();
    if (sourceSnap.exists) {
        await targetRef.set(sourceSnap.data(), { merge: true });
    }

    const subcollections = await sourceRef.listCollections();
    for (const subcollection of subcollections) {
        const docs = await subcollection.get();
        for (const docSnap of docs.docs) {
            const childTarget = targetRef.collection(subcollection.id).doc(docSnap.id);
            await copyDocTree(docSnap.ref, childTarget);
        }
    }
}

async function deleteDocTree(docRef) {
    const subcollections = await docRef.listCollections();
    for (const subcollection of subcollections) {
        const docs = await subcollection.get();
        for (const docSnap of docs.docs) {
            await deleteDocTree(docSnap.ref);
        }
    }
    await docRef.delete();
}

async function findLocaleDocRefById(localeId) {
    const normalized = String(localeId || "").trim();
    if (!normalized) return null;
    const lower = normalized.toLowerCase();

    const lowerRef = db.collection("locales").doc(lower);
    const lowerSnap = await lowerRef.get();
    if (lowerSnap.exists) return lowerRef;

    const exactRef = db.collection("locales").doc(normalized);
    const exactSnap = await exactRef.get();
    if (exactSnap.exists) return exactRef;

    const querySnap = await db.collection("locales").where("id", "==", normalized.toUpperCase()).limit(1).get();
    if (!querySnap.empty) return querySnap.docs[0].ref;

    return null;
}

function buildLocalePayload(payload = {}) {
    const tipo = String(payload.tipo || "").trim();
    if (!VALID_LOCALE_TYPES.has(tipo)) {
        return { error: "Tipo inválido. Debe ser Sucursal o Franquicia." };
    }

    const numericValue = Number(payload.numero);
    if (!Number.isInteger(numericValue) || numericValue <= 0) {
        return { error: "Número inválido. Debe ser un entero positivo." };
    }

    const numero = String(numericValue).padStart(4, "0");
    const prefix = tipo === "Sucursal" ? "SCL" : "FCL";
    const id = `${prefix}${numero}`;

    const direccion = String(payload.direccion || "").trim();
    if (!direccion) {
        return { error: "La dirección es obligatoria." };
    }
    const comuna = String(payload.comuna || "").trim();
    if (!comuna) {
        return { error: "La comuna es obligatoria." };
    }
    const region = String(payload.region || "").trim();
    if (!region) {
        return { error: "La región es obligatoria." };
    }

    const name = String(payload.name || "").trim();
    if (!name) {
        return { error: "El nombre del local es obligatorio." };
    }

    const telefono = normalizePhone(payload.telefono);
    if (telefono === null) {
        return { error: "Teléfono inválido. Usa solo números y separadores válidos." };
    }

    const correo_oficial = normalizeEmail(payload.correo_oficial);
    if (correo_oficial === null) {
        return { error: "Correo oficial inválido." };
    }

    const correo_alternativo = normalizeEmail(payload.correo_alternativo);
    if (correo_alternativo === null) {
        return { error: "Correo alternativo inválido." };
    }

    const anexo = String(payload.anexo || "").trim();
    const horario_atencion = normalizeScheduleRows(payload.horario_atencion);

    const shortNamePrefix = tipo === "Sucursal" ? "L" : "F";
    const short_name = `${shortNamePrefix}${numero}`;

    return {
        value: {
            id,
            tipo,
            numero: numericValue,
            direccion,
            comuna,
            region,
            telefono,
            anexo,
            correo_oficial,
            correo_alternativo,
            horario_atencion,
            name,
            short_name,
            updatedAt: new Date().toISOString()
        }
    };
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Proxy for external image fetching
app.use(
    "/api/proxy",
    createProxyMiddleware({
        router: (req) => {
            const targetUrl = req.query.url;
            if (!targetUrl || !(targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
                throw new Error("Invalid or missing target URL for proxy");
            }
            return targetUrl;
        },
        changeOrigin: true,
        pathRewrite: { "^/api/proxy": "" },
        onProxyReq: (proxyReq) => {
            proxyReq.setHeader(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            );
            const parsedUrl = new URL(proxyReq.path, "http://localhost");
            parsedUrl.searchParams.delete("url");
            proxyReq.path = parsedUrl.pathname + parsedUrl.search;
        },
        onError: (err, req, res) => {
            console.error("Proxy error:", err.message);
            if (err.message.includes("Invalid or missing target URL")) {
                res.status(400).send("Invalid or missing target URL for proxy");
            } else {
                res.status(500).send("Proxy Error");
            }
        }
    })
);

app.use(express.static(path.join(__dirname, "../")));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../index.html")));
app.get("/home", (req, res) => res.sendFile(path.join(__dirname, "../pages/home.html")));
app.get("/usuarios", (req, res) => res.sendFile(path.join(__dirname, "../pages/users.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

app.get("/api/users", async (req, res) => {
    if (!ensureFirestore(res)) return;
    try {
        const snapshot = await db.collection("users").get();
        const users = snapshot.docs.map((doc) => ({ rut: doc.id, ...doc.data() }));
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Error saving users" });
    }
});

app.post("/api/users", async (req, res) => {
    if (!ensureFirestore(res)) return;
    try {
        const users = Array.isArray(req.body) ? req.body : [];
        const previous = await db.collection("users").get();

        const batch = db.batch();
        previous.docs.forEach((doc) => batch.delete(doc.ref));
        users.forEach((user) => {
            if (!user.rut) return;
            const ref = db.collection("users").doc(String(user.rut));
            batch.set(ref, user);
        });
        await batch.commit();
        res.json({ success: true });
    } catch (error) {
        console.error("Error saving users:", error);
        res.status(500).json({ error: "Error saving users" });
    }
});

app.get("/api/storage/custom/:localeId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localeId = req.params.localeId.toLowerCase();
    try {
        const doc = await localeDoc(localeId).collection("storage_custom").doc("default").get();
        if (!doc.exists) {
            return res.status(404).json({ error: "No custom storage locations found for this locale." });
        }
        const data = doc.data() || {};
        res.json(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
        console.error(`Error fetching custom storage locations for ${localeId}:`, error);
        res.status(500).json({ error: "Error interno del servidor al obtener ubicaciones de almacenamiento personalizadas." });
    }
});

app.post("/api/storage/custom/:localeId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localeId = req.params.localeId.toLowerCase();
    const customLocations = req.body;

    if (!Array.isArray(customLocations)) {
        return res.status(400).json({ error: "Invalid data format. Expected an array of strings." });
    }

    try {
        await localeDoc(localeId).collection("storage_custom").doc("default").set({
            items: customLocations,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, message: "Custom storage locations saved successfully." });
    } catch (error) {
        console.error(`Error saving custom storage locations for ${localeId}:`, error);
        res.status(500).json({ error: "Error interno del servidor al guardar ubicaciones de almacenamiento personalizadas." });
    }
});

app.post("/api/transit-list/save/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();
    const transitList = req.body;

    if (!localId || !Array.isArray(transitList)) {
        return res.status(400).json({ error: "Faltan datos (localId o transitList)." });
    }

    try {
        const dateId = ymdDot();
        await localeDoc(localId).collection("transitos").doc(dateId).set({
            items: transitList,
            updatedAt: new Date().toISOString()
        });
        res.json({ success: true, path: `locales/${localId}/transitos/${dateId}` });
    } catch (error) {
        console.error("Error saving transit list:", error);
        res.status(500).json({ error: "Error interno del servidor al guardar la lista de tránsito." });
    }
});

app.get("/api/transit-list/latest/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();

    try {
        const snapshot = await localeDoc(localId).collection("transitos").get();

        if (snapshot.empty) {
            return res.json([]);
        }

        const latestDoc = snapshot.docs.sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
        const data = latestDoc.data() || {};
        res.json(Array.isArray(data.items) ? data.items : data);
    } catch (error) {
        console.error(`Error fetching latest transit list for ${localId}:`, error);
        res.json([]);
    }
});

app.post("/api/inventory/save-daily/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();
    const products = req.body;

    if (!localId || !Array.isArray(products)) {
        return res.status(400).json({ error: "Faltan datos (localId o productos)." });
    }

    try {
        const now = new Date();
        const payload = {
            fecha_procesado: now.toISOString(),
            total_productos: products.length,
            productos: products
        };
        const dateId = ymdDot(now);
        await localeDoc(localId).collection("inventarios").doc(dateId).set(payload);
        res.json({ success: true, path: `locales/${localId}/inventarios/${dateId}` });
    } catch (error) {
        console.error("Error saving daily inventory:", error);
        res.status(500).json({ error: "Error interno del servidor al guardar el inventario diario." });
    }
});

app.post("/api/inventory/save", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const { local, products, date } = req.body || {};
    const localId = String(local || "").toLowerCase();

    if (!localId || !Array.isArray(products)) {
        return res.status(400).json({ error: "Faltan datos (local o products)." });
    }

    try {
        const payload = {
            local: localId,
            date: date || null,
            fecha_procesado: new Date().toISOString(),
            total_productos: products.length,
            productos: products
        };
        await productListRef(localId).set(payload);
        res.json({ success: true, path: `locales/${localId}/product_lists/latest` });
    } catch (error) {
        console.error("Error saving inventory product list:", error);
        res.status(500).json({ error: "Error interno del servidor al guardar lista de productos." });
    }
});

app.get("/api/inventory/last-update/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();

    try {
        const doc = await productListRef(localId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: "No hay lista de productos para este local." });
        }
        const data = doc.data() || {};
        return res.json({ lastUpdate: data.fecha_procesado || null });
    } catch (error) {
        console.error(`Error fetching inventory last update for ${localId}:`, error);
        return res.status(500).json({ error: "Error al consultar última actualización." });
    }
});

app.get("/api/products/list/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();

    try {
        const doc = await productListRef(localId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: "No hay lista de productos para este local." });
        }
        const data = doc.data() || {};
        res.json({ productos: Array.isArray(data.productos) ? data.productos : [] });
    } catch (error) {
        console.error(`Error fetching product list for ${localId}:`, error);
        res.status(500).json({ error: "Error al obtener lista de productos." });
    }
});

app.post("/api/exp/save/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();
    const data = req.body;

    if (!localId || !Array.isArray(data)) {
        return res.status(400).json({ error: "Faltan datos (localId o data)." });
    }

    try {
        const now = new Date();
        const payload = {
            fecha_procesado: now.toISOString(),
            total_items: data.length,
            items: data
        };
        const dateId = ymdDot(now);
        await localeDoc(localId).collection("exp").doc(dateId).set(payload);
        res.json({ success: true, path: `locales/${localId}/exp/${dateId}` });
    } catch (error) {
        console.error("Error saving exp data:", error);
        res.status(500).json({ error: "Error interno del servidor al guardar los datos." });
    }
});

app.post("/api/exp/save-processed", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const { local, date, jsonContent, tableContent } = req.body;

    if (!local || !date || !jsonContent || !tableContent) {
        return res.status(400).json({ error: "Faltan datos requeridos." });
    }

    try {
        const localId = String(local).toLowerCase();
        const parsed = typeof jsonContent === "string" ? JSON.parse(jsonContent) : jsonContent;
        await localeDoc(localId).collection("inventarios").doc("latest").set({
            ...parsed,
            processedDate: date,
            tableContent,
            savedAt: new Date().toISOString()
        });
        res.json({ success: true, jsonPath: `locales/${localId}/inventarios/latest` });
    } catch (error) {
        console.error("Error saving processed exp data:", error);
        res.status(500).json({ error: "Error interno del servidor al guardar los archivos." });
    }
});

app.get("/api/exp/last-update/:local", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.local.toLowerCase();

    try {
        const doc = await localeDoc(localId).collection("inventarios").doc("latest").get();
        if (!doc.exists) {
            return res.status(404).json({ error: "No experimental inventory file found for this locale." });
        }
        const data = doc.data() || {};
        res.json({ lastUpdate: data.fecha_procesado || data.savedAt || null });
    } catch (error) {
        console.error(`Error fetching last experimental update for ${localId}:`, error);
        res.status(500).json({ error: "Error reading experimental inventory data." });
    }
});

app.get("/api/inventory/latest/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();

    try {
        const doc = await localeDoc(localId).collection("inventarios").doc("latest").get();
        if (!doc.exists) {
            return res.status(404).json({ error: "No inventory files found." });
        }
        res.json(doc.data());
    } catch (error) {
        console.error(`Error fetching latest inventory for ${localId}:`, error);
        res.status(500).json({ error: "Error interno del servidor al obtener el inventario más reciente." });
    }
});

app.post("/api/inventory/revision/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();
    const updatedProduct = req.body;

    if (!localId || !updatedProduct || !updatedProduct.codigo || updatedProduct.real === undefined) {
        return res.status(400).json({ error: "Faltan datos necesarios para la revisión." });
    }

    try {
        const ref = localeDoc(localId).collection("asignaciones").doc("latest");
        const snapshot = await ref.get();

        if (!snapshot.exists) {
            return res.status(404).json({ error: "No se encontraron archivos de inventario para este local." });
        }

        const assignment = snapshot.data() || {};
        const products = Array.isArray(assignment.productos) ? assignment.productos : [];

        let productFound = false;
        assignment.productos = products.map((product) => {
            if (product.codigo === updatedProduct.codigo) {
                productFound = true;
                return {
                    ...product,
                    real: updatedProduct.real,
                    diferencia: updatedProduct.diferencia,
                    estado: updatedProduct.estado,
                    encargado: updatedProduct.encargado,
                    fecha_revision: updatedProduct.fecha_revision,
                    destacado: updatedProduct.destacado
                };
            }
            return product;
        });

        if (!productFound) {
            return res.status(404).json({ error: `Producto con código ${updatedProduct.codigo} no encontrado.` });
        }

        await ref.set(assignment);
        res.json({ success: true, message: `Producto ${updatedProduct.codigo} actualizado.` });
    } catch (error) {
        console.error("Error updating inventory revision:", error);
        res.status(500).json({ error: "Error interno del servidor al actualizar la revisión de inventario." });
    }
});

app.post("/api/assignment/save/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();
    const assignmentData = req.body;

    if (!localId || !assignmentData) {
        return res.status(400).json({ error: "Faltan datos (localId o assignmentData)." });
    }

    try {
        await localeDoc(localId).collection("asignaciones").doc("latest").set(assignmentData);
        res.json({ success: true, path: `locales/${localId}/asignaciones/latest` });
    } catch (error) {
        console.error("Error saving assignment:", error);
        res.status(500).json({ error: "Error interno del servidor al guardar la asignación." });
    }
});

app.get("/api/assignment/latest/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();

    try {
        const doc = await localeDoc(localId).collection("asignaciones").doc("latest").get();
        if (!doc.exists) {
            return res.status(404).json({ error: "No assignment files found." });
        }
        res.json(doc.data());
    } catch (error) {
        console.error(`Error fetching latest assignment for ${localId}:`, error);
        res.status(500).json({ error: "Error interno del servidor al obtener la asignación más reciente." });
    }
});

app.post("/api/assignment/resolve-difference/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();
    const { codigo } = req.body || {};

    if (!codigo) {
        return res.status(400).json({ error: "Falta codigo." });
    }

    try {
        const ref = localeDoc(localId).collection("asignaciones").doc("latest");
        const snapshot = await ref.get();
        if (!snapshot.exists) {
            return res.status(404).json({ error: "No assignment files found." });
        }

        const assignment = snapshot.data() || {};
        const productos = Array.isArray(assignment.productos) ? assignment.productos : [];

        let found = false;
        assignment.productos = productos.map((product) => {
            if (String(product.codigo) === String(codigo)) {
                found = true;
                return {
                    ...product,
                    real: product.cantidad,
                    diferencia: 0,
                    fecha_revision: new Date().toISOString()
                };
            }
            return product;
        });

        if (!found) {
            return res.status(404).json({ error: `Producto ${codigo} no encontrado.` });
        }

        await ref.set(assignment);
        return res.json({ success: true });
    } catch (error) {
        console.error(`Error resolving difference for ${localId}:`, error);
        return res.status(500).json({ error: "Error al cuadrar diferencia." });
    }
});

app.get("/api/movements/custom-lists/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();

    try {
        const doc = await movementsCustomListsRef(localId).get();
        if (!doc.exists) return res.json([]);
        const data = doc.data() || {};
        return res.json(Array.isArray(data.lists) ? data.lists : []);
    } catch (error) {
        console.error(`Error fetching custom lists for ${localId}:`, error);
        return res.status(500).json({ error: "Error al obtener listas personalizadas." });
    }
});

app.post("/api/movements/custom-lists/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = req.params.localId.toLowerCase();
    const lists = Array.isArray(req.body) ? req.body : [];

    try {
        await movementsCustomListsRef(localId).set({
            lists,
            updatedAt: new Date().toISOString()
        });
        return res.json({ success: true });
    } catch (error) {
        console.error(`Error saving custom lists for ${localId}:`, error);
        return res.status(500).json({ error: "Error al guardar listas personalizadas." });
    }
});

app.get("/api/fondo/list/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = String(req.params.localId || "").toLowerCase();

    try {
        const snapshot = await localeDoc(localId).collection("fondo").doc("records").get();
        if (!snapshot.exists) {
            return res.json([]);
        }

        const data = snapshot.data() || {};
        return res.json(Array.isArray(data.records) ? data.records : []);
    } catch (error) {
        console.error(`Error fetching fondo list for ${localId}:`, error);
        return res.status(500).json({ error: "Error al obtener lista de fondo." });
    }
});

app.post("/api/fondo/list/:localId", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localId = String(req.params.localId || "").toLowerCase();
    const records = Array.isArray(req.body) ? req.body : [];

    try {
        await localeDoc(localId).collection("fondo").doc("records").set({
            records,
            updatedAt: new Date().toISOString()
        });
        return res.json({ success: true });
    } catch (error) {
        console.error(`Error saving fondo list for ${localId}:`, error);
        return res.status(500).json({ error: "Error al guardar lista de fondo." });
    }
});

app.get("/api/calendar/events", async (req, res) => {
    if (!ensureFirestore(res)) return;

    const from = parseDateKey(req.query.from) || "1900-01-01";
    const to = parseDateKey(req.query.to) || "2999-12-31";
    const viewer = {
        rut: normalizeText(req.query.user_rut),
        cargo: normalizeText(req.query.user_cargo),
        localeId: normalizeText(req.query.user_locale_id).toLowerCase()
    };
    const actorRole = normalizeCargo(viewer.cargo);
    const allowSuperAdminAll = actorRole === "super_admin" && String(req.query.sa_view_all || "") === "1";

    try {
        const snapshot = await calendarEventsCollection()
            .where("date", ">=", from)
            .where("date", "<=", to)
            .get();

        const items = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((event) => (allowSuperAdminAll ? true : isVisibleForUser(event, viewer)))
            .sort((a, b) => {
                const ka = `${a.date || ""} ${a.startTime || ""}`;
                const kb = `${b.date || ""} ${b.startTime || ""}`;
                return ka < kb ? -1 : ka > kb ? 1 : 0;
            });

        return res.json(items);
    } catch (error) {
        console.error("Error fetching calendar events:", error);
        return res.status(500).json({ error: "Error al obtener eventos de calendario." });
    }
});

app.get("/api/calendar/count/today", async (req, res) => {
    if (!ensureFirestore(res)) return;

    const today = new Date().toISOString().slice(0, 10);
    const viewer = {
        rut: normalizeText(req.query.user_rut),
        cargo: normalizeText(req.query.user_cargo),
        localeId: normalizeText(req.query.user_locale_id).toLowerCase()
    };
    const actorRole = normalizeCargo(viewer.cargo);
    const allowSuperAdminAll = actorRole === "super_admin" && String(req.query.sa_view_all || "") === "1";

    try {
        const snapshot = await calendarEventsCollection().where("date", "==", today).get();
        const events = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((event) => (allowSuperAdminAll ? true : isVisibleForUser(event, viewer)));

        const unread = events.filter((event) => !Array.isArray(event.readBy) || !event.readBy.includes(viewer.rut)).length;
        const pendingTasks = events.filter((event) => {
            if (event.publicationType !== "tarea") return false;
            return !Array.isArray(event.completedBy) || !event.completedBy.includes(viewer.rut);
        }).length;
        const unreadIncomplete = events.filter((event) => {
            const isRead = Array.isArray(event.readBy) && event.readBy.includes(viewer.rut);
            const isCompleted = Array.isArray(event.completedBy) && event.completedBy.includes(viewer.rut);
            return !isRead && !isCompleted;
        }).length;

        return res.json({
            date: today,
            total: events.length,
            unread,
            pendingTasks,
            unreadIncomplete
        });
    } catch (error) {
        console.error("Error counting today's calendar events:", error);
        return res.status(500).json({ error: "Error al contar recordatorios del día." });
    }
});

app.post("/api/calendar/events", async (req, res) => {
    if (!ensureFirestore(res)) return;

    const actor = req.body?.actor || {};
    const rawEvent = req.body?.event || {};
    const normalized = normalizeCalendarEventPayload(rawEvent, actor);
    if (normalized.error) {
        return res.status(400).json({ error: normalized.error });
    }

    const payload = normalized.value;
    const actorRut = normalizeText(actor.rut);
    const actorName = normalizeText(actor.name || actor.names);
    const actorCargo = normalizeText(actor.cargo);
    const actorLocale = normalizeText(actor.locale_id || actor.localeId).toLowerCase();

    try {
        const nowIso = new Date().toISOString();
        const hasId = Boolean(rawEvent.id);
        const ref = hasId ? calendarEventsCollection().doc(String(rawEvent.id)) : calendarEventsCollection().doc();

        if (hasId) {
            const current = await ref.get();
            if (!current.exists) {
                return res.status(404).json({ error: "Evento no encontrado." });
            }

            const existing = current.data() || {};
            const actorRole = normalizeCargo(actorCargo);
            const isOwner = String(existing?.createdBy?.rut || "") === actorRut;
            if (!(isOwner || actorRole === "super_admin")) {
                return res.status(403).json({ error: "No puedes editar este evento." });
            }
        }

        const docPayload = {
            ...payload,
            createdBy: {
                rut: actorRut,
                name: actorName,
                cargo: actorCargo,
                localeId: actorLocale
            },
            updatedAt: nowIso
        };
        if (!hasId) {
            docPayload.createdAt = nowIso;
        }

        await ref.set(docPayload, { merge: true });
        return res.json({ success: true, id: ref.id });
    } catch (error) {
        console.error("Error saving calendar event:", error);
        return res.status(500).json({ error: "Error al guardar evento de calendario." });
    }
});

app.post("/api/calendar/events/:eventId/read", async (req, res) => {
    if (!ensureFirestore(res)) return;

    const eventId = String(req.params.eventId || "");
    const userRut = normalizeText(req.body?.user_rut);
    if (!eventId || !userRut) {
        return res.status(400).json({ error: "Faltan datos para marcar lectura." });
    }

    try {
        const ref = calendarEventsCollection().doc(eventId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: "Evento no encontrado." });

        const data = snap.data() || {};
        const readBy = Array.isArray(data.readBy) ? data.readBy.slice() : [];
        const shouldMarkAsRead = req.body?.read !== false;

        if (shouldMarkAsRead && !readBy.includes(userRut)) {
            readBy.push(userRut);
        }
        if (!shouldMarkAsRead) {
            const index = readBy.indexOf(userRut);
            if (index >= 0) readBy.splice(index, 1);
        }

        await ref.set({ readBy, updatedAt: new Date().toISOString() }, { merge: true });
        return res.json({ success: true });
    } catch (error) {
        console.error("Error marking event as read:", error);
        return res.status(500).json({ error: "Error al marcar lectura." });
    }
});

app.post("/api/calendar/events/:eventId/complete", async (req, res) => {
    if (!ensureFirestore(res)) return;

    const eventId = String(req.params.eventId || "");
    const userRut = normalizeText(req.body?.user_rut);
    const completed = req.body?.completed !== false;
    if (!eventId || !userRut) {
        return res.status(400).json({ error: "Faltan datos para marcar tarea." });
    }

    try {
        const ref = calendarEventsCollection().doc(eventId);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: "Evento no encontrado." });

        const data = snap.data() || {};
        const completedBy = Array.isArray(data.completedBy) ? data.completedBy.slice() : [];

        if (completed && !completedBy.includes(userRut)) {
            completedBy.push(userRut);
        }
        if (!completed) {
            const index = completedBy.indexOf(userRut);
            if (index >= 0) completedBy.splice(index, 1);
        }

        await ref.set({ completedBy, updatedAt: new Date().toISOString() }, { merge: true });
        return res.json({ success: true, completedBy });
    } catch (error) {
        console.error("Error marking event completion:", error);
        return res.status(500).json({ error: "Error al actualizar estado de tarea." });
    }
});

app.get("/api/locales", async (req, res) => {
    if (!ensureFirestore(res)) return;
    try {
        const snapshot = await db.collection("locales").get();
        const locales = snapshot.docs.map((doc) => doc.data());
        locales.sort((a, b) => String(a.id || "").localeCompare(String(b.id || "")));
        res.json(locales);
    } catch (error) {
        console.error("Error fetching locales:", error);
        res.status(500).json({ error: "Error fetching locales." });
    }
});

app.post("/api/locales", async (req, res) => {
    if (!ensureFirestore(res)) return;

    const parsed = buildLocalePayload(req.body || {});
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const localeData = parsed.value;
    const docId = String(localeData.id).toLowerCase();

    try {
        const ref = db.collection("locales").doc(docId);
        const exists = await ref.get();
        const queryExists = await db.collection("locales").where("id", "==", localeData.id).limit(1).get();
        if (exists.exists || !queryExists.empty) {
            return res.status(409).json({ error: `El local ${localeData.id} ya existe.` });
        }

        await ref.set({
            ...localeData,
            createdAt: new Date().toISOString()
        });
        return res.json({ success: true, locale: localeData });
    } catch (error) {
        console.error("Error creating locale:", error);
        return res.status(500).json({ error: "Error creating locale." });
    }
});

app.put("/api/locales/:id", async (req, res) => {
    if (!ensureFirestore(res)) return;

    const incomingId = String(req.params.id || "").toUpperCase();
    const parsed = buildLocalePayload(req.body || {});
    if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
    }

    const localeData = parsed.value;
    try {
        const ref = await findLocaleDocRefById(incomingId);
        if (!ref) {
            return res.status(404).json({ error: `No existe el local ${incomingId}.` });
        }

        if (localeData.id === incomingId) {
            await ref.set(localeData, { merge: true });
            return res.json({ success: true, locale: localeData });
        }

        const targetRef = db.collection("locales").doc(localeData.id.toLowerCase());
        const targetExists = await targetRef.get();
        const queryTargetExists = await db.collection("locales").where("id", "==", localeData.id).limit(1).get();
        if (targetExists.exists || !queryTargetExists.empty) {
            return res.status(409).json({ error: `Ya existe el local ${localeData.id}.` });
        }

        await copyDocTree(ref, targetRef);
        await targetRef.set(
            {
                ...localeData,
                migratedFrom: incomingId,
                migratedAt: new Date().toISOString()
            },
            { merge: true }
        );
        await deleteDocTree(ref);

        return res.json({
            success: true,
            locale: localeData,
            migrated: true,
            oldId: incomingId,
            newId: localeData.id
        });
    } catch (error) {
        console.error("Error updating locale:", error);
        return res.status(500).json({ error: "Error updating locale." });
    }
});

app.delete("/api/locales/:id", async (req, res) => {
    if (!ensureFirestore(res)) return;
    const localeId = String(req.params.id || "").toLowerCase();

    try {
        const ref = await findLocaleDocRefById(localeId);
        if (!ref) {
            return res.status(404).json({ error: "Local no encontrado." });
        }

        await ref.delete();
        return res.json({ success: true });
    } catch (error) {
        console.error("Error deleting locale:", error);
        return res.status(500).json({ error: "Error deleting locale." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
