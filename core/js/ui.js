export const UI = {
    showAlert(message, className) {
        const div = document.createElement('div');
        div.className = `alert alert-${className}`;
        div.appendChild(document.createTextNode(message));

        // Find container to insert alert (usually first child of container)
        const container = document.querySelector('.login-container .login-card');
        const form = container ? container.querySelector('form') : null;

        if (container && form) {
            container.insertBefore(div, form);
        } else {
            // Fallback if no specific container is found
            document.body.prepend(div);
        }

        // Remove after 3 seconds
        setTimeout(() => document.querySelector('.alert').remove(), 3000);
    }
};
