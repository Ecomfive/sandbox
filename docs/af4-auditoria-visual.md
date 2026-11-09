# Portal AF4 360° — auditoría visual y sistema AF4

Auditoría de las páginas del área Finanzas (más Nómina y Deliverys) y el sistema que la resuelve. Sin datos reales:
solo patrones de código.

## 1. Inventario de inconsistencias (antes del sistema AF4)

Conteo sobre `src/app/(app)/<módulo>` (estado-resultados, panel-financiero, rentabilidad, presupuesto, cierre-mes,
proyeccion-caja, flujo-caja, utilidades, cuentas-por-cobrar/pagar, libro-movimientos, ventas-tiendas, clientes-marketing,
costos-mercancia, bienes-de-uso, nomina, conciliacion-bancaria, deliverys, importar).

### Formatos duplicados
- **`hoyPanama`**: 17 copias idénticas como `const hoyPanama = () => …` (más 12 usos en línea del mismo
  `toLocaleDateString("en-CA", { timeZone: "America/Panama" })`), y dos exportadas con otra firma
  (`lib/finanzas/cxc-cxp.ts`, `lib/tareas/definiciones.ts`).
- **Dinero**: ~30 funciones `usd`/`dinero`/`formatoDinero` distintas. Varían en: decimales (0, 2 o «mínimo 2»),
  símbolo (`$` estrecho, `US$`, sufijo « USD» en las acciones), locale (`es-PA` y `es-CR` mezclados para dólares) y
  negativos (guion ASCII «-$1,234»). `Intl.NumberFormat` se crea en cada llamada en la mayoría.
- **Porcentajes**: tres convenciones a la vez — fracción ×100 (`ventas-tiendas/formato.ts` `pct`), ya en 0–100
  (`formatoPct`, `pct1`) y `toFixed(1)` con signo armado a mano («+12.3 %») en Panel e Informe. Sin «puntos
  porcentuales» para diferencias de márgenes (se mostraban como % relativo).
- **Fechas y meses**: `mesCorto` en `lib/finanzas/eerr.ts`, `nombreMes` en `cierre.ts`, `diaCorto` en
  `proyeccion-caja.ts`, `nombreMes` en `crm-dropshippers/datos-crm.ts`; cada uno con su propia lista de meses.

### Encabezados y filtros
- Cada página arma su barra: `SelectorEntidad` (4), `Selector` de ventas-tiendas (9), `Selectores` de rentabilidad (5),
  `nav` a mano «Elegir mes»/«Ver por tienda»/«Elegir semana»/«Elegir cuenta» (10), `Opciones` de proyección (2),
  `SelectorMeses` (formulario GET con botón «Ver», 2), `SelectorSemana` (2). Alturas de 28 a 36 px, radios distintos.
- El período no es uniforme: EERR fijo en 12 meses sin elección; Rentabilidad u3/u12/mes; Ventas y Clientes por mes;
  Flujo con desde/hasta; Panel fijo en 12.
- Nadie dice **de qué fecha son los datos** ni cuándo se actualizaron. «Descargar Excel» aparece en 4 lugares con 3
  estilos (enlace con borde, botón del menú de `TablaDatos`, texto). No hay «Imprimir».

### Tarjetas
- `KpiCard compacta` en todas, con el valor en `text-lg`: un KPI ejecutivo (EBITDA) pesa lo mismo que un contador
  («Movimientos sin tipo»). Las variaciones van como texto en el subtexto («+12.3 % vs. mes anterior»), sin dirección
  visual, sin juicio (bueno/malo) y sin texto para lectores. El tono `success` se usaba para «positivo», no para
  «favorable» (un gasto que sube salía verde).
- Alertas de datos mezcladas con los indicadores en el mismo grupo (EERR).

### Tablas
- 4 tablas «estado por mes» hechas a mano con las mismas clases copiadas: `TablaEstadoResultados`, `TablaMensual`
  (flujo, utilidades), `TablaProyeccion` (con su propio plegado), tabla de presupuesto y comparación real. Cada una
  decide distinto: rojo en «resultado» o en todo lo no detalle; «—» para cero con umbrales 0, 0.005 o 0.5; sangría
  `pl-8` o `pl-10`; plegado solo en proyección.
