# Equipo › Puestos — plan de la fase 1

Objetivo: que cada persona sepa **qué puesto ocupa, de qué responde, ante quién, qué puede decidir, qué
procedimientos (SOP) sigue y qué tiene que aprender en sus primeros 30, 60 y 90 días**. KPI, OKR, scorecard,
evaluaciones, PDI e incentivos son las fases 2 y 3: este diseño los deja enganchados al puesto y a la persona,
pero no los construye.

## Qué entra y qué no

| Entra en la fase 1 | Queda para después |
| --- | --- |
| Ficha del puesto: misión (JD), responsabilidades, áreas de resultado (KRA), autoridad | KPI con meta y scorecard (fase 2) |
| A quién reporta cada puesto → organigrama | OKR trimestrales (fase 3) |
| Asignar personas a puestos (y ver vacantes) | Evaluación de desempeño y PDI (fase 3) |
| Enlazar SOP (Manuales de proceso) y cursos (Universidad) | Matriz de autoridad conectada a los permisos reales |
| Plan de onboarding 30/60/90 con su avance por persona | Incentivos, Contrataciones |
| «Mi puesto» para cada persona | RACI por proceso (la autoridad del puesto cubre lo básico) |

Checklist y SLA no son una pieza aparte: van **dentro del SOP** (un manual de proceso ya admite listas).

## Datos (migración 0112)

Todas con `enable row level security` y **sin políticas**; llaves `uuid_v7()`.

- **`puestos`**
  - `nombre` (único sin mayúsculas ni espacios), `area` (texto; lista fija en código: Dirección, Marketing,
    Ventas, Operaciones, Logística, Administración y Finanzas), `reporta_a` (→ `puestos`, `null` = cabeza del
    organigrama), `plazas` (entero ≥ 1, para saber si hay vacante), `activo`.
  - `mision` (texto corto: el JD en una o dos frases), `responsabilidades` y `autoridad` (texto con el mismo
    formato simple de los manuales «## / - / 1.», se muestra como texto, nunca HTML), `kra text[]` (3 a 6
    áreas de resultado).
  - `creado_en`, `actualizado_en`, `actualizado_por`.
  - Un disparador impide que `reporta_a` forme un ciclo (A reporta a B y B a A); el servidor lo revisa antes
    para devolver un error legible.
- **`puesto_personas`** — `puesto_id`, `usuario_id` (→ `perfiles`), `principal boolean`, `desde date`.
  Una persona puede tener **varios puestos** (en un equipo chico es lo normal) pero **un solo principal**
  (índice único parcial). El principal decide su jefe en el organigrama y su «Mi puesto».
- **`puesto_manuales`** — `puesto_id`, `manual_id` (→ `manuales_proceso`, `on delete cascade`), `etapa`
  (`30` / `60` / `90` / `null` = de consulta), `orden`.
- **`puesto_cursos`** — `puesto_id`, `curso_id text` (los cursos viven en `src/lib/ayuda/cursos.ts`, así que el
  servidor valida que exista), `etapa`, `orden`.
- **`manuales_lecturas`** — `usuario_id`, `manual_id`, `leido_en`. Hace medible el onboarding: un manual
  cuenta como leído si `leido_en ≥ manuales_proceso.actualizado_en`; si el manual cambió después, sale
  «Actualizado desde que lo leíste».

El jefe de una persona **no se guarda**: son las personas del puesto al que reporta su puesto principal. Si
ese puesto está vacante, se sube al siguiente.

## Permisos

- Módulo nuevo **`puestos`** en `MODULOS` («Puestos y organigrama»): ver = abrir la lista, el organigrama y
  el avance de onboarding de todos; modificar = crear y editar puestos, asignar personas, enlazar SOP y cursos.
- **«Mi puesto»** no es un módulo (como `/ayuda`): lo abre cualquiera con sesión y solo muestra lo suyo.
  Toda lectura de otra persona exige el módulo `puestos`.
- Acciones con `requireModulo` / `requireModuloEscritura`, error devuelto como valor `{ error }`, id con forma
  de UUID, auditoría con `registrarAuditoria` (entidad `puesto`, agregada a `MODULO_DE_ENTIDAD`).

## Pantallas

Menú: área **Equipo**, fuera de los tres frentes (como Usuarios y roles), entrada «Puestos». Pestañas en
`PESTANAS_POR_MODULO`: **Puestos** · **Organigrama**.

