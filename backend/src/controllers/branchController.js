// src/controllers/branchController.js
const path            = require('path');
const branchService   = require('../services/branchService');
const { removeFile }  = require('../middlewares/uploadImage');

// Carpeta pública donde uploadImage.js guarda las imágenes de recibo.
// A diferencia del proyecto multi-tenant, aquí es una sola carpeta fija
// (no hay subdomain de por medio) — coincide con el destino configurado en
// uploadReceiptImage (uploadImage.js) y con el mount de express.static en
// index.js (/api/receipt/images -> public/images/receipts).
const RECEIPTS_IMAGE_DIR = path.join(__dirname, '../../public/images/receipts');

// GET /branches
const getAll = async (req, res, next) => {
  try {
    const result = await branchService.getAll({
      requestingUser: req.user,
      filters:        req.query,
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

// GET /branches/:id
const getById = async (req, res, next) => {
  try {
    const branch = await branchService.getById({
      branchId:       req.params.id,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

// POST /branches
const create = async (req, res, next) => {
  try {
    const branch = await branchService.create({
      data:           req.body,
      requestingUser: req.user,
    });
    res.status(201).json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

// PUT /branches/:id
const update = async (req, res, next) => {
  try {
    const branch = await branchService.update({
      branchId:       req.params.id,
      data:           req.body,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

// PATCH /branches/:id/status
const toggleStatus = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ status: 'error', message: 'El campo is_active es requerido' });
    }
    const result = await branchService.toggleStatus({
      branchId:       req.params.id,
      is_active:      Boolean(is_active),
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
};

// PUT /branches/:id/receipt
// multipart/form-data: campo "logo_image" (archivo, opcional) + resto de
// campos como texto. req.file lo agrega uploadReceiptImage.single('logo_image')
// si vino un archivo válido (ver branch_routes.js).
const upsertReceipt = async (req, res, next) => {
  // Ruta del archivo viejo en disco, si hay que borrarlo al final — mismo
  // patrón que oldImageDiskPath en productController.update.
  let oldImageDiskPath = null;

  try {
    // upsertReceipt en branchService sobrescribe TODA la fila (ON DUPLICATE
    // KEY UPDATE con VALUES() en cada columna), así que si no reenviamos
    // logo_image explícitamente aquí, un guardado sin archivo nuevo lo
    // pondría en NULL. Por eso siempre resolvemos su valor final antes de
    // llamar al service, en vez de dejar que branchService decida.
    const current = await branchService.getById({
      branchId:       req.params.id,
      requestingUser: req.user,
    });
    const currentLogo = current.receipt?.logo_image ?? null;

    let logoImage = currentLogo; // por default: conservar el logo actual
    if (req.file) {
      if (currentLogo) {
        const filename = path.basename(currentLogo);
        oldImageDiskPath = path.join(RECEIPTS_IMAGE_DIR, filename);
      }
      logoImage = `/api/receipt/images/${req.file.filename}`;
    }

    const branch = await branchService.upsertReceipt({
      branchId:       req.params.id,
      data:           { ...req.body, logo_image: logoImage },
      requestingUser: req.user,
    });

    // Recién ahora que el upsert fue exitoso borramos el logo anterior —
    // mismo orden que productController.update, para no quedarnos sin
    // ninguna de las dos imágenes si algo falla.
    if (oldImageDiskPath) removeFile(oldImageDiskPath);

    res.json({ status: 'success', data: branch });
  } catch (err) {
    // El upsert falló: limpiamos el archivo NUEVO que multer ya guardó,
    // pero dejamos intacto el logo viejo.
    if (req.file) removeFile(req.file.path);
    next(err);
  }
};

// GET /branches/list
// Listado mínimo para selectores de otros módulos (ej. el filtro de
// sucursal en Créditos) — sin el permiso branches:read ni la restricción a
// la sucursal propia de getAll, porque no es una pantalla de
// administración: solo expone branch_id + name de sucursales activas.
const getActiveList = async (req, res, next) => {
  try {
    const branches = await branchService.getActiveList();
    res.json({ status: 'success', data: branches });
  } catch (err) { next(err); }
};

// GET /branches/me
// Cualquier usuario autenticado puede consultar SU PROPIA sucursal (incluye
// receipt) — a diferencia de GET /branches/:id, que exige el permiso
// settings:read porque es para administración. Un cajero necesita estos
// datos para imprimir el ticket, no para "administrar" sucursales.
const getMyBranch = async (req, res, next) => {
  try {
    if (req.user.branch_id === null) {
      return res.status(400).json({ status: 'error', message: 'Este usuario no tiene una sucursal asignada' });
    }
    const branch = await branchService.getById({
      branchId:       req.user.branch_id,
      requestingUser: req.user,
    });
    res.json({ status: 'success', data: branch });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, getMyBranch, getActiveList, create, update, toggleStatus, upsertReceipt };