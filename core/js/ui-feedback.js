function ensureUiFeedbackStyles() {
    const id = "ui-feedback-style-link";
    if (document.getElementById(id)) return;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/styles/ui-feedback.css";
    document.head.appendChild(link);
}

let alertPatched = false;
let loadingOverlayCount = 0;

function ensureToastContainer() {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        container.setAttribute("aria-live", "polite");
        container.setAttribute("aria-atomic", "true");
        document.body.appendChild(container);
    }
    return container;
}

function ensureLoadingOverlay() {
    let overlay = document.getElementById("global-loading-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "global-loading-overlay";
        overlay.className = "global-loading-overlay";
        overlay.innerHTML = `
            <div class="global-loading-toast toast-message toast-info show" role="status" aria-live="polite" aria-busy="true">
                <span class="global-loading-spinner" aria-hidden="true"></span>
                <span class="global-loading-text">Cargando datos...</span>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    return overlay;
}

export function showLoadingOverlay(message = "Cargando datos...") {
    ensureUiFeedbackStyles();
    const overlay = ensureLoadingOverlay();
    const text = overlay.querySelector(".global-loading-text");
    if (text) text.textContent = String(message || "Cargando datos...");
    loadingOverlayCount += 1;
    overlay.classList.add("active");
}

export function hideLoadingOverlay() {
    const overlay = document.getElementById("global-loading-overlay");
    if (!overlay) return;
    loadingOverlayCount = Math.max(0, loadingOverlayCount - 1);
    if (loadingOverlayCount > 0) return;
    overlay.classList.remove("active");
    setTimeout(() => {
        if (!overlay.classList.contains("active")) overlay.remove();
    }, 160);
}

export function showToast(message, type = "info", durationMs = 2800, options = {}) {
    ensureUiFeedbackStyles();
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = `toast-message toast-${type}`;
    const safeMessage = String(message || "");
    const actionLabel = String(options?.actionLabel || "").trim();
    const onAction = typeof options?.onAction === "function" ? options.onAction : null;

    if (actionLabel && onAction) {
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-text"></span>
                <button type="button" class="toast-action-btn"></button>
            </div>
        `;
        const textNode = toast.querySelector(".toast-text");
        const actionBtn = toast.querySelector(".toast-action-btn");
        if (textNode) textNode.textContent = safeMessage;
        if (actionBtn) {
            actionBtn.textContent = actionLabel;
            actionBtn.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                try {
                    await onAction();
                } finally {
                    toast.classList.remove("show");
                    setTimeout(() => toast.remove(), 220);
                }
            });
        }
    } else {
        toast.textContent = safeMessage;
    }

    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 220);
    }, durationMs);
}

export function installGlobalAlertAsToast() {
    if (alertPatched || typeof window === "undefined") return;
    alertPatched = true;

    const nativeAlert = window.alert?.bind(window);
    window.__nativeAlert = nativeAlert;

    window.alert = (message) => {
        showToast(String(message || ""), "info");
    };
}

export function showConfirmDialog(message, title = "Confirmación") {
    ensureUiFeedbackStyles();
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "ui-confirm-overlay";
        overlay.innerHTML = `
            <div class="ui-confirm-dialog">
                <h2 class="ui-confirm-title"></h2>
                <p class="ui-confirm-message"></p>
                <div class="ui-confirm-actions">
                    <button class="btn btn-secondary ui-confirm-cancel">Cancelar</button>
                    <button class="btn btn-danger ui-confirm-ok">Confirmar</button>
                </div>
            </div>
        `;

        const titleNode = overlay.querySelector(".ui-confirm-title");
        const messageNode = overlay.querySelector(".ui-confirm-message");
        if (titleNode) titleNode.textContent = String(title || "Confirmación");
        if (messageNode) messageNode.textContent = String(message || "");

        const cleanup = (result) => {
            overlay.remove();
            resolve(Boolean(result));
        };

        overlay.querySelector(".ui-confirm-cancel")?.addEventListener("click", () => cleanup(false));
        overlay.querySelector(".ui-confirm-ok")?.addEventListener("click", () => cleanup(true));
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) cleanup(false);
        });
        document.body.appendChild(overlay);
    });
}
