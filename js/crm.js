import { storeManager } from './store.js';

class CRMManager {
    constructor() {
        this.customers = [];
        this.init();
    }

    async init() {
        await this.loadCustomers();
    }

    async loadCustomers() {
        try {
            this.customers = await storeManager.getDocuments('customers');
            return this.customers;
        } catch (error) {
            console.error('Error loading customers:', error);
            throw error;
        }
    }

    // Customer CRUD Operations
    async createCustomer(customerData) {
        const required = ['name', 'email'];
        required.forEach(field => {
            if (!customerData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        });

        const customer = {
            ...customerData,
            totalPurchases: 0,
            totalSpent: 0,
            outstandingBalance: customerData.outstandingBalance || 0,
            creditLimit: customerData.creditLimit || 0,
            creditUsed: 0,
            lastPurchase: null,
            firstPurchase: null,
            tags: customerData.tags || [],
            notes: customerData.notes || '',
            customerSince: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };

        const result = await storeManager.addDocument('customers', customer);
        this.customers.push(result);
        return result;
    }

    async updateCustomer(customerId, updates) {
        const result = await storeManager.updateDocument('customers', customerId, updates);
        
        // Update local cache
        const index = this.customers.findIndex(c => c.id === customerId);
        if (index !== -1) {
            this.customers[index] = { ...this.customers[index], ...updates };
        }
        
        return result;
    }

    async deleteCustomer(customerId) {
        const success = await storeManager.deleteDocument('customers', customerId);
        if (success) {
            this.customers = this.customers.filter(c => c.id !== customerId);
        }
        return success;
    }

    // Customer Interactions
    async recordInteraction(customerId, interactionData) {
        const interaction = {
            ...interactionData,
            customerId,
            userId: firebase.auth().currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            followUpRequired: interactionData.followUpRequired || false,
            followUpDate: interactionData.followUpDate || null
        };

        return await storeManager.addDocument('customer_interactions', interaction);
    }

    async getCustomerInteractions(customerId, limit = 50) {
        return await storeManager.getDocuments('customer_interactions', 
            [['customerId', '==', customerId]], 
            ['timestamp', 'desc'], 
            limit
        );
    }

    // Purchase History
    async recordPurchase(customerId, purchaseData) {
        const purchase = {
            ...purchaseData,
            customerId,
            status: 'completed',
            paymentMethod: purchaseData.paymentMethod || 'cash',
            taxAmount: purchaseData.taxAmount || 0,
            discountAmount: purchaseData.discountAmount || 0,
            netAmount: purchaseData.netAmount || 0
        };

        const result = await storeManager.addDocument('sales', purchase);
        
        // Update customer stats
        await this.updateCustomerPurchaseStats(customerId, purchase.amount);
        
        return result;
    }

    async updateCustomerPurchaseStats(customerId, amount) {
        const customer = await storeManager.getDocument('customers', customerId);
        if (!customer) return;

        const updates = {
            totalPurchases: customer.totalPurchases + 1,
            totalSpent: customer.totalSpent + amount,
            lastPurchase: firebase.firestore.FieldValue.serverTimestamp(),
            creditUsed: customer.outstandingBalance
        };

        if (!customer.firstPurchase) {
            updates.firstPurchase = firebase.firestore.FieldValue.serverTimestamp();
        }

        await storeManager.updateDocument('customers', customerId, updates);
    }

    async getCustomerPurchaseHistory(customerId, limit = 100) {
        return await storeManager.getDocuments('sales', 
            [['customerId', '==', customerId]], 
            ['createdAt', 'desc'], 
            limit
        );
    }

    // Credit Management
    async updateCustomerCredit(customerId, amount, type = 'increase') {
        const customer = await storeManager.getDocument('customers', customerId);
        if (!customer) throw new Error('Customer not found');

        let newBalance = customer.outstandingBalance;
        
        if (type === 'increase') {
            newBalance += amount;
        } else if (type === 'decrease') {
            newBalance -= amount;
            if (newBalance < 0) newBalance = 0;
        } else if (type === 'payment') {
            newBalance -= amount;
            if (newBalance < 0) newBalance = 0;
        }

        // Check credit limit
        if (newBalance > customer.creditLimit && customer.creditLimit > 0) {
            throw new Error('Credit limit exceeded');
        }

        await storeManager.updateDocument('customers', customerId, {
            outstandingBalance: newBalance,
            creditUsed: newBalance,
            lastCreditUpdate: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Record credit transaction
        await storeManager.addDocument('credit_transactions', {
            customerId,
            amount,
            type,
            previousBalance: customer.outstandingBalance,
            newBalance,
            userId: firebase.auth().currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        return newBalance;
    }

    // Customer Segmentation
    async segmentCustomers(criteria = {}) {
        let filteredCustomers = [...this.customers];

        // Apply filters
        if (criteria.minPurchases) {
            filteredCustomers = filteredCustomers.filter(c => c.totalPurchases >= criteria.minPurchases);
        }
        
        if (criteria.minSpent) {
            filteredCustomers = filteredCustomers.filter(c => c.totalSpent >= criteria.minSpent);
        }
        
        if (criteria.tags && criteria.tags.length > 0) {
            filteredCustomers = filteredCustomers.filter(c => 
                criteria.tags.some(tag => c.tags.includes(tag))
            );
        }
        
        if (criteria.status) {
            filteredCustomers = filteredCustomers.filter(c => c.status === criteria.status);
        }

        // Calculate customer lifetime value
        const segments = filteredCustomers.map(customer => {
            const clv = this.calculateCustomerLifetimeValue(customer);
            const segment = this.determineCustomerSegment(customer, clv);
            
            return {
                ...customer,
                clv,
                segment,
                lastPurchaseDays: this.daysSince(customer.lastPurchase),
                averageOrderValue: customer.totalPurchases > 0 ? 
                    customer.totalSpent / customer.totalPurchases : 0
            };
        });

        // Group by segment
        const grouped = segments.reduce((acc, customer) => {
            if (!acc[customer.segment]) {
                acc[customer.segment] = [];
            }
            acc[customer.segment].push(customer);
            return acc;
        }, {});

        return {
            segments: grouped,
            summary: {
                totalCustomers: segments.length,
                bySegment: Object.keys(grouped).reduce((acc, segment) => {
                    acc[segment] = grouped[segment].length;
                    return acc;
                }, {}),
                totalClv: segments.reduce((sum, c) => sum + c.clv, 0),
                averageClv: segments.length > 0 ? 
                    segments.reduce((sum, c) => sum + c.clv, 0) / segments.length : 0
            }
        };
    }

    calculateCustomerLifetimeValue(customer) {
        if (!customer.firstPurchase) return 0;
        
        const firstPurchase = customer.firstPurchase.toDate ? 
            customer.firstPurchase.toDate() : new Date(customer.firstPurchase);
        const today = new Date();
        
        const monthsActive = Math.max(1, 
            (today.getFullYear() - firstPurchase.getFullYear()) * 12 + 
            (today.getMonth() - firstPurchase.getMonth())
        );
        
        const averageMonthlyValue = customer.totalSpent / monthsActive;
        
        // Simple CLV: Average monthly value * expected lifetime in months (e.g., 12 months)
        return averageMonthlyValue * 12;
    }

    determineCustomerSegment(customer, clv) {
        if (customer.totalPurchases === 0) return 'New';
        
        const avgOrderValue = customer.totalPurchases > 0 ? 
            customer.totalSpent / customer.totalPurchases : 0;
        
        if (clv > 1000 && customer.totalPurchases > 10) return 'VIP';
        if (clv > 500 && customer.totalPurchases > 5) return 'Loyal';
        if (customer.totalPurchases > 1) return 'Repeat';
        
        return 'One-time';
    }

    daysSince(date) {
        if (!date) return null;
        
        const pastDate = date.toDate ? date.toDate() : new Date(date);
        const today = new Date();
        const diffTime = Math.abs(today - pastDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Communication
    async sendBulkCommunication(customerIds, message, channel = 'email') {
        // This would integrate with email/SMS services
        // For now, we'll log it
        
        const communication = {
            customerIds,
            message,
            channel,
            status: 'pending',
            scheduledFor: new Date(),
            userId: firebase.auth().currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        return await storeManager.addDocument('communications', communication);
    }

    // Customer Search and Filter
    async searchCustomers(query, filters = {}) {
        let results = [...this.customers];

        // Text search
        if (query) {
            const searchTerms = query.toLowerCase().split(' ');
            results = results.filter(customer => {
                const searchable = [
                    customer.name,
                    customer.email,
                    customer.phone,
                    customer.address,
                    customer.notes
                ].join(' ').toLowerCase();
                
                return searchTerms.every(term => searchable.includes(term));
            });
        }

        // Apply filters
        if (filters.tags && filters.tags.length > 0) {
            results = results.filter(c => 
                filters.tags.some(tag => c.tags.includes(tag))
            );
        }

        if (filters.minBalance) {
            results = results.filter(c => c.outstandingBalance >= filters.minBalance);
        }

        if (filters.maxBalance) {
            results = results.filter(c => c.outstandingBalance <= filters.maxBalance);
        }

        if (filters.status) {
            results = results.filter(c => c.status === filters.status);
        }

        if (filters.segment) {
            // Would need to calculate segment for each customer
            // For simplicity, filter by purchase count
            if (filters.segment === 'VIP') {
                results = results.filter(c => c.totalPurchases > 10);
            } else if (filters.segment === 'Loyal') {
                results = results.filter(c => c.totalPurchases > 5 && c.totalPurchases <= 10);
            } else if (filters.segment === 'Repeat') {
                results = results.filter(c => c.totalPurchases > 1 && c.totalPurchases <= 5);
            } else if (filters.segment === 'One-time') {
                results = results.filter(c => c.totalPurchases === 1);
            } else if (filters.segment === 'New') {
                results = results.filter(c => c.totalPurchases === 0);
            }
        }

        // Sort results
        const sortField = filters.sortBy || 'name';
        const sortOrder = filters.sortOrder || 'asc';
        
        results.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            
            if (sortField === 'lastPurchase') {
                aVal = aVal ? new Date(aVal) : new Date(0);
                bVal = bVal ? new Date(bVal) : new Date(0);
            }
            
            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return results;
    }

    // Import/Export Customers
    async importCustomers(csvData) {
        const lines = csvData.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        
        const customers = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const customer = {};
            
            headers.forEach((header, index) => {
                if (values[index]) {
                    // Convert numeric fields
                    if (['outstandingBalance', 'creditLimit', 'totalPurchases', 'totalSpent'].includes(header)) {
                        customer[header] = parseFloat(values[index]) || 0;
                    } else if (header === 'tags') {
                        customer[header] = values[index].split(';').map(t => t.trim());
                    } else {
                        customer[header] = values[index];
                    }
                }
            });
            
            if (customer.email) {
                customers.push(customer);
            }
        }
        
        // Batch add customers
        const results = await storeManager.batchAddDocuments('customers', customers);
        await this.loadCustomers(); // Refresh cache
        
        return results;
    }

    exportCustomers(format = 'csv') {
        if (format === 'csv') {
            return this.convertCustomersToCSV(this.customers);
        } else if (format === 'json') {
            return JSON.stringify(this.customers, null, 2);
        }
    }

    convertCustomersToCSV(customers) {
        if (customers.length === 0) return '';
        
        const headers = ['name', 'email', 'phone', 'address', 'tags', 
                        'totalPurchases', 'totalSpent', 'outstandingBalance', 
                        'creditLimit', 'status', 'customerSince'];
        
        const csvRows = [
            headers.join(','),
            ...customers.map(customer => 
                headers.map(header => {
                    let value = customer[header];
                    
                    if (header === 'tags') {
                        value = Array.isArray(value) ? value.join(';') : value;
                    } else if (header === 'customerSince' && value) {
                        value = value.toDate ? value.toDate().toISOString() : value;
                    }
                    
                    return `"${String(value || '').replace(/"/g, '""')}"`;
                }).join(',')
            )
        ];
        
        return csvRows.join('\n');
    }
}

// Initialize and export
const crmManager = new CRMManager();
export { crmManager };
