import { authManager } from './auth.js';

class FirestoreManager {
    constructor() {
        this.db = null;
        this.init();
    }

    async init() {
        try {
            // Get user Firebase app from auth manager
            const userApp = await this.getUserApp();
            this.db = firebase.firestore(userApp);
            
            // Enable offline persistence
            this.db.enablePersistence()
                .catch((err) => {
                    console.warn('Offline persistence failed:', err.code);
                });
            
            console.log('Firestore Manager initialized');
        } catch (error) {
            console.error('Failed to initialize Firestore:', error);
            throw error;
        }
    }

    async getUserApp() {
        // Wait for auth manager to be ready
        if (!authManager.userApp) {
            await new Promise(resolve => {
                const check = setInterval(() => {
                    if (authManager.userApp) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
        }
        return authManager.userApp;
    }

    // Generic CRUD Operations
    async addDocument(collection, data) {
        try {
            const user = firebase.auth(authManager.masterApp).currentUser;
            if (!user) throw new Error('User not authenticated');
            
            const docData = {
                ...data,
                userId: user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            const docRef = await this.db.collection(collection).add(docData);
            return { id: docRef.id, ...docData };
        } catch (error) {
            console.error(`Error adding to ${collection}:`, error);
            throw error;
        }
    }

    async updateDocument(collection, id, data) {
        try {
            const user = firebase.auth(authManager.masterApp).currentUser;
            if (!user) throw new Error('User not authenticated');
            
            const docRef = this.db.collection(collection).doc(id);
            const updateData = {
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await docRef.update(updateData);
            return { id, ...updateData };
        } catch (error) {
            console.error(`Error updating ${collection}/${id}:`, error);
            throw error;
        }
    }

    async deleteDocument(collection, id) {
        try {
            await this.db.collection(collection).doc(id).delete();
            return true;
        } catch (error) {
            console.error(`Error deleting ${collection}/${id}:`, error);
            throw error;
        }
    }

    async getDocument(collection, id) {
        try {
            const doc = await this.db.collection(collection).doc(id).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error(`Error getting ${collection}/${id}:`, error);
            throw error;
        }
    }

    async getDocuments(collection, whereClauses = [], orderBy = null, limit = null) {
        try {
            let query = this.db.collection(collection);
            
            // Add where clauses
            whereClauses.forEach(clause => {
                query = query.where(...clause);
            });
            
            // Add ordering
            if (orderBy) {
                query = query.orderBy(...orderBy);
            }
            
            // Add limit
            if (limit) {
                query = query.limit(limit);
            }
            
            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error getting ${collection}:`, error);
            throw error;
        }
    }

    // Real-time listeners
    onCollectionUpdate(collection, callback, whereClauses = []) {
        let query = this.db.collection(collection);
        
        whereClauses.forEach(clause => {
            query = query.where(...clause);
        });
        
        return query.onSnapshot((snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(docs);
        }, (error) => {
            console.error(`Error listening to ${collection}:`, error);
        });
    }

    // Product Management
    async addProduct(productData) {
        const required = ['name', 'sku', 'cost', 'price', 'stock'];
        required.forEach(field => {
            if (!productData[field] && productData[field] !== 0) {
                throw new Error(`Missing required field: ${field}`);
            }
        });
        
        const product = {
            ...productData,
            reorderLevel: productData.reorderLevel || 10,
            lowStock: productData.stock <= (productData.reorderLevel || 10),
            category: productData.category || 'General',
            unit: productData.unit || 'pcs',
            barcode: productData.barcode || '',
            lastRestocked: null,
            totalSold: 0,
            totalRevenue: 0
        };
        
        return await this.addDocument('products', product);
    }

    async updateStock(productId, quantityChange, reason = 'sale', reference = null) {
        const product = await this.getDocument('products', productId);
        if (!product) throw new Error('Product not found');
        
        const newStock = product.stock + quantityChange;
        if (newStock < 0) throw new Error('Insufficient stock');
        
        // Update product
        await this.updateDocument('products', productId, {
            stock: newStock,
            lowStock: newStock <= product.reorderLevel
        });
        
        // Log inventory change
        await this.addDocument('inventory_logs', {
            productId,
            productName: product.name,
            quantityChange,
            previousStock: product.stock,
            newStock,
            reason,
            reference,
            userId: firebase.auth(authManager.masterApp).currentUser.uid
        });
        
        return newStock;
    }

    // Financial Operations
    async recordTransaction(transactionData) {
        const required = ['type', 'amount', 'accountId', 'category'];
        required.forEach(field => {
            if (!transactionData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        });
        
        const transaction = {
            ...transactionData,
            status: 'completed',
            reconciled: false,
            notes: transactionData.notes || ''
        };
        
        // Update account balance
        if (transaction.type === 'income') {
            await this.updateAccountBalance(transaction.accountId, transaction.amount);
        } else if (transaction.type === 'expense') {
            await this.updateAccountBalance(transaction.accountId, -transaction.amount);
        } else if (transaction.type === 'transfer') {
            // Handle transfer between accounts
            if (!transactionData.toAccountId) {
                throw new Error('Transfer requires toAccountId');
            }
            await this.updateAccountBalance(transaction.accountId, -transaction.amount);
            await this.updateAccountBalance(transactionData.toAccountId, transaction.amount);
        }
        
        const result = await this.addDocument('transactions', transaction);
        
        // Record audit trail
        await this.auditLog('transaction', result.id, 'create', transactionData);
        
        return result;
    }

    async updateAccountBalance(accountId, amountChange) {
        const account = await this.getDocument('accounts', accountId);
        if (!account) throw new Error('Account not found');
        
        const newBalance = account.balance + amountChange;
        await this.updateDocument('accounts', accountId, {
            balance: newBalance,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return newBalance;
    }

    // Customer Management
    async addCustomer(customerData) {
        const customer = {
            ...customerData,
            totalPurchases: 0,
            outstandingBalance: customerData.outstandingBalance || 0,
            creditLimit: customerData.creditLimit || 0,
            lastPurchase: null,
            tags: customerData.tags || []
        };
        
        return await this.addDocument('customers', customer);
    }

    async updateCustomerBalance(customerId, amount, type = 'sale') {
        const customer = await this.getDocument('customers', customerId);
        if (!customer) throw new Error('Customer not found');
        
        let newBalance = customer.outstandingBalance;
        if (type === 'sale') {
            newBalance += amount;
        } else if (type === 'payment') {
            newBalance -= amount;
            if (newBalance < 0) newBalance = 0;
        }
        
        await this.updateDocument('customers', customerId, {
            outstandingBalance: newBalance,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return newBalance;
    }

    // Analytics Queries
    async getDailySales(date = new Date()) {
        const startOfDay = new Date(date.setHours(0, 0, 0, 0));
        const endOfDay = new Date(date.setHours(23, 59, 59, 999));
        
        const transactions = await this.getDocuments('transactions', [
            ['type', '==', 'income'],
            ['createdAt', '>=', startOfDay],
            ['createdAt', '<=', endOfDay]
        ]);
        
        return transactions.reduce((sum, t) => sum + t.amount, 0);
    }

    async getStockValue() {
        const products = await this.getDocuments('products');
        return products.reduce((sum, p) => sum + (p.stock * p.cost), 0);
    }

    async getFinancialSummary(startDate, endDate) {
        const transactions = await this.getDocuments('transactions', [
            ['createdAt', '>=', startDate],
            ['createdAt', '<=', endDate]
        ]);
        
        const summary = {
            income: 0,
            expenses: 0,
            transfers: 0,
            net: 0,
            byCategory: {}
        };
        
        transactions.forEach(t => {
            if (t.type === 'income') {
                summary.income += t.amount;
            } else if (t.type === 'expense') {
                summary.expenses += t.amount;
            } else if (t.type === 'transfer') {
                summary.transfers += t.amount;
            }
            
            if (!summary.byCategory[t.category]) {
                summary.byCategory[t.category] = 0;
            }
            summary.byCategory[t.category] += t.amount;
        });
        
        summary.net = summary.income - summary.expenses;
        return summary;
    }

    // Audit Trail
    async auditLog(entity, entityId, action, data) {
        const user = firebase.auth(authManager.masterApp).currentUser;
        
        return await this.addDocument('audit_logs', {
            entity,
            entityId,
            action,
            data: JSON.stringify(data),
            userId: user.uid,
            userEmail: user.email,
            ipAddress: '', // Would need additional tracking
            userAgent: navigator.userAgent
        });
    }

    // Data Export
    async exportCollection(collection) {
        const data = await this.getDocuments(collection);
        return data;
    }

    // Bulk Operations
    async batchAddDocuments(collection, items) {
        const batch = this.db.batch();
        const results = [];
        
        items.forEach(item => {
            const docRef = this.db.collection(collection).doc();
            const docData = {
                ...item,
                userId: firebase.auth(authManager.masterApp).currentUser.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            batch.set(docRef, docData);
            results.push({ id: docRef.id, ...docData });
        });
        
        await batch.commit();
        return results;
    }
}

// Initialize and export
const storeManager = new FirestoreManager();
export { storeManager };