1. **Puestos** (`/puestos`, `Pagina ancha`): `TablaDatos` con nombre, área, reporta a, personas («2 de 2»,
   punto ámbar si hay vacante), SOP y cursos enlazados, estado. Agrupar por área. «Agregar» con `FichaCrear`
   (nombre, área, reporta a, plazas, misión). Toda la fila abre la ficha.
2. **Ficha del puesto** (panel lateral `Ventana`, la ficha ya es el formulario, como `FichaCuenta`): flechas
   anterior/siguiente, «Guardar cambios» y «Cancelar» solo con cambios, Desactivar/Activar (un puesto no se
   borra si tuvo personas). Bloques (`Seccion`):
   - **Puesto** — nombre, área, reporta a, plazas.
   - **Misión**, **Responsabilidades**, **Áreas de resultado** (lista editable de 3 a 6), **Autoridad**
     («Aprueba gastos hasta US$500», «Propone descuentos; los aprueba Dirección»).
   - **Personas** — quién lo ocupa, desde cuándo, si es su puesto principal, su avance de onboarding
     («Día 30: 3 de 4»). Asignar y quitar aquí.
   - **Procedimientos (SOP)** — manuales enlazados, con su etapa; buscar y añadir de `manuales_proceso`.
   - **Onboarding 30 / 60 / 90** — cursos y manuales por etapa, en orden.
   - **Actividad** — `HistorialGenerico` con `obtenerHistorialPuesto`.
3. **Organigrama** (`/puestos/organigrama`): árbol de puestos desde `reporta_a`, con las personas (foto y
   nombre) dentro de cada caja; vacante = caja con punto ámbar; filtro por área; pulsar una caja abre la misma
   ficha. En pantallas angostas se vuelve una lista con sangría. Sin librería: CSS + la función pura que arma
   el árbol.
4. **Usuarios y roles › ficha de la persona**: bloque «Puesto» con su puesto principal y los demás (solo
   con permiso de modificar `puestos` se cambia ahí; el resto lo ve).
5. **Mi puesto** (`/mi-puesto`, `Pagina media`, enlace en `MenuCuenta` y en Equipo para todos): mi misión,
   responsabilidades, KRA y autoridad; mi jefe y mi equipo; mis SOP con «Marcar como leído»; mi onboarding
   por etapa con el avance (cursos aprobados de `cursos_progreso` + manuales leídos), cada uno enlazado a su
   lección o manual del Centro de ayuda. Con varios puestos, uno por pestaña, el principal primero.

## Lógica pura (con prueba)

`src/lib/puestos/`:
- `organigrama.ts` — armar el árbol, detectar ciclos, contar vacantes, resolver el jefe de una persona
  (saltando puestos vacantes).
- `onboarding.ts` — avance por etapa a partir de lo enlazado, `cursos_progreso` y `manuales_lecturas`
  (incluye el caso «manual actualizado después de leerlo» y el curso que ya no existe en `CURSOS`).
- `puesto.ts` — validación de la ficha (nombre, área de la lista, plazas ≥ 1, 3 a 6 KRA sin repetir).

## Orden de trabajo (un PR, commits separados)

1. Migración 0112 + `src/lib/puestos/` con sus pruebas.
2. Módulo `puestos` en `MODULOS`, menú, pestañas, migas; lista y «Agregar».
3. Ficha del puesto con sus bloques, asignación de personas, SOP, cursos y actividad.
4. Organigrama.
5. Bloque «Puesto» en Usuarios y roles.
6. Mi puesto + `manuales_lecturas` («Marcar como leído» también en el manual del Centro de ayuda).
7. Buscador global (puestos), Centro de ayuda (guía de Puestos, glosario: JD, KRA, SOP, onboarding;
   `MODULOS_CON_GUIA`), sección en `CLAUDE.md`, `npm run test:seguridad` y `revisar-formularios.cjs`.

La interfaz pasa por `ui-ux-pro-max` e `impeccable`, como pide `CLAUDE.md`.

## Por decidir antes de empezar

1. **Varios puestos por persona** (con uno principal) o uno solo. El plan asume varios.
2. **Quién edita**: el plan da todo a quien tenga `puestos` (Dirección/RRHH). Que cada líder edite solo los
   puestos de su área sería una regla extra.
3. **Áreas**: ¿la lista fija de arriba sirve, o se administran desde Configuración?
4. **Contenido inicial**: ¿cargamos los puestos actuales (con un script, como los manuales borrador) o se
   crean a mano desde la pantalla?
