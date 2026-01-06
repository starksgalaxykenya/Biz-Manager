import { storeManager } from './store.js';

class UIManager {
    constructor() {
        this.currentModule = 'dashboard';
        this.charts = {};
        this.modals = {};
        this.notifications = [];
        this.init();
    }

    async init() {
        console.log('UI Manager initialized');
        // Initialize any default UI components
    }

    async loadDashboardData() {
        try {
            // Load today's revenue
            const todayRevenue = await storeManager.getDailySales();
            document.getElementById('todayRevenue').textContent = `$${todayRevenue.toFixed(2)}`;
            
            // Load total debt (from customers)
            const customers = await storeManager.getDocuments('customers');
            const totalDebt = customers.reduce((sum, c) => sum + c.outstandingBalance, 0);
            document.getElementById('totalDebt').textContent = `$${totalDebt.toFixed(2)}`;
            
            // Load stock value
            const stockValue = await storeManager.getStockValue();
            document.getElementById('stockValue').textContent = `$${stockValue.toFixed(2)}`;
            
            // Load cash balance
            const accounts = await storeManager.getDocuments('accounts', [['type', '==', 'asset']]);
            const cashBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
            document.getElementById('cashBalance').textContent = `$${cashBalance.toFixed(2)}`;
            document.getElementById('accountCount').textContent = accounts.length;
            
            // Load low stock count
            const products = await storeManager.getDocuments('products');
            const lowStockCount = products.filter(p => p.lowStock).length;
            document.getElementById('lowStockCount').textContent = `${lowStockCount} items`;
            
            // Initialize charts
            this.initCharts();
            
            // Load recent activity
            await this.loadRecentActivity();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            this.showToast('Failed to load dashboard data', 'error');
        }
    }

