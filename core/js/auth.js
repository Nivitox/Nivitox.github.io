import { firebaseReady, firestoreApi } from './firebase.js';
import { installGlobalAlertAsToast } from './ui-feedback.js';

installGlobalAlertAsToast();

export const Auth = {
    isAuthenticated: false,
    user: null,
    simulationUser: null,
    backNavigationInstalled: false,

    init() {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            this.user = JSON.parse(storedUser);
            this.isAuthenticated = true;
        }

        const storedSimulationUser = localStorage.getItem('sa_simulation_user');
        if (storedSimulationUser) {
            try {
                this.simulationUser = JSON.parse(storedSimulationUser);
            } catch {
                this.simulationUser = null;
                localStorage.removeItem('sa_simulation_user');
            }
        }

        this.installGlobalBackNavigation();
    },

    installGlobalBackNavigation() {
        if (this.backNavigationInstalled) {
            return;
        }
        this.backNavigationInstalled = true;

        document.addEventListener('click', (event) => {
            if (event.defaultPrevented) return;
            if (!(event.target instanceof Element)) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const backLink = event.target.closest(
                'a#back-button, a.btn-back, a.header-icon-btn[aria-label="Volver"], header a.btn.btn-sm[href="/pages/home.html"], header a.btn.btn-sm[href="/pages/inventario.html"], header a.btn.btn-sm[href="home.html"]'
            );
            if (!backLink) return;
            if (!(backLink instanceof HTMLAnchorElement)) return;
            if (backLink.target === '_blank') return;

            event.preventDefault();

            const fallbackHref = backLink.getAttribute('href') || '/pages/home.html';
            let hasInternalReferrer = false;
            try {
                if (document.referrer) {
                    const refUrl = new URL(document.referrer);
                    hasInternalReferrer = refUrl.origin === window.location.origin;
                }
            } catch {
                hasInternalReferrer = false;
            }

            if (window.history.length > 1 && hasInternalReferrer) {
                window.history.back();
                return;
            }

            window.location.href = fallbackHref;
        });
    },

    getUser() {
        return this.getEffectiveUser();
    },

    getRealUser() {
        return this.user;
    },

    isSuperAdmin(user) {
        const cargo = String(user?.cargo || '').toLowerCase();
        return cargo.includes('super admin');
    },

    canSimulate() {
        return this.isAuthenticated && this.isSuperAdmin(this.user);
    },

    getSimulationUser() {
        return this.simulationUser;
    },

    isSimulationActive() {
        return this.canSimulate() && !!this.simulationUser;
    },

    getEffectiveUser() {
        if (this.isSimulationActive()) {
            return this.simulationUser;
        }
        return this.user;
    },

    setSimulationUser(user) {
        if (!this.canSimulate()) return false;
        if (!user) return this.clearSimulationUser();
        this.simulationUser = user;
        localStorage.setItem('sa_simulation_user', JSON.stringify(user));
        return true;
    },

    clearSimulationUser() {
        this.simulationUser = null;
        localStorage.removeItem('sa_simulation_user');
        return true;
    },

    async login(username, password) {
        try {
            const users = await this.fetchUsers();

            // Login Logic: Match RUT, Code, Email or Name
            const user = users.find(u =>
                u.rut.toLowerCase() === username.toLowerCase() ||
                (u.worker_code && u.worker_code === username) ||
                (u.contact_email && u.contact_email.toLowerCase() === username.toLowerCase())
            );

            if (user && user.password === password) {
                // Check if disabled
                if (user.estado === 'Deshabilitado') {
                    throw new Error('Usuario deshabilitado.');
                }
                this.user = user;
                this.simulationUser = null;
                this.isAuthenticated = true;
                localStorage.setItem('user', JSON.stringify(this.user));
                localStorage.removeItem('sa_simulation_user');
                return this.user;
            } else {
                throw new Error('Credenciales inválidas.');
            }
        } catch (error) {
            console.error('Error en el login:', error);
            throw error;
        }
    },

    logout() {
        this.user = null;
        this.simulationUser = null;
        this.isAuthenticated = false;
        localStorage.removeItem('user');
        localStorage.removeItem('sa_simulation_user');
        window.location.href = '/';
    },

    checkAuth() {
        if (!this.isAuthenticated) {
            window.location.href = '/';
            return null;
        }
        return this.getEffectiveUser();
    },

    // --- User Management Methods ---

    async fetchUsers() {
        if (firebaseReady) {
            try {
                return await firestoreApi.fetchUsers();
            } catch (error) {
                console.error('Firebase fetchUsers failed, falling back to API:', error);
            }
        }

        const res = await fetch('/api/users');
        if (!res.ok) throw new Error("Failed to fetch users");
        return await res.json();
    },

    async saveUser(userData) {
        if (firebaseReady) {
            try {
                await firestoreApi.saveUser(userData);
                return true;
            } catch (error) {
                console.error('Firebase saveUser failed, falling back to API:', error);
            }
        }

        // Fallback to legacy file API
        let users = await this.fetchUsers();
        const index = users.findIndex(u => u.rut === userData.rut);
        if (index >= 0) users[index] = { ...users[index], ...userData };
        else users.push(userData);

        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(users)
        });

        if (!res.ok) throw new Error("Failed to save users");
        return true;
    },

    async deleteUser(rut) {
        if (firebaseReady) {
            try {
                await firestoreApi.deleteUser(rut);
                return true;
            } catch (error) {
                console.error('Firebase deleteUser failed, falling back to API:', error);
            }
        }

        // Fallback to legacy file API
        let users = await this.fetchUsers();
        const initialLength = users.length;
        users = users.filter(u => u.rut !== rut);

        if (users.length === initialLength) return; // Nothing deleted

        const res = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(users)
        });

        if (!res.ok) throw new Error("Failed to delete user");
        return true;
    }
};

Auth.init();
