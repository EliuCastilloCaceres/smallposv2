// src/controllers/providersController.js
const providerService = require('../services/providerService');

const getAll = async (req, res, next) => {
  try {
    const result = await providerService.getAllProviders({
      filters: {
        search:    req.query.search,
        is_active: req.query.is_active,
        page:      req.query.page,
        limit:     req.query.limit,
      },
    });
    res.json({ status: 'success', ...result });
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const data = await providerService.getProviderById(parseInt(req.params.providerId));
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const create = async (req, res, next) => {
  try {
    const data = await providerService.createProvider(req.body);
    res.status(201).json({ status: 'success', data });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const data = await providerService.updateProvider(parseInt(req.params.providerId), req.body);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

// PATCH /:providerId/status  { is_active: true | false }
const toggleStatus = async (req, res, next) => {
  try {
    const providerId = parseInt(req.params.providerId);
    const is_active  = req.body.is_active === true || req.body.is_active === 1;
    const data = await providerService.toggleStatus(providerId, is_active);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const getProducts = async (req, res, next) => {
  try {
    const providerId = parseInt(req.params.providerId);
    const data = await providerService.getProviderProducts(providerId);
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, create, update, toggleStatus, getProducts };