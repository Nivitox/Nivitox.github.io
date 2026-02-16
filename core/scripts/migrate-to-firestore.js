/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DATA_DIR = path.resolve(__dirname, "../../data");
const USERS_PATH = path.join(DATA_DIR, "global", "users.json");
const LOCALES_PATH = path.join(DATA_DIR, "global", "locales.json");

function requireJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeLocaleId(raw) {
    return String(raw || "").trim().toLowerCase();
}

function readServiceAccount() {
    const cliPath = process.argv[2];
    const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const keyPath = cliPath || envPath;

    if (!keyPath) {
        throw new Error(
            "Missing service account path. Use arg 1 or FIREBASE_SERVICE_ACCOUNT_KEY env var."
        );
    }

    const absolute = path.resolve(keyPath);
    const content = fs.readFileSync(absolute, "utf8");
    return JSON.parse(content);
}

function classifyFile(fileName) {
    const assignment = /^([a-z0-9]+)-asignacion\.json$/i.exec(fileName);
    if (assignment) {
        return {
            type: "assignment_latest",
            localeId: normalizeLocaleId(assignment[1]),
            docId: "latest"
        };
    }

    const inventoryLatest = /^([a-z0-9]+)-inventario\.json$/i.exec(fileName);
    if (inventoryLatest) {
        return {
            type: "inventory_latest",
            localeId: normalizeLocaleId(inventoryLatest[1]),
            docId: "latest"
        };
    }

    const datedInventory = /^([a-z0-9]+)-(\d{4}\.\d{2}\.\d{2}) - inventario\.json$/i.exec(fileName);
    if (datedInventory) {
        return {
            type: "inventory_daily",
            localeId: normalizeLocaleId(datedInventory[1]),
            docId: datedInventory[2]
        };
    }

    const datedTransit = /^([a-z0-9]+)-(\d{4}\.\d{2}\.\d{2}) - transito\.json$/i.exec(fileName);
    if (datedTransit) {
        return {
            type: "transit_daily",
            localeId: normalizeLocaleId(datedTransit[1]),
            docId: datedTransit[2]
        };
    }

    const storageCustom = /^([a-z0-9]+)-almacenamiento\.json$/i.exec(fileName);
    if (storageCustom) {
        return {
            type: "storage_custom",
            localeId: normalizeLocaleId(storageCustom[1]),
            docId: "default"
        };
    }

    return null;
}

function safeSnapshotDocId(fileName) {
    return fileName.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function clearCollection(collectionRef) {
    const snapshot = await collectionRef.get();
    for (const item of snapshot.docs) {
        await item.ref.delete();
    }
}

async function clearLocaleCollection(db) {
    const locales = await db.collection("locales").get();
    for (const locale of locales.docs) {
        const localeRef = db.collection("locales").doc(locale.id);
        await clearCollection(localeRef.collection("inventarios"));
        await clearCollection(localeRef.collection("asignaciones"));
        await clearCollection(localeRef.collection("transitos"));
        await clearCollection(localeRef.collection("storage_custom"));
        await localeRef.delete();
    }
}

async function migrate() {
    const serviceAccount = readServiceAccount();
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId
    });

    const db = admin.firestore();
    const reset = process.argv.includes("--reset");
    const summary = {
        users: 0,
        locales: 0,
        inventories: 0,
        assignments: 0,
        transits: 0,
        storageCustom: 0,
        snapshots: 0
    };

    if (reset) {
        await clearCollection(db.collection("users"));
        await clearCollection(db.collection("global_snapshots"));
        await clearLocaleCollection(db);
    }

    const users = toArray(requireJson(USERS_PATH));
    for (const user of users) {
        const rut = String(user.rut || "").trim();
        if (!rut) continue;
        await db.collection("users").doc(rut).set(user);
        summary.users += 1;
    }

    const locales = toArray(requireJson(LOCALES_PATH));
    for (const locale of locales) {
        const localeId = normalizeLocaleId(locale.id);
        if (!localeId) continue;
        await db.collection("locales").doc(localeId).set(locale);
        summary.locales += 1;
    }

    const topLevelFiles = fs
        .readdirSync(DATA_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => entry.name);

    for (const fileName of topLevelFiles) {
        const fullPath = path.join(DATA_DIR, fileName);
        const payload = requireJson(fullPath);
        const classification = classifyFile(fileName);

        if (!classification) {
            const docId = safeSnapshotDocId(fileName);
            await db
                .collection("global_snapshots")
                .doc(docId)
                .set({ file: fileName, data: payload, migratedAt: new Date().toISOString() });
            summary.snapshots += 1;
            continue;
        }

        const localeRef = db.collection("locales").doc(classification.localeId);
        if (classification.type.startsWith("inventory")) {
            await localeRef.collection("inventarios").doc(classification.docId).set(payload);
            summary.inventories += 1;
            continue;
        }

        if (classification.type === "assignment_latest") {
            await localeRef.collection("asignaciones").doc(classification.docId).set(payload);
            summary.assignments += 1;
            continue;
        }

        if (classification.type === "transit_daily") {
            await localeRef.collection("transitos").doc(classification.docId).set(payload);
            summary.transits += 1;
            continue;
        }

        if (classification.type === "storage_custom") {
            await localeRef.collection("storage_custom").doc(classification.docId).set({
                items: payload
            });
            summary.storageCustom += 1;
        }
    }

    console.log("Migration finished.");
    console.log(JSON.stringify(summary, null, 2));
}

migrate().catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
});
