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
    return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function classifyFile(fileName) {
    const assignment = /^([a-z0-9]+)-asignacion\.json$/i.exec(fileName);
    if (assignment) return { type: "assignment_latest", localeId: normalizeLocaleId(assignment[1]) };

    const inventoryLatest = /^([a-z0-9]+)-inventario\.json$/i.exec(fileName);
    if (inventoryLatest) return { type: "inventory_latest", localeId: normalizeLocaleId(inventoryLatest[1]) };

    const datedInventory = /^([a-z0-9]+)-(\d{4}\.\d{2}\.\d{2}) - inventario\.json$/i.exec(fileName);
    if (datedInventory) return { type: "inventory_daily", localeId: normalizeLocaleId(datedInventory[1]) };

    const datedTransit = /^([a-z0-9]+)-(\d{4}\.\d{2}\.\d{2}) - transito\.json$/i.exec(fileName);
    if (datedTransit) return { type: "transit_daily", localeId: normalizeLocaleId(datedTransit[1]) };

    const storageCustom = /^([a-z0-9]+)-almacenamiento\.json$/i.exec(fileName);
    if (storageCustom) return { type: "storage_custom", localeId: normalizeLocaleId(storageCustom[1]) };

    return { type: "snapshot", localeId: null };
}

async function validate() {
    const serviceAccount = readServiceAccount();
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId
    });

    const db = admin.firestore();
    const localUsers = toArray(requireJson(USERS_PATH));
    const localLocales = toArray(requireJson(LOCALES_PATH));
    const dataFiles = fs
        .readdirSync(DATA_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
        .map((entry) => entry.name);

    const expected = {
        users: localUsers.filter((u) => u.rut).length,
        locales: localLocales.filter((l) => l.id).length,
        inventories: 0,
        assignments: 0,
        transits: 0,
        storageCustom: 0,
        snapshots: 0
    };

    const localeExpect = new Map();
    for (const file of dataFiles) {
        const info = classifyFile(file);
        if (info.type === "snapshot") {
            expected.snapshots += 1;
            continue;
        }

        if (!localeExpect.has(info.localeId)) {
            localeExpect.set(info.localeId, { inventories: 0, assignments: 0, transits: 0, storageCustom: 0 });
        }
        const slot = localeExpect.get(info.localeId);

        if (info.type === "inventory_latest" || info.type === "inventory_daily") {
            expected.inventories += 1;
            slot.inventories += 1;
        } else if (info.type === "assignment_latest") {
            expected.assignments += 1;
            slot.assignments += 1;
        } else if (info.type === "transit_daily") {
            expected.transits += 1;
            slot.transits += 1;
        } else if (info.type === "storage_custom") {
            expected.storageCustom += 1;
            slot.storageCustom += 1;
        }
    }

    const actual = {
        users: (await db.collection("users").get()).size,
        locales: (await db.collection("locales").get()).size,
        inventories: 0,
        assignments: 0,
        transits: 0,
        storageCustom: 0,
        snapshots: (await db.collection("global_snapshots").get()).size
    };

    const localeDocs = await db.collection("locales").get();
    for (const locale of localeDocs.docs) {
        const localeRef = db.collection("locales").doc(locale.id);
        actual.inventories += (await localeRef.collection("inventarios").get()).size;
        actual.assignments += (await localeRef.collection("asignaciones").get()).size;
        actual.transits += (await localeRef.collection("transitos").get()).size;
        actual.storageCustom += (await localeRef.collection("storage_custom").get()).size;
    }

    const report = { expected, actual };
    const checks = Object.keys(expected).map((k) => ({
        metric: k,
        ok: expected[k] === actual[k],
        expected: expected[k],
        actual: actual[k]
    }));

    const failed = checks.filter((c) => !c.ok);
    console.log(JSON.stringify({ report, checks }, null, 2));

    if (failed.length > 0) {
        process.exitCode = 1;
    }
}

validate().catch((error) => {
    console.error("Validation failed:", error.message);
    process.exitCode = 1;
});
