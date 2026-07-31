// src/errors/AppError.js
// Clases de error personalizadas para distinguir errores de negocio
// de errores inesperados del servidor.

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Error conocido, no un bug
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Datos inválidos') {
    super(message, 400);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflicto con datos existentes') {
    super(message, 409);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado', code = 'UNAUTHORIZED') {
    super(message, 401, code);
    this.code = code; // <─── ¡Asegura esta línea aquí!
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Sin permisos suficientes') {
    super(message, 403);
  }
}

class InsufficientStockError extends AppError {
  constructor(productName) {
    super(`Stock insuficiente para el producto: ${productName}`, 409);
    this.code = 'INSUFFICIENT_STOCK';
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  InsufficientStockError,
};
