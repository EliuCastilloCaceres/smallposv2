# Migraciones

Cómo se cambia el esquema o los datos de una base que ya existe. El mecanismo se definió en [`specs/03-fix-costos-e-indices.md`](../specs/03-fix-costos-e-indices.md).

## 1. Cómo funciona

- **`backend/sql-init/`** (`01-schema.sql` y `02-seeds.sql`) es la **base fija** de una instalación nueva. Docker la carga solo cuando crea la base desde cero. **No se edita** para cambios nuevos.
- **`backend/migrations/`** guarda los cambios posteriores, uno por archivo, con nombre `NNN-descripcion.sql`. Se aplican en orden por nombre, encima de `sql-init/`.
- **`schema_migrations`** registra cada migración aplicada (`name`, `applied_at`). Una migración registrada no se vuelve a aplicar.
- El runner vive en `backend/src/utils/migrations.js` y ejecuta cada archivo tal cual, con todas sus sentencias.

Las migraciones pendientes se aplican en tres momentos:

| Cuándo | Qué pasa |
|---|---|
| **Al arrancar el backend** (`npm start`, `npm run dev`, el contenedor) | Se aplican antes de que el servidor acepte peticiones. Si una falla, el backend no arranca. |
| **Con `npm run migrate`** | Se aplican sin levantar el servidor. Sale con código 1 si una falla. |
| **En los tests** | `resetDatabase` las aplica después de cargar `sql-init/`, antes de cada archivo de integración (ver `docs/tests.md`). |

En una instalación nueva: Docker carga `sql-init/` y, al arrancar, el backend aplica todas las migraciones.

## 2. Escribir una migración

1. **Nombre:** el siguiente número de tres dígitos y una descripción en inglés, en kebab-case. Ejemplo: `003-add-expense-categories.sql`. El runner se niega a aplicar nada si un `.sql` de la carpeta no sigue ese formato.
2. **Contenido:** SQL de MySQL 8, con las sentencias separadas por `;`. Al inicio, un comentario que diga qué hace y de qué spec viene. Ejemplos: `001-add-date-indexes.sql` (índices) y `002-add-layaway-details-purchase-price.sql` (columna nueva que llena los datos existentes).
3. **Un cambio acotado por archivo.** MySQL confirma solo cada cambio de esquema (`ALTER`, `CREATE`, `DROP`), así que una migración no es atómica: si falla a la mitad, lo anterior ya quedó aplicado.
4. **Datos existentes:** si agregas una columna obligatoria, llénala en la misma migración, como hace la `002`.
5. **Nunca edites una migración ya aplicada** en otra base (la de otra persona, la de producción): el runner la reconoce por nombre y no la vuelve a correr. Para corregirla, escribe una migración nueva.
6. **Código y migración van en el mismo commit** si el código depende del cambio. El código nuevo contra el esquema viejo, o al revés, puede fallar.
7. **Test:** cada migración lleva su test en `backend/tests/integration/migrations/`, con el mismo nombre del archivo y terminación `.test.js`. Para probarla sobre datos con la forma anterior, usa `resetDatabase({ migrate: false })` y aplica las migraciones en el test (ver el test de la `002`).

## 3. Aplicar las migraciones

**Con Docker** (desarrollo):

```bash
docker compose exec backend npm run migrate
```

O reinicia el backend: `docker compose restart backend`. Ojo: nodemon reinicia solo cuando cambian archivos `.js` o `.json`, así que **crear un `.sql` no aplica la migración por sí solo**.

**Sin Docker**, desde `backend/`, con un `.env` que apunte a la base que quieres migrar:

```bash
npm run migrate
```

El resultado se ve en la consola:

| Mensaje | Significado |
|---|---|
| `✅  Migraciones aplicadas: 003-….sql` | Se aplicaron esas migraciones. |
| `✅  Migraciones al día` | No había pendientes. |
| `❌  Error al aplicar migraciones: La migración 003-….sql falló: …` | Ver la sección 4. |

Para ver qué migraciones tiene una base:

```sql
SELECT name, applied_at FROM schema_migrations ORDER BY name;
```

## 4. Si una migración falla

El backend muestra el error y no arranca, y `npm run migrate` sale con código 1. La migración que falló **no se registra** y las siguientes **no se aplican**.

1. **Lee el mensaje:** dice qué archivo falló y el error de MySQL.
2. **Revisa qué alcanzó a aplicarse.** Los cambios de esquema anteriores a la sentencia que falló pueden haber quedado (punto 3 de la sección 2). Revísalo con `SHOW CREATE TABLE <tabla>`.
3. **Deshaz a mano lo que quedó a medias,** para que la migración pueda correr completa otra vez. MySQL 8 no acepta `ADD COLUMN IF NOT EXISTS` ni `CREATE INDEX IF NOT EXISTS`, así que una columna o un índice que ya existe hace fallar el siguiente intento.
4. **Corrige la causa:**
   - si el error está en el archivo y la migración no se ha aplicado en ninguna otra base, corrige el archivo;
   - si ya se aplicó en otra base, no lo edites: corrige los datos de esta base que la hacen fallar, o escribe una migración nueva.
5. **Vuelve a aplicarla** con `npm run migrate` o reiniciando el backend.

No insertes a mano un registro en `schema_migrations` para saltarte una migración, salvo que ya hayas aplicado a mano **todo** su contenido.

## 5. Limitaciones

- **No hay forma de revertir** (*down*): para deshacer un cambio se escribe otra migración.
- **Una sola instancia del backend:** no hay bloqueo, así que dos backends que arrancan a la vez contra la misma base podrían intentar la misma migración.
- **Sin control de cambios en los archivos:** si alguien edita una migración ya aplicada, el runner no lo detecta.
- **Solo SQL:** no hay migraciones en JavaScript.
