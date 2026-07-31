# Decisiones de diseño — Schema v2

## Stock: inventory_stock + inventory_movements

**Problema anterior:** stock vivía en `products.general_stock` Y en `sizes.stock`. Dos fuentes de verdad = inconsistencias garantizadas.

**Solución:**
- `inventory_stock` — tabla de posición actual. Una fila por (branch, product, variant). Es la fuente de verdad.
- `inventory_movements` — bitácora inmutable. Nunca se borra. Registra quantity_before y quantity_after para auditoría completa.

**Flujo en el código:**
```
BEGIN;
  UPDATE inventory_stock SET quantity = quantity - 2 WHERE ...;
  INSERT INTO inventory_movements (quantity, quantity_before, quantity_after, ...) VALUES (-2, 10, 8, ...);
COMMIT;
```

## Catálogo por sucursal

`products.branch_id` hace que cada sucursal tenga su propio catálogo. El mismo producto físico en dos sucursales son dos registros distintos con sus propios precios, proveedor e imágenes. Traspasos entre sucursales se manejan con `inventory_transfers`.

## Clientes y créditos globales

`customers` no tiene branch_id — son globales. `credit_sales` y `layaways` tampoco tienen branch en el header (sí en los pagos, para saber en qué caja se recibió el abono).

## RBAC vs boolean columns

**Anterior:** una columna boolean por módulo en `permissions`. Añadir "crédito" = ALTER TABLE.

**Nuevo:** tabla `permissions` con (module, action) + tabla `role_permissions`. Añadir permisos = INSERT, sin DDL. La lógica en el middleware de Node:

```javascript
// ensurePermission('credit', 'approve')
const hasPermission = await db.query(
  `SELECT 1 FROM role_permissions rp
   JOIN permissions p ON rp.permission_id = p.permission_id
   JOIN users u ON u.role_id = rp.role_id
   WHERE u.user_id = ? AND p.module = ? AND p.action = ?`,
  [userId, module, action]
);
```

## Refresh tokens

- El access token (JWT) dura 15 min, no se persiste en BD.
- El refresh token dura 7–30 días, se guarda como SHA-256 hash (nunca el token real).
- En cada refresh se rota: el token viejo se marca `revoked = 1`, se emite uno nuevo.
- `user_agent` + `ip_address` permiten detectar uso desde dispositivos inesperados.
- Para cerrar sesión en todos los dispositivos: `UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`.

## cash_register_sessions

Reemplaza `open_close_details`. Ahora una sesión de caja tiene relación directa con los movimientos de caja (`cash_movements.session_id`), lo que permite corte de caja exacto por sesión.

## order_details — snapshot de precio

`unit_price` y `purchase_price` se guardan en el momento de la venta, no como FK al catálogo. Esto garantiza que los reportes históricos de margen sean correctos aunque el producto cambie de precio después.

## Campos corregidos

| Antes | Ahora |
|---|---|
| `adress` (3 tablas) | `address` |
| `amount_refound` | `amount_refunded` |
| `create_date` | `created_at` |
| `sizes` | `product_variants` |
| `orders_details` | `order_details` |
| `return_details.size varchar` | `return_details.variant_id FK` |
| `open_close_details` | `cash_register_sessions` |
