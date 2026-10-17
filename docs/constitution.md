# Constitución del proyecto — smallposv2

> Reglas no negociables del proceso de desarrollo. Aplican a personas y agentes por igual.
> Si una regla choca con otro documento, gana esta constitución.

Este documento es **vinculante**. Si un pedido del usuario, una spec futura, el plan o un hábito de “hacer extra” contradice esta constitución, gana la constitución.  
El agente **pregunta y espera respuesta** antes de continuar. No asume, no elige en silencio, no “resuelve después”.

---

## 1. Las specs son la fuente de verdad
- Toda funcionalidad nace de una spec en `specs/`. Si algo no está en una spec, no se implementa.
- Antes de tocar código hay que leer esta constitución y la spec activa.

## 2. Estados de una spec
- **Borrador**: en redacción o con dudas abiertas. No se escribe código.
- **Lista**: aprobada explícitamente por el usuario y sin dudas abiertas. Se puede implementar.
- **Bloqueada**: depende de algo externo o de una decisión pendiente. No se escribe código.
- **Terminada**: implementada, con todas sus tareas cerradas, sus criterios de aceptación cumplidos con evidencia y los tests en verde.
- Solo el usuario cambia una spec a **Lista** o a **Terminada**, o el agente con petición o aprobación explícita del usuario.

## 3. Avance secuencial
- No se genera código si la spec no está en estado **Lista**.
- No se empieza otra spec hasta que la anterior esté **Terminada**.

## 4. Ante la duda, se detiene
- Si aparece una duda o ambigüedad, se detiene el trabajo y se pregunta antes de seguir. No se asume.
- La duda se registra en "Dudas abiertas" de la spec, que vuelve a **Borrador** hasta resolverla.

## 5. Gestión de cambios
- Si algo cambia (requisito, decisión o hallazgo técnico), primero se actualizan las specs afectadas, y después el código.
- Los archivos de `specs/` solo se modifican con petición o aprobación explícita del usuario.

## 6. Idioma
- Código, identificadores, nombres de archivo de código y mensajes de commit: **inglés**.
- Mensajes visibles para el usuario final y documentación (`docs/`, `specs/`): **español**.

## 7. Tests
- Cada tarea termina con sus tests escritos y **en verde**.
- Está prohibido avanzar a la siguiente tarea o spec con tests en rojo.
- No se desactivan ni se borran tests para ponerlos en verde.
