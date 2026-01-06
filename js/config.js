// Master Firebase config for authentication portal
const MASTER_CONFIG = {
    apiKey: "AIzaSyYOUR_MASTER_API_KEY",
    authDomain: "sbm-master.firebaseapp.com",
    projectId: "sbm-master",
    storageBucket: "sbm-master.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456"
};

class ConfigManager {
    constructor() {
        this.userConfig = null;
        this.masterConfig = MASTER_CONFIG;
        this.init();
    }

    init() {
        // Load user config from localStorage
        this.loadUserConfig();
        
        // Initialize form if on config page
        if (document.getElementById('configForm')) {
            this.setupConfigForm();
        }
    }

    loadUserConfig() {
        const savedConfig = localStorage.getItem('sbm_firebase_config');
        if (savedConfig) {
            try {
                this.userConfig = JSON.parse(savedConfig);
                console.log('Loaded user config:', this.userConfig);
            } catch (error) {
                console.error('Error parsing saved config:', error);
                localStorage.removeItem('sbm_firebase_config');
            }
        }
    }

    saveUserConfig(config) {
        try {
            // Validate required fields
            const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
            for (const field of required) {
                if (!config[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            this.userConfig = config;
            localStorage.setItem('sbm_firebase_config', JSON.stringify(config));
            
            // Also set a flag that config is complete
            localStorage.setItem('sbm_config_complete', 'true');
            
            return true;
        } catch (error) {
            console.error('Error saving config:', error);
            return false;
        }
    }

    getUserConfig() {
        return this.userConfig;
    }

    getMasterConfig() {
        return this.masterConfig;
    }

    setupConfigForm() {
        const form = document.getElementById('configForm');
        
        // Load existing config if available
        if (this.userConfig) {
            Object.keys(this.userConfig).forEach(key => {
                const input = document.getElementById(key);
                if (input) {
                    input.value = this.userConfig[key];
                }
            });
        }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const config = {
                apiKey: document.getElementById('apiKey').value.trim(),
                authDomain: document.getElementById('authDomain').value.trim(),
                projectId: document.getElementById('projectId').value.trim(),
                storageBucket: document.getElementById('storageBucket').value.trim(),
                messagingSenderId: document.getElementById('messagingSenderId').value.trim(),
                appId: document.getElementById('appId').value.trim()
            };

            if (this.saveUserConfig(config)) {
                // Show success message
                this.showAlert('Configuration saved successfully! Redirecting...', 'success');
                
                // Redirect to auth page after 2 seconds
                setTimeout(() => {
                    window.location.href = 'auth.html';
                }, 2000);
            } else {
                this.showAlert('Error saving configuration. Please check your values.', 'error');
            }
        });
    }

    showAlert(message, type = 'info') {
        // Remove existing alerts
        const existingAlert = document.querySelector('.config-alert');
        if (existingAlert) existingAlert.remove();

        const alert = document.createElement('div');
        alert.className = `config-alert fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        alert.textContent = message;
        
        document.body.appendChild(alert);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 5000);
    }

    isConfigComplete() {
        return !!localStorage.getItem('sbm_config_complete') && !!this.userConfig;
    }

    clearConfig() {
        localStorage.removeItem('sbm_firebase_config');
        localStorage.removeItem('sbm_config_complete');
        this.userConfig = null;
    }
}

// Initialize ConfigManager
const configManager = new ConfigManager();

// Check if config is complete on page load
if (window.location.pathname.endsWith('index.html') && configManager.isConfigComplete()) {
    window.location.href = 'auth.html';
}
