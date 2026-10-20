# Tests

Cómo correr y escribir los tests del proyecto. La infraestructura se definió en [`specs/01-infraestructura-de-tests.md`](../specs/01-infraestructura-de-tests.md), y la constitución (§7) exige que cada tarea termine con sus tests en verde.

| Lado | Herramientas | Comando |
|---|---|---|
| Backend | Jest + supertest, contra una base MySQL de pruebas | `npm test` en `backend/` |
| Frontend | Vitest 0.34 + React Testing Library + jsdom | `npm test` en `frontend/` |

Los dos comandos salen con código 0 si todo pasa y con otro código si falla algún test.

## 1. Correr los tests

### Backend

1. Levanta la base de pruebas (servicio `mysql_test` de `docker-compose.yml`):

   ```bash
   docker compose --profile test up -d --wait mysql_test
   ```

2. Corre los tests:

   ```bash
   cd backend
   npm test
   ```

3. Cuando termines, apágala si quieres liberar recursos. Sus datos viven en memoria y se pierden al apagarla, pero eso no importa: los tests la recrean.

   ```bash
   docker compose --profile test stop mysql_test
   ```

Si `mysql_test` no está levantada, los tests fallan de inmediato con un mensaje que dice cómo levantarla.

**Dentro de Docker** (sin Node en tu máquina). El host de la base cambia a `mysql_test` y el puerto al interno:

```bash
docker compose --profile test up -d --wait mysql_test
docker compose run --rm --no-deps -e TEST_DB_HOST=mysql_test -e TEST_DB_PORT=3306 backend npm test
```

### Frontend

```bash
cd frontend
npm test
```

No necesita base de datos ni backend. **Dentro de Docker:**

```bash
docker compose run --rm --no-deps frontend npm test
```

> **Después de cambiar dependencias** (`package.json`), reconstruye la imagen antes de correr los tests en Docker: `docker compose build backend` o `docker compose build frontend`. Los contenedores guardan `node_modules` en un volumen propio y no ven lo que instalas en tu máquina.

### Un solo archivo o un grupo

| Qué | Comando |
|---|---|
| Un archivo del backend | `npx jest tests/unit/utils/timezone.test.js` |
| Solo unitarios del backend (sin base) | `npx jest --selectProjects unit` |
| Solo integración del backend | `npx jest --selectProjects integration` |
| Un archivo del frontend | `npx vitest run src/utils/dateFormatter.test.js` |
| Frontend en modo watch | `npx vitest` |

## 2. Cómo está organizado

### Backend

```
backend/
├── jest.config.js          dos proyectos: unit e integration
└── tests/
    ├── unit/               no usan la base de datos
    ├── integration/        usan la base de pruebas, a través de la API o del pool
    ├── helpers/            helpers para usar en los tests
    └── setup/              configuración de Jest (no se importa desde los tests)
```

- **`unit`:** tests de funciones sueltas. Corren sin base de datos.
- **`integration`:** antes de **cada archivo**, la base vuelve al estado de una instalación nueva: se borran todas las tablas, se cargan otra vez `sql-init/01-schema.sql` y `02-seeds.sql`, y se aplican las migraciones de `backend/migrations/`, igual que hace el backend al arrancar. Lo que crea un archivo no lo ve el siguiente. Dentro de un mismo archivo los datos sí se comparten entre tests.
- Los archivos corren **en serie**, porque todos comparten la misma base.
- Dentro de `unit/` e `integration/`, las subcarpetas reflejan `src/` (por ejemplo, `tests/unit/utils/` para `src/utils/`). Los tests de la propia infraestructura van en `test-infra/`.

### Frontend

- El test va **junto al archivo que prueba**: `dateFormatter.js` → `dateFormatter.test.js`, `ConfirmDialog.jsx` → `ConfirmDialog.test.jsx`.
- La config de Vitest vive en la sección `test` de `vite.config.js`, así que los tests usan el mismo plugin de React que la app. `frontend/vitest.setup.js` carga los matchers de `jest-dom` y limpia lo renderizado después de cada test.
- La zona horaria de la app (`VITE_TIMEZONE`) está fijada en `America/Mexico_City` para los tests, sin importar lo que diga `.env`.

## 3. Base de datos de pruebas

| Dato | Valor |
|---|---|
| Servicio | `mysql_test`, solo con `--profile test` |
| Base | `smallposv2_test` |
| Puerto en tu máquina | 3308 |
| Zona horaria | `-04:00`, como el MySQL de producción (ver `utils/timezone.js`) |
| Datos | En memoria; se pierden al apagar el servicio |

