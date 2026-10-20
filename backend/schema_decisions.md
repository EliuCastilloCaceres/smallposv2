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

Desde la spec 03 (`specs/03-fix-costos-e-indices.md`):
- El servidor toma `purchase_price` de `products.purchase_price` al vender; el que mande el cliente se ignora. Las variantes usan el costo del producto base.
- Los apartados congelan el costo al crearse, en `layaway_details.purchase_price`, y la venta que generan al liquidarse usa ese costo.
- Una línea con `purchase_price = 0` es una venta **"sin costo"**: el producto no tenía costo capturado al venderse. Los reportes de utilidad la marcan y permiten excluirla.

## Cambios al esquema: migraciones

`sql-init/01-schema.sql` es la base fija de una instalación nueva. Los cambios posteriores viven en `backend/migrations/` y se registran en `schema_migrations` (ver `docs/migraciones.md`).

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
