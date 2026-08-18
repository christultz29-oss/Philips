# CLAUDE.md — Esquema del Vault

> **Lee este archivo completo ANTES de escribir nada en el vault.**
> Es la capa de memoria de un sistema personal de IA. Todo es markdown plano,
> legible en cualquier editor de texto. Sin base de datos, sin binarios ocultos.

---

## 1. Qué es esto

Un vault de notas en markdown que funciona como **grafo de conocimiento**, no como
una carpeta suelta. Las páginas se enlazan entre sí con wikilinks. Cualquier
persona (o sesión futura) debe poder abrir el vault en un editor y entender todo
lo que el sistema sabe.

## 2. Estructura de carpetas

```
vault/
  raw/       Todo lo capturado SIN editar. Materia prima.
             (respuestas de práctica, notas de estudio, borradores de CV,
              correos de aplicación, transcripciones)
  wiki/      Conocimiento DESTILADO. Una página por tema, reescrita en el sitio
             conforme aprendo. Nombre estable (ej: sap-ewm.md, empresas-target.md).
             Aquí viven también los documentos VIVOS (trackers, progreso) porque
             se reescriben en su lugar y necesitan un nombre fijo para encontrarlos.
  outputs/   Todo lo que el sistema ENTREGA, con FECHA en el nombre del archivo.
             (CVs generados, planes de estudio, reportes de estado, snapshots)
```

### Regla de decisión: ¿wiki/ u outputs/?

- **¿Se reescribe en el mismo archivo con el tiempo?** → `wiki/` (nombre estable,
  se sube el campo `updated`). Ej: `tracker-vacantes.md`, `progreso-certificaciones.md`.
- **¿Es una entrega fechada, un snapshot de un momento?** → `outputs/` con
  prefijo `YYYY-MM-DD-`. Ej: `2026-08-18-cv-analista-inventario.md`.

> Nota: la especificación original listaba el "tracker de vacantes" bajo outputs/.
> Se resolvió poniendo el tracker VIVO en `wiki/` (nombre estable para que los
> skills lo encuentren) y dejando en `outputs/` los reportes/exportes fechados
> que genera cada corrida. Es una decisión documentada, no una desviación silenciosa.

## 3. Frontmatter obligatorio

**Toda** página lleva YAML frontmatter con estos campos:

```yaml
---
title: SAP EWM                       # Título legible
type: wiki                           # raw | wiki | output
tags: [sap, ewm, certificacion]      # lista, minúsculas, sin espacios
created: 2026-08-18                  # YYYY-MM-DD, no cambia nunca
updated: 2026-08-18                  # YYYY-MM-DD, se sube en cada edición
summary: Una frase de qué contiene.  # el "gancho" que va al índice
---
```

- `type` debe coincidir con la carpeta: `raw/`→`raw`, `wiki/`→`wiki`, `outputs/`→`output`.
- `created` es inmutable. `updated` se actualiza en cada escritura.
- `summary` es una sola frase; se copia tal cual al índice.

## 4. Wikilinks — el vault es un grafo

Enlaza las páginas entre sí con `[[nombre-de-archivo]]` (sin extensión):

```markdown
Ver [[empresas-target]] y las certificaciones en [[progreso-certificaciones]].
```

Cada vez que una página menciona un tema que tiene (o debería tener) su propia
página, ponle un wikilink. El objetivo es que se pueda navegar el conocimiento
saltando de nodo en nodo, no leyendo carpetas.

## 5. Nombres de archivo

- **wiki/**: `kebab-case` estable y descriptivo → `empresas-target.md`, `sap-ewm.md`.
- **outputs/**: SIEMPRE prefijo de fecha → `2026-08-18-plan-estudio-ewm.md`.
- **raw/**: prefijo de fecha recomendado → `2026-08-18-nota-syllabus-uip.md`.

## 6. Índice y log — se mantienen SIEMPRE

- [[index]] — lista TODO el vault con un gancho de una línea (el `summary`).
  Al crear o renombrar una página, agrégala/actualízala en el índice.
- [[log]] — bitácora **append-only**. Nunca se edita ni se borra lo viejo:
  solo se agrega una línea al final con fecha y qué cambió.

## 7. Reglas duras

1. **Solo markdown.** Nada de bases de datos ni formatos que un humano no pueda
   leer en un editor de texto.
2. **Frontmatter en todo.** Sin excepción.
3. **Enlaza.** Una página sin wikilinks es una hoja huérfana; evítalo.
4. **Cada skill aterriza sus entregas en `outputs/`** con la fecha en el nombre.
5. **Actualiza `index` y agrega al `log`** en cada cambio estructural.
6. **Nada se escribe fuera del vault sin avisar primero** al usuario.