- Sin jerarquía contable visible: los subtotales y el total final se distinguen apenas por un borde.
- Sin «% sobre ventas» en el EERR (solo las filas de margen).
- `TablaDatos` sí se usa bien en listas (cascada de rentabilidad, economía unitaria, libro): se conserva.

### Gráficas (recharts)
- 6 gráficas con el mismo bloque copiado (ejes, rejilla, `contentStyle` del globo) y colores elegidos en cada una:
  `--muted-foreground` como serie principal (gris de texto, no de dato), `--primario`, `--border-control` como serie
  (contraste 3,4:1 con el borde), `--foreground-soft`, `--success`. Sin paleta de series ni equivalente en oscuro.
- Leyenda de recharts por defecto (no respeta el formato), globo con el valor sin unidad de la serie de la derecha.
- Sin cascada (waterfall) para la cascada de margen, que es justo el caso de uso.

### Estados vacío y de carga
- `EstadoVacio` con mensajes técnicos («Falta correr la migración 0901…») y sin acción.
- `loading.tsx` con esqueletos distintos de lo que luego se dibuja (alturas fijas que no coinciden: salto al cargar).
  `importar` no tiene `loading.tsx`.

### Menú
- Finanzas: 20 páginas en una sola lista bajo «Proveeduría», con «Gestión de tienda» y «Fulfillment» diciendo
  «Próximamente» aunque las finanzas ya consolidan las tiendas de los tres frentes.

## 2. Decisiones de diseño

| Decisión | Por qué |
|---|---|
| **Negativos con signo menos tipográfico (U+2212), nunca paréntesis**, en todo el portal | Una sola regla para tarjeta, tabla, eje y globo. El dueño no es contador: «−$1,234» se lee al instante; los paréntesis se confunden con notas. El lector de pantalla dice «menos». El signo − tiene el ancho de las cifras tabulares, así que las columnas quedan alineadas. En el EERR los costos se muestran en positivo («lo que se gastó»), así que un negativo es una pérdida o un reverso: es raro y debe resaltar. |
| Rojo **solo en subtotales y totales** negativos (token `text-destructive`) | Un detalle negativo es un reverso, no una alarma. El color nunca lo pone el formato. |
| Total final con **doble filete** contable; subtotales con filete `border-control` y fondo tenue | Jerarquía de estado financiero reconocible sin agregar color. |
| KPI ejecutivo con valor de 22–26 px, punto de estado, flecha + cifra + «vs …» | El punto lleva el juicio (favorable según el sentido del indicador: un gasto que sube es rojo), la flecha y el texto llevan la dirección: no depende del color. |
| Diferencias de márgenes en **puntos porcentuales** («+1.2 pp») | Un margen que pasa de 30 % a 31,2 % no «sube 4 %»: sube 1,2 pp. |
| Paleta de gráficas por tokens `--grafica-1..5`, `--grafica-positivo/negativo`, todas ≥ 3:1 contra la tarjeta en los dos temas | Serie 1 = magnitud base (gris oscuro), 2 = el resultado que importa (morado de la marca), 5 = referencia. Además del color, cada serie se distingue por forma (barra, línea continua, rayas, puntos). |
| Una barra de contexto (`EncabezadoAF4`) | Filtros a la izquierda; «Datos hasta», «Actualizado», Descargar e Imprimir a la derecha. Lo mismo en cada página: se aprende una vez. |
| Período único `?periodo=` (`u3`, `u6`, `u12`, `aAAAA`, `AAAA-MM`) | Compatible con las claves de Rentabilidad. Botones para los rápidos y una lista para el mes suelto: con 12 meses + 4 rápidos no caben como botones. |
| Controles de 32 px de alto | Es una herramienta de escritorio densa (como el resto del portal); cumple WCAG 2.5.8 (24 px). En el celular los controles envuelven y la lista desplegable usa el selector nativo. |
| Panel financiero = inicio del Portal AF4 (sin `/finanzas`) | El Panel ya es la portada: KPIs de dirección, cola de cierre y alertas. Una portada aparte duplicaría lo mismo y pediría otro permiso. Va primero en el menú y el panel del área se titula «Portal AF4 360°». |
| Finanzas sin frentes, con grupos por función | Las finanzas consolidan los tres frentes; los «Próximamente» eran ruido. Grupos: Dirección, Tesorería, Contabilidad y cierre, Comercial, Proveeduría Dropi. |
| Un solo `MarcoAF4` (franja gris del `KpiGroup`) para gráficas y tablas financieras | Mismo lenguaje que los grupos de indicadores que ya existían. |

