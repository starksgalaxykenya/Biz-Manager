// General Utility Functions for SBM

class Utils {
    // Date/Time Utilities
    static formatDate(date, format = 'short') {
        if (!date) return '';
        
        const d = date.toDate ? date.toDate() : new Date(date);
        
        switch (format) {
            case 'short':
                return d.toLocaleDateString();
            case 'long':
                return d.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            case 'datetime':
                return d.toLocaleString();
            case 'time':
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            case 'iso':
                return d.toISOString();
            default:
                return d.toLocaleDateString();
        }
    }

    static formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    static formatNumber(number, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    }

    static getDateRange(range = 'today') {
        const now = new Date();
        let start, end;
        
        switch (range) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
            case 'yesterday':
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
                end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
                break;
            case 'thisWeek':
                const firstDayOfWeek = new Date(now);
                firstDayOfWeek.setDate(now.getDate() - now.getDay());
                start = new Date(firstDayOfWeek.getFullYear(), firstDayOfWeek.getMonth(), firstDayOfWeek.getDate());
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
            case 'thisMonth':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            case 'thisYear':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
            default:
                start = new Date(range);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        }
        
        return { start, end };
    }

    // Validation Utilities
    static validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    static validatePhone(phone) {
        const re = /^[\+]?[1-9][\d]{0,15}$/;
        return re.test(phone.replace(/[\s\-\(\)]/g, ''));
    }

    static validateSKU(sku) {
        return sku.length >= 3 && sku.length <= 50 && /^[A-Za-z0-9\-_]+$/.test(sku);
    }

    // String Utilities
    static truncate(text, length = 100) {
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    static capitalize(text) {
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    }

    static generateId(prefix = '') {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 9);
        return `${prefix}${timestamp}-${random}`.toUpperCase();
    }

    static generateOrderNumber() {
        const date = new Date();
        const year = date.getFullYear().toString().substr(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        
        return `ORD-${year}${month}${day}-${random}`;
    }

    // File Utilities
    static readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    static downloadFile(content, fileName, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    static exportToCSV(data, fileName = 'export.csv') {
        if (data.length === 0) {
            console.warn('No data to export');
            return;
        }

        const headers = Object.keys(data[0]);
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

        const csv = csvRows.join('\n');
        this.downloadFile(csv, fileName, 'text/csv');
    }

    // Color Utilities
    static getStatusColor(status) {
        const colors = {
            active: 'green',
            inactive: 'gray',
            pending: 'yellow',
            completed: 'blue',
            cancelled: 'red',
            overdue: 'orange',
            low: 'yellow',
            out: 'red',
            in: 'green'
        };
        
        return colors[status.toLowerCase()] || 'gray';
    }

    static generateColorFromString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 60%)`;
    }

    // Math Utilities
    static calculatePercentage(value, total) {
        if (total === 0) return 0;
        return (value / total) * 100;
    }

    static roundToDecimal(value, decimals = 2) {
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    // Array/Object Utilities
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    static groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key];
            if (!result[groupKey]) {
                result[groupKey] = [];
            }
            result[groupKey].push(item);
            return result;
        }, {});
    }

    static sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            let aVal = a[key];
            let bVal = b[key];
            
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    static filterBy(array, filters) {
        return array.filter(item => {
            return Object.entries(filters).every(([key, value]) => {
                if (value === undefined || value === null) return true;
                
                const itemValue = item[key];
                
                if (Array.isArray(value)) {
                    return value.includes(itemValue);
                }
                
                if (typeof value === 'object' && value.min !== undefined) {
                    return itemValue >= value.min && 
                          (value.max === undefined || itemValue <= value.max);
                }
                
                return itemValue === value;
            });
        });
    }

    // Local Storage Utilities
    static getLocalStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return defaultValue;
        }
    }

    static setLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Error writing to localStorage:', error);
            return false;
        }
    }

    static removeLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing from localStorage:', error);
            return false;
        }
    }

    // DOM Utilities
    static showLoading(elementId = null) {
        const loader = document.createElement('div');
        loader.className = 'loading-overlay';
        loader.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Loading...</p>
            </div>
        `;
        
        document.body.appendChild(loader);
        
        return loader;
    }

    static hideLoading(loader) {
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }

    static showNotification(message, type = 'info', duration = 5000) {
        // Remove existing notifications
        const existing = document.querySelectorAll('.notification');
        existing.forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas ${
                    type === 'success' ? 'fa-check-circle' :
                    type === 'error' ? 'fa-exclamation-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' :
                    'fa-info-circle'
                }"></i>
                <span>${message}</span>
                <button class="notification-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Add styles if not already present
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    min-width: 300px;
                    max-width: 400px;
                    animation: slideIn 0.3s ease-out;
                }
                .notification-content {
                    display: flex;
                    align-items: center;
                    padding: 16px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    color: white;
                }
                .notification-success .notification-content {
                    background: linear-gradient(135deg, #10b981, #059669);
                }
                .notification-error .notification-content {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                }
                .notification-warning .notification-content {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                }
                .notification-info .notification-content {
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                }
                .notification-content i:first-child {
                    margin-right: 12px;
                    font-size: 20px;
                }
                .notification-content span {
                    flex: 1;
                }
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    margin-left: 12px;
                    opacity: 0.7;
                }
                .notification-close:hover {
                    opacity: 1;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(styles);
        }
        
        // Auto-remove
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
        
        // Manual close
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
        
        return notification;
    }

    // Form Utilities
    static serializeForm(form) {
        const data = {};
        const formData = new FormData(form);
        
        for (const [key, value] of formData.entries()) {
            if (data[key]) {
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }
        
        return data;
    }

    static resetForm(form) {
        form.reset();
        // Clear validation states
        form.querySelectorAll('.error').forEach(el => {
            el.classList.remove('error');
        });
        form.querySelectorAll('.form-error').forEach(el => {
            el.remove();
        });
    }

    // Time Utilities
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Security Utilities
    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Remove potentially dangerous characters
        return input
            .replace(/[<>"'`]/g, '')
            .trim();
    }

    static escapeHTML(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
    }

    // Currency Conversion (simplified - would use API in production)
    static async convertCurrency(amount, fromCurrency, toCurrency) {
        // This is a simplified version. In production, use a currency API
        const rates = {
            USD: 1,
            EUR: 0.85,
            GBP: 0.73,
            KES: 110.5, // Kenyan Shilling
            NGN: 410.5, // Nigerian Naira
            GHS: 5.8,   // Ghanaian Cedi
            ZAR: 14.5   // South African Rand
        };
        
        if (!rates[fromCurrency] || !rates[toCurrency]) {
            throw new Error('Unsupported currency');
        }
        
        const amountInUSD = amount / rates[fromCurrency];
        return amountInUSD * rates[toCurrency];
    }

    // QR Code Generation
    static generateQRCode(text, elementId, size = 128) {
        // This would use a QR code library
        // For now, return a URL to a QR code generator API
        return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
    }

    // Barcode Generation
    static generateBarcode(code, type = 'CODE128') {
        // This would use a barcode library
        // For now, return placeholder
        return `https://barcode.tec-it.com/barcode.ashx?data=${code}&code=${type}`;
    }
}

// Export utility functions
export default Utils;
