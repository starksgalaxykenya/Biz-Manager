// Import config manager
import { configManager } from './config.js';

class AuthManager {
    constructor() {
        this.masterApp = null;
        this.userApp = null;
        this.currentUser = null;
        this.init();
    }

    async init() {
        try {
            // Check if config exists
            if (!configManager.isConfigComplete()) {
                window.location.href = 'index.html';
                return;
            }

            // Initialize Master Firebase App for authentication
            this.masterApp = firebase.initializeApp(
                configManager.getMasterConfig(), 
                'master'
            );

            // Initialize User Firebase App for user data
            this.userApp = firebase.initializeApp(
                configManager.getUserConfig(), 
                'user'
            );

            // Set up authentication state listener
            this.setupAuthListener();
            
            // Render auth UI
            this.renderAuthUI();
            
        } catch (error) {
            console.error('Auth initialization error:', error);
            this.showError('Failed to initialize authentication system.');
        }
    }

    setupAuthListener() {
        firebase.auth(this.masterApp).onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                console.log('User logged in:', user.email);
                
                // Check if user exists in user's Firestore
                await this.checkUserInDatabase(user);
                
                // Redirect to dashboard
                window.location.href = 'dashboard.html';
            } else {
                this.currentUser = null;
                console.log('User logged out');
            }
        });
    }

    async checkUserInDatabase(user) {
        const db = firebase.firestore(this.userApp);
        const userRef = db.collection('users').doc(user.uid);
        
        try {
            const doc = await userRef.get();
            
            if (!doc.exists) {
                // Create user record in user's Firestore
                await userRef.set({
                    email: user.email,
                    displayName: user.displayName || '',
                    businessName: '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    role: 'owner',
                    subscription: {
                        plan: 'free',
                        expiry: null,
                        active: true
                    }
                });
                
                // Initialize default data for new user
                await this.initializeDefaultData(user.uid);
            } else {
                // Update last login
                await userRef.update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            console.error('Error checking user in database:', error);
        }
    }

    async initializeDefaultData(userId) {
        const db = firebase.firestore(this.userApp);
        
        // Initialize default accounts
        const defaultAccounts = [
            {
                name: 'Cash',
                type: 'asset',
                balance: 0,
                currency: 'USD',
                isDefault: true
            },
            {
                name: 'Bank Account',
                type: 'asset',
                balance: 0,
                currency: 'USD',
                isDefault: false
            }
        ];

        const batch = db.batch();
        
        defaultAccounts.forEach(account => {
            const accountRef = db.collection('accounts').doc();
            batch.set(accountRef, {
                ...account,
                userId: userId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
    }

    renderAuthUI() {
        const container = document.getElementById('authContainer');
        
        container.innerHTML = `
            <div class="bg-white/90 backdrop-blur-sm rounded-xl p-6">
                <div class="space-y-6">
                    <!-- Login Form -->
                    <div id="loginForm">
                        <h2 class="text-xl font-bold text-gray-800 mb-4">Sign In</h2>
                        <form id="loginFormElement" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input type="email" id="loginEmail" required
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="your@email.com">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <input type="password" id="loginPassword" required
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="••••••••">
                            </div>
                            
                            <button type="submit"
                                class="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-all duration-200">
                                <i class="fas fa-sign-in-alt mr-2"></i>Sign In
                            </button>
                        </form>
                        
                        <div class="text-center mt-4">
                            <button id="showRegister" class="text-blue-600 hover:text-blue-800 text-sm">
                                Don't have an account? Register
                            </button>
                        </div>
                    </div>
                    
                    <!-- Register Form (hidden by default) -->
                    <div id="registerForm" class="hidden">
                        <h2 class="text-xl font-bold text-gray-800 mb-4">Create Account</h2>
                        <form id="registerFormElement" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
                                <input type="text" id="businessName" required
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="My Business Inc.">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input type="email" id="registerEmail" required
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="your@email.com">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <input type="password" id="registerPassword" required minlength="6"
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="••••••••">
                                <p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                                <input type="password" id="confirmPassword" required
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="••••••••">
                            </div>
                            
                            <button type="submit"
                                class="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition-all duration-200">
                                <i class="fas fa-user-plus mr-2"></i>Create Account
                            </button>
                        </form>
                        
                        <div class="text-center mt-4">
                            <button id="showLogin" class="text-blue-600 hover:text-blue-800 text-sm">
                                Already have an account? Sign In
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Toggle between login and register forms
        document.getElementById('showRegister').addEventListener('click', () => {
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
        });

        document.getElementById('showLogin').addEventListener('click', () => {
            document.getElementById('registerForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
        });

        // Login form submission
        document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });

        // Register form submission
        document.getElementById('registerFormElement').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            await firebase.auth(this.masterApp).signInWithEmailAndPassword(email, password);
            // Auth state listener will handle the redirect
        } catch (error) {
            this.showError(this.getAuthErrorMessage(error));
        }
    }

    async handleRegister() {
        const businessName = document.getElementById('businessName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Validate passwords match
        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }
        
        try {
            // Create user in master auth
            const userCredential = await firebase.auth(this.masterApp)
                .createUserWithEmailAndPassword(email, password);
            
            // Update user profile
            await userCredential.user.updateProfile({
                displayName: businessName
            });
            
            // User will be created in user's Firestore by the auth state listener
        } catch (error) {
            this.showError(this.getAuthErrorMessage(error));
        }
    }

    getAuthErrorMessage(error) {
        switch (error.code) {
            case 'auth/invalid-email':
                return 'Invalid email address.';
            case 'auth/user-disabled':
                return 'This account has been disabled.';
            case 'auth/user-not-found':
                return 'No account found with this email.';
            case 'auth/wrong-password':
                return 'Incorrect password.';
            case 'auth/email-already-in-use':
                return 'Email already registered.';
            case 'auth/weak-password':
                return 'Password is too weak.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your connection.';
            default:
                return 'Authentication failed. Please try again.';
        }
    }

    showError(message) {
        // Remove existing error messages
        const existingError = document.querySelector('.auth-error');
        if (existingError) existingError.remove();

        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-error mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm';
        errorDiv.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-exclamation-circle mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        const container = document.getElementById('authContainer');
        container.querySelector('.bg-white\\/90').prepend(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    async logout() {
        try {
            await firebase.auth(this.masterApp).signOut();
            window.location.href = 'auth.html';
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
}

// Initialize AuthManager
const authManager = new AuthManager();

// Export for use in other modules
export { authManager };