## 3. Qué hay en el sistema

- `src/lib/af4/formato.ts` — `dinero`, `dineroCompacto`, `dineroKpi`, `porcentaje`, `fraccion`, `puntos`, `entero`,
  `numero`, `dias`, `veces`, `MENOS`, `SIN_DATO`.
- `src/lib/af4/fecha.ts` — `hoyPanama`, `mesEnCursoPanama`, `inicioDeMes`, `mesCorto`, `mesMedio`, `mesLargo`,
  `fechaCorta`, `diaMes`, `fechaHora`, `rangoMeses`, `sumarMeses`, `ultimosMeses`, `leerPeriodo`.
- `src/lib/af4/variacion.ts` — `calcularVariacion(actual, referencia, sentido)`, textos y tono.
- `src/lib/af4/periodo.ts` — `elegirPeriodoAF4`, `opcionesPeriodo`, `periodoAnterior`, `rangoPeriodo`.
- `src/lib/af4/tabla-financiera.ts` — modelo de filas y adaptadores `desdeEerr`, `desdeProyeccion`.
- `src/lib/af4/grafica.ts` — colores, trazos, `barrasCascada`, `bandaEscenarios`.
- `src/lib/af4/eerr-periodo.ts` — el EERR de un período con su anterior (página y Excel).
- `src/lib/af4/cargar-contexto.ts` — `ultimaActualizacionLibro` (memoria 60 s).
- `src/components/af4/` — `EncabezadoAF4`, `ControlPeriodo`, `ControlSegmentado`, `SelectorEnlace`, `BotonImprimir`,
  `KpiAF4` + `FilaKpiAF4`, `Variacion`, `TablaFinanciera`, `GraficaBarrasAF4`, `GraficaLineasAF4`,
  `GraficaCascadaAF4`, `GraficaEscenariosAF4`, `MarcoAF4`, `EstadoVacioAF4`, `CargandoAF4`, `estilos-af4.ts`.
- Imprimir: `[data-sin-imprimir]` oculta menú, barra y migas (`globals.css`).
- Lote B agregó: `TablaComparacionAF4` (comparaciones cuyas columnas no son períodos: real/presupuesto/desvío/%, con
  fila de grupos), `informe-af4.tsx` (`PortadaInformeAF4`, `SeccionInformeAF4`, `EstiloImpresionAF4`: A4 con márgenes,
  pie con número de página, tema claro al imprimir, sin cortar tablas), `src/lib/af4/tabla-mensual.ts`
  (`desdeTablaMensual`, con prueba), y en lo existente: `TablaFinanciera` acepta `etiquetaTotal`, `celdaPropia`
  (edición en la celda) y `textoDesplegar`; `Variacion` acepta `enCelda`; `KpiAF4` acepta `activa`; las clases de fila
  (`CLASE_FILA_AF4`, `FONDO_FILA_AF4`, `claseCeldaAF4`, `claseNumeroAF4`) viven en `estilos-af4.ts`.

## 4. Migradas

Panel financiero, Estado de resultados (+ su Excel con el período), Rentabilidad por tienda (+ los filtros de sus
subpáginas), Proyección de caja. `SelectorEntidad` usa el control AF4 en todas las páginas que lo tienen. Los
formateadores de `estado-resultados/formato.ts`, `ventas-tiendas/formato.ts` y `rentabilidad/formato.ts` delegan en
el formato único (toda página que los usa ya muestra el signo menos real).

