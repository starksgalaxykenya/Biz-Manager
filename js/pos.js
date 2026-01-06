import { storeManager } from './store.js';
import { crmManager } from './crm.js';
import { financeManager } from './finance.js';

class POSManager {
    constructor() {
        this.cart = [];
        this.currentCustomer = null;
        this.paymentMethods = ['Cash', 'Card', 'Mobile Money', 'Bank Transfer', 'Credit'];
        this.taxRate = 16; // Default VAT/GST rate
        this.init();
    }

    async init() {
        // Load HTML5 QR Code Scanner if available
        if (typeof Html5QrcodeScanner !== 'undefined') {
            this.initBarcodeScanner();
        }
    }

    // Barcode Scanner Integration
    initBarcodeScanner() {
        this.scanner = new Html5QrcodeScanner(
            "barcode-scanner",
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true,
                supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
            }
        );
    }

    startBarcodeScan(onSuccess, onError) {
        if (!this.scanner) {
            console.warn('Barcode scanner not available');
            return false;
        }

        this.scanner.render(
            (decodedText) => {
                onSuccess(decodedText);
                this.stopBarcodeScan();
            },
            (error) => {
                onError(error);
            }
        );
        
        return true;
    }

    stopBarcodeScan() {
        if (this.scanner) {
            this.scanner.clear();
        }
    }

    // Cart Management
    async addToCart(productId, quantity = 1) {
        try {
            const product = await storeManager.getDocument('products', productId);
            if (!product) {
                throw new Error('Product not found');
            }

            if (product.stock < quantity) {
                throw new Error(`Insufficient stock. Available: ${product.stock}`);
            }

            // Check if product already in cart
            const existingItem = this.cart.find(item => item.productId === productId);
            
            if (existingItem) {
                existingItem.quantity += quantity;
                existingItem.total = existingItem.quantity * existingItem.price;
            } else {
                this.cart.push({
                    productId,
                    name: product.name,
                    sku: product.sku,
                    price: product.price,
                    cost: product.cost,
                    quantity,
                    total: product.price * quantity,
                    taxAmount: this.calculateTax(product.price * quantity, this.taxRate, false).taxAmount,
                    stock: product.stock,
                    unit: product.unit
                });
            }

            this.updateCartSummary();
            return this.cart;
        } catch (error) {
            console.error('Error adding to cart:', error);
            throw error;
        }
    }

    removeFromCart(productId, quantity = null) {
        const itemIndex = this.cart.findIndex(item => item.productId === productId);
        
        if (itemIndex !== -1) {
            if (quantity && this.cart[itemIndex].quantity > quantity) {
                // Reduce quantity
                this.cart[itemIndex].quantity -= quantity;
                this.cart[itemIndex].total = this.cart[itemIndex].quantity * this.cart[itemIndex].price;
                this.cart[itemIndex].taxAmount = this.calculateTax(this.cart[itemIndex].total, this.taxRate, false).taxAmount;
            } else {
                // Remove entire item
                this.cart.splice(itemIndex, 1);
            }
        }

        this.updateCartSummary();
        return this.cart;
    }

    updateQuantity(productId, quantity) {
        const item = this.cart.find(item => item.productId === productId);
        
        if (item) {
            if (quantity <= 0) {
                this.removeFromCart(productId);
            } else {
                item.quantity = quantity;
                item.total = item.price * quantity;
                item.taxAmount = this.calculateTax(item.total, this.taxRate, false).taxAmount;
            }
        }

        this.updateCartSummary();
        return this.cart;
    }

    clearCart() {
        this.cart = [];
        this.currentCustomer = null;
        this.updateCartSummary();
    }

    updateCartSummary() {
        const summary = {
            subtotal: 0,
            tax: 0,
            discount: 0,
            total: 0,
            itemCount: 0
        };

        this.cart.forEach(item => {
            summary.subtotal += item.total;
            summary.tax += item.taxAmount || 0;
            summary.itemCount += item.quantity;
        });

        summary.total = summary.subtotal + summary.tax - summary.discount;
        
        return summary;
    }

    // Customer Management in POS
    setCustomer(customer) {
        this.currentCustomer = customer;
    }

    async findCustomerByPhone(phone) {
        const customers = await crmManager.searchCustomers(phone);
        return customers.length > 0 ? customers[0] : null;
    }

    async createQuickCustomer(customerData) {
        const quickCustomer = {
            ...customerData,
            phone: customerData.phone || '',
            address: customerData.address || '',
            tags: ['pos-customer']
        };

        return await crmManager.createCustomer(quickCustomer);
    }

    // Checkout Process
    async processCheckout(paymentData) {
        if (this.cart.length === 0) {
            throw new Error('Cart is empty');
        }

        const summary = this.updateCartSummary();
        
        // Validate payment
        if (paymentData.method === 'Credit' && this.currentCustomer) {
            const customer = await storeManager.getDocument('customers', this.currentCustomer.id);
            const availableCredit = customer.creditLimit - customer.creditUsed;
            
            if (summary.total > availableCredit) {
                throw new Error('Credit limit exceeded');
            }
        }

        // Process payment
        const paymentResult = await this.processPayment(summary.total, paymentData);
        
        if (!paymentResult.success) {
            throw new Error(`Payment failed: ${paymentResult.message}`);
        }

        // Create sale record
        const sale = await this.createSaleRecord(paymentResult);
        
        // Update inventory
        await this.updateInventory();
        
        // Update customer stats if applicable
        if (this.currentCustomer) {
            await this.updateCustomerAfterPurchase(paymentResult);
        }

        // Generate receipt
        const receipt = await this.generateReceipt(sale, paymentResult);
        
        // Clear cart
        this.clearCart();
        
        return {
            sale,
            receipt,
            payment: paymentResult
        };
    }

    async processPayment(amount, paymentData) {
        const payment = {
            amount,
            method: paymentData.method,
            reference: paymentData.reference || `PAY-${Date.now()}`,
            status: 'pending',
            timestamp: new Date()
        };

        // Process based on payment method
        switch (paymentData.method) {
            case 'Cash':
                payment.status = 'completed';
                payment.cashTendered = paymentData.cashTendered || amount;
                payment.change = payment.cashTendered - amount;
                break;
                
            case 'Card':
                // In a real app, integrate with payment gateway
                payment.status = 'completed';
                payment.cardLast4 = paymentData.cardLast4 || '****';
                payment.cardType = paymentData.cardType || 'Unknown';
                break;
                
            case 'Mobile Money':
                payment.status = 'completed';
                payment.mobileProvider = paymentData.provider || 'Unknown';
                payment.mobileNumber = paymentData.mobileNumber || '';
                break;
                
            case 'Credit':
                if (!this.currentCustomer) {
                    throw new Error('Customer required for credit payment');
                }
                payment.status = 'completed';
                await crmManager.updateCustomerCredit(this.currentCustomer.id, amount, 'increase');
                break;
                
            default:
                throw new Error(`Unsupported payment method: ${paymentData.method}`);
        }

        // Record financial transaction
        if (payment.status === 'completed') {
            await financeManager.recordTransaction({
                type: 'income',
                amount: amount,
                accountId: await this.getPaymentAccount(paymentData.method),
                category: 'Sales',
                description: `POS Sale - ${paymentData.method}`,
                reference: payment.reference
            });
        }

        return {
            ...payment,
            success: payment.status === 'completed'
        };
    }

    async getPaymentAccount(paymentMethod) {
        // Get default account for payment method
        const accounts = await storeManager.getDocuments('accounts');
        
        switch (paymentMethod) {
            case 'Cash':
                const cashAccount = accounts.find(a => 
                    a.name.toLowerCase().includes('cash') && a.isDefault
                );
                return cashAccount ? cashAccount.id : accounts[0]?.id;
                
            case 'Card':
            case 'Bank Transfer':
                const bankAccount = accounts.find(a => 
                    a.name.toLowerCase().includes('bank') && a.isDefault
                );
                return bankAccount ? bankAccount.id : accounts[0]?.id;
                
            case 'Mobile Money':
                const mobileAccount = accounts.find(a => 
                    a.name.toLowerCase().includes('mobile') && a.isDefault
                );
                return mobileAccount ? mobileAccount.id : accounts[0]?.id;
                
            default:
                return accounts[0]?.id;
        }
    }

    async createSaleRecord(payment) {
        const summary = this.updateCartSummary();
        
        const sale = {
            items: this.cart.map(item => ({
                productId: item.productId,
                name: item.name,
                sku: item.sku,
                quantity: item.quantity,
                price: item.price,
                total: item.total,
                cost: item.cost
            })),
            customerId: this.currentCustomer?.id || null,
            customerName: this.currentCustomer?.name || 'Walk-in Customer',
            subtotal: summary.subtotal,
            tax: summary.tax,
            discount: summary.discount,
            total: summary.total,
            paymentMethod: payment.method,
            paymentReference: payment.reference,
            status: 'completed',
            employeeId: firebase.auth().currentUser.uid,
            location: 'POS Terminal 1', // Could be dynamic
            notes: ''
        };

        const result = await storeManager.addDocument('sales', sale);
        
        // Record audit trail
        await storeManager.auditLog('sale', result.id, 'create', sale);
        
        return result;
    }

    async updateInventory() {
        for (const item of this.cart) {
            await storeManager.updateStock(
                item.productId,
                -item.quantity,
                'sale',
                `POS Sale - ${Date.now()}`
            );
        }
    }

    async updateCustomerAfterPurchase(payment) {
        if (!this.currentCustomer) return;
        
        const summary = this.updateCartSummary();
        
        // Record purchase
        await crmManager.recordPurchase(this.currentCustomer.id, {
            amount: summary.total,
            items: this.cart.length,
            paymentMethod: payment.method,
            saleId: payment.reference
        });
    }

    // Receipt Generation
    async generateReceipt(sale, payment) {
        const receipt = {
            id: `REC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            saleId: sale.id,
            date: new Date().toISOString(),
            businessInfo: await this.getBusinessInfo(),
            items: this.cart,
            summary: this.updateCartSummary(),
            payment: payment,
            customer: this.currentCustomer || { name: 'Walk-in Customer' },
            cashier: firebase.auth().currentUser.displayName || 'System',
            footer: 'Thank you for your business!'
        };

        // Generate printable HTML
        const receiptHTML = this.generateReceiptHTML(receipt);
        
        // Save receipt to database
        await storeManager.addDocument('receipts', {
            ...receipt,
            html: receiptHTML
        });

        return {
            ...receipt,
            html: receiptHTML
        };
    }

    async getBusinessInfo() {
        // This would come from business settings
        const user = firebase.auth().currentUser;
        return {
            name: user.displayName || 'My Business',
            address: '123 Business St, City',
            phone: '+1234567890',
            email: user.email,
            taxId: 'TAX-123456',
            logo: '' // URL to logo
        };
    }

    generateReceiptHTML(receipt) {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt #${receipt.id}</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            max-width: 300px;
            margin: 0 auto;
            padding: 20px;
        }
        .receipt-header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .receipt-header h2 {
            margin: 0;
            font-size: 18px;
        }
        .receipt-info {
            margin-bottom: 10px;
        }
        .receipt-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        }
        .receipt-table th {
            text-align: left;
            border-bottom: 1px solid #000;
            padding: 5px 0;
        }
        .receipt-table td {
            padding: 3px 0;
        }
        .receipt-totals {
            margin-top: 10px;
            border-top: 2px dashed #000;
            padding-top: 10px;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
        }
        .total-row.grand-total {
            font-weight: bold;
            font-size: 18px;
            margin-top: 10px;
            border-top: 1px solid #000;
            padding-top: 5px;
        }
        .receipt-footer {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            border-top: 2px dashed #000;
            padding-top: 10px;
        }
        @media print {
            body {
                max-width: 80mm;
            }
        }
    </style>
</head>
<body>
    <div class="receipt printable">
        <div class="receipt-header">
            <h2>${receipt.businessInfo.name}</h2>
            <p>${receipt.businessInfo.address}</p>
            <p>${receipt.businessInfo.phone} | ${receipt.businessInfo.email}</p>
        </div>
        
        <div class="receipt-info">
            <p><strong>Receipt:</strong> ${receipt.id}</p>
            <p><strong>Date:</strong> ${new Date(receipt.date).toLocaleString()}</p>
            <p><strong>Customer:</strong> ${receipt.customer.name}</p>
            <p><strong>Cashier:</strong> ${receipt.cashier}</p>
        </div>
        
        <table class="receipt-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${receipt.items.map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.quantity} ${item.unit}</td>
                        <td>$${item.price.toFixed(2)}</td>
                        <td>$${item.total.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div class="receipt-totals">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>$${receipt.summary.subtotal.toFixed(2)}</span>
            </div>
            <div class="total-row">
                <span>Tax (${this.taxRate}%):</span>
                <span>$${receipt.summary.tax.toFixed(2)}</span>
            </div>
            ${receipt.summary.discount > 0 ? `
            <div class="total-row">
                <span>Discount:</span>
                <span>-$${receipt.summary.discount.toFixed(2)}</span>
            </div>
            ` : ''}
            <div class="total-row grand-total">
                <span>TOTAL:</span>
                <span>$${receipt.summary.total.toFixed(2)}</span>
            </div>
        </div>
        
        <div class="payment-info">
            <p><strong>Payment Method:</strong> ${receipt.payment.method}</p>
            ${receipt.payment.reference ? `<p><strong>Reference:</strong> ${receipt.payment.reference}</p>` : ''}
            ${receipt.payment.cashTendered ? `
                <p><strong>Cash Tendered:</strong> $${receipt.payment.cashTendered.toFixed(2)}</p>
                <p><strong>Change:</strong> $${receipt.payment.change.toFixed(2)}</p>
            ` : ''}
        </div>
        
        <div class="receipt-footer">
            <p>${receipt.footer}</p>
            <p>Thank you for shopping with us!</p>
            <p>Returns accepted within 7 days with receipt</p>
        </div>
    </div>
    
    <script>
        // Auto-print on load
        window.onload = function() {
            window.print();
            setTimeout(function() {
                window.close();
            }, 1000);
        };
    </script>
</body>
</html>`;
    }

    // Quick Sale Functions
    async quickSale(productId, quantity, paymentMethod = 'Cash') {
        await this.addToCart(productId, quantity);
        
        const summary = this.updateCartSummary();
        
        const paymentData = {
            method: paymentMethod,
            cashTendered: summary.total // For cash payments
        };
        
        return await this.processCheckout(paymentData);
    }

    // Return/Refund Processing
    async processReturn(saleId, returnItems, reason = 'customer return') {
        const sale = await storeManager.getDocument('sales', saleId);
        if (!sale) {
            throw new Error('Sale not found');
        }

        const refundAmount = returnItems.reduce((sum, item) => {
            const saleItem = sale.items.find(si => si.productId === item.productId);
            if (saleItem) {
                return sum + (saleItem.price * item.quantity);
            }
            return sum;
        }, 0);

        // Record refund transaction
        const refund = await financeManager.recordTransaction({
            type: 'expense',
            amount: refundAmount,
            accountId: await this.getPaymentAccount(sale.paymentMethod),
            category: 'Returns & Refunds',
            description: `Refund for sale ${saleId}: ${reason}`,
            reference: `REF-${Date.now()}`
        });

        // Restock inventory
        for (const item of returnItems) {
            await storeManager.updateStock(
                item.productId,
                item.quantity,
                'return',
                `Refund for sale ${saleId}`
            );
        }

        // Record return
        await storeManager.addDocument('returns', {
            saleId,
            items: returnItems,
            refundAmount,
            reason,
            refundId: refund.id,
            processedBy: firebase.auth().currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        return {
            refund,
            returnItems,
            totalRefund: refundAmount
        };
    }

    // Tax Calculation Helper
    calculateTax(amount, rate, isInclusive = false) {
        if (isInclusive) {
            const taxAmount = amount - (amount / (1 + rate / 100));
            const netAmount = amount - taxAmount;
            return {
                netAmount: parseFloat(netAmount.toFixed(2)),
                taxAmount: parseFloat(taxAmount.toFixed(2)),
                grossAmount: parseFloat(amount.toFixed(2))
            };
        } else {
            const taxAmount = amount * (rate / 100);
            const grossAmount = amount + taxAmount;
            return {
                netAmount: parseFloat(amount.toFixed(2)),
                taxAmount: parseFloat(taxAmount.toFixed(2)),
                grossAmount: parseFloat(grossAmount.toFixed(2))
            };
        }
    }

    // Sales Reports
    async getSalesReport(startDate, endDate) {
        const sales = await storeManager.getDocuments('sales', [
            ['createdAt', '>=', startDate],
            ['createdAt', '<=', endDate]
        ], ['createdAt', 'desc']);

        const report = {
            totalSales: sales.length,
            totalRevenue: 0,
            totalItems: 0,
            averageSale: 0,
            byPaymentMethod: {},
            byHour: {},
            topProducts: {}
        };

        sales.forEach(sale => {
            report.totalRevenue += sale.total;
            report.totalItems += sale.items.reduce((sum, item) => sum + item.quantity, 0);
            
            // Group by payment method
            if (!report.byPaymentMethod[sale.paymentMethod]) {
                report.byPaymentMethod[sale.paymentMethod] = 0;
            }
            report.byPaymentMethod[sale.paymentMethod] += sale.total;
            
            // Group by hour
            const hour = new Date(sale.createdAt.toDate()).getHours();
            if (!report.byHour[hour]) {
                report.byHour[hour] = 0;
            }
            report.byHour[hour] += sale.total;
            
            // Track top products
            sale.items.forEach(item => {
                if (!report.topProducts[item.productId]) {
                    report.topProducts[item.productId] = {
                        name: item.name,
                        quantity: 0,
                        revenue: 0
                    };
                }
                report.topProducts[item.productId].quantity += item.quantity;
                report.topProducts[item.productId].revenue += item.total;
            });
        });

        report.averageSale = report.totalSales > 0 ? report.totalRevenue / report.totalSales : 0;
        
        // Sort top products
        report.topProducts = Object.values(report.topProducts)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return report;
    }
}

// Initialize and export
const posManager = new POSManager();
export { posManager };
