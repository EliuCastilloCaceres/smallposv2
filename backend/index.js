// index.js
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const path         = require('path');
require('dotenv').config();

const errorHandler = require('./src/middlewares/errorHandler');

// Rutas
const authRoutes          = require('./src/routes/auth_routes');
const dashboardRoutes     = require('./src/routes/dashboard_routes');
const ordersRoutes        = require('./src/routes/orders_routes');
const productsRoutes      = require('./src/routes/products_routes');
const inventoryRoutes     = require('./src/routes/inventory_routes');
const customersRoutes     = require('./src/routes/customers_routes');
const providersRoutes     = require('./src/routes/providers_routes');
const cashRegistersRoutes = require('./src/routes/cash_registers_routes');
const layawayRoutes       = require('./src/routes/layaway_routes');
const creditRoutes        = require('./src/routes/credit_routes');
const reportRoutes       = require('./src/routes/report_routes');
const userRoutes          = require('./src/routes/user_routes');
const branchRoutes        = require('./src/routes/branch_routes');
const returnRoutes        = require('./src/routes/return_routes');
const categoriesRoutes    = require('./src/routes/category_routes');
const { router: roleRoutes, permissionsRouter } = require('./src/routes/role_routes');
const paymentMethodRoutes = require('./src/routes/payment_method_routes');
const uploadRoutes        = require('./src/routes/upload_routes');

const app = express();

// ─── Middlewares globales ─────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/csv' }));   // ← necesario para carga masiva CSV
app.use(cookieParser());

// CORS: origin dinámico según env (compatible con credentials)
app.use(cors({
  origin:      process.env.CORS_ORIGIN
                 ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
                 : true,
  credentials: true,
}));

// Archivos estáticos
app.use('/api/product/images', express.static(path.join(__dirname, 'public/images/products')));
app.use('/api/receipt/images', express.static(path.join(__dirname, 'public/images/receipts')));

// ─── Rutas ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.json({ status: 'ok', message: 'SALL POS API v2' }));

app.use('/api/auth',           authRoutes);
app.use('/api/branches',       branchRoutes);
app.use('/api/dashboard',      dashboardRoutes);
app.use('/api/orders',         ordersRoutes);
app.use('/api/products',       productsRoutes);
app.use('/api/inventory',      inventoryRoutes);
app.use('/api/customers',      customersRoutes);
app.use('/api/providers',      providersRoutes);
app.use('/api/cash-registers', cashRegistersRoutes);
app.use('/api/layaways',       layawayRoutes);
app.use('/api/credits',        creditRoutes);
app.use('/api/returns',        returnRoutes);
app.use('/api/reports',        reportRoutes);
app.use('/api/users',          userRoutes);
app.use('/api/categories',     categoriesRoutes);
app.use('/api/roles',          roleRoutes);
app.use('/api/permissions',    permissionsRouter);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/upload',         uploadRoutes);          // ← rutas de upload de imágenes

// ─── 404 para rutas no existentes ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─── Error handler global (DEBE ser el último middleware) ─────────────────────
app.use(errorHandler);

// ─── Arrancar servidor ────────────────────────────────────────────────────────
const port = process.env.SERVER_PORT ?? 3001;
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀  API corriendo en puerto ${port}`);
});