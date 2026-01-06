import { storeManager } from './store.js';

class FinanceManager {
    constructor() {
        this.accounts = [];
        this.transactions = [];
        this.categories = {
            income: ['Sales', 'Service', 'Interest', 'Other Income'],
            expense: ['Cost of Goods', 'Rent', 'Salaries', 'Utilities', 'Marketing', 'Supplies', 'Taxes', 'Other Expenses'],
            transfer: ['Account Transfer']
        };
        this.init();
    }

    async init() {
        await this.loadAccounts();
        await this.loadTransactions();
    }

    async loadAccounts() {
        try {
            this.accounts = await storeManager.getDocuments('accounts');
            return this.accounts;
        } catch (error) {
            console.error('Error loading accounts:', error);
            throw error;
        }
    }

    async loadTransactions(startDate = null, endDate = null) {
        try {
            let whereClauses = [];
            
            if (startDate && endDate) {
                whereClauses.push(['createdAt', '>=', startDate]);
                whereClauses.push(['createdAt', '<=', endDate]);
            }
            
            this.transactions = await storeManager.getDocuments('transactions', whereClauses, ['createdAt', 'desc']);
            return this.transactions;
        } catch (error) {
            console.error('Error loading transactions:', error);
            throw error;
        }
    }

    // Account Management
    async createAccount(accountData) {
        const required = ['name', 'type', 'currency'];
        required.forEach(field => {
            if (!accountData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        });

        const account = {
            ...accountData,
            balance: accountData.balance || 0,
            isDefault: accountData.isDefault || false,
            openingBalance: accountData.balance || 0,
            accountNumber: accountData.accountNumber || '',
            bankName: accountData.bankName || '',
            description: accountData.description || ''
        };

        const result = await storeManager.addDocument('accounts', account);
        
        // If this is set as default, update other accounts
        if (account.isDefault) {
            await this.updateDefaultAccount(result.id);
        }

        this.accounts.push(result);
        return result;
    }

    async updateDefaultAccount(accountId) {
        const batch = firebase.firestore(storeManager.db).batch();
        
        // Update all accounts to not default
        this.accounts.forEach(account => {
            if (account.id !== accountId && account.isDefault) {
                const accountRef = storeManager.db.collection('accounts').doc(account.id);
                batch.update(accountRef, { isDefault: false });
            }
        });
        
        await batch.commit();
    }

    async transferFunds(fromAccountId, toAccountId, amount, description = '') {
        if (amount <= 0) {
            throw new Error('Transfer amount must be positive');
        }

        const fromAccount = this.accounts.find(a => a.id === fromAccountId);
        const toAccount = this.accounts.find(a => a.id === toAccountId);

        if (!fromAccount || !toAccount) {
            throw new Error('One or both accounts not found');
        }

        if (fromAccount.balance < amount) {
            throw new Error('Insufficient funds for transfer');
        }

        // Record transfer as two transactions (outgoing and incoming)
        const transferOut = await storeManager.recordTransaction({
            type: 'transfer',
            amount: amount,
            accountId: fromAccountId,
            toAccountId: toAccountId,
            category: 'Account Transfer',
            description: `Transfer to ${toAccount.name}: ${description}`,
            reference: `TRF-${Date.now()}`
        });

        // Note: The storeManager.recordTransaction already handles balance updates for both accounts
        // because it detects it's a transfer type and updates both accounts

        return transferOut;
    }

    // Financial Reports
    async getProfitAndLoss(startDate, endDate) {
        const transactions = await this.loadTransactions(startDate, endDate);
        
        const pnl = {
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            operatingExpenses: 0,
            netProfit: 0,
            details: {
                revenue: {},
                expenses: {}
            }
        };

        transactions.forEach(transaction => {
            if (transaction.type === 'income') {
                pnl.revenue += transaction.amount;
                if (!pnl.details.revenue[transaction.category]) {
                    pnl.details.revenue[transaction.category] = 0;
                }
                pnl.details.revenue[transaction.category] += transaction.amount;
                
                // Check if this is COGS (Cost of Goods Sold)
                if (transaction.category === 'Cost of Goods') {
                    pnl.cogs += transaction.amount;
                }
            } else if (transaction.type === 'expense') {
                pnl.operatingExpenses += transaction.amount;
                if (!pnl.details.expenses[transaction.category]) {
                    pnl.details.expenses[transaction.category] = 0;
                }
                pnl.details.expenses[transaction.category] += transaction.amount;
            }
        });

        pnl.grossProfit = pnl.revenue - pnl.cogs;
        pnl.netProfit = pnl.grossProfit - pnl.operatingExpenses;

        return pnl;
    }

    async getBalanceSheet(date = new Date()) {
        const accounts = await this.loadAccounts();
        const transactions = await this.loadTransactions(
            new Date(date.getFullYear(), 0, 1), // Start of year
            date
        );

        const balanceSheet = {
            assets: {
                current: [],
                fixed: [],
                total: 0
            },
            liabilities: {
                current: [],
                longTerm: [],
                total: 0
            },
            equity: {
                capital: 0,
                retainedEarnings: 0,
                total: 0
            },
            date: date
        };

        // Categorize accounts
        accounts.forEach(account => {
            const accountItem = {
                name: account.name,
                balance: account.balance,
                type: account.type
            };

            if (account.type === 'asset') {
                // Simple categorization - can be enhanced
                if (['Cash', 'Bank', 'Mobile Money'].some(name => 
                    account.name.toLowerCase().includes(name.toLowerCase()))) {
                    balanceSheet.assets.current.push(accountItem);
                } else {
                    balanceSheet.assets.fixed.push(accountItem);
                }
                balanceSheet.assets.total += account.balance;
            } else if (account.type === 'liability') {
                // Simple categorization
                if (account.name.toLowerCase().includes('payable') || 
                    account.name.toLowerCase().includes('loan')) {
                    balanceSheet.liabilities.current.push(accountItem);
                } else {
                    balanceSheet.liabilities.longTerm.push(accountItem);
                }
                balanceSheet.liabilities.total += account.balance;
            } else if (account.type === 'equity') {
                balanceSheet.equity.capital += account.balance;
            }
        });

        // Calculate retained earnings (Net Profit for the period)
        const pnl = await this.getProfitAndLoss(
            new Date(date.getFullYear(), 0, 1),
            date
        );
        balanceSheet.equity.retainedEarnings = pnl.netProfit;
        balanceSheet.equity.total = balanceSheet.equity.capital + balanceSheet.equity.retainedEarnings;

        // Check accounting equation: Assets = Liabilities + Equity
        balanceSheet.balanced = Math.abs(
            balanceSheet.assets.total - (balanceSheet.liabilities.total + balanceSheet.equity.total)
        ) < 0.01; // Allow for floating point errors

        return balanceSheet;
    }

    async getCashFlow(startDate, endDate) {
        const transactions = await this.loadTransactions(startDate, endDate);
        
        const cashFlow = {
            operating: { inflows: 0, outflows: 0, net: 0 },
            investing: { inflows: 0, outflows: 0, net: 0 },
            financing: { inflows: 0, outflows: 0, net: 0 },
            netIncrease: 0,
            openingBalance: 0,
            closingBalance: 0
        };

        // Categorize transactions (simplified categorization)
        transactions.forEach(transaction => {
            let category = 'operating';
            
            // Simple categorization logic - can be enhanced
            if (transaction.category.includes('Investment') || 
                transaction.category.includes('Asset Purchase')) {
                category = 'investing';
            } else if (transaction.category.includes('Loan') || 
                      transaction.category.includes('Capital')) {
                category = 'financing';
            }

            if (transaction.type === 'income') {
                cashFlow[category].inflows += transaction.amount;
            } else if (transaction.type === 'expense') {
                cashFlow[category].outflows += transaction.amount;
            }

            // Calculate net for each category
            cashFlow[category].net = cashFlow[category].inflows - cashFlow[category].outflows;
        });

        // Calculate totals
        cashFlow.netIncrease = cashFlow.operating.net + cashFlow.investing.net + cashFlow.financing.net;
        
        // Get cash account balances
        const cashAccounts = this.accounts.filter(a => 
            a.type === 'asset' && 
            a.name.toLowerCase().includes('cash')
        );
        
        cashFlow.openingBalance = cashAccounts.reduce((sum, a) => sum + (a.openingBalance || 0), 0);
        cashFlow.closingBalance = cashFlow.openingBalance + cashFlow.netIncrease;

        return cashFlow;
    }

    // Budget Management
    async createBudget(budgetData) {
        const required = ['category', 'amount', 'period', 'year'];
        required.forEach(field => {
            if (!budgetData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        });

        const budget = {
            ...budgetData,
            spent: 0,
            remaining: budgetData.amount,
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        return await storeManager.addDocument('budgets', budget);
    }

    async updateBudgetSpending(category, amount, period = 'monthly', year = new Date().getFullYear()) {
        const budgets = await storeManager.getDocuments('budgets', [
            ['category', '==', category],
            ['period', '==', period],
            ['year', '==', year],
            ['status', '==', 'active']
        ]);

        if (budgets.length > 0) {
            const budget = budgets[0];
            const newSpent = budget.spent + amount;
            const newRemaining = budget.amount - newSpent;
            
            await storeManager.updateDocument('budgets', budget.id, {
                spent: newSpent,
                remaining: newRemaining,
                status: newRemaining < 0 ? 'exceeded' : 'active'
            });
        }
    }

    // Debt Management
    async getDebtorsSummary() {
        const customers = await storeManager.getDocuments('customers');
        
        return customers
            .filter(c => c.outstandingBalance > 0)
            .map(c => ({
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                outstandingBalance: c.outstandingBalance,
                lastPurchase: c.lastPurchase,
                creditLimit: c.creditLimit,
                daysOverdue: this.calculateDaysOverdue(c.lastPurchase)
            }))
            .sort((a, b) => b.outstandingBalance - a.outstandingBalance);
    }

    async getCreditorsSummary() {
        const suppliers = await storeManager.getDocuments('suppliers');
        
        return suppliers
            .filter(s => s.outstandingBalance > 0)
            .map(s => ({
                id: s.id,
                name: s.name,
                contact: s.contactPerson,
                phone: s.phone,
                outstandingBalance: s.outstandingBalance,
                lastTransaction: s.lastTransaction,
                creditTerms: s.creditTerms
            }))
            .sort((a, b) => b.outstandingBalance - a.outstandingBalance);
    }

    calculateDaysOverdue(lastPurchaseDate) {
        if (!lastPurchaseDate) return 0;
        
        const lastDate = lastPurchaseDate.toDate ? lastPurchaseDate.toDate() : new Date(lastPurchaseDate);
        const today = new Date();
        const diffTime = Math.abs(today - lastDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Tax Calculations
    calculateTax(amount, taxRate, isInclusive = false) {
        if (isInclusive) {
            const taxAmount = amount - (amount / (1 + taxRate / 100));
            const netAmount = amount - taxAmount;
            return {
                netAmount: parseFloat(netAmount.toFixed(2)),
                taxAmount: parseFloat(taxAmount.toFixed(2)),
                grossAmount: parseFloat(amount.toFixed(2))
            };
        } else {
            const taxAmount = amount * (taxRate / 100);
            const grossAmount = amount + taxAmount;
            return {
                netAmount: parseFloat(amount.toFixed(2)),
                taxAmount: parseFloat(taxAmount.toFixed(2)),
                grossAmount: parseFloat(grossAmount.toFixed(2))
            };
        }
    }

    // Financial Health Metrics
    async getFinancialMetrics() {
        const [pnl, balanceSheet, cashFlow] = await Promise.all([
            this.getProfitAndLoss(
                new Date(new Date().getFullYear(), 0, 1),
                new Date()
            ),
            this.getBalanceSheet(),
            this.getCashFlow(
                new Date(new Date().getFullYear(), 0, 1),
                new Date()
            )
        ]);

        const metrics = {
            profitability: {
                grossMargin: pnl.revenue > 0 ? (pnl.grossProfit / pnl.revenue) * 100 : 0,
                netMargin: pnl.revenue > 0 ? (pnl.netProfit / pnl.revenue) * 100 : 0,
                roi: 0 // Would need investment data
            },
            liquidity: {
                currentRatio: balanceSheet.assets.total > 0 ? 
                    balanceSheet.assets.total / (balanceSheet.liabilities.total || 1) : 0,
                quickRatio: 0 // Would need more detailed asset breakdown
            },
            efficiency: {
                inventoryTurnover: 0, // Would need inventory data
                accountsReceivableTurnover: 0 // Would need receivables aging
            },
            solvency: {
                debtToEquity: balanceSheet.equity.total > 0 ? 
                    balanceSheet.liabilities.total / balanceSheet.equity.total : 0
            }
        };

        return metrics;
    }

    // Export Financial Data
    async exportFinancialData(format = 'csv', startDate, endDate) {
        const transactions = await this.loadTransactions(startDate, endDate);
        
        if (format === 'csv') {
            return this.convertToCSV(transactions);
        } else if (format === 'json') {
            return JSON.stringify(transactions, null, 2);
        } else if (format === 'excel') {
            // For Excel, we'd typically use a library like SheetJS
            return this.convertToExcel(transactions);
        }
    }

    convertToCSV(data) {
        if (data.length === 0) return '';
        
        const headers = Object.keys(data[0]).filter(key => key !== 'id');
        const csvRows = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header];
                    if (value instanceof Date) {
                        return value.toISOString();
                    } else if (typeof value === 'object') {
                        return JSON.stringify(value);
                    }
                    return `"${String(value).replace(/"/g, '""')}"`;
                }).join(',')
            )
        ];
        
        return csvRows.join('\n');
    }

    convertToExcel(data) {
        // Simplified - in production, use SheetJS
        return this.convertToCSV(data);
    }
}

// Initialize and export
const financeManager = new FinanceManager();
export { financeManager };
