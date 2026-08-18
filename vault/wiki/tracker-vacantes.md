---
title: Tracker de Vacantes
type: wiki
tags: [busqueda-empleo, panama, tracker, vivo]
created: 2026-08-18
updated: 2026-08-18
summary: Tracker vivo de vacantes — estado, fechas de seguimiento y cierre.
---

# Tracker de Vacantes

Documento **vivo**: el skill [[skill-job-search]] lo lee y lo reescribe en su sitio.
Cada corrida sube el campo `updated` y agrega una línea al [[log]]. Empresas en
[[empresas-target]].

## Estados
`aplicado` · `seguimiento` · `entrevista` · `sin-respuesta` · `oferta` · `rechazado` · `cerrado`

## Vacantes
| Empresa | Puesto | Aplicado | Estado | Último contacto | Cierra | Próximo paso |
|---|---|---|---|---|---|---|
| _(ejemplo)_ | Analista de Inventario | 2026-08-18 | aplicado | 2026-08-18 | 2026-08-29 | Seguimiento a 7 días |

## Reglas de alerta (las aplica job-search)
- **Seguimiento**: `estado=aplicado` y `hoy - último_contacto > 7 días` → marcar seguimiento.
- **Cierra pronto**: `cierra - hoy <= 3 días` → priorizar.
- **Sin respuesta**: `estado=aplicado` y `hoy - aplicado > 14 días` → mover a `sin-respuesta`.
