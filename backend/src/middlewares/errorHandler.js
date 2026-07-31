// src/middlewares/errorHandler.js
// Middleware de error GLOBAL. Debe registrarse al final de todos los app.use().
// Captura cualquier error lanzado con next(error) desde rutas y servicios.

const { AppError } = require('../errors/AppError');

const errorHandler = (err, req, res, next) => {
  // Error operacional conocido (lanzado desde servicios o controladores)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status:  'error',
      message: err.message,
      code:    err.code ?? null,
    });
  }

  // Error de MySQL — lo mostramos de forma segura sin exponer queries
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      status:  'error',
      message: 'Ya existe un registro con esos datos',
    });
  }

  // Error inesperado del servidor — log interno, respuesta genérica al cliente
  console.error('💥  Error inesperado:', err);
  return res.status(500).json({
    status:  'error',
    message: 'Error interno del servidor',
  });
};

module.exports = errorHandler;
