// invoice-generator.js
import Utils from './utils.js';

class InvoiceGenerator {
    constructor() {
        this.templates = {
            invoice: 'templates/invoice.html',
            receipt: 'templates/receipt.html',
            quotation: 'templates/quotation.html'
        };
    }

    async generateInvoice(invoiceData) {
        try {
            // Load template
            const template = await this.loadTemplate('invoice');
            
            // Prepare data
            const data = this.prepareInvoiceData(invoiceData);
            
            // Render template
            const html = this.renderTemplate(template, data);
            
            // Create printable window
            const printWindow = window.open('', '_blank');
            printWindow.document.write(html);
            printWindow.document.close();
            
            // Auto-print after load
            printWindow.onload = function() {
                printWindow.focus();
                printWindow.print();
            };
            
            return {
                html,
                data,
                printWindow
            };
            
        } catch (error) {
            console.error('Error generating invoice:', error);
            throw error;
        }
    }

    async loadTemplate(templateName) {
        const response = await fetch(this.templates[templateName]);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${templateName}`);
        }
        return await response.text();
    }

    prepareInvoiceData(invoiceData) {
        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(now.getDate() + (invoiceData.paymentTerms || 30));
        
        return {
            // Business Info
            businessName: invoiceData.businessName || 'My Business',
            businessAddress: invoiceData.businessAddress || '123 Business St, City',
            businessPhone: invoiceData.businessPhone || '+1234567890',
            businessEmail: invoiceData.businessEmail || 'billing@mybusiness.com',
            businessTaxId: invoiceData.businessTaxId || 'TAX-123456',
            
            // Invoice Info
            invoiceNumber: invoiceData.invoiceNumber || `INV-${Date.now()}`,
            invoiceDate: Utils.formatDate(now, 'long'),
            dueDate: Utils.formatDate(dueDate, 'long'),
            paymentTerms: invoiceData.paymentTerms || 30,
            status: invoiceData.status || 'Pending',
            currency: invoiceData.currency || 'USD',
            
            // Customer Info
            customerName: invoiceData.customerName || 'Customer Name',
            customerAddress: invoiceData.customerAddress || '123 Customer St, City',
            customerPhone: invoiceData.customerPhone || '+1234567890',
            customerEmail: invoiceData.customerEmail || 'customer@email.com',
            customerTaxId: invoiceData.customerTaxId || '',
            
            // Items
            items: invoiceData.items || [],
            itemsJSON: JSON.stringify(invoiceData.items || []),
            
            // Financials
            subtotal: invoiceData.subtotal || 0,
            taxAmount: invoiceData.taxAmount || 0,
            totalTaxRate: invoiceData.totalTaxRate || 0,
            discountAmount: invoiceData.discountAmount || 0,
            shippingAmount: invoiceData.shippingAmount || 0,
            totalAmount: invoiceData.totalAmount || 0,
            
            // Payment Info
            bankName: invoiceData.bankName || 'My Bank',
            accountName: invoiceData.accountName || 'My Business Account',
            accountNumber: invoiceData.accountNumber || '1234567890',
            swiftCode: invoiceData.swiftCode || 'SWIFTCODE',
            mobileMoneyInfo: invoiceData.mobileMoneyInfo || '',
            
            // Terms
            lateFeePercentage: invoiceData.lateFeePercentage || 5,
            terms: invoiceData.terms || [
                'All payments are non-refundable',
                'Services are delivered as described',
                'Late payments incur additional fees'
            ],
            termsJSON: JSON.stringify(invoiceData.terms || []),
            
            // Additional
            notes: invoiceData.notes || '',
            allowPayment: invoiceData.allowPayment || false
        };
    }

    renderTemplate(template, data) {
        let rendered = template;
        
        // Simple template rendering (in production, use a proper templating engine)
        Object.keys(data).forEach(key => {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            rendered = rendered.replace(placeholder, data[key] || '');
        });
        
        // Handle conditional blocks (simplified)
        rendered = rendered.replace(/\{\{#if (.*?)\}\}(.*?)\{\{\/if\}\}/gs, (match, condition, content) => {
            const conditionKey = condition.trim();
            return data[conditionKey] ? content : '';
        });
        
        // Handle loops (simplified for arrays)
        rendered = rendered.replace(/\{\{#each (.*?)\}\}(.*?)\{\{\/each\}\}/gs, (match, arrayKey, content) => {
            const items = data[arrayKey.trim()] || [];
            return items.map(item => {
                let itemContent = content;
                Object.keys(item).forEach(key => {
                    const placeholder = new RegExp(`{{${key}}}`, 'g');
                    itemContent = itemContent.replace(placeholder, item[key] || '');
                });
                return itemContent;
            }).join('');
        });
        
        return rendered;
    }

    async generatePDF(html, filename = 'invoice.pdf') {
        // This would use a PDF generation library like jsPDF or html2pdf.js
        // For now, return the HTML
        
        try {
            // Using html2pdf.js if available
            if (typeof html2pdf !== 'undefined') {
                const element = document.createElement('div');
                element.innerHTML = html;
                document.body.appendChild(element);
                
                const opt = {
                    margin: 10,
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                
                await html2pdf().set(opt).from(element).save();
                document.body.removeChild(element);
                
                return true;
            } else {
                // Fallback to print dialog
                const printWindow = window.open('', '_blank');
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.print();
                
                return false;
            }
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw error;
        }
    }

    async emailInvoice(invoiceData, recipientEmail) {
        // This would integrate with an email service
        // For now, log the action
        
        console.log('Emailing invoice to:', recipientEmail);
        console.log('Invoice data:', invoiceData);
        
        // In production, you would:
        // 1. Generate the invoice HTML
        // 2. Convert to PDF if needed
        // 3. Send via email API (SendGrid, AWS SES, etc.)
        
        return {
            success: true,
            message: 'Invoice emailed successfully (simulated)',
            recipient: recipientEmail
        };
    }

    // Batch invoice generation
    async generateBatchInvoices(invoicesData) {
        const results = [];
        
        for (const invoiceData of invoicesData) {
            try {
                const result = await this.generateInvoice(invoiceData);
                results.push({
                    invoiceNumber: invoiceData.invoiceNumber,
                    success: true,
                    result
                });
            } catch (error) {
                results.push({
                    invoiceNumber: invoiceData.invoiceNumber,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    // Invoice management
    async saveInvoice(invoiceData) {
        // Save to database
        const invoice = {
            ...invoiceData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            userId: firebase.auth().currentUser.uid
        };
        
        return await storeManager.addDocument('invoices', invoice);
    }

    async getInvoice(invoiceId) {
        return await storeManager.getDocument('invoices', invoiceId);
    }

    async updateInvoiceStatus(invoiceId, status, paymentInfo = null) {
        const updates = {
            status,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (paymentInfo) {
            updates.paymentInfo = paymentInfo;
            updates.paidAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        
        await storeManager.updateDocument('invoices', invoiceId, updates);
        
        // If paid, record transaction
        if (status === 'paid' && paymentInfo) {
            await financeManager.recordTransaction({
                type: 'income',
                amount: paymentInfo.amount,
                accountId: paymentInfo.accountId,
                category: 'Invoice Payment',
                description: `Payment for invoice ${invoiceId}`,
                reference: paymentInfo.reference
            });
        }
    }

    // Invoice analytics
    async getInvoiceAnalytics(startDate, endDate) {
        const invoices = await storeManager.getDocuments('invoices', [
            ['createdAt', '>=', startDate],
            ['createdAt', '<=', endDate]
        ]);
        
        const analytics = {
            total: invoices.length,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            overdueAmount: 0,
            byStatus: {},
            byCustomer: {},
            averageInvoice: 0,
            daysToPay: []
        };
        
        invoices.forEach(invoice => {
            analytics.totalAmount += invoice.totalAmount || 0;
            
            // By status
            if (!analytics.byStatus[invoice.status]) {
                analytics.byStatus[invoice.status] = 0;
            }
            analytics.byStatus[invoice.status] += invoice.totalAmount || 0;
            
            if (invoice.status === 'paid') {
                analytics.paidAmount += invoice.totalAmount || 0;
            } else if (invoice.status === 'pending') {
                analytics.pendingAmount += invoice.totalAmount || 0;
            } else if (invoice.status === 'overdue') {
                analytics.overdueAmount += invoice.totalAmount || 0;
            }
            
            // By customer
            if (!analytics.byCustomer[invoice.customerName]) {
                analytics.byCustomer[invoice.customerName] = 0;
            }
            analytics.byCustomer[invoice.customerName] += invoice.totalAmount || 0;
            
            // Days to pay
            if (invoice.status === 'paid' && invoice.paidAt && invoice.invoiceDate) {
                const invoiceDate = invoice.invoiceDate.toDate();
                const paidDate = invoice.paidAt.toDate();
                const daysToPay = Math.ceil((paidDate - invoiceDate) / (1000 * 60 * 60 * 24));
                analytics.daysToPay.push(daysToPay);
            }
        });
        
        analytics.averageInvoice = analytics.total > 0 ? analytics.totalAmount / analytics.total : 0;
        analytics.averageDaysToPay = analytics.daysToPay.length > 0 ? 
            analytics.daysToPay.reduce((a, b) => a + b, 0) / analytics.daysToPay.length : 0;
        
        return analytics;
    }
}

// Initialize and export
const invoiceGenerator = new InvoiceGenerator();
export { invoiceGenerator };