Lote B (Dirección): Informe mensual (imprimible como informe ejecutivo), Valoración, Tareas programadas, Presupuesto
(lista y detalle: la tabla mensual es una `TablaFinanciera` editable en la celda), Distribución de utilidades (con
`?periodo=`; `?desde=&hasta=` sigue funcionando), Participaciones, Retiros de socios, Estado de resultados › Ajustes y
Tipos de cambio, Cierre de mes (lista y detalle). Quedan del Lote B: `rentabilidad/capital-trabajo/`, `inventario/` y
`palancas/` (encabezado y KPIs).

## 5. Plan de migración del resto (archivo por archivo)

Receta común para cada página: (1) `EncabezadoAF4` con sus filtros en `filtros`, `datosHasta`, `actualizado` y
`descarga`; (2) indicadores principales con `KpiAF4` en `FilaKpiAF4` (variación vs período anterior con
`calcularVariacion`), contadores y alertas en `KpiGroup` con `KpiCard compacta`; (3) estados por mes con
`TablaFinanciera` (adaptador nuevo en `tabla-financiera.ts` si hace falta); (4) gráficas con los envoltorios AF4;
(5) `loading.tsx` con `CargandoAF4`; (6) quitar `usd`/`dinero`/`pct`/`hoyPanama` locales por `@/lib/af4/*`.

**Lote A — Tesorería**
- `flujo-caja/page.tsx`: `SelectorMeses` → `ControlPeriodo` (o mantener desde/hasta como `?periodo=` con `aAAAA`);
  `EncabezadoAF4` con la descarga `/api/exportar-flujo`; KPIs con `KpiAF4`. `flujo-caja/grafica-flujo.tsx` →
  `GraficaBarrasAF4` (entradas color 1, salidas color 5 en negativo, neto línea color 2 rayas). `TablaMensual` →
  `TablaFinanciera` (adaptador `desdeTablaMensual`: grupo→grupo, seccion→seccion, detalle→detalle con padre,
  resultado→subtotal/saldo). `flujo-caja/actions.ts`, `saldos/tabla-saldos.tsx`: `usd` → `dinero(v, "USD", { decimales: 2 })`.
- `proyeccion-caja/precision/page.tsx`: `dinero`/`pct` locales → `@/lib/af4/formato`; tabla de precisión a `TablaDatos` o `TablaFinanciera`.
  `proyeccion-caja/actions.ts`, `tabla-ajustes.tsx`: `usd` → `dinero`.
- `conciliacion-bancaria/page.tsx`, `cobros/page.tsx`: `nav` de cuenta/fuente → `ControlSegmentado`; KPIs con
  `KpiAF4`; `usd`/`pct` → formato AF4. `tabla-lineas.tsx`, `ficha-linea.tsx`, `cobros/tabla-lotes.tsx`, `barra-lote.tsx`,
  `actions.ts`: `usd` → `dinero(…, { decimales: 2 })`; `hoy` en línea → `hoyPanama()`.
- `src/components/cartera/vista-cartera.tsx`, `ficha-documento.tsx`, `pagina-cartera.tsx` (Cuentas por cobrar y por
  pagar): `EncabezadoAF4` en `pagina-cartera.tsx`; antigüedad por tramos como `GraficaBarrasAF4`; formatos AF4.

**Lote B — Dirección**
- `panel-financiero/informe/page.tsx`: `usd`/`pct` → AF4; `nav` «Mes de la comparación» → `ControlPeriodo` (solo
  meses); tablas a mano → `TablaFinanciera`; variaciones con `Variacion`.
- `panel-financiero/valoracion/page.tsx`: tabla → `TablaFinanciera` o `TablaDatos`; KPIs `KpiAF4`.
- `panel-financiero/tareas/page.tsx`: formato de fechas con `fechaHora`.
- `presupuesto/page.tsx`, `[id]/page.tsx`: `EncabezadoAF4` (descarga `[id]/descargar`), KPIs vs real con `Variacion`
  (`modo: "dinero"`). `[id]/tabla-presupuesto.tsx`, `comparacion-real.tsx`, `sensibilidad.tsx`, `supuestos.tsx`:
  tablas a mano → `TablaFinanciera` (columnas = meses; filas por sección); `dinero`/`pct` locales → AF4.
  `[id]/descargar/route.ts` y `actions.ts`: `hoyPanama()`/`dinero`.
