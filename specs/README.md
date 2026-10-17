# Specs

Las specs son la **fuente de verdad** del proyecto. Toda funcionalidad nace de una spec en esta carpeta: si algo no está en una spec, no se implementa.

Este proceso lo rige [`docs/constitution.md`](../docs/constitution.md). Si algo de este documento choca con la constitución, gana la constitución.

## Nombres de archivo

`NN-tema.md`

- `NN`: número consecutivo de dos dígitos, por **orden de creación**. La siguiente spec toma el número más alto + 1, empezando en `01`.
- `tema`: en kebab-case.
- Ejemplo: `01-filtro-metodo-pago.md`

## Estados

| Estado | Significado |
|---|---|
| **Borrador** | En redacción o con dudas abiertas. No se escribe código. |
| **Lista** | Aprobada explícitamente por el usuario y sin dudas abiertas. Se puede implementar. |
| **Bloqueada** | Depende de algo externo o de una decisión pendiente. No se escribe código. |
| **Terminada** | Implementada, con todas sus tareas cerradas, sus criterios de aceptación cumplidos con evidencia y los tests en verde. |

Solo el usuario cambia una spec a **Lista** o a **Terminada** o el agente con petición o aprobación explícita del usuario..

## Reglas clave

- No se genera código si la spec no está en estado **Lista**.
- No se empieza otra spec hasta que la anterior esté **Terminada**.
- Si aparece una duda, se detiene el trabajo y se pregunta. La duda se registra en "Dudas abiertas" y la spec vuelve a **Borrador** hasta resolverla.
- Si algo cambia (requisito, decisión o hallazgo técnico), primero se actualiza la spec y después el código.
- Cada tarea termina con sus tests escritos y en verde.
- Los archivos de `specs/` solo se modifican con petición o aprobación explícita del usuario.
- Las specs se escriben en español.

## Plantilla

Copia este bloque en un archivo nuevo `NN-tema.md`:

```markdown
# NN — Título de la spec

| Estado | Fecha de creación | Última actualización |
|---|---|---|
| **Borrador** | AAAA-MM-DD | AAAA-MM-DD |

## Objetivo

Qué problema resuelve esta spec y para quién.

## Historias de usuario

- Como **[rol]**, quiero **[acción]** para **[beneficio]**.

## Alcance

**Incluye**
- ...

**No incluye**
- ...

## Requisitos

1. ...

## Tareas

- [ ] Tarea 1 — tests: ...
- [ ] Tarea 2 — tests: ...

## Criterios de aceptación

| # | Criterio | Evidencia |
|---|---|---|
| 1 | ... | _(se llena al cerrar)_ |

## Dudas abiertas

- _Ninguna._

## Historial de cambios

| Fecha | Cambio | Aprobado por |
|---|---|---|
| AAAA-MM-DD | Creación de la spec. | — |
```