- **Candado:** si el nombre de la base no termina en `_test`, los tests se niegan a correr. Así es imposible borrar por error la base de desarrollo o la de producción.
- **Configuración:** vive en `backend/tests/helpers/database.js`. Host, puerto y nombre se pueden cambiar con `TEST_DB_HOST`, `TEST_DB_PORT` y `TEST_DB_NAME`.
- **Sin `.env`:** los tests nunca leen `backend/.env`. `dotenv` se reemplaza por un stub y `tests/setup/env.js` fija las variables que lee el backend (`DB_*`, `JWT_SECRET`, `NODE_ENV=test`).

## 4. Escribir un test

### Reglas
- Los nombres de `describe` e `it` van **en inglés**, como el resto del código (constitución §6). Los comentarios siguen el estilo del proyecto, en español.
- Cada spec escribe los tests de lo que toca. Ninguna tarea se cierra con tests en rojo, y no se borran ni se desactivan tests para ponerlos en verde.

### Backend: test unitario

Si el módulo que pruebas importa `src/config/db` aunque la función no lo use, reemplázalo con `jest.mock` para no abrir conexiones:

```js
// tests/unit/utils/timezone.test.js
jest.mock('../../../src/config/db', () => ({}));

const { todayInMexico } = require('../../../src/utils/timezone');

describe('todayInMexico', () => {
  it('returns the Mexico day, not the UTC day', () => {
    jest.useFakeTimers({ now: new Date('2026-03-15T00:30:00Z') });
    expect(todayInMexico()).toBe('2026-03-14');
    jest.useRealTimers();
  });
});
```

### Backend: test de integración

Usa `supertest` contra la app (`backend/app.js`), que se importa sin abrir un puerto. La base ya está reiniciada cuando empieza el archivo.

```js
// tests/integration/users/list.test.js
const request = require('supertest');
const app     = require('../../../app');
const { loginAs }        = require('../../helpers/auth');
const { createTestUser } = require('../../helpers/users');

describe('GET /api/users', () => {
  it('responds 403 to a cashier', async () => {
    const cajero = await createTestUser({ role: 'cajero', branchId: 1 });
    const token  = await loginAs(cajero);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
```

Para consultar o preparar datos directo en la base, usa el mismo pool del backend: `require('../../../src/config/db')`. Se cierra solo al terminar el archivo.

### Helpers del backend

| Helper | Archivo | Qué hace |
|---|---|---|
| `loginAs(credenciales?)` | `tests/helpers/auth.js` | Inicia sesión por la API y devuelve el `accessToken`. Sin argumentos entra como el `superadmin` de los seeds; también acepta lo que devuelve `createTestUser`. |
| `SUPERADMIN` | `tests/helpers/auth.js` | Credenciales del `superadmin` de los seeds. |
| `createTestUser({ role, branchId, username, password })` | `tests/helpers/users.js` | Crea un usuario activo directo en la base (por defecto, cajero de la sucursal 1). Devuelve `{ userId, username, password, roleId, branchId }`. |
| `resetDatabase()` | `tests/helpers/database.js` | Deja la base como una instalación nueva, con las migraciones aplicadas. Ya corre antes de cada archivo de integración; úsalo solo si un archivo necesita reiniciar a mitad. |

> `requirePermission` deja pasar siempre al `superadmin`. Para probar un 403, usa un usuario con otro rol creado con `createTestUser`.

### Frontend

Importa explícitamente lo que uses de `vitest` (no hay globals) y renderiza con Testing Library:

```jsx
// src/components/Common/ConfirmDialog.test.jsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConfirmDialog from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="Título" message="Mensaje" onConfirm={onConfirm} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
```

## 5. Limitaciones conocidas

- **Vitest 0.34:** es la última versión compatible con Vite 4 y ya no recibe mantenimiento. `npm audit` marca dos avisos críticos que vienen de ahí (el servidor de la interfaz web de Vitest, que no se usa, y `tinypool`). Son solo de desarrollo y no llegan al build. Se resuelven al actualizar Vite, en su propia spec.
- **Imagen de producción:** `backend/dockerfile` usa `npm install` sin omitir dependencias de desarrollo, así que la imagen de producción incluye Jest y supertest. Quitarlas requiere un Dockerfile de producción aparte.