- `utilidades/page.tsx`: `TablaMensual` → `TablaFinanciera`; `participaciones/`, `retiros/tabla-retiros-socios.tsx`:
  `usd` → AF4.
- `rentabilidad/capital-trabajo/`, `inventario/`, `palancas/`: ya usan los filtros AF4 (`Selectores`); falta
  envolverlos en `EncabezadoAF4` y pasar sus KPIs a `KpiAF4`.

**Lote C — Contabilidad y cierre**
- `cierre-mes/page.tsx`, `[periodo]/page.tsx`, `actions.ts`: `EncabezadoAF4`, fechas con `fechaCorta`/`mesLargo`,
  `hoy` en línea → `hoyPanama()`; la lista de tareas del cierre se queda (es un checklist, no una tabla financiera).
- `libro-movimientos/page.tsx`, `tabla-movimientos.tsx`, `pendientes/`, `reglas/`, `barra-clasificar.tsx`,
  `pegar-excel.tsx`, `importar/importar-excel.tsx`: `toLocaleString` (27 usos) → `dinero`/`entero`; selector de mes →
  `ControlPeriodo` (`?periodo=AAAA-MM`).
- `costos-mercancia/page.tsx`, `mapeo/page.tsx`, `tabla-costos.tsx`, `lotes/tabla-lotes.tsx`,
  `importar/importar-costos.tsx`: formatos AF4 (14 `toLocaleString`).
- `bienes-de-uso/page.tsx`, `tabla-bienes.tsx`, `ficha-bien.tsx`, `importar/importar-bienes.tsx`, `actions.ts`:
  `usd` → AF4; KPIs `KpiAF4`; depreciación mensual como `GraficaLineasAF4`.

**Lote D — Comercial**
- `ventas-tiendas/page.tsx`, `ordenes/page.tsx`: `Selector` mes/tienda → `ControlPeriodo` + `ControlSegmentado`;
  `grafica-ventas.tsx` → `GraficaBarrasAF4`; `cuadre/page.tsx`, `cuadre/base-reparto.tsx`, `ordenes/ficha-orden.tsx`,
  `importar/importar-ventas.tsx`: formatos AF4. `datos.ts` ya usa `hoyPanama` común.
- `clientes-marketing/selectores.tsx`: → `ControlPeriodo` + `ControlSegmentado`; `marketing/grafica-marketing.tsx` →
  `GraficaBarrasAF4` con ROAS en el eje derecho (`formatoDerecha: "veces"`, referencia ROAS 1 tipo `limite`);
  `cohortes/page.tsx`: tabla de cohortes a mano (se queda, con formatos AF4); `formato.tsx` → delegar en AF4.

**Lote E — Equipo y Operación**
- `nomina/page.tsx`, `formato.ts` (delegar en AF4, conservando `USDT`), `ficha-persona.tsx`, `conciliacion/page.tsx`,
  `conciliacion/nomina-al-libro.tsx`, `importar/importar-nomina.tsx`: `EncabezadoAF4`, KPIs, formatos.
- `deliverys/page.tsx`, `entregas/page.tsx`, `selector-semana.tsx` (→ `ControlSegmentado` o `SelectorEnlace`),
  `tabla-cierres.tsx`, `entregas/tabla-entregas.tsx`, `ficha-cierre.tsx`, `repartidores/ficha-repartidor.tsx`,
  `importar/importar-deliverys.tsx`, `actions.ts`, `formato.ts`: formatos AF4 (el sufijo « USD» de las acciones →
  `dinero(…, { decimales: 2 })`).
- `importar/importar-universal.tsx`: formatos AF4; agregar `loading.tsx` con `CargandoAF4 filas={0}`.

**Fuera de Finanzas** (mismo `hoyPanama` en línea): `compras/envios/*`, `compras/calculos-compras.ts`,
`lib/moneda/tipo-cambio.ts`.