    initCharts() {
        // Revenue vs Expenses Chart
        const revenueCtx = document.getElementById('revenueChart').getContext('2d');
        this.charts.revenue = new Chart(revenueCtx, {
            type: 'bar',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [
                    {
                        label: 'Revenue',
                        data: [1200, 1900, 1500, 2200, 1800, 2500, 2000],
                        backgroundColor: 'rgba(102, 126, 234, 0.8)',
                        borderColor: 'rgba(102, 126, 234, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Expenses',
                        data: [800, 1100, 900, 1200, 1000, 1300, 1100],
                        backgroundColor: 'rgba(255, 99, 132, 0.8)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value;
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: $${context.raw}`;
                            }
                        }
                    }
                }
            }
        });

        // Stock Overview Chart (Doughnut)
        const stockCtx = document.getElementById('stockChart').getContext('2d');
        this.charts.stock = new Chart(stockCtx, {
            type: 'doughnut',
            data: {
                labels: ['In Stock', 'Low Stock', 'Out of Stock'],
                datasets: [{
                    data: [85, 10, 5],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(255, 99, 132, 0.8)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.raw}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    async loadRecentActivity() {
        try {
            // Get recent transactions, inventory changes, etc.
            const transactions = await storeManager.getDocuments('transactions', [], ['createdAt', 'desc'], 10);
            
            const activityContainer = document.getElementById('recentActivity');
            activityContainer.innerHTML = '';
            
            if (transactions.length === 0) {
                activityContainer.innerHTML = `
                    <div class="text-center py-8 text-gray-500">
                        <i class="fas fa-inbox text-3xl mb-2"></i>
                        <p>No recent activity</p>
                    </div>
                `;
                return;
            }
            
            transactions.forEach(transaction => {
                const activityItem = this.createActivityItem(transaction);
                activityContainer.appendChild(activityItem);
            });
            
        } catch (error) {
            console.error('Error loading recent activity:', error);
        }
    }

    createActivityItem(transaction) {
        const item = document.createElement('div');
        item.className = 'flex items-center p-3 hover:bg-gray-50 rounded-lg';
        
        const icon = transaction.type === 'income' ? 'fa-arrow-down text-green-500' : 
                    transaction.type === 'expense' ? 'fa-arrow-up text-red-500' : 
                    'fa-exchange-alt text-blue-500';
        
        const typeLabel = transaction.type === 'income' ? 'Sale' : 
                         transaction.type === 'expense' ? 'Expense' : 'Transfer';
        
        const timeAgo = this.formatTimeAgo(transaction.createdAt?.toDate());
        
        item.innerHTML = `
            <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mr-3">
                <i class="fas ${icon}"></i>
            </div>
            <div class="flex-1">
                <p class="font-medium">${typeLabel}: ${transaction.category}</p>
                <p class="text-sm text-gray-500">${transaction.notes || 'No description'}</p>
            </div>
            <div class="text-right">
                <p class="font-semibold">$${transaction.amount.toFixed(2)}</p>
                <p class="text-xs text-gray-500">${timeAgo}</p>
            </div>
        `;
        
        return item;
    }

    formatTimeAgo(date) {
        if (!date) return 'Just now';
        
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        
        return date.toLocaleDateString();
    }

    async switchModule(moduleName) {
        this.currentModule = moduleName;
        document.getElementById('moduleTitle').textContent = this.capitalize(moduleName);
        
        // Hide all module contents
        document.querySelectorAll('.module-content').forEach(el => {
            el.classList.add('hidden');
        });
        
        // Show module container
        const moduleContainer = document.getElementById('moduleContainer');
        moduleContainer.classList.remove('hidden');
        moduleContainer.innerHTML = '';
        
        // Load module content
        switch(moduleName) {
            case 'dashboard':
                document.getElementById('dashboardContent').classList.remove('hidden');
                moduleContainer.classList.add('hidden');
                await this.loadDashboardData();
                break;
                
            case 'products':
                await this.loadProductsModule();
                break;
                
            case 'sales':
                await this.loadSalesModule();
                break;
                
            case 'customers':
                await this.loadCustomersModule();
                break;
                
            case 'finance':
                await this.loadFinanceModule();
                break;
                
            case 'reports':
                await this.loadReportsModule();
                break;
                
            default:
                moduleContainer.innerHTML = `
                    <div class="bg-white rounded-xl shadow p-8 text-center">
                        <i class="fas fa-wrench text-4xl text-gray-400 mb-4"></i>
                        <h3 class="text-xl font-semibold text-gray-700 mb-2">Module Under Construction</h3>
                        <p class="text-gray-500">This module is coming soon!</p>
                    </div>
                `;
        }
    }

    async loadProductsModule() {
        const moduleContainer = document.getElementById('moduleContainer');
        
        moduleContainer.innerHTML = `
            <div class="bg-white rounded-xl shadow">
                <div class="p-6 border-b flex justify-between items-center">
                    <div>
                        <h3 class="text-xl font-semibold text-gray-800">Products & Stock Management</h3>
                        <p class="text-gray-500">Manage your inventory and products</p>
                    </div>
                    <button id="addNewProduct" class="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-lg font-medium">
                        <i class="fas fa-plus mr-2"></i>Add Product
                    </button>
                </div>
                
                <div class="p-6">
                    <!-- Filters -->
                    <div class="flex flex-wrap gap-4 mb-6">
                        <div class="flex-1 min-w-[200px]">
                            <input type="text" placeholder="Search products..." 
                                class="w-full px-4 py-2 border rounded-lg" id="productSearch">
                        </div>
                        <select class="border rounded-lg px-4 py-2" id="categoryFilter">
                            <option value="">All Categories</option>
                            <option value="General">General</option>
                            <option value="Electronics">Electronics</option>
                            <option value="Clothing">Clothing</option>
                            <option value="Food">Food</option>
                        </select>
                        <select class="border rounded-lg px-4 py-2" id="stockFilter">
                            <option value="">All Stock</option>
                            <option value="low">Low Stock</option>
                            <option value="out">Out of Stock</option>
                            <option value="in">In Stock</option>
                        </select>
                    </div>
                    
                    <!-- Products Table -->
                    <div class="overflow-x-auto">
                        <table class="w-full">
                            <thead>
                                <tr class="bg-gray-50">
                                    <th class="text-left p-4">Product</th>
                                    <th class="text-left p-4">SKU</th>
                                    <th class="text-left p-4">Category</th>
                                    <th class="text-left p-4">Cost</th>
                                    <th class="text-left p-4">Price</th>
                                    <th class="text-left p-4">Stock</th>
                                    <th class="text-left p-4">Value</th>
                                    <th class="text-left p-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="productsTableBody">
                                <tr>
                                    <td colspan="8" class="p-8 text-center text-gray-500">
                                        <div class="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                                        <p class="mt-2">Loading products...</p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Summary -->
                    <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="bg-blue-50 p-4 rounded-lg">
                            <p class="text-sm text-blue-600">Total Products</p>
                            <p class="text-2xl font-bold" id="totalProducts">0</p>
                        </div>
                        <div class="bg-yellow-50 p-4 rounded-lg">
                            <p class="text-sm text-yellow-600">Low Stock Items</p>
                            <p class="text-2xl font-bold" id="lowStockItems">0</p>
                        </div>
                        <div class="bg-green-50 p-4 rounded-lg">
                            <p class="text-sm text-green-600">Total Stock Value</p>
                            <p class="text-2xl font-bold" id="totalProductsValue">$0.00</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Load products data
        await this.loadProductsData();
        
        // Add event listeners
        document.getElementById('addNewProduct').addEventListener('click', () => {
            this.showAddProductModal();
        });
        
        document.getElementById('productSearch').addEventListener('input', (e) => {
            this.filterProducts(e.target.value);
        });
    }

    async loadProductsData() {
        try {
            const products = await storeManager.getDocuments('products');
            this.renderProductsTable(products);
            
            // Update summary
            document.getElementById('totalProducts').textContent = products.length;
            
            const lowStockCount = products.filter(p => p.lowStock).length;
            document.getElementById('lowStockItems').textContent = lowStockCount;
            
            const totalValue = products.reduce((sum, p) => sum + (p.stock * p.cost), 0);
            document.getElementById('totalProductsValue').textContent = `$${totalValue.toFixed(2)}`;
            
        } catch (error) {
            console.error('Error loading products:', error);
            this.showToast('Failed to load products', 'error');
        }
    }

    renderProductsTable(products) {
        const tbody = document.getElementById('productsTableBody');
        tbody.innerHTML = '';
        
        if (products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="p-8 text-center text-gray-500">
                        <i class="fas fa-box-open text-3xl mb-2"></i>
                        <p>No products found</p>
                        <button id="addFirstProduct" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg">
                            Add Your First Product
                        </button>
                    </td>
                </tr>
            `;
            
            document.getElementById('addFirstProduct')?.addEventListener('click', () => {
                this.showAddProductModal();
            });
            return;
        }
        
        products.forEach(product => {
            const row = document.createElement('tr');
            row.className = 'border-b hover:bg-gray-50';
            
            const stockClass = product.lowStock ? 
                (product.stock === 0 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800') : 
                'bg-green-100 text-green-800';
            
            row.innerHTML = `
                <td class="p-4">
                    <div class="font-medium">${product.name}</div>
                    <div class="text-sm text-gray-500">${product.barcode || 'No barcode'}</div>
                </td>
                <td class="p-4">${product.sku}</td>
                <td class="p-4">
                    <span class="px-2 py-1 rounded-full text-xs bg-gray-100">${product.category}</span>
                </td>
                <td class="p-4">$${product.cost.toFixed(2)}</td>
                <td class="p-4">
                    <span class="font-medium">$${product.price.toFixed(2)}</span>
                    <div class="text-xs text-green-600">
                        ${(((product.price - product.cost) / product.cost) * 100).toFixed(1)}% margin
                    </div>
                </td>
                <td class="p-4">
                    <span class="px-3 py-1 rounded-full text-sm ${stockClass}">
                        ${product.stock} ${product.unit}
                    </span>
                    ${product.reorderLevel ? `<div class="text-xs text-gray-500 mt-1">Reorder at ${product.reorderLevel}</div>` : ''}
                </td>
                <td class="p-4">$${(product.stock * product.cost).toFixed(2)}</td>
                <td class="p-4">
                    <div class="flex space-x-2">
                        <button class="edit-product text-blue-600 hover:text-blue-800" data-id="${product.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="adjust-stock text-green-600 hover:text-green-800" data-id="${product.id}">
                            <i class="fas fa-exchange-alt"></i>
                        </button>
                        <button class="delete-product text-red-600 hover:text-red-800" data-id="${product.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add event listeners to action buttons
        this.addProductActionListeners();
    }

    addProductActionListeners() {
        document.querySelectorAll('.edit-product').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.currentTarget.dataset.id;
                this.showEditProductModal(productId);
            });
        });
        
        document.querySelectorAll('.adjust-stock').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.currentTarget.dataset.id;
                this.showAdjustStockModal(productId);
            });
        });
        
        document.querySelectorAll('.delete-product').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.currentTarget.dataset.id;
                this.showDeleteProductModal(productId);
            });
        });
    }

    showAddProductModal() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg w-full max-w-md">
                <div class="p-6 border-b">
                    <h3 class="text-xl font-semibold">Add New Product</h3>
                </div>
                
                <div class="p-6">
                    <form id="addProductForm">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-1">Product Name *</label>
                                <input type="text" name="name" required 
                                    class="w-full px-4 py-2 border rounded-lg">
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium mb-1">SKU *</label>
                                    <input type="text" name="sku" required 
                                        class="w-full px-4 py-2 border rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1">Barcode</label>
                                    <input type="text" name="barcode" 
                                        class="w-full px-4 py-2 border rounded-lg">
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium mb-1">Cost Price *</label>
                                    <input type="number" name="cost" step="0.01" required 
                                        class="w-full px-4 py-2 border rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1">Selling Price *</label>
                                    <input type="number" name="price" step="0.01" required 
                                        class="w-full px-4 py-2 border rounded-lg">
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium mb-1">Stock Quantity *</label>
                                    <input type="number" name="stock" required 
                                        class="w-full px-4 py-2 border rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1">Reorder Level</label>
                                    <input type="number" name="reorderLevel" value="10" 
                                        class="w-full px-4 py-2 border rounded-lg">
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium mb-1">Category</label>
                                    <input type="text" name="category" value="General" 
                                        class="w-full px-4 py-2 border rounded-lg">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1">Unit</label>
                                    <select name="unit" class="w-full px-4 py-2 border rounded-lg">
                                        <option value="pcs">Pieces</option>
                                        <option value="kg">Kilograms</option>
                                        <option value="L">Liters</option>
                                        <option value="m">Meters</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex justify-end space-x-3 mt-6">
                            <button type="button" class="cancel-modal px-6 py-2 border rounded-lg">
                                Cancel
                            </button>
                            <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg">
                                Add Product
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.getElementById('modalContainer').appendChild(modal);
        
        // Form submission
        modal.querySelector('#addProductForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const productData = Object.fromEntries(formData);
            
            // Convert numeric fields
            productData.cost = parseFloat(productData.cost);
            productData.price = parseFloat(productData.price);
            productData.stock = parseInt(productData.stock);
            productData.reorderLevel = parseInt(productData.reorderLevel);
            
            try {
                await storeManager.addProduct(productData);
                this.showToast('Product added successfully', 'success');
                this.closeModal(modal);
                await this.loadProductsData(); // Refresh the table
            } catch (error) {
                this.showToast(error.message, 'error');
            }
        });
        
        // Close modal
        modal.querySelector('.cancel-modal').addEventListener('click', () => {
            this.closeModal(modal);
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast flex items-center justify-between p-4 rounded-lg shadow-lg min-w-[300px] ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            type === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${
                    type === 'success' ? 'fa-check-circle' :
                    type === 'error' ? 'fa-exclamation-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' :
                    'fa-info-circle'
                } mr-3"></i>
                <span>${message}</span>
            </div>
            <button class="ml-4 text-white hover:text-gray-200">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        const container = document.getElementById('toastContainer');
        container.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 5000);
        
        // Manual close
        toast.querySelector('button').addEventListener('click', () => {
            toast.remove();
        });
    }

    closeModal(modal) {
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
        }
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    showQuickSaleModal() {
        // Implementation for quick sale modal
        this.showToast('Quick sale feature coming soon!', 'info');
    }

    // Other module loading methods would be implemented similarly
    async loadSalesModule() {
        // POS interface implementation
    }

    async loadCustomersModule() {
        // CRM implementation
    }

    async loadFinanceModule() {
        // Financial management implementation
    }

    async loadReportsModule() {
        // Reports and analytics implementation
    }
}

export default UIManager;
