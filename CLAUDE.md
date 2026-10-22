@AGENTS.md

# Sistema Gestión de Plataformas Ecomfive

Ver [PRODUCT.md](PRODUCT.md) para el propósito del producto, usuarios y
alcance actual (Costa Rica + Panamá, Dropi). Este archivo es para
convenciones técnicas del código.

## Stack

- Next.js (App Router), Server Components y Server Actions.
- Supabase: Postgres + Storage. RLS activado en todas las tablas **y sin políticas** (migración 0063): solo el
  servidor, con la clave de servicio, toca los datos. **Una tabla nueva** se crea con
  `alter table ... enable row level security` y sin política alguna (nada de `auth.role() = 'authenticated'`: daba
  acceso total a cualquier usuario con sesión). Ver [SEGURIDAD.md](SEGURIDAD.md).
- Hosting en Vercel, desplegado desde el repo `Ecomfive/sandbox` en GitHub,
  CI/CD automático en push a `main`.
- Sin autenticación de usuarios finales todavía (ver PRODUCT.md) — es una
  limitación temporal conocida, no una decisión de diseño definitiva.

## Seguridad (reglas que no se rompen)

- Los datos se leen y escriben solo con `createServiceClient()` en el servidor. `createSessionClient()` es solo para
  saber quién es la persona y para el login. Toda página, acción y ruta nueva empieza con `requireModulo` /
  `requireModuloEscritura` (o `getUsuarioActual` en una ruta de API).
- Todo HTML que viene de una persona (descripciones) pasa por `sanitizarHtml` (`src/lib/seguridad/`, lista permitida);
  una imagen subida se valida por su firma (`detectarImagen`), no por `archivo.type` ni por la extensión; el texto de una
  persona nunca se arma dentro de un filtro `.or()` de PostgREST sin limpiarlo.
- Las cabeceras de seguridad están en `next.config.ts` y las cookies de sesión son `httpOnly`
  (`src/lib/supabase/cookies.ts`). Los secretos nunca llevan `NEXT_PUBLIC_`.
- Pruebas: `npm run test:seguridad`. Comprobar la base desde fuera: `node scripts/verificar-seguridad-supabase.mjs`.
- **Auditoría del 13 oct 2026 (skill security-audit de Cloudflare, 14 hallazgos corregidos).** Reglas que dejó:
  - Descargar de una URL externa solo con `descargarPublico` (`src/lib/seguridad/url-externa.ts`): IPv6 revisada por bytes
    (mapeadas, NAT64, 6to4…), puertos 80/443 y la IP se revisa en la misma búsqueda DNS de la conexión (`lookupPublico`).
  - Borrar un archivo de Storage a partir de una URL guardada: solo con `rutaPropia(url, prefijo, carpeta)`
    (`src/lib/seguridad/ruta-almacen.ts`), confinado a la carpeta del módulo (`compras/`, `filtros/`). Los adjuntos de un
    comentario se borran con `borrarSubidos(compraId, rutas)` (solo `comentarios/<compra>/` y nunca uno ya guardado en
    `wms_compra_adjuntos`); las rutas de medios WMS deben calzar con `RUTA_MEDIO_SHOPIFY` / `RUTA_MEDIO_DROPI`. Un nombre de
    archivo subido va a la ruta con `nombreArchivoSeguro` y el país/id se leen de la base, no del formulario.
  - Una foto se **copia** a la carpeta del módulo, no se comparte la URL (Filtro de productos: `copiarFoto`).
  - «Ver así» (vista previa de rol): la cookie es `<usuario>:<rol>` httpOnly y solo vale para quien puede **modificar**
    Usuarios y roles.
  - La bitácora del Centro de notificaciones se filtra por módulo de la entidad y país (`eventoVisible`,
    `src/lib/auditoria-visible.ts`): una entidad nueva en la auditoría se agrega a `MODULO_DE_ENTIDAD`.
  - «Hoy» arma cada tarjeta solo con su módulo; una acción que crea algo en el país de la barra comprueba `puedeVerPais`.
  - `getPaisActual` con países limitados solo devuelve uno de ellos (`paisesCandidatos`); si ninguno existe devuelve
    `SIN_PAIS` («Sin país», un id que no es de ningún país), nunca Costa Rica: las páginas quedan vacías en vez de mostrar otro país.
  - Una acción que recibe un `pais_id` o una bodega del navegador comprueba el país con `puedeVerPaisId` / `puedeVerBodega`
    (`src/lib/seguridad/pais-acceso.ts`; ya lo hacen la importación de inventario y `registrarMovimientoStock`).
  - Los eventos de un producto que son de un país (`crear_compra`, `movimiento_inventario`) llevan el país al final del detalle
    («… · Panamá») y se filtran con `eventoVisible` en la actividad del producto y en Avisos; los conteos de Avisos pasan por
    `pendientesVisibles` (`src/lib/hoy.ts`).
  - Compras y Filtro solo borran una foto de Storage si ninguna otra fila la sigue usando. La foto de una persona (Usuarios)
    se valida por su contenido y con un id UUID. El CSV pone entre comillas también lo que lleva `;` o tabulador.
  - CSV del servidor con el `celdaCsv` compartido (`src/lib/tabla/csv.ts`), HTML de correos con lo escrito por personas
    escapado.
  - `scripts/actualizar-pedidos-servidor.ts` escucha solo en 127.0.0.1, exige Host `localhost:4321` y un código por
    arranque en cada POST; el GET `/actualizar-saldo-rapido` solo muestra el botón.

## Convenciones importantes

- Todas las páginas llevan `export const dynamic = "force-dynamic"` — no
  hay caché de página, cada carga consulta datos frescos.
- **Server Components no pueden pasar funciones como props a Client
  Components** (solo datos serializables o funciones marcadas
  `"use server"`). Si un Client Component necesita un callback dinámico,
  sacarlo a su propio archivo `"use client"` y definir la función ahí
  dentro (ver `src/app/(app)/retiros/[id]/cerrar-retiro-form.tsx` como
  ejemplo). Caso típico: el `mensajeExito` de `FormularioConToast` como función
  solo sirve en un Client Component; en una página (Server Component) va un texto
  fijo, y si la acción devuelve `{ error }` el aviso sale en rojo solo (así falló
  Configuración con «Agregar cuenta»: la página dejaba de cargar).
- Acciones que crean/modifican datos importantes deben registrar auditoría
  con `registrarAuditoria()` (`src/lib/auditoria.ts`) — ver
  `src/app/(app)/retiros/actions.ts` o `productos/actions.ts` como ejemplo.
- Supabase/PostgREST limita cada `select` a ~1000 filas. Para traer un
  dataset completo existe el helper `traerTodasLasFilas()` que pagina
  automáticamente. **Ojo:** usarlo solo cuando de verdad se necesitan todas
  las filas en JS; si solo se necesita un conteo, suma o agrupación, es
  mejor hacer esa agregación directamente en Postgres (`count`, `sum`,
  `group by`) en vez de traer todo y calcularlo en JavaScript — ver
  [RENDIMIENTO-PENDIENTE.md](RENDIMIENTO-PENDIENTE.md) para el diagnóstico
  detallado de dónde falta esto todavía.
- **Retiros: los crea el equipo y Dropi solo concilia.** El correlativo
  (empieza en #0001) se escribe en el concepto del retiro en Dropi con el
  formato `#0007`. Se asigna al **crear** el retiro: la ficha de crear solo
  muestra el siguiente (`siguiente_correlativo_retiro()` = mayor existente + 1)
  sin gastarlo, así que abrirla y no guardar no deja huecos. Si dos personas
  crean a la vez y el número ya se ocupó, se guarda con el siguiente libre y la
  ficha del retiro lo avisa (`src/lib/retiros/correlativo.ts`).
  `scripts/dropi-ingerir-retiros.ts` nunca crea retiros: vincula por ese
  correlativo (guarda `dropi_id`, `banco` y `estado_dropi`, sin tocar el
  estado propio) y deja lo que no puede vincular en
  `dropi_retiros_sin_vincular`. La lógica vive en
  `src/lib/dropi/emparejar-retiros.ts`.
- **Encabezado y tooltips (estilo ClickUp).** Las migas de pan y la estrella de
  favorito salen solas en `BarraMigas` (layout de `(app)`), a partir del menú
  (`src/lib/nav-data.ts`) y la ruta (`src/lib/migas.ts`): una página nueva del
  menú aparece sola; una subpágina fija se agrega a `SUBPAGINAS`; una página de
  detalle renderiza `<EtiquetaMiga texto="Retiro #0009" />`. No pongas enlaces
  "← Volver" a mano: las migas ya traen su botón de volver (historial del
  navegador). Los botones de ícono explican qué hacen con
  `<Tooltip texto="...">` (`src/components/ui/tooltip.tsx`), no con `title=`; el
  texto es corto y preciso (2 a 4 palabras, verbo en infinitivo: "Filtrar
  retiros", "Mostrar cerrados"). Un botón de ícono lleva además su `aria-label`;
  un botón que solo muestra un estado ("Activo") dice en el `aria-label` el
  estado y lo que hace al pulsarlo. En el menú lateral colapsado se usa
  `ConTooltip` (`src/components/sidebar-tooltip.tsx`), que también aparece con
  el foco de teclado. Lo que no es enfocable (un ⚠️) se vuelve `tabIndex={0}`
  con `role="img"` para poder envolverlo. La única excepción a `title=` es el
  chip de filtro con texto recortado, que muestra su nombre completo. El botón **Accesos** de la misma franja
  (`src/components/accesos/`) muestra quién tiene acceso a la sección: sale de
  los roles (`permisos_rol` + `perfiles`, ver `src/lib/accesos-actions.ts`), es
  solo lectura y consulta al abrirse; dar acceso se hace en Usuarios y roles. Se
  llama «Accesos» y no «Compartir» porque no comparte ni da permisos.
- **Ancho de las páginas.** El contenido de toda página (y de su `loading.tsx`,
  para que no salte al cargar) va dentro de `<Pagina ancho="...">`
  (`src/components/ui/pagina.tsx`), no en un `<main>` con `max-w-*` a mano:
  `ancha` (hasta 1800 px) para tablas y listas de datos, `media` (1024 px) para
  listas de tarjetas y texto, `angosta` (768 px) para formularios y ajustes,
  `ficha` (672 px) para un solo registro. El límite de ancho es para texto
  corrido; una tabla puede ocupar la pantalla. Las páginas de un mismo módulo
  (las pestañas) usan el mismo ancho. Un formulario suelto dentro de una página
  ancha se limita con `max-w-5xl` para que sus campos no se estiren. Las
  pantallas de acceso (login, sin acceso) no usan `Pagina`. El margen
  vertical de `Pagina` y el espacio entre bloques son de 24 px (`py-6`,
  `gap-6`), no 40: la tabla debe verse sin bajar. El título de la página va con
  `<EncabezadoPagina titulo="..." oculto>` (`src/components/ui/encabezado-pagina.tsx`)
  cuando es igual al de las migas de pan (queda como `<h1>` solo para lectores de
  pantalla y la descripción sigue visible); si dice algo que las migas no
  dicen («Cargar extracto bancario»), va visible con su ícono. Un dato secundario
  de un grupo de indicadores (la fecha de actualización) va en la franja del
  `KpiGroup` (`accion`), no en una fila aparte. Varios indicadores que se leen juntos
  van en **una sola barra** (un `KpiGroup` con un `KpiGrid compacta` de tarjetas
  `compacta`): Retiros tiene la barra «Dashboard» con el saldo de wallet, retiros
  abiertos, con novedad, cerrados este mes (monto y cuántos), cerrados y el total, todas
  hermanas en una misma fila que envuelve sin recortar si no caben. Un componente de
  cliente que aporta varias tarjetas (`TarjetasResumenRetiros`) devuelve un fragmento,
  no su propio `KpiGrid`, para no anidar contenedores. Si aun así hiciera falta repartir
  el ancho entre varios grupos, usa bases pequeñas dentro de un `flex flex-wrap` y
  calcúlalas pensando en pantallas de ~1 200 px de contenido, no en 1 900: un mínimo de
  39rem por grupo las apilaba en las pantallas del equipo.
- **Cuentas destino de tipo Binance.** Al elegir «Binance» en la ventana de una cuenta
  destino (`retiros/cuentas/ventana-cuenta-retiro.tsx`), el campo «Cuenta» se cambia por
  los datos en el formato del formulario de Dropi: País, Banco (la red, p. ej.
  `USDT(RED=TRC-20)`), Tipo de identificación (obligatorio), Número de identificación y
  Número de cuenta (la dirección de la billetera, obligatorio); **no** se pide «Tipo de
  cuenta». Se guardan en `cuentas_retiro.datos_binance` (jsonb, migración 0039; lógica y
  pruebas en `src/lib/retiros/datos-binance.ts`) y el número de cuenta también va en
  `detalle`, que es lo que muestran las listas. País y Tipo de identificación son listas
  desplegables (`SelectorDeLista`: un clic y se elige otra, sin borrar antes; un campo de
  texto con `datalist` solo ofrece lo que coincide con lo escrito, y con un valor puesto
  no muestra el resto); el Banco es texto con una sugerencia. Las acciones `crearCuentaRetiro` y `actualizarCuentaRetiro` devuelven el error
  **como valor** (`{ error }`), porque en producción Next.js oculta el mensaje de una
  excepción; sin la migración, las cuentas que no son Binance siguen funcionando y la
  lista se consulta sin esa columna. Cambiar una cuenta de Binance a otro tipo borra sus
  datos (`binance_previo`). Los tipos de cuenta que se ofrecen son Banco, Binance y Otro
  (`TIPOS_CUENTA`, una sola lista para la ficha, «Nueva cuenta», Configuración y el
  filtro); «Tarjeta» ya no se ofrece, pero la base todavía lo admite y una cuenta antigua
  lo conserva y se sigue mostrando (`tiposParaElegir`).
- **Botón «Crear» de la barra.** `MenuCrear` (`src/components/menu-crear.tsx`, en
  `NavBar`) lista lo que se crea a menudo desde cualquier página; las opciones salen de
  `ACCIONES_CREAR` (`src/lib/crear-global.ts`) y solo aparecen las de módulos que la
  persona puede abrir **y modificar**. Cada opción lleva a donde se crea; una que abre
  un formulario llega con `?nuevo=1` y la página lo abre sola (Retiros abre su ficha y
  limpia el parámetro con `router.replace`; Gastos hace lo mismo con
  `<FichaCrear abrirConNuevo>`). Para sumar una opción: agrégala a `ACCIONES_CREAR` y, si
  abre un formulario, haz que su página atienda `?nuevo=1`.
- **Botón «Agregar» y fichas de crear (todas las áreas, como Retiros).** Lo que se crea
  en una tabla se crea desde **«Agregar», el botón oscuro al final de la misma fila de
  botones de su barra de herramientas** (`accionPrincipal` de `BarraHerramientas`,
  `TablaDatos` y `ListaDatos`; `BotonAgregar`, `src/components/ui/boton-agregar.tsx`), y
  abre una **ficha lateral**, no un formulario suelto encima de la tabla ni una fila de
  campos con su botón. La ficha de un módulo es un componente de cliente de su carpeta
  (`crear-gasto-panel.tsx`, `crear-dropshipper-panel.tsx`, …) que usa `FichaCrear`
  (`src/components/ui/ficha-crear.tsx`): pone el botón, el panel, los bloques (`Seccion`),
  el «* Obligatorio» y el botón grande de crear apagado hasta llenar lo obligatorio
  (`useFaltantes`, `BotonCrear`); el módulo solo aporta su `action`, sus campos (`Campo`,
  `src/components/ui/campo-ficha.tsx`, con ejemplos ficticios en los vacíos) y lo que
  viaja oculto (`ocultos`, p. ej. `pais_id`). Los campos van como función
  (`{({ faltante, invalido }) => …}`) para señalar el dato que falta: por eso viven en un
  Client Component y no en la página. La acción devuelve `{ error }` como valor, sin
  lanzarlo; sin error la ficha se cierra y sale un aviso, con error se ve dentro de ella y
  no se cierra. Con `alAbrir` se reinicia lo que la ficha guarda en su estado (el tipo de
  SKU) y con `puedeExtra` se apaga el botón por algo que no es un campo (no hay
  dropshippers a quien registrar una interacción). Con solo lectura en el módulo no se
  dibuja «Agregar» ni el botón «Eliminar» de la fila (`puedeEscribir`). Ya la usan Gastos,
  CRM (dropshipper e interacción), Catálogo (un solo «Nuevo SKU» con el tipo Simple o
  Combo), Configuración (plataformas y **la misma ficha de cuenta destino** de Retiros),
  Patrones bancarios y Cuentas destino. (Usuarios y roles tiene su propia versión, con
  ficha de persona y de rol, y no usa `FichaCrear`.) En una página con una sola tabla no
  lleva título suelto (`EncabezadoPagina oculto`, sin descripción); con dos tablas
  (Configuración, CRM) cada una lleva su `h2` con el nombre, sin texto explicativo.
- **Color: un punto, no una caja.** Lo que está en estado de alerta se marca con **un
  punto de color** junto a su título (tarjetas de resumen, `KpiCard tono`), no con el
  borde ni el fondo de toda la caja o de toda la fila: la alerta de un pedido es un
  punto rojo antes de su referencia, el aviso «Mostrando N de M» y el de correlativo son
  cajas neutras con un punto ámbar, el bloque «Cierre» del retiro lleva su punto rojo en
  el título. Las superficies son blancas (`card`) con borde `border`; el gris (`muted`)
  es solo para las franjas de encabezado (la del grupo de tarjetas y la fila de títulos
  de la tabla); el negro (`foreground`) es solo para la acción principal (Agregar,
  Crear) y lo seleccionado. Los rellenos oscuros salen de los tokens
  (`bg-foreground text-background`), **nunca un `#202020` fijo**: en el tema oscuro se
  invierten (un negro fijo quedaba casi invisible sobre la tarjeta oscura). El color
  pleno queda para las insignias de estado (`Badge`) y los avisos de éxito o error.
- **Fichas de detalle con línea de tiempo (Catálogo, Alertas; CRM aparte).** Un registro
  con estados que cambian (un SKU, una alerta de inventario) se abre en un panel lateral
  con la misma estructura que `FichaCuenta`: cabecera con sus insignias, flechas de
  anterior/siguiente, una fila de `BotonAccion` para pasar de estado y los datos en
  bloques con ícono; **la tabla no tiene columna de acciones** (`abrirFila` de
  `TablaDatos`, como Cuentas destino). La actividad va al final con
  `HistorialGenerico` (`src/components/ui/historial-generico.tsx`, también la de
  Retiros: recibe `obtener`, la acción de lectura propia del módulo, como prop —
  vale porque los dos son de cliente, no cruza de servidor). Su cabecera lleva
  `HistorialIcon` junto al título y, a la derecha, «del más nuevo al más viejo»
  (los `obtener` siempre piden `ascending: false`).
  Cada módulo define su `obtenerHistorialX(id)` (basta poder abrir el módulo,
  devuelve el error como valor, id validado con forma de UUID) que lee
  `historial_auditoria` filtrado por `entidad`/`entidad_id` y arma cada línea con
  `formatearEventoAuditoria` (`src/lib/auditoria-cambios.ts`: `usuario_nombre` +
  `ETIQUETA_ACCION[accion]` + «Campo antes → después» si `antes`/`despues` traen algo,
  si no el `detalle` libre). Para que haya algo que mostrar, la acción que cambia el
  estado llama a `registrarAuditoria` con el valor de antes (leído con un `select`
  previo) y el de después — ver `cambiarEstadoSku` y `actualizarEstadoAlerta`. **CRM
  Dropshippers no usa este panel**: su lista es `ListaDatos` (tarjeta con su propio
  formulario, no una tabla), así que la actividad se despliega **dentro de la misma
  tarjeta** con un botón «Ver actividad» (`crm-dropshippers/lista-dropshippers.tsx`),
  reutilizando el mismo `HistorialGenerico`.
- **Centro de ayuda** (`/ayuda`, botón «Ayuda» abajo en la barra negra; no es un módulo de permisos: lo abre cualquiera con
  sesión y muestra solo lo de sus módulos). Pestañas: **Glosario** y **Guías** (contenido fijo en `src/lib/ayuda/contenido.ts`;
  `MODULOS_CON_GUIA` en `guias-indice.ts` pone el «?» de la página en `BarraMigas`, que lleva a su guía), **Universidad**
  (cursos en `src/lib/ayuda/cursos.ts` con lecciones y examen; las respuestas correctas **no salen del servidor**:
  `cursoParaAlumno` las quita y `completarCurso` corrige; se aprueba con 75 %; progreso en `cursos_progreso`, y «Progreso del
  equipo» para quien tiene Usuarios y roles) y **Manuales de proceso** (`manuales_proceso`, se escriben y editan desde el sistema
  quien puede modificar Usuarios y roles; formato simple «## / - / 1.» que se muestra como texto, nunca HTML; borradores
  iniciales en `manuales-borrador.ts`, cargados con `scripts/cargar-manuales-borrador.ts`). Migración 0088. Una guía o un curso
  nuevo: agrégalo a esos archivos (con su `modulo`) y, si es de una página, su ruta a `MODULOS_CON_GUIA`.
  **Regla: todo cambio que se vea en el sistema actualiza el Centro de ayuda en el mismo cambio** (su guía, el glosario y, si
  lo enseña, el curso). Además, una tarea programada diaria (20:00, «Actualizar el Centro de ayuda») revisa lo publicado en
  `main` y corrige solo esos tres archivos de `src/lib/ayuda/`.
- **Equipo › Puestos y organigrama** (`/puestos` y `/puestos/organigrama`, módulo `puestos`, migración 0112, 16 oct 2026; plan en
  [EQUIPO-PUESTOS.md](EQUIPO-PUESTOS.md), fase 1). Un **puesto** (`puestos`) es una plantilla: nombre (único), área (lista fija
  `AREAS_PUESTO`, `src/lib/puestos/puesto.ts`), `reporta_a` (de ahí sale el organigrama; un disparador y `cierraCiclo` impiden ciclos),
  plazas, misión, responsabilidades y autoridad (formato simple de los manuales, se muestran con `TextoManual`, nunca HTML) y `kra`
  (hasta 6). Lista con `TablaDatos` (agrupada por área, punto ámbar si hay vacante), «Agregar» con `FichaCrear` y ficha lateral
  (`ficha-puesto.tsx`) que ya es el formulario; Personas y «Procedimientos (SOP) y onboarding» guardan al momento. Un puesto no se
  borra: se desactiva sin personas. **Personas:** `puesto_personas` (varios puestos por persona, **uno principal**, índice único
  parcial; el primero que se asigna lo es y al quitarlo pasa al siguiente). El jefe no se guarda: `jefesDe` sube por `reporta_a`
  saltando puestos vacantes. Se asigna también desde la ficha de la persona en Usuarios y roles (`usuarios/puestos-persona.tsx`,
  por contexto; solo con el módulo `puestos`). **SOP y cursos:** `puesto_manuales` (→ `manuales_proceso`) y `puesto_cursos` (id de
  `CURSOS`, validado en el servidor), cada uno con `etapa` 30/60/90 o null = de consulta. **Avance del onboarding**
  (`src/lib/puestos/onboarding.ts`, con prueba): curso aprobado (`cursos_progreso.completado_en`) o manual leído
  (`manuales_lecturas`; si el manual se actualizó después, «Volver a leer»). El manual trae «Marcar como leído» (`BotonLeido`,
  `marcarManualLeido` en `mi-puesto/actions.ts`) y se puede abrir si está enlazado a un puesto de la persona aunque no sea de sus
  módulos (`manualesDeMisPuestos`). **«Mi puesto»** (`/mi-puesto`, en `MenuCuenta`) no es un módulo: lo abre cualquiera con sesión y
  solo muestra lo suyo (jefe, equipo, cada puesto con su onboarding). Lectura de todo en `cargarPuestos` (`src/lib/puestos/datos.ts`);
  sin la migración las páginas avisan. La migración da `puestos` a los roles que tienen `usuarios`. Fuera de la fase 1: KPI,
  scorecard, OKR, evaluaciones, PDI e incentivos.
- **Perfiles de acceso por área** (migración 0115, 20 oct 2026; cuadro en `Perfiles-de-acceso-Ecomfive.pdf`, junto a la carpeta del proyecto). Roles
  listos con los módulos de cada área y qué es solo lectura: **nuevos** Investigación de producto, Contenido y ofertas, Compras, Producto / Catálogo,
  Talento humano y Consulta; **completados** Administrativo (Finanzas), Atención al cliente, Líder comercial y Operaciones (Bodega); Admin
  (Dirección) no cambia. La migración solo **agrega** permisos (nunca quita ni cambia un «solo lectura» ya puesto), no mueve a nadie de rol y no le
  da Nómina y gastos a Administrativo. Reglas que la guían: Usuarios y roles y Configuración solo Dirección; Nómina y gastos, Extractos, Retiros,
  Conciliación y Productos y márgenes solo Finanzas y Dirección; Producto va en lectura para casi todos (Compras, Inventario y la competencia de un
  producto dependen de verlo); Selección y Scraping van juntos en Investigación (enviar a Selección exige modificarla). Reversa:
  `supabase/rollbacks/0115_rollback.sql`. Un módulo nuevo debe sumarse a estos roles (a mano en Usuarios y roles o con otra migración).
- **Usuarios y roles: matriz, permisos propios y «Afinar»** (migración 0118, 20 oct 2026; rediseño aprobado con maqueta). Tres pantallas
  bajo el módulo `usuarios`, con pestañas **Personas** (`/usuarios`), **Roles** (`/usuarios/roles?rol=<id>`) e **Historial de auditoría**.
  *Roles*: lista de roles al lado de un editor (`roles/editor-rol.tsx`) con la barra de cobertura y la **matriz** (`AREAS_ACCESO`,
  `src/lib/permisos/catalogo.ts`): un `SelectorNivel` de tres niveles por módulo (Sin acceso · Solo lectura · Edición, guardado en
  `permisos_rol.solo_lectura`; sin acceso = sin fila), botones por área y por módulo con su marca «Sensible» (`MODULOS_SENSIBLES`). Las
  acciones (`permisos-actions.ts`) devuelven `{ error }`, exigen poder modificar Usuarios y roles y **no dejan que alguien se quite a sí
  misma la edición de Usuarios y roles**. El rol tiene `color` (`color-rol.ts`) y se puede duplicar, copiar de otro o crear desde otro.
  *Persona* (`/usuarios/personas/[id]`, ya no es un panel): rol base, **permisos propios** (`permisos_persona`: sin acceso, lectura o
  edición por módulo, mandan sobre el rol; igual al del rol no se guarda), países, puestos, alta y datos, y «Acceso efectivo»
  (`src/lib/permisos/acceso.ts`: `nivelesEfectivos`, `diferencias`). «Ver así» ahora también va por persona (cookie `<dueno>:p-<persona>`).
  **Afinar** (`/usuarios/roles/[id]/afinar/[modulo]` y `/usuarios/personas/[id]/afinar/[modulo]`, `afinar/afinar-modulo.tsx`): dentro de un
  módulo que tiene catálogo (`CATALOGO_COMPRAS`; **solo Compras por ahora**; los demás módulos se dan o se quitan completos) se decide qué
  *pestañas* ve, qué *acciones* usa, qué *campos* ve/solo ve/oculta y qué *alcance* tiene (todas, solo las asignadas, solo las que creó). Se
  guarda **solo lo que se aparta del acceso completo** (`permisos_afinados` por rol y `permisos_persona_afinados` por persona; la de la
  persona manda y puede soltar lo que el rol restringe) y `resolverAfinado` lo junta; `getUsuarioActual` lo trae en `usuario.afinado[modulo]`.
  **Cómo se aplica en Compras** (el servidor manda, la pantalla solo esconde): las pestañas se protegen con `requirePestana` y se quitan de
  la franja y de la paleta (`pestanasOcultasDe`); `cargarCompras` **no manda** los campos ocultos (`enmascarar`) y filtra por alcance
  (`dentroDelAlcance`); cada acción comprueba `accionBloqueadaEnCompras` (crear, lote, anular, comentar, cotización) y las celdas, el lote
  y `actualizarCompra` ignoran lo que no se puede cambiar (guardar la ficha **no pisa** un dato oculto); la Actividad no muestra cambios
  de un dato oculto ni los montos de las líneas; el histórico de compras de Producto también respeta el monto y el alcance. Etapa y estado
  no se pueden ocultar (el tablero se agrupa por ellos). La pantalla de afinar avisa si se ocultan campos de dinero con Informe,
  Dashboard, Planificación o Tiempos visibles (sus cifras saldrían en cero). **Un módulo nuevo que se quiera afinar**: agrega su
  `CatalogoModulo` a `src/lib/permisos/catalogo.ts` y aplica sus claves en el servidor como Compras (`permisos-compras.ts` es el modelo).
  `acceso-seccion.ts`, «Líderes comerciales» del CRM y el progreso de la Universidad ya cuentan lo propio de cada persona.
- **Acceso en silencio** (21 oct 2026). Una sección a la que la persona no tiene acceso **no se le muestra ni se le rechaza con un aviso**.
  `requireModulo`, `requirePestana` y las páginas de Usuarios llaman a `irAlInicio(usuario, moduloRechazado?)` (`src/lib/auth.ts`), que
  la lleva a `paginaInicialDe` (`src/lib/nav-data.ts`: la primera página del menú que su rol le deja abrir, sin volver al módulo que la
  rechazó, con prueba). `/sin-acceso` quedó solo para una cuenta **sin ningún módulo** («Tu cuenta aún no tiene áreas asignadas»); con
  módulos redirige a su inicio. El menú (`sidebar.tsx`) muestra solo las áreas y los frentes con páginas suyas y, con acceso limitado
  (`tieneAccesoLimitado`), no dibuja Baby Yoda ni «Próximamente». Un enlace a **otro módulo** desde una ficha se dibuja solo si la persona
  lo puede abrir: en un Client Component con `usePuedeAbrir("modulo")` (`src/components/modulos-contexto.tsx`, lo provee el layout de
  `(app)`), en un Server Component con `usuario.modulos.includes(...)`. Un enlace nuevo a otro módulo debe hacer lo mismo. Las acciones
  del servidor siguen devolviendo `{ error }` o lanzando: eso es defensa, no pantalla.
- **Países permitidos por persona** (migración 0087, `perfiles.paises_permitidos`; se elige en la ficha de la persona, Usuarios
  y roles › «Países»). `null` = todos; una lista = solo esos códigos, y «importacion» para Compras Importadora. Viaja en
  `UsuarioActual.paisesPermitidos` y la regla vive en `src/lib/paises-permitidos.ts` (`puedeVerPais`, `filtrarPaises`). Lo
  aplica **el servidor**: `cargarCompras` solo pide las compras de esos países (y el selector solo los ofrece), **cada acción de
  Compras que recibe una compra o una línea lo vuelve a comprobar** (`sinAccesoACompras`, `sinAccesoALinea`; crear o mover una
  compra a un país no permitido también se rechaza), el histórico de compras de Producto/Inventario y la columna «Unidades
  compradas» cuentan solo esos países, y la barra de arriba (`getPaisActual`, `setPaisActual`, `SelectorContexto`) solo deja
  elegir uno de ellos. Una acción nueva de Compras que reciba un id de compra debe llamar a `sinAccesoACompras`. Sin la
  migración todos ven todo, como antes.
- **País de cada persona.** `getPaisActual` (`src/lib/pais.ts`) resuelve el país con
  este orden: la cookie `pais_actual` de este navegador; si no hay, el último país que
  la persona eligió (`perfiles.pais_preferido`, migración 0038, que `setPaisActual`
  guarda al cambiar de país); y si tampoco, Costa Rica. La consulta a `perfiles` solo
  se hace **sin cookie** (otro equipo, cookies borradas), para no sumar un viaje a
  cada página; con cookie manda la cookie aunque en otro equipo se haya elegido otro
  país. Sin la migración todo sigue como antes (cookie o Costa Rica).
- **Sistema WMS: «Ficha producto Shopify»** (`/wms-productos`, módulo `wms-productos`,
  migración 0049). Réplica de la ficha de producto del admin de Shopify. La lista es un
  `TablaDatos` (toda la fila abre la ficha; «Agregar» lleva a `/wms-productos/nuevo`) y la
  ficha es una **página de dos columnas** (`ficha-producto-shopify.tsx`, no un panel):
  título, descripción (editor enriquecido propio, `editor-descripcion.tsx`, HTML que el
  servidor vuelve a limpiar con `sanitizarHtml`), multimedia, categoría, precio, inventario,
  envío, variantes, metacampos y vista previa SEO a la izquierda; estado, publicación,
  organización y plantilla a la derecha. «Guardar» y «Descartar» aparecen solo con cambios;
  sin permiso de escritura la ficha queda deshabilitada (`fieldset disabled`). Un producto
  siempre tiene al menos una variante (sin opciones es la única) y ahí viven precio, SKU,
  peso e inventario por sucursal (`en_existencia` = suma de las tres cantidades). Las
  imágenes suben **directo a Storage** con una dirección firmada (`prepararSubidaMedio`)
  para no chocar con el límite de tamaño de las acciones; al guardar solo viaja su ruta.
  La lógica pura y la validación viven en `src/lib/wms/producto.ts`. No incluye las ventas
  de los últimos 90 días ni el precio unitario de Shopify (no hay de dónde sacarlos).
- **Sistema WMS: «Ficha producto Dropi»** (`/wms-productos-dropi`, módulo `wms-productos-dropi`,
  migración 0051). Réplica de los productos de Dropi. **La lista no lleva los íconos de
  acción de la fila de Dropi**: toda la fila abre una **ficha lateral** (`Ventana`, como
  Retiros; «Agregar» abre la misma ficha vacía) que carga el producto al abrirse
  (`obtenerProductoDropi`; la lista solo trae lo justo para sus filas). La ficha junta como
  bloques lo que Dropi reparte en pestañas (General, Stock o Variables y stock, Imagen del
  producto, Videos, Recursos adicionales, Productos privados, Garantías) y pone como botones
  las opciones de la fila: Historial de existencia (los ajustes de stock quedan en la
  auditoría como `ajustar_stock_dropi`), Duplicar, Archivar/Restaurar y Eliminar. «Crear
  orden» y «Generar formato de órdenes masivas» de Dropi no están (no hay creación de
  pedidos ni ese formato aquí). «Archivados» es el botón de filas cerradas de la tabla
  (`exclusivo`). Las bodegas salen de `wms_bodegas` por país y se agregan desde la sección
  Stock. Reglas de Dropi que se validan al guardar (`faltantesDropi`,
  `src/lib/wms/producto-dropi.ts`): peso y medidas, precio y precio sugerido, categoría,
  descripción de 200 caracteres como mínimo y, si el producto es público, una bodega con
  100 unidades y 3 imágenes. Peso en gramos, medidas en centímetros. No incluye Carga masiva,
  Actualización masiva ni las descargas en Excel de Dropi.
- **Módulo «Producto»** (`/producto`, módulo `producto`, migración 0070; sustituye al Catálogo maestro, cuya ruta redirige aquí). Un
  producto vive en `skus_maestros` (el nombre de la tabla se conserva) y se crea desde «Agregar»: **simple o compuesto** (un compuesto
  es una combinación de productos simples con su cantidad: al venderlo se descuenta cada componente) y **Activo o Test** (se ve como «Estado» y se elige en la ficha; en la base es la columna `clase`, y Activo se guarda como `'fisico'`:
  un test se está probando, todavía no se compra, **aparece en Inventario pero no tiene stock** —`wms_aplicar_cambios` rechaza cualquier
  movimiento— y se pasa a Activo desde el selector «Estado» de su ficha; volver a Test solo si nunca tuvo movimientos). **Inactivo y Descontinuado** (migraciones 0101 y 0103; Descontinuado = ya no se trae más, gris): venden lo que les queda y no se compran (`productoComprable`, `useConfirmarProductoActivo`) hasta pasarlos a Activo. **Aviso de posible duplicado** (13 oct 2026): la ficha «Nuevo producto» muestra `AvisoDuplicados` (`producto/aviso-duplicados.tsx`) al escribir el nombre o subir la foto; `buscarPosiblesDuplicados` compara palabras clave del nombre y la huella de la foto (dHash con sharp, `src/lib/wms/huella-foto.ts`; lógica pura y umbrales en `src/lib/wms/duplicados.ts`, con prueba) contra los productos sin variantes. La huella se guarda en `skus_maestros.foto_huella` al crear o cambiar la foto; `scripts/calcular-huellas-fotos.ts --aplicar` calcula las que faltan. Solo avisa, no impide crear. **Un producto aprobado pasa solo a Compras** (12 oct 2026): al pasar de Test a Activo desde su ficha (`cambiarClaseProducto` → `aplicarEstado`, no desde Compras ni en compuestos), `crearCompraDesdeProducto` (`src/lib/compras/compra-desde-producto.ts`) crea su orden en «01 - Cotizar» en el país de la barra de arriba (`getPaisActual`), con su nombre, su foto copiada y un comentario; sin línea de producto (la cantidad se pone al cotizar). El producto nuevo arranca en Test y su foto se sube al crearlo (`productos/nuevos/…` → su carpeta en `crearProducto`). **Compras: un producto en Test no se compra.** Al agregar un producto a una compra se usa `useConfirmarProductoActivo` (`compras/confirmar-producto-activo.tsx`): si está en Test advierte que debe pasar a Activo; Cancelar vuelve atrás y Aceptar lo pasa a Activo en su ficha (`activarProductoParaCompra`, basta poder modificar Compras; queda en su actividad «desde Compras»). Compras enlaza productos con el bloque «Productos» (`wms_compra_items`); el campo de texto «Producto relacionado» se quitó (migración 0090). Ya no hay flujo
  propuesto → en revisión → aprobado (todo queda `aprobado`). **SKU copiable** (21 oct 2026): `SkuCopiable` (`src/components/ui/sku-copiable.tsx`) copia el SKU al portapapeles con un clic y avisa (en la lista de Producto, en el encabezado y el dato SKU de su ficha y en el producto vinculado de la ficha de Publicaciones Dropi); es un botón, así que **no va dentro de otro botón o enlace** (por eso la fila de Publicaciones, que es un botón, lleva el SKU como texto). La ficha de Producto trae **«Nombre en Dropi»** (`FilaProducto.nombresDropi`: el nombre de sus publicaciones vinculadas, por país). **Unir productos duplicados** (21 oct 2026, migración 0121): `wms_unir_productos(conservar, eliminar, aplicar)` deja el producto que se conserva (el más viejo) y le pasa **todo lo vinculado al otro** (compras, publicaciones de Dropi, tests, Filtro de productos, fichas de Shopify y de Dropi, componentes de compuestos; sale de las llaves foráneas reales, `pg_constraint`, así que no se queda nada) antes de borrarlo; con `aplicar = false` solo simula y devuelve el informe. **Se niega** si el sobrante tiene movimientos, stock, lotes o variantes, si es de otro tipo o si dos filas chocarían al juntarlas. Se corre a mano en el editor SQL, **de a un par y confirmado con la persona**; nunca en masa. Probada contra Postgres real (PGlite). **Eliminar un producto** (21 oct 2026, migración 0125): la ficha trae «Eliminar» **solo para un administrador** (`esAdministrador`, que además pueda modificar Producto; `eliminarProducto`, `producto/actions.ts`). `wms_eliminar_producto(p_id)` lo borra únicamente si **nada apunta a él** (busca por las llaves foráneas reales, `pg_constraint`: compras, publicaciones de Dropi, tests, Filtro, fichas de Shopify y Dropi, variantes, componentes de otro compuesto, movimientos, lotes y stock distinto de cero); si algo lo bloquea no borra nada y devuelve qué tabla y cuántas filas, que `mensajeBloqueos` (`src/lib/wms/eliminar-producto.ts`, con prueba) dice en palabras. Se va con él su stock en cero y, si es compuesto, su lista de componentes; su foto se borra de Storage si ningún otro producto la usa. Un producto con historia no se borra: Inactivo o Descontinuado. Reversa: `supabase/rollbacks/0125_rollback.sql`. Probada con PGlite. **El SKU lleva lo que distingue al producto** (21 oct 2026, migración 0119): `sugerirSku` (`src/lib/wms/sugerir-sku.ts`, con prueba) agrega después de las 3 palabras la cantidad de cápsulas/tabletas/gomitas, el color y la talla que diga el nombre (`distintivosDeNombre`: «BOLSO/NAYLA/GRAN/PURPURA», «ACEITE/OREGANO/CAPSULAS/300/VERDE»; no repite lo que ya está en las 3 palabras ni toma medidas en ml/g); el /2, /3 queda solo para lo que no se puede distinguir. La migración 0119 pasó 16 productos que se distinguían por número (tónicos Truly, bolsos Nayla y Multichic, base Zephoco, banda de pedales, aceite de orégano 300 verde / 180 blanco); los demás con /2 son el mismo producto con otro nombre de proveedor y se dejaron. **Ya no hay SKU solo numéricos** (20 oct 2026, migración 0114: los 193 primeros productos pasaron de «1000 + N.º» a la sugerencia por palabras, con /2, /3 si se repite; el N.º correlativo es lo que los identifica). **El SKU (`codigo`) es la llave del descuento automático**: es
  obligatorio y único sin importar mayúsculas ni espacios, y una venta de cualquier plataforma (Dropi, las tiendas de Shopify) encuentra
  su producto por ese código, que debe ser el mismo en las dos. `wms_aplicar_venta(codigo, cantidad, bodega, fase)` ya lo implementa
  (fases `reserva` al crear el pedido, `liberacion` si se cancela y `despacho` al salir; un compuesto se reparte entre sus componentes
  y todo ocurre en una transacción), pero **todavía no está conectada a ninguna plataforma**. Cada **variante** de la ficha Shopify
  y cada **producto** de la ficha Dropi se enlazan a su producto con una llave foránea (`sku_maestro_id`, migración 0068): el campo de SKU
  de esas fichas es un selector (`CampoSkuMaestro`, `src/components/ui/selector-sku-maestro.tsx`, con una sola lista compartida por
  `ProveedorSkusMaestros`) y el servidor copia el código del producto en `sku` al guardar (`escribirHijos`, `resolverSkuMaestro`). La
  ficha de un producto muestra sus **Asociaciones** (variantes Shopify, productos Dropi y productos de los pedidos de Dropi), un acceso a
  Inventario y «Crear ficha Shopify» (`/wms-productos/nuevo?sku_maestro=<id>`). **`/producto?abrir=<id>`** abre al cargar la ficha de ese producto (`abrirInicial` de `TablaProducto`, como `?abrir=` de Gestión de IDs Dropi: la ficha es un portal, así que solo se monta en el navegador, y el parámetro se quita de la dirección); lo usa «Abrir en Producto» de la ficha de una publicación **solo con Ctrl, Cmd o clic central (otra pestaña)**: con un clic normal la ficha del producto se abre **encima de la de la publicación, sin salir del módulo** (22 oct 2026: `FichaProductoEmbebida`, `producto/ficha-producto-embebida.tsx`, pide la fila con `obtenerProductoParaFicha` —`producto/ficha-actions.ts`, hay que poder abrir Producto— que reutiliza `cargarProductos`, `producto/datos-producto.ts`, la misma carga de la página de Producto; se dibuja **fuera del `<form>` de la ficha** porque los eventos de un portal suben por el árbol de React; el botón solo se ve con acceso a Producto). Varias `Ventana` abiertas una sobre otra se atienden de arriba hacia abajo (`PILA` en `ventana.tsx`: Escape y Tab solo los toma la de arriba). Las variaciones de un producto Dropi variable
  conservan su SKU como texto. **Código de barras** (migración 0072, `src/lib/wms/codigo-barras.ts`): cada producto puede tener el EAN-8, UPC-A, EAN-13 o GTIN-14 del fabricante
  (se valida el dígito de control GS1; `codigo_barras_origen = 'fabricante'`) o, si no trae ninguno, **uno interno**: al crear el producto viene elegido «Interno» y se genera solo (8 oct 2026; «Del fabricante» pide escribirlo y un compuesto arranca en «Sin código de barras»), y también se genera después desde su ficha
  («Generar código interno», `wms_asignar_codigo_barras_interno`): un **EAN-13 con prefijo 20** (el estándar GS1 reserva del 20 al 29 para
  uso interno, así que no choca con ningún código de fabricante) formado por un consecutivo de 10 cifras y su dígito de control. Es único entre
  productos, opcional (un compuesto normalmente no tiene), se puede cambiar o quitar, se dibuja en la ficha y su etiqueta se imprime. **Envío** (migración 0074, `envio-producto.tsx`, como el bloque de Shopify): interruptor «Producto físico» (`es_fisico`, por defecto sí) y, encendido, embalaje, tamaño empacado (largo × ancho × alto en cm o in), peso (kg, g, lb, oz), país de origen y código SA (4 a 10 cifras); apagado, los campos quedan deshabilitados y sus datos se conservan. «Físico» aquí es *que se envía*; no es la clase físico/test. Las llaves nuevas de los productos y de las tablas `wms_*` son **UUID v7** (`uuid_v7()`, migración 0071). El módulo **Productos Test** (Marketing) sigue aparte: aún no está ligado a la clase test de un producto.
- **Sistema WMS: «Bodegas»** (`/wms-bodegas`, módulo `wms-bodegas`, migración 0053; fase 1
  del plan de `WMS-REFERENCIA.md`, que es el documento maestro del WMS: arquitectura V2,
  decisiones confirmadas, flujos de GreaterWMS y fases). Las 6 fuentes físicas (Despacho,
  Fulfillment, Dropi, Effi, Boxfull, Dunamixfy) vienen cargadas para Costa Rica y Panamá en
  `wms_bodegas`, con un `codigo` fijo y un `tipo`: **propia** (la mueve el WMS) o **externa**
  (el stock lo tiene el tercero y llega por sincronización, solo lectura aquí). Lista con
  `TablaDatos`, «Agregar» con `FichaCrear` y ficha lateral que ya es el formulario (Guardar
  cambios y Cancelar solo con cambios, Desactivar/Activar; **una bodega no se borra**: el stock
  y los movimientos dependerán de ella). La ficha Dropi ofrece solo la bodega «Dropi» (y las
  agregadas desde su ficha). Las ubicaciones (bins) de cada bodega son la fase 3.
- **Sistema WMS: «Ubicaciones»** (`/wms-ubicaciones`, módulo `wms-ubicaciones`, migración
  0054; fase 2 del plan de `WMS-REFERENCIA.md`, calcada de `binset`/`binsize`/`binproperty` de
  GreaterWMS). Una ubicación (bin) pertenece a una bodega (`wms_ubicaciones.bodega_id`, todas
  las bodegas, también las externas) y tiene código (único dentro de su bodega), **propiedad**
  (normal, dañado, en inspección, retenido: decidirá a qué cubeta de stock suma lo que se guarde
  ahí), tamaño opcional y código de barras. Lista de las ubicaciones de las bodegas del país con
  `TablaDatos` y «Agregar» con `FichaCrear`; ficha lateral que ya es el formulario (la bodega se
  ve pero no se cambia; Desactivar/Activar; **no se borra**). El stock por ubicación llega con
  el inventario multi-estado.
- **Productos Test: Informe + Productos** (`/productos-test` y `/productos-test/productos`, pestañas en
  `PESTANAS_POR_MODULO`). **Informe** (`informe-test.tsx`, lógica pura en `informe.ts`): agrupa los tests por
  día, semana o mes según `fecha_test`, con indicadores, gráfica (pulsar una barra elige el periodo), winners vs
  fallidos, categorías, winners y «Para revisar», y el botón «Copiar informe» (`textoInforme`). **Productos**
  (`lista-productos-test.tsx`): búsqueda, filtros, orden por columna y ficha fija a la derecha
  (`ficha-lateral-test.tsx`); «Editar producto» y «Agregar» siguen usando la ficha y el formulario de siempre (en «Agregar» se elige el producto de Producto, `sku_maestro_id`, migración 0099). **Se llama «Test productos»** en el menú y los títulos (12 oct 2026; la ruta y el módulo siguen siendo `productos-test`). **«+ Agregar» abre el formulario del test** (`agregar-producto-test.tsx`, 13 oct 2026; antes eran dos pestañas): junto al campo «Producto (de Producto)» está «Nuevo producto» (solo a quien puede modificar Producto y Test productos), que cambia el panel a la ficha de Producto (`CrearProductoPanel incrustada` con `action` = `crearProductoParaTest`, que crea con `crearProducto` y devuelve la opción); al crearlo vuelve al formulario con ese producto elegido (se suma a `ProveedorSkusMaestros` con `useOpcionesSkuMaestro`) y el nombre lleno, y el test se guarda como siempre. Las dos vistas quedan montadas mientras el panel está abierto. **Test productos abre en «Productos»** (13 oct 2026, como Compras): `/productos-test` redirige a `/productos-test/productos` (conserva `?buscar=`) y el Informe vive en `/productos-test/informe`; pestañas Productos, Informe, Dashboard. **De Test productos a Filtro de productos** (migración 0100): un test vinculado cuyo producto está Activo pasa solo a `wms_filtro_productos` en «cotizar» con foto y métricas (`pasarTestsAFiltro`, `src/lib/productos-test/pasar-a-filtro.ts`; lo llaman crear/editar un test y `aplicarEstado` al pasar a Activo). No duplica: busca por `producto_test_id` y, si no, por nombre en el país (y le anota el test). Sin la migración funciona solo por nombre. La lista de **Producto** tiene la columna **«Test»** (`test-producto.tsx`): dice «Test» en los que vienen de Test productos y, al pasar el cursor, el resultado y las métricas de cada test (`FilaProducto.tests`, leídos de `wms_productos_test` por `sku_maestro_id`, solo con el módulo `productos-test` y en los países que la persona ve); filtro y agrupación «Tuvo test / Sin test». Un producto simple muestra también los tests de los compuestos de los que forma parte (`TestProducto.via` = nombre del compuesto, «Test de su compuesto»; 13 oct 2026: el test de un 2x1 está vinculado al compuesto y el simple salía sin datos). Los tests, los winners y los componentes se leen paginados (`traerTodasConError`), sin el tope de 1 000. Columna **«Oferta»** (`metrica_oferta` del test más reciente; también en la tarjeta, el bloque de la ficha y como columna ordenable de Test productos). Su ficha trae el bloque **«Resultado del test»** (`ResultadoTestProducto`, con la `Medida` de `ficha-lateral-test.tsx`; la referencia es el promedio de los winners de los países que la persona ve, `referenciasTest` desde la página).
  Los datos salen de `wms_productos_test` (`datos-test.ts`, todas, paginadas de 1 000 en 1 000) y las sumas se hacen en el navegador
  con esas filas: si la tabla crece mucho, pasarlas a Postgres. El criterio de winner es **solo el CPA menor a $4**
  (`CPA_OBJETIVO` en `informe.ts`, confirmado por el equipo; no hay mínimo de compras) y **no está guardado en la base**.
  «Ganador» agrupa `winner` y
  `enviado_a_compras`. Las piezas visuales comunes (insignias redondas, indicadores, botones de barra, marco de
  tabla) viven en `src/components/panel/piezas-panel.tsx` y las usa también el CRM.
- **Testing Lab › Scraping de proveedores** (`/scraping-proveedores`, módulo `scraping-proveedores`, migración 0105, 14 oct 2026).
  Sigue proveedores de Dropi: `scraping_proveedores`, `scraping_proveedor_registros` (órdenes/productos/dropshippers, `origen`
  manual o dropi), `scraping_busquedas` (con `duracion_ms`), `scraping_productos` (último precio y stock, `estado` activo o
  desaparecido con `motivo_desaparicion`, privado con `vinculado_a`/`vinculo_parecido`/`vinculo_seguro`) y
  `scraping_producto_historial` (un evento por cambio). La comparación es pura en `src/lib/scraping/comparar.ts` (con prueba):
  agotado si desaparece con 10 o menos, privatizado si aparece un privado con su nombre; un privado («Privado …», foto = logo)
  se vincula solo con 85 % y 2 palabras en común, si no queda como sugerencia. **Dropi a un dropshipper solo le entrega los
  productos publicados con stock** (HYPER MODA: 779 de los «1436» del encabezado, que salen de
  `api-v2.dropi.<país>/indicators/supplier/<id>/metrics`). **Cómo se corre:** `npx tsx scripts/scraping-proveedores.ts recibir`
  (127.0.0.1:4322, código por arranque) y, en la pestaña del proveedor en Dropi con la sesión iniciada, la función de
  `scripts/scraping-proveedores-navegador.js`: lee `api/products/v4/index` ordenado por `created_at desc` (sin orden, Dropi
  devuelve páginas aleatorias que se repiten), de 100 en 100 con 1,3 s de pausa (Dropi permite 50 consultas por minuto), y
  navega al «puente» del receptor con la lectura comprimida en el fragmento `#` (el navegador no deja que una página de internet
  llame a 127.0.0.1 ni abra otra pestaña sin un clic). La sesión de Dropi nunca sale de la página. «Buscar ahora» solo deja una
  búsqueda `pendiente` (`scripts/scraping-proveedores.ts pendientes` las lista). Una búsqueda de ~800 productos: ~30 s leyendo + ~16 s guardando.
- **Testing Lab: Selección, ofertas y cruces** (migración 0107, 14 oct 2026; necesita la 0104 de Alcides y la 0105).
  Selección de productos (`wms_seleccion_productos`) tiene los estados **Seleccionado → Crear oferta → Descartado** («Por
  evaluar» se quitó); lo que entra ya viene Seleccionado. **Ya visto:** al entrar (a mano o desde Scraping) se cruza con todos
  los tests de Test productos (todos los países) y los productos de Producto (`yaVisto`, `src/lib/scraping/cruces.ts`, con
  prueba: 85 % del nombre y 2 palabras en común, o la misma huella de foto); si ya se vio entra Descartado con
  `motivo_descarte` («Ya testeado: …»). **Prioridad:** lo que aparece en más de un proveedor de Scraping o en otra fuente
  (`repetidos`, 85 % y 2 palabras o la misma foto; `cargarRepetidos` en `src/lib/scraping/referencias.ts`); se calcula al
  cargar, no se guarda. **Creación de ofertas** (`/creacion-ofertas`, módulo `creacion-ofertas`): los productos en «Crear
  oferta» del país de la barra, con 1 a 3 ofertas (`wms_seleccion_ofertas`: nombre, unidades, precio en dólares, notas) y el
  margen = precio − costo × unidades. **Dólares:** `tasasUsd` (`src/lib/moneda/tipo-cambio.ts`) lee una vez al día
  open.er-api.com y guarda `tipos_cambio` (unidades por 1 US$); `MONEDA_POR_PAIS` da la moneda de cada país de Dropi. Scraping
  muestra cada precio en su moneda y en dólares, marca Prioridad / Ya testeado / En Producto / En Selección, lista los privados
  vinculados en la ficha del publicado, tiene el historial en tabla y envía a Selección (`enviarASeleccion`, fuente SP, en el
  país del proveedor, precios en dólares, `scraping_producto_id` único). El receptor calcula `scraping_productos.foto_huella` de
  las fotos nuevas (`npx tsx scripts/scraping-proveedores.ts huellas` para las que falten).
- **Operación › Fulfillment › Gestión de IDs Dropi** (antes «Gestión de publicaciones Dropi») (`/publicaciones-dropi`, módulo `publicaciones-dropi`, migración 0116, 21 oct
  2026; debajo de Compras). Los productos que ECOMFIVE tiene publicados en Dropi como proveedor; reemplaza la lista «GCC 🇵🇦 Ecomfive
  Panamá» de ClickUp. Una fila de `dropi_publicaciones` por publicación (por país): `dropi_id` (texto: a veces son dos, «7231-7679»),
  `estado` (el flujo de ClickUp: producto_nuevo → revisar_precio → verificar_dropshipper → validar_bajar_precio → bajar_precio → al_dia
  → archivado, oculto), `estado_publicacion`, `tipo_publicacion`, privatización (`privatizado_a`, `privatizado_email`, `dropshipper_id`
  para cuando se vincule el CRM), precios (`precio_venta`, `costo_mercancia`, `fulfillment`, `coste_real` = costo de la última compra) con
  `utilidad` y `margen` **generadas**, `estado_venta`, `ubicacion`, `estado_reposicion`, `competencia`, fechas y `proxima_revision`
  **generada** (`ultima_revision + 28`: en ClickUp la fecha límite era eso), `relacionados` (uuid[]), `sku_maestro_id` (para vincular los
  SKU después) y la tarea original en `clickup`. Opciones, colores (los de ClickUp) y la lectura de una tarea viven en
  `src/lib/publicaciones/publicacion.ts` (con prueba: `leerTareaGcc`, `deClickup`). **Correlativo propio** (migración 0123): `dropi_publicaciones.numero` (secuencia, único, no cambia; las existentes se numeraron por fecha de creación), que se ve como «PUB-0012» (`numeroPublicacion`) en la fila, el encabezado de la ficha, la búsqueda y el CSV; distinto al `dropi_id` de Dropi. Va en una consulta aparte: sin la migración la lista carga igual, sin números. **Lista de filas, no tabla** (21 oct 2026): `ListaDatos` con `variante="filas"` (las filas juntas en una tarjeta, separadas por una línea; `renderFila` recibe también las filas en el orden en que se ven para las flechas de la ficha) y `FilaPublicacionLista` (`fila-publicacion.tsx`: foto, nombre con ID y SKU, precio, utilidad y margen, estado y venta, dónde está y reposición, próxima revisión; las alertas son un punto, no una caja), agrupada por estado, con filtro
  «Revisión vencida», punto rojo si el margen < 30 % y, arriba, el **tablero de acciones** (`tablero-acciones.tsx`, `KpiFiltro` sobre `DEF_PUBLICACIONES`: los estados del flujo, revisión vencida, margen bajo —campo `margenBajo`—, sin vincular y sin stock; cuenta las abiertas y filtra la lista). La ficha trae **«En camino»** (`EnCaminoProducto`, `src/app/(app)/producto/en-camino-producto.tsx`): solo **unidades** de las órdenes que ya salieron y no han llegado (regla de «En tránsito» de Compras; `enCaminoPorPais`, `src/lib/compras/en-camino.ts`, con prueba), **solo del país seleccionado en la barra** (`obtenerEnCaminoProducto(id, codigoPais)`; no va en Compras ni en la ficha de Producto). La ficha de Producto agrupa su bloque «Compras» **por país** (`compras-producto.tsx`). `obtenerEnCaminoProducto` respeta países y alcance de la persona y no trae costos). La ficha trae **«Competencia del producto»** (`BloqueCompetencia`, el mismo de Producto y Compras, con `obtenerCompetenciaProducto` del producto vinculado; no sale en un compuesto ni sin vínculo; la acción acepta también el módulo `publicaciones-dropi`). **Eliminar** (`eliminarPublicacion`): botón de la ficha y papelera al final de cada fila (`BotonEliminarFila`, fuera del botón que abre la ficha), **solo para un administrador** (`esAdministrador`, `src/lib/permisos/acceso.ts`: puede modificar Usuarios y roles); borra la fila, la quita de las «relacionadas» de las demás, borra su foto si ninguna otra fila la usa y queda en la auditoría; el resto archiva. **Mercancía en camino de lo que no tiene stock** (22 oct 2026): `FilaPublicacion.enCamino` = unidades del producto vinculado (y sus variantes) en órdenes de Compras del país ya pedidas que no han llegado: **ya salieron (fecha de envío) o están en 03 En Producción, 04 Tracking o 05 Arribo** aunque aún no tengan fecha de envío —una orden en Cotizar, Cotizado o Backlog es solo una cotización y no cuenta; `lineaEnCamino` + `ETAPAS_EN_MARCHA`, `src/lib/compras/en-camino.ts`; 22 oct 2026: el extracto de ajo con 500 u. en producción no salía— (`cargarEnCamino`, `src/lib/publicaciones/en-camino-datos.ts`, con el alcance de Compras de la persona; `cargarPublicaciones` recibe ahora el `usuario`). La tarjeta «Sin stock» suma una línea azul «N con mercancía en camino» (entre las que se venden sin stock); la fila agrega « · N en camino» al «Sin stock» de la celda de ventas y la ficha una línea en «Ventas en Dropi»; el campo `enCamino` también filtra y sale en el CSV. **Fecha de llegada** (22 oct 2026): `llegadaDeCompra` (`src/lib/compras/en-camino.ts`, con prueba) = la **fecha límite** de la compra o, si no la tiene, la estimada con `estimarPlanificacion` (fecha de envío + lo que tarda su vía en ese país; necesita **la fecha de envío y la vía**, sin vía no se adivina); si ninguna, la compra «no tiene fecha de llegada». `cargarEnCamino` devuelve por producto `{ unidades, llegada (la más próxima), sinFecha (unidades de órdenes sin fecha) }` → `FilaPublicacion.llegadaCamino` y `sinFechaCamino`. La fila pone «N en camino · 12 nov» (`LlegadaCamino`) o una insignia ámbar: **«Sin fecha de envío»** si la orden aún no tiene fecha de envío (en producción: las unidades se cuentan igual, `sinEnvio`/`faltaParaLlegada`) o «Sin fecha» si ya se envió y falta la vía o la fecha límite (un punto ámbar si solo una parte no la tiene); la ficha lo dice en «Ventas en Dropi» y `obtenerEnCaminoProducto` devuelve además `ordenes` (OC, unidades, llegada) para el bloque «En camino». **«Conectado»** (22 oct 2026): una publicación con ID de Dropi guardado muestra una insignia verde «Conectado» (`InsigniaConectado`, también en la fila de la lista, junto al ID, solo esa palabra) sobre el campo «ID en Dropi», que queda de solo lectura hasta pulsar el lápiz («Corregir el ID»; al guardar vuelve a bloquearse). **El «Nombre en Dropi» no se edita** en la ficha (viene de Dropi; `actualizarPublicacion` lo ignora aunque llegue en el formulario): cambiaría solo si Dropi trae otro nombre para el mismo ID al volver a vincular; se escribe únicamente al crear la publicación. Ficha lateral que ya es el formulario (`actualizarPublicacion`: si cambia el precio,
  el último cambio de precio pasa a hoy; la ficha ya no trae «Revisión» ni «Marcar revisada hoy» (21 oct 2026; `ultima_revision` sigue en la base y viaja al guardar para no borrarse); actividad con `HistorialGenerico`) y «Agregar» con `FichaCrear`.
  **Importar:** `node scripts/clickup-exportar-publicaciones-dropi.mjs` (baja la lista a `datos-privados/clickup-gcc-panama.json`) y
  `npx tsx scripts/importar-publicaciones-dropi.ts --aplicar` (por `clickup_id`, se puede repetir; copia la foto a
  `wms-productos/publicaciones/<id>/`; responsables por nombre). El campo «ID» de ClickUp es el ID de Dropi: 177 de los 178 productos
  públicos de ECOMFIVE en el catálogo de Análisis de competencia (14 oct) están en la lista. «%», «URL» y «Países» de ClickUp no se
  traen (el % es el margen escrito a mano; los otros dos están vacíos). **Vincular los SKU** (migración 0117, `foto_huella`): las reglas
  viven en `src/lib/publicaciones/vincular.ts` (con prueba). `sugerirSku`: exacta si el código o el nombre de un producto es idéntico al de
  la publicación (o al del catálogo de Dropi con su ID, `competencia_productos`); si no, el cruce de Testing Lab (`todasLasCoincidencias`,
  nombre o foto). Un pack (`detectarPack`: «PACK 2», «2x1», «x2») va al **compuesto** de un solo simple con esa cantidad
  (`sku_maestro_componentes`); si no existe, «Falta el compuesto» (nunca al simple: descontaría mal). Un «combo» solo busca entre
  compuestos. La página calcula las sugerencias al cargar (`cargarSugerencias`, `src/lib/publicaciones/sugerencias.ts`); la ficha las
  confirma con `vincularSkuPublicacion` («Vincular y siguiente»), con `CampoSkuMaestro` para elegir otro. Las exactas se vinculan con
  `npx tsx scripts/vincular-skus-publicaciones.ts --aplicar` (también calcula las huellas que falten; actividad «Vínculo automático»). **Reglas y recomendaciones** (fase 1 de las automatizaciones, migración 0127, 21 oct 2026; pestañas Publicaciones ·
  Recomendaciones · Reglas). Los umbrales (margen mínimo/crítico/saludable, caída de ventas, días de nuevo, combo) viven en
  `dropi_publicaciones_reglas` y se editan en `/publicaciones-dropi/reglas`; `REGLAS` y sus valores de siempre en
  `src/lib/publicaciones/reglas.ts` (con prueba), y `accionesPublicacion` y `nivelMargen` los reciben (nada de umbrales fijos en la
  pantalla: el nivel del margen lo calcula el servidor). `recomendar` (`src/lib/publicaciones/recomendaciones.ts`, con prueba) propone
  **Crear combo x2** (margen bajo, simple vinculado, ventas ≥ regla, sin compuesto x2 publicado; asume que el fulfillment se paga una vez
  por pedido), **Subir precio** (sin competidor más barato, tope = el más barato de la competencia) y **Bajar precio frente a la
  competencia** (sin quedar en crítico). La persona acepta, rechaza (con porqué obligatorio) o pospone (`decidirRecomendacion`,
  `recomendaciones-actions.ts`): queda en `dropi_publicaciones_decisiones` con la foto de la recomendación, el precio y margen de ese
  momento y `vigente_hasta` (aceptada 30 días, rechazada 90, pospuesta 7/14/30), y en la actividad. Se calcula al cargar
  (`cargarPublicaciones`, `datos-publicaciones.ts`, compartido por la lista y la pestaña Recomendaciones); no se escribe nada al abrir. **Globo de la pestaña «Recomendaciones»** (22 oct 2026): la franja de pestañas (`BarraMigas`) dibuja un globo rojo como el de la campana con lo pendiente de una pestaña (`useContadoresPestanas`, `src/components/migas/contador-pestana.tsx`: un almacén fuera de React, como la etiqueta de las migas, que se queda al pasar de una pestaña a otra). La página lo pone con `<ContadorPestana href cantidad />`: Publicaciones y Recomendaciones ya tienen la cuenta (suma de `recomendaciones` de cada fila, igual a «Pendientes» del panel) y se actualiza al decidir una; Reglas no carga las publicaciones, así que pasa `cargar={contarRecomendacionesPendientes}` (acción de lectura) que solo se llama si aún no hay un número. Otra pestaña con globo: su página renderiza `ContadorPestana` con su `href`.
  **Tareas** (migración 0128): una aceptada es una tarea con `responsable_id`, `plazo` (regla `dias_plazo`, 7) y aviso «Para ti»
  (`notificaciones_usuario` tipo `tarea`); mientras está abierta no se vuelve a sugerir (`pendientes`). `tareaCumplida` la da por hecha
  si Dropi muestra un precio nuevo después de aceptarla y en la dirección pedida, o si el combo x2 ya está publicado; `cargarPublicaciones`
  lo guarda con `after()` (a nombre de «Sistema», con su línea en la auditoría) y si no, «Ya lo hice» (`marcarTareaHecha`). Las
  atrasadas cuentan en `PendientesHoy.tareasAtrasadas` (Hoy y menú). Vistas Pendientes · Por hacer · Hechas (`?ver=`).
  **Optimización en Dropi** (22 oct 2026, `src/lib/publicaciones/optimizacion.ts`, con prueba): `revisarPublicacion` revisa, con el
  título y los datos que muestra Dropi (`cargarNuestrosEnDropi`, de `competencia_productos`), título en español (`palabrasEnIngles`), de `min_titulo` a `max_titulo` caracteres (35 a 40; 40 es lo que admite Dropi),
  cantidad si es suplemento, para qué sirve («revisar» si no dice «para…»), formato, fotos (`min_fotos`, 7), video, descripción
  (`min_descripcion`, 200) y precio sugerido (> nuestro precio). `recomendarOptimizacion` vuelve lo que falta recomendaciones del grupo
  «optimizacion» (`TIPOS_RECOMENDACION[].grupo`), y `tareaCumplida` las da por hechas cuando la revisión ya está bien. Fotos, videos y
  largo de la descripción los guarda la lectura del catálogo desde la migración 0129 (`fotos`, `videos`, `descripcion_largo`; el
  video cuenta cualquier campo de Dropi que diga «video» y queda null si no viene). Bloque «Optimización en Dropi» en la ficha,
  tarjeta «Por optimizar» y filtro «Optimización».
  **Bodegas y «Dropi manda»** (22 oct 2026, pedido de Hernán, migración 0131): la cuenta de ECOMFIVE en `app.dropi.pa` es de
  **proveedor** (`type_user: SUPPLIER`, usuario 2094) y su pantalla «Mis productos» lee api-v2 `bff/catalog/products/produit/<usuario>/owner`
  (POST, `pageSize` 100, `page` desde 1, `get_stock: true`; `archive: true` = pestaña Archivados): trae por producto `warehouses`
  `[{id, name, stock}]` (las variables en `variation_warehouses`, una por variación), `total_stock`, `private_stock`, `private_product`,
  precio y sugerido. Panamá: bodega 81 «Proveedor Ecomfive» y 280 «Bodega Dropi Panama» (los «(B280)»); 218 activos y 196 archivados.
  La lee `leerNuestrosProductos` de `scripts/scraping-proveedores-navegador.js` (en la pestaña de Dropi con esa sesión, mismo
  receptor y puente que el scraping, `tipo: "nuestros"`) y la guarda `scripts/publicaciones-sincronizar-dropi.ts`
  (`guardarNuestrosProductos`; también a mano con un JSON guardado, por defecto solo informa, `--aplicar` escribe): reemplaza
  `dropi_productos_proveedor` (una fila por producto y país, `bodegas` jsonb) y anota `dropi_productos_proveedor_lecturas`. **Dropi
  manda:** `cambiosDesdeDropi` (`src/lib/publicaciones/sincronizar-dropi.ts`, con prueba) pone en la publicación `ubicacion` (la
  bodega de más stock, por nombre: `ubicacionDeBodega`; un archivado sin bodegas no la cambia), `precio_venta` (y
  `ultimo_cambio_precio` = hoy), `tipo_publicacion` y `estado_publicacion`; con dos IDs manda el activo de más stock
  (`productoPrincipal`). Cada cambio va a la actividad como «Sistema» (`sincronizar_dropi_publicacion`). La lista lee la tabla con
  `cargarProductosProveedor` (`proveedor-datos.ts`; sin la migración, null y todo sigue igual): `bodegasDropi`, `stockProveedor`,
  `stockPrivadoProveedor` y `leidoProveedor` en `FilaPublicacion`; «En Dropi» y el Tipo prefieren esta lectura a la carga de Ventas
  Dropi; la fila pone las unidades bajo «Dónde está», la ficha lista las bodegas en «Stock», y hay filtro «Bodega en Dropi» y
  columna en el CSV.
  **Fase 2** (pendiente): Claude propone con el historial de decisiones; **fase 3**: automático por tipo cuando su tasa de aceptación lo
  justifique, con bitácora y deshacer.
- **Portal del proveedor (Chin)** (plan en [PORTAL-PROVEEDOR.md](PORTAL-PROVEEDOR.md); fase 1 = migración 0124, 21 oct 2026). Chin
  cotiza, marca envíos y confirma pagos desde un portal aparte que lee un **espejo**, nunca `wms_compras`: `proveedor_pedidos` lo
  llena el disparador `proveedor_sincronizar` (en `wms_compras` y `wms_compra_items`) con las compras de un proveedor de
  `proveedores` desde «Cotizar» (Backlog, anuladas u otro proveedor quedan `visible = false`); si la copia falla, la compra se guarda
  igual (solo un aviso en el registro). La compra es la fuente: lo que el proveedor cambie se aplica a la compra y el disparador lo
  trae de vuelta (al aplicar, cambiar unidades y etapa en **un solo update**: `unidades_pedidas` se congela al salir de «Por
  cotizar»). Cuentas del portal en `proveedor_usuarios` (sin fila en `perfiles`: el sistema no las reconoce). Reglas puras en
  `src/lib/proveedor/` (con prueba que compara el `case` del disparador con `ETAPA_PORTAL_DE_COMPRA`): cuotas 50 % a los 10 días
  corridos del envío y 50 % a la llegada, tránsito contra `wms_rutas_envio` (CR mar = 80 días), cotización y qué paso da cada lado.
  Lectura: `cargarEspejo`. Verificar: `npx tsx --env-file=.env.local scripts/verificar-espejo-proveedor.ts`.
  **Fase 2** (migración 0125: módulo `portal-proveedor` para quien tiene Compras y `proveedores.notificar_a` = Francis): página
  `/portal-proveedor` debajo de Compras (`portal-proveedor.tsx`, la interfaz del prototipo con los tokens del sistema), pestañas
  Novedades · Por decidir · En cotización · Tránsito (`?tab=`). «Por decidir» muestra solo la foto de referencia: el espacio de la real va en blanco (`Foto enBlanco`), porque la real se agrega después (22 oct 2026). «Pasar a Producción»/«Descartar» y «Marcar llegada» cambian la compra
  **con `actualizarCampoCompra`** (mismos permisos de Compras, evento, Actividad y auditoría) y dejan una novedad para el proveedor;
  la nota para el proveedor se escribe en «En cotización». «Nueva compra en Cotizar» lleva a `/compras/lista?proveedor=Chin`, que
  abre la compra nueva con proveedor y agente puestos (`CrearCompraPanel` se abre sola después de montarse: `Ventana` no se puede
  dibujar en el servidor). Los plazos salen de Compras › Envíos (si un país y vía tienen dos rutas, la última cambiada).
  **Fase 3** (migración 0126): el portal de Chin en **`/proveedor`** (`src/app/proveedor/`, fuera de `(app)`: su propio layout sin menú).
  Solo lo abre una cuenta de `proveedor_usuarios` (`requireProveedor` / `cuentaProveedorActual`, `src/lib/proveedor/sesion.ts`); el login
  la manda ahí, y `requireModulo` y el layout de `(app)` devuelven al portal a una cuenta de proveedor que abra otra página
  (`cuentaDeProveedor`, `src/lib/proveedor/cuenta.ts`). Lo que hace el proveedor lo aplica `src/lib/proveedor/aplicar.ts` **a la compra**
  sin pasar por los permisos de Compras (el proveedor no tiene perfil): cotizar = línea de producto (si tiene una), `qty_total`,
  `monto_total` y etapa `cotizado` en un solo update, comentario «Cotización de Chin…» con la foto real como adjunto (origen
  `proveedor`, copiada de `proveedor-portal` a `wms-compras`, validada por su firma; ruta `<proveedor>/<pedido>/fotos/<id>`,
  `rutaEsDelPedido`); enviar = etapa `tracking`, `fecha_envio` (hasta 60 días atrás, nunca futura) y su planificación
  (`cargarTiempos`, ahora en `src/lib/compras/tiempos-datos.ts`). Cada cambio: evento con origen `proveedor`, auditoría, novedad y aviso
  en la campana de `proveedores.notificar_a`. La cuenta la crea un administrador en la pestaña «Cuenta de Chin» (`cuenta-actions.ts`, clave
  temporal con `crypto.randomInt`, una sola cuenta por proveedor).
  **Fase 4** (migración 0127): pagos. **Lo pagado vive en `proveedor_pagos`, nunca en los campos de pago de la compra** (en Compras
  `fecha_pago_1` es la fecha en que vence; decidido con Hernán). Entra por avisos de Ecomfive (`proveedor_avisos_pago` + `_cuotas`,
  `pagos-actions.ts`: los montos los recalcula el servidor con `estadoPagos`; comprobante imagen/PDF en `proveedor-portal/<prov>/avisos/`)
  que el proveedor confirma (`confirmarAvisoPago`, primero marca confirmado para no duplicar), o por las hojas de pagos de Chin
  (`scripts/importar-pagos-proveedor.ts`, se puede repetir; `proveedor_historial` con `pedido_id` si se emparejó —`emparejar`,
  `hoja-pagos.ts`— o historial suelto que cuenta para el cumplimiento). Cuotas en `cuotas.ts` (`anticipo_monto` cuando no es el 50 %:
  UPS sin saldo); `enviosConCuotas` solo cuenta los pedidos de las hojas, los enviados después de la última hoja y el historial suelto
  (un pedido viejo sin hoja saldría vencido sin estarlo). La ficha de compra muestra «Pagos a Chin» (solo lectura,
  `pagos-proveedor-compra.tsx`, oculto si el rol no ve el monto).
  **Idioma** (migración 0130, 22 oct 2026): Chin ve su portal en **chino simplificado** (`proveedor_usuarios.idioma`, 'zh' por defecto;
  «中文 / Español» arriba, `cambiarIdiomaProveedor`; `idiomaDeCuenta` cae a chino sin la migración). Los textos de la pantalla están en
  `src/lib/proveedor/textos.ts` (`TEXTOS.es` / `TEXTOS.zh`, fechas, estados de cuota y tránsito por `clave` + `n`, y `errorEn` para los
  errores de las acciones; **un texto nuevo del portal va en los dos idiomas**, lo comprueba `idioma.test.ts`). Lo escrito por personas se
  traduce con Gemini (`traducirTextos`, `src/lib/proveedor/traducir.ts`: `GEMINI_API_KEY`, modelo `GEMINI_TEXT_MODEL` o
  `gemini-3.5-flash-lite`, tandas de 60, máximo 4 por carga, nunca lanza) y se guarda en `traducciones` (huella sha256 + destino): a
  chino los productos, las notas, «Lo nuevo» y los productos de pagos; a español lo que escribe Chin (comentario de cotización, detalle de
  novedad, nota al confirmar un pago). Las pantallas reciben las traducciones por `IdiomaProveedor` (`useIdioma`: `t`, `tr`, `fecha`,
  `cuota`, `transito`, `error`, `numero`) y `Traducido` muestra la traducción con «(ver original)». **«Tablero de Chin»** (`?tab=tablero`
  en `/portal-proveedor`): el mismo `PortalChin` en español con `soloLectura` (sin botones, sin selector ni «Salir» y sin marcar
  «Lo nuevo» como visto).
- **Actividad con comentarios, común a todos los módulos** (22 oct 2026). La Actividad de Compras se separó en una pieza común:
  `Actividad` (`src/components/actividad/actividad.tsx`: un solo bloque con comentarios, cambios y archivos, filtro, «Ver anteriores»,
  campo con @menciones, pegar o arrastrar archivos), `TarjetaComentario` (`tarjeta-comentario.tsx`: respuestas de un nivel,
  reacciones, editar y eliminar el propio) y `adjuntos.tsx` (subida directa a Storage con URL firmada, galería). Cada módulo le pasa
  `obtener` (su lectura) y `acciones` (`AccionesActividad`, `src/lib/comentarios/tipos.ts`: comentar, editar, eliminar, reaccionar,
  prepararSubida, descartarSubida y su bucket) y, si quiere, `renderCambio` y `arriba`; `version` la vuelve a pedir. Compras la usa
  con sus acciones de siempre (`actividad-compra.tsx` es ahora un envoltorio: etapa/estado en color y subtareas). Para un módulo nuevo
  el servidor es `src/lib/comentarios/servidor.ts` (`ConfigComentarios`: tablas, columna de unión y bucket): no revisa permisos, así
  que su archivo "use server" comprueba el módulo y el acceso al registro ANTES de llamarlo, como
  `publicaciones-dropi/actividad-actions.ts`. Los archivos se revisan por su contenido (`detectarAdjunto`) y solo se borran los de
  `comentarios/<registro>/`. **Gestión de IDs Dropi** ya la tiene (migración 0132: `dropi_publicacion_comentarios`, `_adjuntos`,
  `_comentario_reacciones`, bucket privado `publicaciones-dropi`); sus cambios salen de `historial_auditoria` (también las decisiones
  de recomendaciones y las tareas hechas), y la ficha la vuelve a pedir al guardar o decidir.
- **Testing Lab › Generador de landings** (`/generador-landings` y `/generador-landings/[id]`, módulo `generador-landings`, migración
  0113, 20 oct 2026; debajo de Creación de ofertas en Producción). Una fila de `landings` por landing (LND-0001, por país, con
  `seleccion_id` opcional): `modo` cero/clonar, `referencia_url` + `referencia` (lo leído de la landing modelo), `angulo`, `notas_ia`,
  `moneda` (la del país, `monedaDePais`) con `precio` y `precio_tachado`, `contenido` (textos y orden/visibilidad de las secciones),
  `imagenes` (`{ <espacio>: { ruta, instruccion } }`), `fotos_proveedor` y `estado` (borrador → lista, solo al guardar sin
  faltantes; publicada queda para Shopify). Qué tiene una landing y cómo se valida vive en `src/lib/landings/landing.ts` (con
  prueba): `ESPACIOS_IMAGEN`, `SECCIONES`, `normalizarContenido` (todo lo que llega del navegador pasa por aquí), `faltantesLanding`
  y `leerReferencia` (título, h1–h3 en orden, imágenes grandes y botones de compra de un HTML, sin ejecutar nada). Las imágenes van
  al bucket **privado** `landings`, bajo `<id de la landing>/` (`rutaDeLanding` lo confina), se suben directo con dirección firmada
  y `guardarImagenLanding` las revisa por su firma (`detectarImagen`); se ven con enlaces firmados de una hora. «Leer landing» baja
  la página con `descargarPublico` (hasta 3 MB). La vista previa (`[id]/vista-landing.tsx` + `.module.css`) tiene su propia paleta
  de tienda, igual en los dos temas. Las ofertas salen de `wms_seleccion_ofertas` pasadas a la moneda con `tasasUsd`. **Gemini** (21 oct 2026): `generarImagenLanding`
  pide la imagen de un espacio a la API de Interactions (`src/lib/landings/gemini-api.ts`, `POST v1beta/interactions`, clave
  `GEMINI_API_KEY`, modelo `GEMINI_IMAGE_MODEL` o `gemini-nano-banana-2.1`, 1K, proporción por espacio en `PROPORCION`), con hasta 4
  fotos del proveedor de referencia (o la portada); el pedido y la lectura de la respuesta son puros en `gemini.ts` (con prueba:
  `extraerImagen` toma la última imagen de cualquier forma de respuesta). La imagen se valida por su firma, se guarda en el bucket y
  queda en la auditoría (`generar_imagen_landing`). La página `[id]` tiene `maxDuration = 120`. Sin clave, el botón se ve
  deshabilitado. **Shopify** (21 oct 2026, tienda Oferfy Panamá): `enviarAShopify` crea o actualiza el producto con
  `productSet` (borrador; título, `variantesShopify`: una variante «Oferta» por oferta con precio o la única con el precio de la landing;
  `files` con la portada primero, las que no cambiaron van por su `mediaId`), espera a que Shopify procese las fotos (`esperarFotos`) y
  pone la landing como descripción (`htmlDescripcion`, texto escapado, imágenes con las direcciones de Shopify). `publicarEnShopify`
  lo activa y lo publica en el canal «Tienda online» (`publishablePublish`), pasa la landing a «Publicada» y copia el enlace a
  `wms_productos_test.pagina_producto_url` de sus tests sin página. Lo enviado queda en `landings.shopify` (`DatosShopify`). La conexión
  (`src/lib/landings/shopify-api.ts`) usa una app del Dev Dashboard con *client credentials* (`SHOPIFY_TIENDA`, `SHOPIFY_CLIENT_ID`,
  `SHOPIFY_CLIENT_SECRET`; el permiso dura 24 h y se guarda en memoria) o un token fijo de una app vieja (`SHOPIFY_ADMIN_TOKEN`);
  permisos `write_products`, `read_products`, `read_publications`, `write_publications`; versión `SHOPIFY_API_VERSION` o 2026-10.
  **Pendiente:** Claude (textos), con `BotonPendiente`. Las reseñas son de clientes reales: la IA no las inventa.
- **Testing Lab › Instagram** (`/instagram`, módulo `instagram`, migración 0106, 14 oct 2026). Una fuente más de Fuentes: lo que el
  equipo ve en Instagram y comparte **por mensaje directo con la cuenta de fuentes** (`@ecomfive.fuentes`, cuenta profesional ligada
  al Business Manager) cae solo en `instagram_capturas`. Meta llama al webhook **`/api/instagram/webhook`**
  (`src/app/api/instagram/webhook/route.ts`): `GET` para registrarlo (devuelve `hub.challenge` si `hub.verify_token` coincide con
  `INSTAGRAM_VERIFY_TOKEN`) y `POST` por cada mensaje, que **solo se acepta con la firma `X-Hub-Signature-256`** (HMAC-SHA256 del
  cuerpo crudo con `INSTAGRAM_APP_SECRET`, en tiempo constante; sin secreto configurado todo se rechaza). Contesta de inmediato y el
  trabajo sigue en `after()`. Variables de entorno (nunca `NEXT_PUBLIC_`): `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN` y,
  opcional, `INSTAGRAM_ACCESS_TOKEN` (con él se consulta el usuario y el nombre de quien envió; sin él solo se guarda su id).
  La lógica pura vive en `src/lib/instagram/` (con prueba): `firma.ts`, `extraer.ts` (entiende `entry[].messaging[]` y
  `changes[].value`; captura adjuntos `ig_reel`/`reel`, `ig_post`/`post`, `video`, `share`/`fallback` y también un enlace de reel o
  publicación pegado en el texto; ignora ecos, imágenes, audios y menciones; si la `url` del adjunto es de instagram.com es el
  enlace, si no es el archivo de video) y `guardar.ts`. **Una fila por mensaje+adjunto**: `mensaje_id` es único, así que un
  reintento de Meta no duplica. El video se copia a Storage (bucket **privado** `instagram-fuentes`, se ve con enlace firmado de una
  hora) con el descargador seguro `descargarPublico` (sin red interna, hasta 100 MB) y **se valida por su firma** (MP4/WebM), no por
  el tipo que diga el servidor. El aviso completo queda en `payload` (jsonb) para no perder datos mientras se decide qué sirve; las
  métricas del autor (`metricas`: `like_count`, `comments_count`, `view_count`) y `autor_usuario` quedan listos para llenarse con la
  Business Discovery API (solo cuentas profesionales; **compartidos y guardados no los entrega Meta**) y la página de destino no
  viene del DM: se toma del enlace que la persona escribe al compartir (Instagram lo manda como **mensaje de texto aparte**, que `extraerNotas`/`guardarNotas` unen a la última captura de esa persona de los últimos 20 minutos) y, si no, del primero que aparezca en el copy; se puede filtrar «Sin página» y se completa a mano en la ficha, donde el botón «Buscar el anuncio en la Biblioteca de anuncios» (`biblioteca.ts`) abre la búsqueda del copy en la Biblioteca pública de Meta: **el copy completo, no su primera línea** (probado el 15 oct 2026: la primera línea de IG-0026 daba 340 resultados y el copy completo 1; el de IG-0027, 11 contra 10). `urlBibliotecaAnuncios` busca la frase exacta del copy limpio (solo letras y números, hasta 700 caracteres cortados en una palabra: `copyCompletoPorBuscar`) y «Ver los anuncios de la página» (`urlAnunciosDePagina`, 15 oct 2026) busca el nombre de la página como frase exacta para ver todo lo que corre (nombre de la Biblioteca → nombre de la página → usuario de Facebook; sin « | » ni « · »). «Buscar solo la primera línea» se quitó: el copy completo es siempre más preciso, y la vista de la página por id exige iniciar sesión. **Anuncios con el mismo copy** (15 oct 2026, columna «Anuncios (mismo copy)», `metricas.anuncios_mismo_copy`, editable en la ficha, bloque «Biblioteca de anuncios»): el servidor no abre la Biblioteca (Meta lo limita y se arma con JavaScript), así que la lee **el navegador de la persona** con el marcador «Leer Biblioteca» (`marcador.ts`, un favorito que se arrastra desde la ficha, `MarcadorBiblioteca`; el código va completo dentro del favorito y lee las tarjetas por su «Identificador de la biblioteca», no por clases de Meta). Al pulsarlo con la Biblioteca abierta abre `/instagram/biblioteca#d=…` con la lectura en el fragmento (el servidor nunca lo ve; desde la página de Meta no se puede llamar a otro sitio, pero sí abrir una pestaña); esa página (`lectura-biblioteca.tsx`) borra el fragmento y llama a `guardarLecturaBiblioteca` (`biblioteca-actions.ts`: pide modificar Instagram, valida la forma con `validarLectura` y no confía en nada de lo que mandó). `biblioteca-lectura.ts` (con prueba) interpreta cada tarjeta (id, activo, fecha, página, copy, destino sin el rastreo de `l.facebook.com`, «N anuncios usan este contenido y texto» cuenta N) y, **para cada captura con copy, cuenta los de la misma página (`mismaPagina`) con el mismo copy (`mismoCopy`: las primeras 25 a 120 letras sin emojis ni acentos)**; sin nombre de página en la captura, si el copy está en varias no se adivina y se avisa. Guarda el total, activos, inactivos, desde, ids y destinos en `metricas.biblioteca`, y si la captura no tenía página de destino (o nombre de página) la completa; nada de lo escrito a mano se pisa. Si la Biblioteca tiene más anuncios de los que cargó (`parcial`), la página lo dice: se baja hasta el final y se pulsa otra vez. **Vincular a mano** (15 oct 2026): el nombre con que Instagram muestra la cuenta no siempre es el de la página en la Biblioteca (IG-0026: «NENA GOSLING regalos personalizados»; buscando nombre + copy la Biblioteca no devolvía nada, y solo con la frase salían 340 anuncios de muchas tiendas), y entonces ninguna captura coincide. Los anuncios que ninguna captura reconoció (`sinVincular`) se listan en la misma página de lectura (`VincularAMano`): se marcan (al marcar uno se marcan los de la misma página y el mismo copy), se elige la captura y `vincularAnunciosACaptura` (pide modificar Instagram; revalida los anuncios con `validarAnuncios`, porque los manda el navegador) le anota el total, activos, desde y destinos y, si no la tenía, la página de destino. Guarda el nombre de la página en la Biblioteca (`metricas.biblioteca.pagina`, con `manual: true`) y la próxima lectura **la reconoce sola** (`paginasAlternas` de `coincidencias`). La cuenta que salió de la Biblioteca se anota (`metricas.cuenta_origen = "biblioteca"`, se borra al corregirla a mano) para que su enlace abra la página de Facebook y no un perfil de Instagram. Los enlaces de la ficha (`EnlaceExterno`, pequeños, con «se abre en una pestaña nueva» para lectores de pantalla) son: Buscar el anuncio, Ver los anuncios de la página y Abrir el perfil de Instagram / la página de Facebook / la cuenta de TikTok, todos en el mismo bloque y sin repetirse en otro lado de la ficha. **La página también se reconoce por el usuario de la cuenta** (`autor_usuario`: `nenagosling` está dentro de la página «Nenagoslingshop» de la Biblioteca) y `mismaPagina` compara sin espacios (mínimo 5 letras; el contenido de un nombre dentro de otro necesita 4), así que IG-0026 se habría reconocido sola. **«Volver a leer el enlace» completa lo que faltó** (17 oct 2026, `completarCaptura`): en Instagram el archivo sale también de la página principal del reel (`archivosDeLaPagina`: `og:video`/`og:image`, que traen el video cuando la página de «insertar» no), con `candidatosDeArchivo` (videos primero, imágenes al final); una captura con solo una imagen se mejora con un video (`esSoloImagen`, `borrarArchivoViejo`); cada lectura se repite una vez si falla (`conReintento`; también TikTok y Facebook); si no hay archivo, la ficha lo dice («Sin archivo: …», `faltaArchivo`/`video_error`). Detalle en `INSTAGRAM-META.md`. **Barra de avance y «Volver a Instagram»** (17 oct 2026): todo proceso lento de este módulo (compartir desde el celular, la lectura de la Biblioteca, volver a leer un enlace, unir, eliminar, fusionar) muestra `ProgresoEstimado` (`src/components/ui/progreso-estimado.tsx`: arranca rápido, pasos que cambian seguido, segundos, se completa en verde al terminar; `src/lib/progreso-estimado.ts`), y «Volver a Instagram» (`volver-a-instagram.tsx`) de las pantallas que abre el marcador cierra esa pestaña y avisa por `BroadcastChannel` (`src/lib/instagram/canal.ts`) a la lista abierta, que se actualiza sola (también al volver a verse). Detalle en `INSTAGRAM-META.md`. **Ícono de la app** (17 oct 2026): `node scripts/generar-iconos-fuentes.mjs` lo dibuja en vectores (la «E» con las medidas del logo dentro de un visor de captura, rojo de la marca) y escribe `public/pwa/icon-192.png`, `icon-512.png` e `icon-maskable-512.png` (la app instalada; el manifiesto declara el maskable). **El favicon de todo el sistema** (`src/app/icon.png` y `src/app/apple-icon.png`) lo dibuja `node scripts/generar-favicon.mjs` (21 oct 2026: la «E» del logo con su línea en L, #E83B3C, transparente; el de iPhone con fondo blanco), no el script de la app instalada. No recortes el logo a mano. **Compartir desde el celular, sin mensaje directo** (15 oct 2026, Android): los anuncios se ven y se comparten en la app del celular, donde no cabe un marcador ni una extensión, pero la hoja de «Compartir en…» de Instagram sí ofrece compartir fuera de Instagram (comprobado con un anuncio patrocinado). La plataforma se instala como app (Chrome › «Instalar aplicación»: `src/app/manifest.ts` + `public/sw.js`, que no guarda nada, registrado por `RegistrarSw`) y aparece como «Ecomfive Fuentes» en esa hoja: su `share_target` manda `title`, `text` y `url` a `/instagram/compartir`, cuyo componente de cliente (`compartir-celular.tsx`) los lee, borra los datos de la dirección y llama a `compartirDesdeCelular` (`compartir-actions.ts`: pide modificar Instagram, saca el enlace con `enlaceDeCompartido` —`compartir.ts`, con prueba— y guarda la captura con `guardarCapturas` como un mensaje, con remitente `web:<usuario>` y el nombre de la persona; una captura nueva del mismo contenido se **fusiona** en la existente por el código del enlace, y la llave `llaveDeEnvio` evita guardar dos veces el mismo envío en 10 minutos). Se lee la página pública del enlace (cifras, cuenta, video) como con un mensaje; como lo compartido desde el celular no trae el copy, **si la captura no tiene copy se toma el de la vista previa pública** (`copy` de `interpretarVistaPrevia`, lo que sigue a la fecha en `og:description`; `guardarCapturas` y `completarCaptura` lo ponen en `titulo` solo si está vacío), que es lo que hace funcionar la búsqueda en la Biblioteca. Primera prueba real (15 oct 2026, un anuncio de Metodo Sawaya): llegó con enlace, página, cuenta, fecha, me gusta y comentarios, pero **sin video**: esa cuenta no publica los datos de «insertar», y no hay otra vía. **En iPhone** una web instalada no aparece en la hoja de compartir (iOS no registra el destino), así que se usa **un atajo de la app Atajos** que abre `/instagram/compartir?url=<lo compartido>` en el navegador: la misma página y la misma acción que en Android, sin endpoint nuevo ni claves (usa la sesión de la plataforma en Safari; si no hay sesión, se pierde ese envío). Los pasos para crearlo están en `INSTAGRAM-META.md` y en la guía de Instagram del Centro de ayuda. La página de resultado trae «Volver a Instagram» (`instagram://app`) y «Ver capturas». **Unir con otra captura** (15 oct 2026): un anuncio reenviado desde un chat llega solo como archivo y el mismo compartido después con «Compartir en…» llega con enlace; el id de Meta de cada camino es distinto (`18020951225874919` en el mensaje de IG-0020 frente a `4004412357671560050` del enlace), así que `fusionarEnPrimera` no los reconoce. La ficha trae el bloque «Unir con otra captura» (`unir-captura.tsx`): una lista con **las sugeridas** (`sugerirUniones`, `src/lib/instagram/unir.ts`, con prueba: llegaron con menos de 2 horas de diferencia, no son de enlaces distintos y una aporta el enlace o el archivo que le falta a la otra; primero la misma persona, luego la más cercana) y todas las demás; la tabla avisa con «Se puede unir con IG-00NN» (`unionProbable`: solo archivo y **una sola** captura con enlace de menos de 30 minutos; entre varias no se adivina). «Unir» (`unirCapturas` en `actions.ts` y `guardar.ts`, pide modificar Instagram y confirma) deja **la más antigua** como principal y la absorbe con la misma `fusionar` de las fusiones automáticas (solo completa lo que le falta, suma los envíos «Compartida N veces», borra el archivo sobrante); se rechaza si las dos tienen un enlace de Instagram distinto. **Unir y eliminar desde la lista, sin abrir la ficha** (15 oct 2026): la tabla trae casillas (`seleccion` de `TablaDatos`) y, con alguna marcada, la barra fija de abajo (`barra-lote-instagram.tsx`): «Unir» (se enciende con exactamente dos, confirma y usa la misma `unirCapturas`), «Eliminar» (`eliminarCapturas`: hasta 100, con confirmación, cada una con su archivo y su línea en la actividad) y descargar lo marcado. **Facebook y TikTok** (15 oct 2026): la misma hoja de «Compartir en…» (y el atajo de iPhone) funciona desde Facebook y TikTok. `reconocerEnlace` (`src/lib/instagram/plataformas.ts`, con prueba) dice de qué red es un enlace y saca su **código del contenido** (`codigoDeContenido`: el de Instagram, el id del video de TikTok o de Facebook, o el del enlace corto), que es lo que fusiona (`fusionarEnPrimera`, `repetidasDe`, `unir`) y evita duplicar; un enlace **corto** (`vm.tiktok.com`, `fb.watch`, `facebook.com/share/…`) se abre con el descargador seguro y se queda con el enlace canónico. La red queda en `metricas.plataforma` (sin dato = Instagram; **sin migración**) y se ve en la columna «Red» y en la ficha («Captura de TikTok», «Ver en TikTok»). `guardarCapturas` lee la página pública (`leerPaginaExterna`, `aplicarLecturaExterna` en `guardar.ts`; `lectura-externa.ts`, con prueba): **TikTok** trae copy, cuenta, nombre, fecha (en hora de Panamá: `fechaEnPanama`), me gusta, comentarios, compartidos, **guardados** (`save_count`), vistas **y el video** (se copia por su firma, con las cookies de la página y `referer`, solo de la red de archivos de TikTok); **Facebook** trae el copy **completo** (el `og:title` es «cifras | texto completo | nombre de la página»; `og:description` viene cortada a 200 caracteres y `copyRecortadoCompletado` arregla las capturas viejas al volver a leer), las reproducciones, las reacciones y los comentarios que traiga esa vista previa (si la primera lectura no trae ninguna cifra se pide otra vez; la fecha de un post, sus reacciones y los compartidos no llegan al servidor, ver `INSTAGRAM-META.md`), **el nombre de la página** (el código de la página del reel trae el id de la página, `pageID`; abrir `facebook.com/<id>` con `descargarConDetalle(…, parcial)` —la página pesa ~5 MB, solo se lee el comienzo— da su nombre y su nombre de usuario, que quedan en `nombre_pagina` y `autor_usuario`; la ficha lo enlaza con «Abrir la página») **y el video** (la página de «insertar» `facebook.com/plugins/video.php?href=<enlace>`, pública, trae `hd_src` y `sd_src`, direcciones de la red de archivos de Facebook, `archivosDeEmbedFacebook`); una publicación que no es un video queda sin archivo. Vistas y compartidos se muestran en la ficha solo de estas dos redes (`CIFRAS_EXTRA`; en `actualizarCaptura` solo se guardan si vienen en el formulario). **Anuncios:** Facebook usa la misma Biblioteca de Meta (copy completo + marcador); **TikTok no tiene una biblioteca pública para estos países** (la «Commercial Content Library» solo cubre Europa; el Creative Center sí tiene Panamá y Costa Rica, pero es una vitrina de los mejores anuncios que exige iniciar sesión), así que su ficha ofrece «Buscar el copy en TikTok» (`urlBusquedaTikTok`), «Abrir la cuenta» y «Top Ads de TikTok» (`urlTopAdsTikTok`) en vez de la Biblioteca. **Enlaces de Facebook que se reconocen** (`reconocerEnlace`): `reel/ID`, `watch/?v=ID` (y `watch/live`), `<página>/videos/…/ID`, `<página>/posts/ID`, `photo/?fbid=ID`, `<página>/photos/…/ID`, `groups/<g>/posts|permalink/ID`, `permalink.php`/`story.php?story_fbid=`, `fb.watch/XXXX` y los de compartir `share/r|v|p/XXXX` y `share/XXXX` (sin letra); los cortos se abren para saber qué son. **Respaldo:** cualquier otro enlace de contenido de Facebook (dos tramos en la ruta o `fbid`/`story_fbid`/`v`, sin `login`, `ads`, `marketplace`, `hashtag`, `people`, `profile.php`…) se acepta como un enlace «por abrir» (sin parámetros de rastreo, con un código estable `corto-<resumen>`): el servidor lo abre, sigue sus redirecciones y se queda con el canónico; si no lo puede leer, la captura queda con ese enlace (así, la forma que mande un anuncio no se pierde). `fb.me/XXXX` también. Si lo compartido no trae un enlace reconocido, el aviso de error **dice lo que llegó** (`compartirDesdeCelular`), para ver qué forma de enlace mandó la app y agregarla. **Ajustes del 15 oct 2026 tras las primeras pruebas desde el celular:** (1) un anuncio de Facebook con foto trae `og:title` = el nombre de la página, `og:description` = el copy y `og:image` = la foto (`facebook.com/ads/image/?d=…`, se baja y se guarda como imagen cuando no hay video; sin reacciones ni vistas: Facebook no las da en una publicación que no es video) y su enlace tiene el título en texto (`posts/<título>/<id>`, reconocido por su id); (2) el marcador de la Biblioteca lee también el **enlace de la página del anunciante** (`facebook.com/<usuario>/`, campo `p` de la tarjeta) y la lectura completa «Cuenta del video» (`autor_usuario`) **solo si estaba vacía**, también al vincular a mano; (3) cada red lleva su ícono (`iconoDeRed`: Instagram, Facebook, TikTok) y (4) «Volver a <red>» de la pantalla de resultado cierra la ventana de la app instalada (`window.close()`, así se vuelve a la app donde se estaba) y, si no se puede cerrar, abre la app de la red (`enlaceDeApp`: `intent://` en Android, esquema `fb://`, `instagram://`… en iPhone). El módulo y su ruta siguen llamándose Instagram. Sin la app instalada y con la sesión iniciada en Chrome del celular, nada de esto funciona. **La tabla muestra el «Formato»** (Con enlace / Con video / Con imagen / Enlace y video / Enlace e imagen / Sin enlace ni archivo, `formatoDeCaptura`) y no el tipo de Meta (`ig_reel`/`ig_post`): el mismo contenido llegó una vez de cada tipo compartido por la misma persona (ver `INSTAGRAM-META.md`). El archivo puede ser **video o imagen** (por su firma) y se guarda en `video_ruta`. El **nombre de la página** sale del título de la vista previa (`metricas.nombre_pagina`) y se usa, junto con el copy, para buscar en la Biblioteca. **Una captura por contenido:** lo que llega del mismo contenido (mismo id de Meta o mismo código de enlace) se **fusiona en la primera** (`fusion.ts`, `fusionarEnPrimera`), que se completa con lo que traiga y guarda cada envío en `metricas.envios` («Compartida N veces»); un reintento de Meta no duplica (`yaProcesado`). «Fusionar N repetidas» fusiona las anteriores. Un **enlace pegado** después de compartir un archivo se une a la última captura de esa persona sin enlace (`pegarEnlaceALaUltima`), y el texto escrito al compartir también se une a la última que tocó esa persona (`ultimaCapturaDe`, por `actualizado_en`). «Reintentar el archivo» vuelve a descargarlo del aviso guardado en `payload`. **Regla para el equipo (probada): abrir la publicación o el anuncio y compartir con su avión; reenviar el mensaje desde una conversación llega solo como archivo** (ver `INSTAGRAM-META.md`). **Una captura que llega solo como archivo no tiene enlace calculable** (`asset_id` = `ig_post_media_id`, no el código del enlace): la ficha ofrece un campo «Enlace de Instagram» (al guardar uno nuevo se lee su página con `completarCaptura`) (pedirle a Meta el mensaje por su id **no sirve**: devuelve solo quién lo envió, a quién y cuándo, sin `attachments` ni `shares`; se probó con IG-0007 y se quitó). La lista se **refresca sola** cada 30 s con la pestaña visible. **Con el enlace se completa todo** (`embed.ts`, `lectura.ts`): la página pública de insertar (`/p/<código>/embed/captioned/`, bloque `contextJSON`) da la dirección del video (o la imagen), las vistas, me gusta y comentarios; el archivo se copia a Storage por su firma y solo si es de `cdninstagram.com`/`fbcdn.net`. `completarCaptura` (botón «Completar desde el enlace» / «Volver a leer el enlace» de la ficha) lo hace con las capturas que ya existían; lo corregido a mano no se pisa. Una captura que llega solo como archivo sigue sin enlace (no se puede sacar de un archivo). **Eliminar:** la ficha trae «Eliminar captura» (`eliminarCaptura`: borra la fila y su archivo si ninguna otra lo usa, con confirmación) y, en «Compartida N veces», «Quitar» en cada envío fusionado (`quitarEnvioDeCaptura`; no deshace los datos que completó). La
  lista es una `TablaDatos` (sin «Agregar»: las crea el webhook), el estado se cambia pulsando su insignia en la celda (`SelectorEstadoInstagram`, `cambiarEstadoCaptura`; se ve al instante y vuelve atrás si el servidor lo rechaza), la ficha lateral muestra el video, lo que trajo Meta y, editable,
  Estado (Nuevo / Por testear / Descartado), Página de destino y Notas. Se abre desde `/instagram` y el código es IG-0001.
  **Cómo se montó la app de Meta y qué hizo falta de verdad** (publicar la app era lo único que destrabó los mensajes; roles de
  quien comparte, el paso 2 «completo» y la verificación del negocio no hicieron falta): ver [INSTAGRAM-META.md](INSTAGRAM-META.md).
  **Lo observado** (14 oct 2026, dos muestras): un reel llega con copy y enlace pero **sin archivo de video**; una publicación de
  video llega con copy y el archivo (se copia a Storage) pero sin enlace. Me gusta, comentarios y vistas no vienen en el aviso:
  `consultarMedia` pide a Instagram, con el id del reel o la publicación, lo que deja leer de una publicación ajena y guarda la
  respuesta (o el error) en `metricas.consulta`, visible en la ficha, «Datos de Meta»; **con estos permisos Meta la niega para publicaciones ajenas**. Por eso, al guardar una captura con enlace, el sistema **lee solo la vista previa pública** del reel o la publicación (`vista-previa.ts`, un pedido, `og:description`) y llena me gusta, comentarios, cuenta del video y fecha de publicación, marcados como dato no oficial (`metricas.fuente = "vista_previa"`); las vistas y los compartidos no salen ahí y **se quitaron de la ficha, la lista y los filtros (15 oct 2026)**. Todo lo demás se puede corregir a mano en la ficha («Cifras de la publicación»: me gusta, comentarios, cuenta, nombre de la página y fecha; en `metricas`: `like_count`, `comments_count`, `fecha_publicacion`), y entonces pasa a `fuente = "manual"`. Se apaga con `INSTAGRAM_LECTURA_PUBLICA=0` (Vercel); si Instagram no responde, el motivo queda en `metricas.vista_previa_error`. Una publicación trae su id como `ig_post_media_id`.
  **Falta:** probar un anuncio patrocinado real; decidir qué hacer con los reels sin video; enviar una captura «Por testear» a
  Selección (hoy no hay puente).
- **Investigación › Análisis de competencia** (`/analisis-competencia`, módulo `analisis-competencia`, migración 0108, 14 oct
  2026). Todo el catálogo de Dropi del país de la barra (hoy Panamá) leído con una cuenta de **dropshipper** (la de proveedor
  de ECOMFIVE recibe 401 en el catálogo) y comparado con nuestro proveedor ECOMFIVE (`NUESTRO_PROVEEDOR`,
  `src/lib/competencia/analisis.ts`, con prueba). Tablas `competencia_busquedas`, `competencia_productos` (proveedor, precio,
  stock, `es_nuestro`, `igual_a` + parecido + método nombre/foto, `foto_huella`), `competencia_historial` y
  `competencia_alertas` (bajó precio, más barato que nosotros, bajó stock, competidor nuevo,
  desapareció; `vista`). Se lee con `scrapingCompetencia` de `scripts/scraping-proveedores-navegador.js` en una pestaña de
  `app.dropi.pa` y la guarda el mismo receptor (`tipo: "competencia"`, `scripts/competencia-guardar.ts`): compara con la
  búsqueda anterior (`comparar`), calcula huellas, empareja con `yaVisto` contra lo nuestro y arma las alertas
  (`armarAlertas`; la primera búsqueda de un país no deja alertas). «Stock vendido» = suma de las bajadas de stock en 1/7/30
  días (`unidadesBajadas`), porque Dropi no muestra ventas ajenas. Panamá, 14 oct 2026: 1.452 productos de 93 proveedores
  leídos en 10 s; ECOMFIVE tiene 178. **Pestañas** (`PESTANAS_POR_MODULO`, simplificado a pedido el 14 oct 2026): **Competidores**
  (`/analisis-competencia`, `VistaCompetidores`: novedades = alertas arriba, buscador, filtros de un toque y la lista de
  competidores en acordeón; cada uno muestra sus productos, los iguales a los nuestros primero, y cada producto despliega
  `HistorialCompetencia`) y **Resumen** (`/analisis-competencia/resumen`, `dashboard-competencia.tsx`). Las dos usan
  `PaginaCompetencia` (carga `cargarDatosCompetencia` y pone `ResumenCompetencia`, la barra de `Indicador` con `marco-neon`).
  **Qué hacer hoy y posición en precio** (ideas de SmartFlow): `posicionPrecio` (ganando / empatado / perdiendo, «#2 de 3»)
  y `decisionesDeHoy` (`src/lib/competencia/analisis.ts`, con prueba): bajar precio (perdemos y un más barato vendió en 7 d),
  oportunidad de stock (le quedan < `SEMANAS_OPORTUNIDAD` = 6 semanas al ritmo de 7 d, o lo dejó de mostrar), vigilar
  (competidor nuevo o que empezó a vender uno igual, después de `corte` = fin de la primera búsqueda) y mantener (ganamos y
  la competencia vende). Se calculan al cargar; no se guardan. **Precio equivalente:** `precioEquivalente(nuestroNombre, otro)` lleva el precio del competidor al
  tamaño del nuestro: por contenido si los dos lo dicen (`medidaEnNombre`: cápsulas/caps/cap/softgels/tabletas/gomitas, ml, g)
  y si no por unidades (`unidadesEnNombre`: PACK-N, Nx1, xN —no «x 60 cápsulas»—, «N pares/unidades», «COMBO A y B»); devuelve
  la `nota` de la conversión. Posición, decisiones, diferencias y Resumen comparan nuestro precio real con ese equivalente.
  **Competencia de un producto** (Producto, Compras y Gestión de publicaciones Dropi; 21 oct 2026: **se une también por la publicación de Dropi**: `obtenerCompetenciaProducto` toma las publicaciones vinculadas al producto, enlaza su ID de Dropi con nuestra fila del análisis —`dropi_producto_id`— aunque los nombres no se parezcan, y busca a los competidores con el nombre del producto **y** con el nombre en Dropi; `unirCoincidencias`, con prueba. Antes 34 de los 175 productos nuestros sin competencia en su ficha eran solo porque su nombre no calzaba con el de su fila en Dropi): `obtenerCompetenciaProducto(skuId)` (`src/lib/competencia/actions.ts`,
  basta Producto, Compras o Análisis) busca el producto por nombre y foto con `todasLasCoincidencias` (cruces.ts) entre todo
  el catálogo guardado y suma los iguales a nuestro producto de ECOMFIVE (el «SKU» de Dropi es el nombre, no nuestro código);
  `BloqueCompetencia` / `CompetenciaDesplegable` (`src/components/competencia/piezas-competencia.tsx`, con `FotoAmpliable` y
  `HistorialCompetencia`). **Competidor nuevo** = `PendientesHoy.competidoresNuevos` (alertas `competidor_nuevo` sin ver): sale
  en la cola de Hoy, en Avisos y como contador de `/analisis-competencia`.
- **Ventas Dropi: la utilidad** (22 oct 2026, migración 0130). `dropi_ventas_dinero` guarda por producto de Dropi y día (fecha de la
  orden) las entregadas, unidades, ganancia, comisión B280, coste real y descuentos por garantía, con `utilidad` **generada** (ganancia −
  comisión − coste − descuentos: las reglas de la hoja RESUMEN del Excel «ECOMFIVE DROPI 2026 DIARIO» de la oficina; los fletes los paga
  el dropshipper y no entran). Lo carga `scripts/importar-dinero-ventas-dropi.ts "<Excel>" [--aplicar]` (hojas ÓRDENES y COSTOS; cada carga
  reemplaza la anterior de Panamá y deja una fila en `dropi_ventas_dinero_cargas`); el informe comprueba que lo repartido suma lo mismo que
  el Excel. Una orden de varios productos («7854 | 7652») se reparte con `dineroPorDia` (`src/lib/publicaciones/dinero.ts`, con prueba):
  ganancia, comisión y descuentos por precio de proveedor de la publicación × unidades; coste por el costo unitario del mes de COSTOS ×
  unidades. La página (`ventas-dropi/page.tsx`) lo junta sin la migración (sigue solo con unidades): indicadores «Utilidad» y «Margen» del
  último mes completo, tarjeta «Utilidad por mes» y columnas «Utilidad»/«Margen» de cada producto, con su utilidad por mes en el detalle.
- **Pantalla «Hoy»** (`/`, antes «Dashboard operativo»; el módulo de permisos sigue siendo `dashboard`). Arriba, en dos
  tarjetas lado a lado (apiladas en pantallas angostas): **«Necesita tu atención»** (`ColaAtencion`), la cola de trabajo
  con lo que cuenta `obtenerPendientesHoy` (pedidos de Dropi en Novedad, plataformas sin saldo de wallet, retiros de
  Dropi sin vincular, alertas de inventario y lotes vencidos o por vencer), lo pendiente primero y lo que está al día abajo con su marca verde
  (`armarCola`, `src/lib/hoy.ts`: cada fila lleva el módulo que hay que poder abrir y a dónde se resuelve); y
  **«Producto en test»** (`TarjetaProductoTest`), lo testeado en el período elegido según «Fecha Test»
  (`obtenerResumenTest`, hasta 1 000 filas, solo con el módulo `productos-test`). Debajo siguen el selector de
  período y las tarjetas con sus gráficas de siempre (`DashboardSecciones`). Para sumar un pendiente a la cola,
  agrégalo a `PENDIENTES` en `src/lib/hoy.ts`.
- **Barra de arriba y buscador con Ctrl K.** `NavBar` (`src/components/nav.tsx`) lleva a la izquierda el
  buscador y a la derecha: el contexto «Panamá · Dropi» (`SelectorContexto`: el país se cambia ahí; la
  plataforma solo se muestra, porque Dropi es la única con datos), «Crear» (`MenuCrear`), la campana del Centro de
  notificaciones con lo pendiente (`CampanaPendientes`, usa la misma promesa del menú lateral) y el menú de la
  persona (`MenuCuenta`: tema, atajos, configuración, salir y versión). Los menús desplegables nuevos usan
  `MenuDesplegable` (`src/components/ui/menu-desplegable.tsx`: flechas, Escape, foco). El buscador
  (`src/components/busqueda-global.tsx`) es una **paleta de comandos**: un botón con forma de campo abre una ventana al
  centro con Ctrl K (⌘ K), con `/` o al pulsarlo. Sin escribir ofrece Recientes (`paleta-recientes-v1`, en el
  navegador de cada persona), Acciones (las de `ACCIONES_CREAR`, solo de módulos que puede abrir y modificar) e «Ir
  a»; al escribir filtra acciones y páginas al instante y pide al servidor retiros (por correlativo: `#0007` o `7`),
  pedidos, productos, **productos en test** y dropshippers (`src/lib/busqueda-global.ts`, que respeta los módulos
  de la persona). Productos Test y el directorio del CRM abren ya filtrados con `?buscar=` (la página pasa
  `buscarInicial` y un `key` para que se vuelva a montar). La lista de páginas sale del menú y de las pestañas de
  cada módulo (`paginasBuscables`, `src/lib/paleta.ts`): una página nueva del menú se puede buscar sola; una acción
  nueva se agrega a `ACCIONES_CREAR`; un resultado nuevo del servidor se agrega en `buscarGlobal`. La paleta es un
  `role="dialog"` modal, así que los atajos de una tecla no actúan mientras está abierta.
- **Flujo Etapa / Estado / Consolidación de un retiro (manda sobre lo que sigue).** La
  barra de pasos de arriba de la ficha se llama **«Etapa»**; el **Estado** es la insignia
  (Abierto / Novedad / Cerrado) y la **Consolidación** es el dato (Pendiente / Novedad
  resuelta / Consolidado). Mapa: crear → Creado, Abierto, Pendiente · Dropi aprueba →
  Aprobado, Abierto, Pendiente · Dropi cancela o rechaza (o el botón manual «Cancelar»,
  que se comporta igual y guarda `estado_dropi = 'cancelado'`) → etapa Cancelado/Rechazado y
  el sistema abre solo una novedad («Novedad: Dropi reportó…» en el historial), Estado
  Novedad, Pendiente · Conciliar (soporte, ID/referencia, **fecha de recibido** y **fecha de
  consolidación**, esta arranca en hoy y se edita; `fecha_cierre`) → etapa Recibido y
  Consolidado con sus fechas, Cerrado, Consolidado · Novedad manual → la etapa no se mueve,
  Novedad, Pendiente · «Resolver» novedad (pide fecha de recibido y de consolidación,
  editables) → etapa Recibido + Consolidado, Estado **Cerrado**, Consolidación «Novedad
  resuelta». Ya no hay estado propio `novedad_resuelta`: se guarda con la bandera
  `retiros.novedad_resuelta` (migración 0048, que además convierte las filas viejas); sin
  correrla, el código cae al estado antiguo y todo se sigue leyendo igual
  (`estadoConsolidacion`, `resuelta()`). Los retiros que ya tenían `estado = 'cancelado'`
  lo conservan. Donde más abajo diga que «Resolver» deja el estado `novedad_resuelta`, léase
  Cerrado + bandera.
- **Ficha de un retiro.** Un clic en su `#` abre un panel a la derecha
  (`<Ventana lado="derecha" ancho="lg">`, `retiros/vista-rapida-retiro.tsx`) con su barra
  de pasos (`BarraPasos`; no es lo mismo que `estado`, que se ve aparte en la insignia del
  título): **siempre son los mismos cuatro pasos**, cada uno con su fecha debajo, igual que
  Creado (nunca solo la etiqueta sin fecha) — no se agregan ni se quitan pasos según lo que
  le pasó al retiro:
  1. **Creado**, con `fecha`.
  2. La decisión de Dropi: **Aprobado**, **Rechazado** o **Cancelado** — el único paso que
     cambia, según `estado_dropi` (`fecha_aprobado`/`fecha_rechazo`/`fecha_cancelado_dropi`,
     migraciones 0044-0046). Mientras Dropi no decide, este paso queda «En espera», sin
     fecha. Ninguno de los tres detiene los pasos siguientes — ni Rechazado ni Cancelado
     paran el conteo: los cuatro pasos se ven siempre, así el retiro haya sido rechazado o
     cancelado por Dropi.
  3. **Recibido**, cuando llega el dinero.
  4. **Consolidado**, con la fecha de `conciliarRetiro`.
  **Novedad y Novedad resuelta no son pasos de esta barra**: se ven en el dato
  «Consolidación» de la ficha (`estadoConsolidacion()`, `src/lib/retiros/estados.ts`), que
  tiene tres estados — «Pendiente» (al crear), «Novedad resuelta» (al resolver una novedad
  con el botón «Resolver» — `resolverNovedadRetiro` deja `consolidado = true` por dentro,
  pero el dato sigue diciendo «Novedad resuelta», no «Consolidado», mientras `estado` sea
  `novedad_resuelta`) y «Consolidado» (al conciliar por el camino normal, sin pasar por una
  novedad). "Cancelado" del segundo paso es el estado que reporta **Dropi**
  (`mapearEstadoDropi`, antes se unía con "Rechazado" — ver `src/lib/dropi/emparejar-retiros.ts`);
  no tiene relación con la cancelación manual del equipo (`cancelarRetiro`, botón
  «Cancelar»), que sigue siendo su propia acción y se ve en la insignia del título, no en
  este paso.
  Los círculos son chicos (`h-3.5 w-3.5`, borde fino) unidos por **una línea continua de
  1 px** (`bg-success` en el tramo ya completo, `bg-border` en el resto, como un rastreo de
  envíos): nada de círculos grandes ni línea gruesa. Un retiro que ya pasó por
  Aprobado/Rechazado/Cancelado **antes** de que existieran esas columnas (migraciones
  0044-0046) se queda con «—» en ese paso — nada las rellena solo.
  `scripts/backfill-fechas-retiros.ts` las rellena una vez, sacando la fecha del evento
  correspondiente que ya estaba en `retiro_eventos` (sin `--aplicar` solo dice qué
  encontraría).
  **La ficha ya es el formulario**
  (`retiros/formulario-editar-retiro.tsx`, sin un botón "Modificar" aparte, mismo patrón
  que la ficha de cuenta destino): se cambia un campo y arriba, junto a los botones
  grandes de Conciliar, Novedad (solo en un retiro abierto), Ver novedad (solo en
  novedad), Cancelar y Eliminar, aparecen "Guardar cambios" y "Cancelar" — que solo se ven
  con cambios sin guardar. Guardar no cierra la ficha. El selector de Estado (`ESTADO_TONO`
  y `ESTADO_ETIQUETA`, centralizados en `src/lib/retiros/estados.ts` para no duplicarlos
  entre la tabla, la ficha y `retiros/[id]/`) siempre muestra el valor real aunque no esté
  en `ESTADOS_EDITABLES` (una opción extra se agrega al vuelo en el `<select>`, ver
  `formulario-editar-retiro.tsx`): sin eso, un valor fuera de la lista revertía en
  silencio a «Abierto» al guardar cualquier otro campo. **Un retiro cancelado o con la
  novedad ya resuelta no ofrecen «Conciliar»** (ni en la ficha ni, como respaldo, en el
  propio `conciliarRetiro`, que devuelve `{ error }` si igual se invoca): su ciclo ya
  terminó. **«Conciliar», «Novedad» y «Ver novedad» no
  abren una ventana en el medio**: despliegan una sección al final de la misma ficha,
  **encima del historial** (`SeccionConciliarRetiro`, `SeccionNovedadRetiro`,
  `SeccionResolverNovedad`; solo una a la vez), la ficha
  baja hasta ella (`irAlPanel`, sin movimiento suave si se pidió menos animación) y el foco
  entra en su primer campo. Conciliar pide **Recibido** e **ID / Referencia**, ambos
  obligatorios (Recibido: si se aleja de «A recibir» más de lo tolerado, `conciliarRetiro`
  no concilia y lo dice). El **soporte** es **opcional**: se adjunta con un botón que es
  **solo un ícono**, sin texto (`BotonAdjuntar` con `AdjuntoIcon`; ya con archivo se marca
  en verde y su nombre queda en el tooltip), pero no bloquea conciliar si no se adjunta uno
  — ni en la ficha ni en el servidor (`conciliarRetiro`). Al conciliar, deja el retiro
  cerrado y consolidado y **la fecha de recibido la pone el sistema** (`fecha_cierre` = hoy;
  no hay un campo de fecha aparte que llenar a mano); además de la línea «Retiro conciliado:
  …» del historial, se registra una línea aparte «Consolidado» (mismo patrón que
  `resolverNovedadRetiro` más abajo), porque la Consolidación es su propio hecho, no un dato
  suelto dentro de otro texto. **Novedad no exige texto**: se crea rápido, sin nota
  (`agregarNovedadRetiro` acepta la nota vacía), el retiro pasa a «novedad» y aparece «Ver
  novedad» en su lugar; sella `fecha_novedad` (migración 0045, con plan B si no se ha
  corrido — la misma columna que sella `scripts/dropi-ingerir-retiros.ts` cuando la novedad
  la generó un rechazo de Dropi en vez de una persona), aunque hoy solo quede guardada para
  el historial: no hay un paso «Novedad» en la barra de pasos (siempre son los mismos
  cuatro, ver `BarraPasos`). **«Ver novedad» lleva a la nota, editable ahí
  mismo** (`SeccionResolverNovedad`, que la saca del historial con `novedadVigente`,
  `src/lib/retiros/novedad.ts`: la nota más reciente que no esté ya resuelta ni sustituida
  por un estado puesto a mano; sin nota lo dice), con un botón «Guardar nota»
  (`actualizarNovedadRetiro`, que deja otra línea «Novedad: …» en el historial y en la
  auditoría) y el botón **«Resolver»**, que es lo único que la quita
  (`resolverNovedadRetiro`). **A diferencia de antes, el retiro no vuelve a «abierto»**:
  pasa al estado aparte **`novedad_resuelta`** («Novedad resuelta», tono ámbar) y **queda
  consolidado** (como al conciliar): ya no tiene más pasos pendientes, así que su
  Consolidación no se queda en «Pendiente» para siempre. `resolverNovedadRetiro` sella
  `fecha_cierre` (la misma columna que usan `conciliarRetiro` y `cancelarRetiro` para
  «cuándo se cerró la historia de este retiro») y registra **dos** líneas en el historial
  — «Novedad resuelta: …» y, aparte, «Consolidado» — para que ambos hechos se vean con su
  propia fecha; en la ficha se ve como el dato «Consolidación» pasando a «Novedad resuelta»
  (`estadoConsolidacion()`), no como un paso en la barra. No sigue el flujo normal de
  conciliación y por eso queda oculto por defecto junto con «Cerrado» detrás del
  interruptor «Cerrados» (`retiros/filtros.ts`, `exclusivo: true` como Cuentas destino:
  el botón aísla, nunca mezcla cerrados con abiertos). El estado `novedad_resuelta` lo
  exige el `check` de la columna `estado` en la base: **la migración 0043 es
  obligatoria** — sin correrla, «Resolver» falla con el error crudo de Postgres. Las
  secciones de
  Conciliar y Novedad usan el botón grande de `BotonCrear` y
  `useFaltantes` (apagado hasta llenar lo obligatorio; pulsarlo así lleva al dato que
  falta), y al terminar suben `versionHistorial` para que el historial se vuelva a pedir.
  El selector de Estado se ve siempre, hasta en un retiro cancelado o con novedad resuelta:
  es la forma de corregirlo a mano. Sin pestañas: los campos y los datos que no se editan
  (Recibido, Cierre, Creado por —quien creó el retiro, no se reasigna—, Consolidación,
  Estado en Dropi, Soporte) van seguidos, y **el historial de actividad (`HistorialGenerico`,
  con `obtener={obtenerActividadRetiro}`) es siempre lo último de la ficha**, debajo de
  Conciliar o Novedad cuando están desplegadas; por eso no vive dentro del formulario.
  **No le pongas `key` a `HistorialGenerico`** en la ficha: con una `key={fila.id}` al
  conciliar o agregar una novedad la sección se quedaba en «Conciliando…» y no se cerraba
  (el estado pendiente de la acción no terminaba). Con cambios sin guardar, cerrar la ficha
  pide confirmación.
  **La tabla no tiene columna de acciones**: lo que se hace con un retiro se hace desde
  su ficha. Ctrl/Cmd/Shift-clic o
  clic central en el `#` abren la página completa (`retiros/[id]/`) en una pestaña nueva,
  como cualquier enlace. Lo que muestra la ficha sale de la fila ya cargada (se busca por
  id, así que si la fila cambia el panel se actualiza); solo la actividad se pide al
  abrir, con la acción de lectura `obtenerActividadRetiro` (`retiros/actividad.ts`: basta
  poder abrir Retiros, devuelve el error como valor, trae los 30 eventos más recientes).
- **Atajos de teclado y ventanas.** `AtajosTeclado` (`src/components/atajos-teclado.tsx`,
  en la barra de arriba) da atajos de una tecla al estilo ClickUp: `g` y luego una
  letra va a una página (solo las que la persona puede abrir; la lista y las letras
  están en `src/lib/atajos.ts`), `/` abre el buscador y `?` lista los atajos. **Nunca
  actúan mientras se escribe en un campo ni con una ventana abierta**, y se pueden
  apagar en la propia ayuda (`atajos-teclado-v1`; WCAG 2.1.4): apagados, `?` y Ctrl K
  siguen. Una página nueva del menú no gana atajo sola: agrégale su letra en
  `ATAJOS_IR` (y una prueba de que no choca). Para una ventana modal nueva usa
  `<Ventana>` (`src/components/ui/ventana.tsx`, al centro o como panel a la derecha):
  `role="dialog"`, foco atrapado, Escape y clic fuera la cierran y el foco vuelve a
  donde estaba (el foco entra en el campo con `data-enfocar`, o en el primero).
  Un panel a la derecha (`lado="derecha"`) sale con una animación corta
  (`animate-entrar-derecha`, sin movimiento si la persona pide menos animación).
  **Cómo se abre una ficha** (22 oct 2026, como las vistas de una tarea de ClickUp): una `Ventana` que es **ficha** —un panel a la derecha o la grande
  `ancho="xl"` al centro, `esFicha` en `src/lib/ficha/modo.ts`, con prueba— se abre en el modo que cada persona eligió: **barra lateral**, **cuadro de
  diálogo** al centro o **pantalla completa** (`lateral` / `centro` / `completa`). El botón de la cabecera (`SelectorModoFicha`,
  `src/components/ui/selector-modo-ficha.tsx`: el ícono «Cambiar diseño» de ClickUp; **las tres miniaturas se despliegan al pasar el cursor** —o con clic, Enter o flecha abajo— y **se repliegan al elegir una o al sacar el cursor**, quedando solo el ícono; no usa `MenuDesplegable` ni `Tooltip`) lo cambia y la elección vale para **todas las fichas** (almacén
  `modo-ficha-v1` en el navegador, `useModoFicha`; sin base de datos, así que no viaja a otro equipo). Mientras no elija, cada ficha se abre como siempre
  (`modoPorDefecto`: el panel a la derecha → lateral; la de Producto → centro). Un diálogo pequeño (atajos, copiar permisos) no es ficha y no cambia. En los tres
  modos el panel se desplaza por dentro; a pantalla completa el contenido se centra con un ancho cómodo. **Una ficha nueva** solo usa `<Ventana lado="derecha">`:
  lo trae solo. Si su contenido pone columnas, que dependan del ancho de la ficha (`@container` + `@3xl:`) y no de la pantalla (`lg:`), como la de Producto.
  **Las fichas de una cuenta destino** son ese panel y sirven de modelo para otra
  ficha lateral. Toda la fila de la tabla se pulsa (`abrirFila` de `TablaDatos`:
  un clic en un botón, enlace o campo de la fila, como el interruptor de estado, no
  la abre; el contenido de la primera columna es además un botón real, para teclado
  y lectores de pantalla, y el clic en la fila le pasa el foco para que al cerrar
  vuelva ahí). Se abre `FichaCuenta` (`retiros/cuentas/ficha-cuenta.tsx`): cabecera
  con el título («Cuenta #3») y sus insignias de tipo y estado (Activa o Eliminada),
  las flechas de cuenta anterior y siguiente (en el orden en que se ven las filas;
  `Ventana` recibe esos botones en `navegacion`) y cerrar; y el país con la comisión (la
  ficha **no lleva línea de tiempo**: se quitó a pedido). **Con permiso de
  escritura la ficha ya es el formulario** (`FormularioCuenta` con `botonesArriba`: no
  hay un botón «Modificar» ni botones abajo): una fila de botones (`BotonAccion`: del
  mismo tamaño, rellenos de color, ícono arriba y texto abajo) tiene «Eliminar» (gris y
  apagado si ya está eliminada) y, **solo cuando se cambia un campo**, «Guardar cambios»
  y «Cancelar» (que descarta lo escrito), pegada bajo la cabecera al desplazarse (`Ventana`
  publica el alto de la cabecera como `--alto-cabecera`); luego los datos en bloques con
  ícono (`Seccion`, `src/components/ui/seccion-ficha.tsx`: Cuenta, Datos de la cuenta si es Binance, Comisión sugerida). Guardar
  no cierra la ficha: los botones vuelven a ser solo «Eliminar» y sale un aviso. Con
  cambios sin guardar, cerrar (X, Escape, clic fuera) o pasar a otra cuenta con las
  flechas pide confirmación; el formulario lleva `key` con el id de la cuenta para que al
  pasar a otra arranque con sus datos. Sin permiso de escritura solo se leen los datos
  (`DatosDeLaCuenta`, sin acciones). La ficha lee la cuenta de la lista por su id, así
  que se actualiza sola; «Eliminar» solo desactiva la cuenta (la ficha queda abierta con
  el estado nuevo, aunque la fila salga de la tabla por el filtro «Eliminadas»);
  reactivarla se hace con el interruptor de la columna Estado. **No pongas íconos de acción
  en las filas** (la tabla no tiene columna de acciones): lo que se hace con una
  cuenta se hace desde su ficha. «Nueva cuenta destino» (`ventana-cuenta-retiro.tsx`,
  el botón Agregar) usa el mismo `FormularioCuenta`. **Los formularios de creación**
  (la ficha de «Nuevo retiro», `retiros/crear-retiro-panel.tsx`, y «Nueva cuenta
  destino»; los demás módulos usan `FichaCrear`, ver «Botón «Agregar» y fichas de
  crear») son un panel lateral (`Ventana`) con bloques (`Seccion`) y siguen esta
  receta: (1) los campos vacíos llevan un **ejemplo ficticio** del formato del dato
  (`placeholder="Ej: 1500.00"`; nunca datos de una cuenta real); (2) al final va **un botón
  grande de crear** (`BotonCrear`, `src/components/ui/boton-crear.tsx`) que se ve
  apagado mientras falte un dato obligatorio y **no envía el formulario**, pero al
  pulsarlo lleva la página al primer dato que falta (lo centra, le da el foco, borde
  rojo y «Falta este dato» debajo, con `AvisoFaltante`); es `aria-disabled` y no
  `disabled` para poder recibir ese clic. Todo eso lo da `useFaltantes()`
  (`src/components/ui/usar-faltantes.ts`): `formRef`, `completo`, `faltante`,
  `revisar` (en `onInput` y `onChange`) y `señalarFaltante`; cada campo obligatorio
  necesita `id`, `required` y `aria-invalid={faltante === id || undefined}`
  (`fieldClass` pinta el borde). Lo obligatorio hoy: en «Nuevo retiro», la cuenta destino
  (**sin ninguna preelegida**: hay que escoger una), el monto (**mayor a cero**, `min="0.01"`)
  y la comisión (hay que escribirla, aunque sea 0; arranca vacía y solo la rellena la
  comisión sugerida de la cuenta que se elija); `crearRetiro` lo vuelve a comprobar en el
  servidor. Al guardar, `crearRetiro` manda de vuelta a `/retiros` (la lista), **no** a la
  ficha del retiro recién creado; si otra persona ocupó primero el número que se vio al
  abrir la ficha, llega como `?correlativo_cambio=X&correlativo_final=Y` y `CrearRetiroPanel`
  lo avisa con un `mostrarToast` (tono `info`) y limpia la dirección. En «Nueva cuenta
  destino», el nombre, el tipo, la cuenta (o, si es Binance, el
  tipo de identificación, el número de identificación y el número de cuenta); la cuenta y
  el número de identificación solo se exigen **al crear**, para no bloquear la
  modificación de una cuenta guardada antes sin ese dato. (Ya no queda ninguna ventana de
  Retiros con su propia copia de la lógica de `Ventana`: crear, editar y conciliar son
  el panel lateral o una sección de él.)
  **Toda ventana modal o globo flotante se dibuja en `<body>` con `createPortal`**
  (`Ventana`, `AyudaContextual`, `Tooltip`, y las ventanas de Retiros y Cuentas): un
  `position: fixed` dentro de la tabla queda atrapado en el contexto de apilamiento
  de la celda (`sticky ... z-10`) y la barra de herramientas fija (`z-20`) y el
  encabezado (`z-15`) se ven **por encima** de la ventana; y un globo `absolute`
  dentro de una tarjeta con `overflow-hidden` se recorta. Escala de capas: filas
  `z-10`, encabezado de tabla `z-15`, barra de herramientas `z-20`, menús desplegables
  de la barra `z-20`/`z-30`, ventanas modales `z-40`, avisos y tooltips `z-50`. Un
  error al eliminar una fila **no** va en una caja pegada a la celda (tapa las filas de
  abajo): va como aviso (`useToast`, `mensajeErrorAlEliminar`).
- **Menú lateral: riel de áreas + panel, con tres frentes** (modelado sobre el de Mi Reto Digital para que su importación futura
  encaje). El riel (`src/components/sidebar.tsx`) lleva **Desempeño, Favoritos, Marketing, Clientes, Investigación, Operación, Finanzas y Equipo** y, abajo,
  **Avisos** (con el contador de pendientes; es el Centro de notificaciones), **Ajustes** y el botón que oculta el panel. Al lado,
  el panel muestra solo el área elegida (su título puede ser más descriptivo: «Marketing y ventas», «Operaciones», «Recursos
  humanos», campo `panel`) o, si se pulsa **Favoritos**, los accesos rápidos de la persona (la estrella `FavoritoToggle` de cada
  página). **Cada área se reparte en tres frentes** (`FRENTES`, `src/lib/nav-data.ts`): **Proveeduría** (lo de Ecomfive hoy),
  **Gestión de tienda** (Mi Reto Digital, cuando se importe) y **Fulfillment**; un frente sin páginas dice «Próximamente»
  (`PaginasDeArea`). Una página lleva su `frente` en `AREAS`; sin frente queda **afuera de los tres** y va arriba (hoy solo
  Usuarios y roles). **Bodegas, Ubicaciones, Inventario, Alertas de inventario, Compras y Producto
  son del frente Fulfillment** (las fichas de producto de Shopify y de Dropi ya **no están en el menú**: se llega desde Producto, y siguen
  registradas en un área oculta «Fichas de canal» para migas, buscador y favoritos) (en Operación, no en Marketing): el producto entra por el WMS y sale por Proveeduría
  (dropshippers) o por Fulfillment hacia tiendas, de un tercero a quien solo se le presta el servicio (Clicksy) o propias
  (Kenku, Nuvo, Wao Ofertas y Ofertfy); Compras también es de Fulfillment (el fulfillment se gestiona desde el WMS) y ya no tiene pestaña de Filtros; solo Pedidos Dropi sigue en Proveeduría. En un negocio de dropshipping el
  catálogo sí sería parte de vender, aquí no. Marketing tiene Productos Test y **Filtro de productos** (`/filtro-productos`, módulo `filtro-productos`; antes era la
  pestaña «Filtros» de Compras y `/compras/filtros` redirige aquí); **Clientes** tiene el CRM de dropshippers e
  **Investigación** la Inteligencia competitiva. `AREAS` sigue siendo una lista plana de páginas por área (migas, buscador,
  contadores y `encontrarSeccionActiva` no cambian); un área con `oculta: true` (Avisos) no tiene botón en el riel pero cuenta
  para migas, buscador y fijados. **Una página nueva del menú se agrega a su área y frente en `AREAS`** (con una prueba en
  `nav-data.test.ts` si cambia el reparto). Al pulsar un área solo cambia el panel; al navegar, el panel pasa al área de la
  página nueva. El panel se oculta con el botón de abajo del riel o **solo, con un clic fuera del menú**; se guarda en el
  navegador (`sidebar-panel-v1`). En móvil, un cajón lista las áreas con sus frentes una debajo de la otra. Una página con
  `dropi: true` solo sale si Dropi tiene datos en el país (`construirAreas`). **Contadores:** Alertas, Pedidos Dropi y Conciliación
  de Retiros muestran una pastilla con cuántos hay, **Avisos** muestra el total, y cada área del riel muestra lo que suman
  sus páginas (`calcularPendientesMenu`, `src/lib/contadores-menu.ts`). **El layout no espera la consulta**: crea la promesa y el
  menú y la campana la leen con `use()` dentro de un `Suspense`. Las rutas de Mi Reto Digital chocan con algunas nuestras
  (`/alertas`, `/productos`, `/finanzas`): al importarlas, montarlas bajo un prefijo (`/tienda/...`). La cuenta de la persona
  (foto, tema, atajos, versión y salir) vive en `MenuCuenta`, en la barra de arriba.
- **Inventario por cubetas** (`/inventario`, módulo `inventario`, migración 0069; fase B de `WMS-REFERENCIA.md`). El stock vive
  en `wms_stock` (una fila por **SKU maestro y bodega**, creada con el primer movimiento): `fisico`, `reservado`, `danado`,
  `inspeccion`, `retenido`, `en_camino` y `disponible`, que es una **columna generada** (físico menos reservado, dañado,
  en inspección y retenido). `wms_stock_ubicacion` lo reparte por ubicación (la propiedad del bin decide la cubeta extra) y
  `wms_movimientos` es el **libro que no se edita ni se borra** (un disparador lo impide; las cubetas se pueden reconstruir
  sumando sus `cambios`). Todo cambio de cantidad pasa por **una función SQL atómica** (`wms_registrar_movimiento`: entrada,
  salida, ajuste, reserva, liberación; `wms_trasladar`: entre ubicaciones) con `UPDATE ... SET x = x + n`, así que dos
  personas a la vez no se pisan (probado con 60 entradas simultáneas). **Nace vacío y un saldo puede ser negativo** (decisión
  de Hernán): primero los módulos, luego las conexiones; una salida que llega antes que su entrada se registra y se corrige
  con una entrada o un ajuste (el negativo se ve en rojo). **Una bodega externa (Dropi, Effi, Boxful, Dunamixfy) solo acepta
  movimientos de una sincronización** (`origen` `sync_dropi` / `sync_shopify`): a mano se rechaza. Un **combo no guarda stock**:
  `wms_stock_resumen` lo calcula de sus componentes. La página lista todos los SKU (también en cero) con filtro por bodega; la
  ficha de un SKU (`FichaStock`) muestra su stock por bodega, los últimos movimientos y los botones Entrada, Salida y Ajuste
  (`registrarMovimientoStock`, que devuelve `{ error }` como valor). El pistoleo anterior (carga por CSV) quedó en
  `/inventario/pistoleo`.
  **Lotes y vencimiento** (migración 0073): el producto marca «maneja vencimiento» (+ días de aviso, 90 por defecto desde el 13 oct 2026: `DIAS_AVISO_PREDETERMINADO`, `src/lib/wms/vencimiento.ts`, se guarda en el producto al activarlo; las funciones SQL aún caen a 60 si el dato está vacío) en su ficha; no
  aplica a compuestos y solo se activa sin stock físico (se desactiva sin lotes con unidades). Su stock se reparte por lote
  (`wms_lotes`, `wms_stock_lote`, por bodega): la entrada exige lote y fecha (un lote existente exige la misma fecha), el ajuste exige
  lote y la salida sin lote sale por **FEFO** (primero el que vence antes, un movimiento por lote) y **nunca toma un lote vencido**.
  Un lote vencido no cuenta como disponible (`disponible` = generado − vencido) y se da de baja con una salida que lo nombre. La reserva
  no necesita lote; el despacho (`wms_aplicar_venta`) sí consume lotes vigentes. Las ubicaciones aún no son por lote. La pestaña
  **Vencimientos** (`/inventario/vencimientos`, `wms_vigilancia_vencimientos`) lista vencidos y por vencer. La fecha de «hoy» es la de
  America/Panama (`wms_hoy()`).
- **Compras › Dashboard** (`/compras/dashboard`, `dashboard-compras.tsx`): toda la operación a la vez con **filtros que se
  cruzan** (fechas de creación, país, proveedor, vía, tienda, responsable, etapa, solo abiertas): pulsar un mes de la gráfica,
  una etapa o una fila de «Comparar por» pone ese filtro y lo vuelve a quitar; los filtros activos se ven como chips.
  Indicadores (compras, pagado y costo por unidad, unidades, ciclo, tránsito mar/aire, % a tiempo, atrasadas, fallas),
  compras y pagos por mes, abiertas por etapa, días de tránsito por mes de llegada, histograma de tránsito, tiempo por tramo,
  dónde se quedan más tiempo (historial de estados y etapas), comparación y lo que está fallando. Gráficas con recharts;
  cálculos en `calculos-compras.ts` (`serieMensual`, `transitoMensual`, `histogramaTransito`, `aTiempo`). «A tiempo» usa el
  mismo umbral que «atrasada», calculado con todas las compras de la vista y no solo con las filtradas.
- **Compras: Informe, lista y tiempos, como Productos Test.** **Informe** (`/compras/informe`, `informe-compras.tsx`; `/compras` abre directo la pestaña Compras, `/compras/lista`, desde el 8 oct 2026): por día, semana o mes
  (pulsar una barra elige el periodo), lo creado/pagado/enviado/llegado del periodo, «Hoy» (abiertas, en tránsito, atrasadas,
  con inconveniente: cada tarjeta lleva a la lista filtrada), abiertas por etapa, tránsito por vía de envío y
  «Para revisar»; «Copiar informe». **Campos que ya no existen** (migración 0083, 9 oct 2026): Cliente, Track ID, Orden, Pago
  Pendiente, Cobrado Cliente, Pendiente Cliente, Pago Cliente y Cuenta receptora se quitaron de la tabla, la ficha y la base;
  el dato de cada compra pasó a un comentario con su título («Track ID: …») para poder buscarlo en la Actividad. No los
  vuelvas a poner como campo ni como indicador (el «pago pendiente» del Informe y del Dashboard se quitó con ellos); la
  fecha «Cerrada» sí sigue, porque la pone el sistema y de ella salen el ciclo y los tiempos. **Compras** (`/compras/lista`, `tabla-compras.tsx`): una sola vista, la `TablaDatos`
  con aspecto de lista (**lo que se archiva —«Cerrados», oculto por defecto— lo decide el Estado: solo `estado = completado`;
  la etapa «Completado» no archiva**, porque el producto puede haber llegado y la compra seguir «En Gestión»; los tiempos y lo
  atrasado siguen por etapa) (agrupar —arranca por Etapa; el título de cada grupo lleva el color de su etapa, estado o etiqueta, como
  en ClickUp: `etiquetaGrupo` de `TablaDatos`—, filtros, columnas, Cerrados, descarga), 8 columnas a la vista y el resto
  de los campos de ClickUp ocultos (`oculta` en la columna) hasta mostrarlos en «Columnas»; filtros de un toque (Cotizando,
  Producción, En tránsito, Atrasadas; `?grupo=` y `?etapa=` los preseleccionan). **Pulsar la descripción de
  la compra (la columna «Orden de compra», y solo esa; las etiquetas van dentro de ella, ya no hay columna «Etiquetas») abre directo la ficha completa con la actividad; el resto de las celdas se editan en su sitio** (ver abajo). Ya no hay ficha de resumen a la derecha (13 oct 2026: se quitó `ficha-lateral-compra.tsx`; en Windows obligaba a pulsar además «Abrir ficha completa»).
  **Edición en la celda** (`celda-editable.tsx`, qué se edita y cómo se valida en `def-edicion-compras.ts`): un clic en el
  dato abre bajo la celda **el mismo panel para todas las columnas** (`PanelCelda`, `panel-celda.tsx`, como los de ClickUp):
  lista de opciones con sus colores, buscador, flechas y Enter (etapa, estado, Sí/No; la vía de envío es una sola, `unica`, aunque se guarde como lista y la marca
  varias), un campo limpio (texto y montos) o la fecha con atajos (Hoy, Mañana, En una semana, Quitar). Las opciones guardan
  al elegir; lo escrito, con Enter o al pulsar fuera, y Escape lo deja como estaba. Las etiquetas usan su propio selector
  (`selector-etiquetas.tsx`, en el mismo panel); su botón va junto al nombre de la compra con `abrirFila.junto`, fuera del
  botón que abre la compra (un botón dentro de otro rompe la hidratación). Guarda **un solo dato** con
  `actualizarCampoCompra` (no la compra entera, que es lo que hace la ficha), que valida otra vez en el servidor con las mismas
  reglas (`normalizarValor`), sella o quita `cerrado_en` y anota el evento si cambia la etapa o el estado, y deja una línea en
  la auditoría. El cambio se ve al instante (`cambios` en `TablaCompras`, por encima de las filas del servidor); si el
  servidor lo rechaza vuelve a como estaba y sale un aviso. **No llama a `revalidatePath`**: rearmar toda la página por cada
  celda la haría lenta. No se editan en la celda: N.º OC, código, creada, cerrada, días, valor unitario (los pone el sistema o
  son fórmulas), país, foto, responsable, ni la QTY y el monto de una compra con productos (se calculan de ellos), igual que
  en la ficha. Sin permiso de escritura las celdas son solo texto. Para sumar un dato editable: agrégalo a `CAMPOS_EDITABLES`
  y envuelve su celda con `ed(c, "<id>", …)` en `tabla-compras.tsx`.
  **Cambiar varias compras a la vez** (como las acciones en lote de ClickUp, para armar un envío: etiqueta, fecha límite,
  planificación…): con permiso de escritura la tabla trae una casilla por fila y una en el encabezado (marca las que se ven;
  `seleccion` de `TablaDatos`, genérico: cuenta solo lo que está en pantalla, como Retiros; **al agrupar, cada grupo trae su
  propia casilla en el encabezado** —`casilla` de `EncabezadoGrupo`, también en Retiros— que marca o desmarca todas las filas
  del grupo, se ve a medias si solo hay algunas y, si el grupo estaba contraído, lo abre al marcarlo). Al marcar alguna sale fija abajo
  `BarraLoteCompras` (`barra-lote-compras.tsx`): «N compras seleccionadas», un botón por dato (Etiquetas, Fecha límite,
  Fecha de Envío, Etapa, Estado, Vía de envío, Proveedor, Tienda y «Más» con el resto de `CAMPOS_EDITABLES`), descargar lo
  marcado y quitar la selección. Cada botón abre **el mismo panel de las celdas** (los editores de `celda-editable.tsx`, ahora
  exportados) sin valor de partida y lo elegido va a todas las marcadas; la selección queda para seguir con otro dato. Un texto
  o monto vacío no hace nada (no se borra un dato de varias compras sin querer), una fecha se quita con «Quitar fecha», la vía
  de envío marca varias y se guarda al cerrar el panel, y las etiquetas dicen si la tienen todas (✓), algunas (–) o ninguna:
  pulsar una la pone en todas o, si ya la tenían todas, la quita (`agregar` / `quitar` respetan las que cada compra ya tenía).
  Guarda `actualizarCampoComprasLote` (hasta 300 compras; valida con `normalizarValor`, una escritura por valor distinto, la
  fecha de cierre al cambiar la etapa, evento de etapa/estado, línea en la Actividad y auditoría por compra, «En lote (N
  compras)»; la QTY y el monto de una compra con productos no se tocan y se cuentan como omitidas). La lógica pura vive en
  `src/lib/compras/lote.ts` (con prueba). Se ve al instante y, si el servidor lo rechaza, vuelve a como estaba.
  **Planificación automática** (8 oct 2026, `src/lib/compras/planificacion.ts` con prueba): la Planificación («Nov26») **no se
  escribe** (no está en `CAMPOS_EDITABLES` ni en la barra de lote): es el mes de la fecha de envío + la mediana de días envío →
  llegada de los envíos de su país por su vía (`clave|via`; con menos de 3, la de todos los países; sin datos, 60 mar / 16 aire
  / 7 tierra; con varias vías, la más lenta). La calculan `crearCompra`, `actualizarCompra` (solo si cambió fecha de envío, vía,
  país o tipo), `actualizarCampoCompra` y el lote al cambiar fecha de envío o vía (devuelven `planificacion` y la lista la
  pinta). Sin fecha de envío: una compra que nunca la tuvo conserva la de ClickUp; si se le quita, queda vacía. La ficha la
  muestra con `PlanificacionAutomatica` (llegada estimada y de dónde salen los días). **Predicción de la fecha límite** (21 oct 2026): bajo el campo «Fecha límite» de la ficha, `PrediccionFechaLimite` (`prediccion-fecha-limite.tsx`) muestra la llegada más probable (la misma `estimarPlanificacion`: mediana del país por esa vía, o de todos los países, o lo típico), el **rango habitual** (cuartiles 25 a 75 de esos envíos, `Estimacion.rango`, null si solo hay lo típico) y «Usar como fecha límite», que escribe la fecha en el campo (setter nativo + evento `input`, para que se encienda «Guardar cambios»); **nunca la guarda ni la cambia sola**. La estimación se calcula una sola vez por formulario (`EstimacionEnvio`, `estimacion-envio.tsx`, un contexto que escucha país, vía, tipo y fecha de envío) y la comparten ella y la planificación. `scripts/recalcular-planificacion.ts`
  recalcula las abiertas con fecha de envío. **«Documentos» y «Producto relacionado» ya no existen** (migración 0090): los
  archivos del campo Documentos de ClickUp quedaron dentro de un comentario «Documentos (factura o soporte)».
  **Copiar cotización** (17 oct 2026, `copiar-cotizacion.tsx`): botón de la ficha que deja en el portapapeles una imagen PNG
  (dibujada en un canvas, colores fijos) con las métricas del test y la fila del sheet de cotizaciones, para pegar en
  WhatsApp. Los datos los arma `obtenerCotizacionCompra` (basta poder abrir Compras): las métricas salen del bloque
  «**Métricas (…)**» de la descripción con sus puntos 🔴🟡🟢 (`leerMetricasDescripcion`) o, si no está, del test del producto
  (solo con el módulo `productos-test`); la logística es la modalidad de la ruta del agente en `wms_rutas_envio` + la vía
  («DDP BY SEA», `textoLogistica`); nombre y foto, de los productos de la compra. Lógica pura en `src/lib/compras/cotizacion.ts`
  (con prueba). La copia empieza en el clic (`ClipboardItem` con promesa); si el navegador no deja, copia el texto.
  **Anular, no borrar** (migración 0096, 9 oct 2026): la ficha tiene «Anular» (pide motivo; `anularCompra`) en vez de
  «Eliminar». Anular pasa la compra a la etapa **Descartado** con Estado Completado (sella `cerrado_en`, deja los eventos) y la
  marca (`anulada_en`, `anulada_por`, `motivo_anulacion`; insignia «Anulada» en la lista y aviso con «Restaurar» en la ficha).
  Se ve con las descartadas (no va aparte) y cuenta como descartada en informe, dashboard y tiempos; queda fuera de la
  planificación, los envíos y el histórico de compras de los productos (filtran `anulada_en is null`). `restaurarCompra` vuelve a
  la etapa y el estado de antes (los del último paso a Descartado en `wms_compra_eventos`). `eliminarCompra` ya no se ofrece.
  **Venta de importación** (migración 0094, 8 oct 2026): «Importadora» ya no es una vista ni un país. Una venta de
  importación es una compra de país con `venta_importacion = true`: el campo «Tipo de venta» (Proveeduría / Venta de importación,
  `siNo` en `CAMPOS_EDITABLES`; radio en la compra nueva y la ficha, columna, filtro y celda). La vía de envío es una sola. Las 12 compras `tipo = 'importacion'` pasaron a México marcadas. El código
  aún entiende `tipo = 'importacion'` por si queda alguna, pero ya no se crean ni se ofrecen (ni en Países de la persona).
  **Envíos** (`/compras/envios`, pestaña después de Tiempos y fallas; migración 0092; antes la lista «Envíos desde China» de
  ClickUp, importada con `scripts/clickup-exportar-envios.mjs` + `scripts/importar-rutas-envio.ts`): `wms_rutas_envio` (agente,
  país por código ISO —cualquiera del mundo, no hace falta que exista en `paises`—, vía, DDP/DAP, courier, días prometidos
  mín/máx, activo, nota) y `wms_rutas_envio_tarifas` (tipo de producto, precio, por CBM o kg, vigente desde; una nueva no borra la
  anterior). **Lo real** sale de las compras con `agente_envio` (campo nuevo de la compra, aparte del proveedor; las de proveedor
  «Chin» quedaron con agente «Chin»), del mismo país y una sola vía, con fecha de envío y de llegada: histórico, últimos 12 meses
  y año en curso por la fecha de llegada (`src/lib/compras/rutas-envio.ts`, con prueba); punto rojo si el promedio de 12 meses
  pasa del máximo prometido. Quien tiene países limitados solo ve y toca las rutas de sus países.
  **La pantalla** (21 oct 2026, rediseño aprobado con maqueta; `panel-envios.tsx`): filtros arriba (vía, agente, país, «Solo activas», «Agrupar por» país/agente/vía —se recuerda en el
  navegador—, «Descargar» con `DEF_ENVIOS` y «Agregar ruta»), una sola barra de indicadores (`Indicador`; «Fuera de plazo» es un botón que recorta la lista) y, debajo, **una sola lista**
  (`lista-rutas.tsx`: grupos con una fila-botón por ruta y siempre las mismas columnas —plazo, real 12 m con los últimos 2 meses, estado, «uso del plazo», envíos, tarifa—) con un panel
  a la derecha («Para atender»: fuera de plazo de más a menos atrasada; «Falta definir el plazo»; «Agentes» con cuántas de sus rutas medidas cumplen). **Ya no hay vista de tarjetas ni
  de tabla** (`TablaEnvios` se quitó) y la fila no lleva el interruptor de activa: eso se hace en la ficha (`FichaRuta`, que no cambió). El estado de cada ruta es texto + ícono, nunca solo
  color (`estadoRuta`, `src/lib/compras/estado-ruta.ts`, con prueba: En plazo / Fuera de plazo / Sin medir / Sin plazo, contra el real de 12 meses o el histórico). La barra
  (`barra-uso.tsx`, `geometriaBarra`) va de 0 a 2,2 veces el plazo máximo para que todas se comparen y la línea del máximo caiga siempre en el mismo sitio: franja verde = plazo
  prometido, barra oscura = lo que tardó, rayas rojas = lo que se pasó. Los indicadores y el panel de la derecha respetan los filtros de la barra pero no «Fuera de plazo».
  **Tiendas con color y nombre editable** (migración 0091, `wms_compras_tiendas`, como `wms_compras_etiquetas`; las que existían
  arrancan con colores distintos): `tiendas.tsx` da el contexto `ProveedorTiendas` (lo pone `TablaCompras`) con `colorDe`,
  `cambiarColor` (`guardarColorTienda`) y `renombrar` (`renombrarTienda`: cambia el nombre en todas las compras de todos los
  países —solo quien los ve todos—, se juntan si ya existe, mueve el color, deja la línea en la Actividad). `PastillaTienda` las
  dibuja; `PanelLista` con `gestion` muestra el lápiz de color y nombre en la celda, la ficha y la barra de varias compras.
  **Tienda: una sola por orden** (desde el 9 oct 2026, `unica` en `CAMPOS_EDITABLES` y `CampoLista`; antes podían ser varias) (migración 0084, 9 oct 2026): `wms_compras.tiendas text[]` (antes `tienda`, un
  solo texto; esa columna vieja se queda sin usarse hasta una migración que la borre). Se elige o se crea al escribirla en la
  celda (`CeldaEditable` con `opcionesLista`), en la ficha (`CampoLista`, `campo-lista.tsx`: pastillas con ✕ y «Añadir tienda»,
  viaja como `tiendas` separadas por comas) y en la barra de varias compras. Los tres usan el mismo panel `PanelLista`
  (`selector-lista.tsx`: buscar, pulsar para poner o quitar, «Crear …» y Enter); los nombres que ya existen salen de las
  tiendas de todas las compras (`todasTiendas`), así que una tienda nueva queda disponible en cuanto se pone en una compra.
  Un nombre no lleva comas (separan la lista al guardar: `limpiarNombre`). Agrupar, filtrar y los tiempos por tienda cuentan
  la compra en cada una de sus tiendas.
  **Comentarios con imágenes y PDF** (migración 0085, como los de ClickUp: la captura de un pago con su detalle debajo): el
  campo de comentario de la Actividad (`actividad-compra.tsx`) tiene el botón «Adjuntar», y también se pega una captura
  (Ctrl+V) o se arrastra un archivo encima. Cada archivo sube **al elegirlo** directo al bucket privado `wms-compras`
  (`prepararSubidaAdjuntoComentario`, URL firmada, ruta `comentarios/<compra>/…`; hasta 10 por comentario y 10 MB cada uno,
  `src/lib/compras/adjuntos.ts` con prueba), se ve como miniatura con su ✕ y viaja con «Comentar»
  (`comentarCompra(id, texto, menciones, adjuntos)`; un comentario puede ir solo con archivos). El servidor **revisa el
  contenido por su firma** (imagen JPG/PNG/WebP/GIF o PDF; SVG, HTML y lo demás se rechazan, nunca el nombre ni el tipo del
  navegador), que la ruta sea de esa compra, y borra todo si algo falla; un archivo subido que se quita o se abandona se
  borra (`descartarAdjuntoSubido`). Queda en `wms_compra_adjuntos` con `comentario_id` y se ve **debajo del texto de su
  comentario** (`GaleriaAdjuntos`: miniaturas que se amplían con `VisorImagen`, PDF como enlace firmado de una hora); la
  sección «Adjuntos» del final solo trae los sueltos (ClickUp, foto, documentos). Sin la columna, la actividad sigue cargando
  y el comentario con archivos avisa que falta la migración.
  **Actividad como ClickUp** (8 oct 2026; `actividad-compra.tsx` + la pieza común `src/components/actividad/`, ver «Actividad con comentarios»): un solo bloque con comentarios,
  cambios y archivos en orden de tiempo (filtro Todo / Comentarios / Cambios, «Ver anteriores», campo abajo). Cada comentario
  tiene **respuestas** de un nivel (`respuesta_a`; avisa a quien lo escribió por `autor_id`) y **reacciones**
  (`wms_compra_comentario_reacciones`, emojis fijos de `src/lib/compras/reacciones.ts`, `alternarReaccion`), migración 0095;
  sin ella todo carga igual, sin respuestas ni reacciones. **Editar:** solo quien lo escribió (`autor_id`, o por nombre en los de antes; `editarComentarioCompra`), queda `editado_en` y se ve «(editado)» (migración 0097). Al editar también se **quitan sus archivos** (✕ en `TiraExistentes`) y se **agregan otros** (`editarComentarioCompra(id, texto, menciones, { quitar, agregar })`: se revisan por contenido como al comentar, el comentario no puede quedar sin texto ni archivos, y los quitados se borran del almacenamiento). **Eliminar** (`eliminarComentarioCompra`, solo quien lo escribió, confirmación en la misma fila): borra el comentario, sus reacciones, respuestas propias y archivos (las filas caen por `on delete cascade`, el almacenamiento se borra a mano); con respuestas de otras personas se rechaza; queda en la auditoría. **Adjuntos:** además de imágenes y PDF, Excel, Word y PowerPoint
  (modernos por su carpeta interna del ZIP; viejos por el contenedor OLE + extensión), CSV y texto (sin bytes nulos ni HTML), hasta
  25 MB (`detectarAdjunto(bytes, nombre)`); el servidor vuelve a guardar el archivo con el tipo de su contenido (un texto se sirve
  como `text/plain`, nunca como página).
  **Proveedor de una lista** (21 oct 2026): se elige de `PROVEEDORES_COMPRA` (`def-compras.ts`: Chin, Zion, Alibaba; guardados
  con el nombre que ya tenían, el Portal del proveedor reconoce a Chin por él) en la celda (`seleccion` en `CAMPOS_EDITABLES`), la
  ficha y la compra nueva (`SelectorProveedor`). Una compra vieja con otro proveedor («Local») lo conserva: la ficha lo muestra como
  opción y `proveedorDeLista` lo deja pasar. El **agente de envío** igual: `AGENTES_ENVIO` (Chin, Avery: los nombres de `wms_rutas_envio.agente`, con los que Envíos cruza los tiempos reales), `agenteDeLista`. Los dos usan `SelectorDeLista` en la ficha. Cada valor tiene su color (`colorProveedor`, `colorAgente`: tonos del neón del sistema, distintos entre sí y de Etapa/Estado; lo comprueba `proveedor-lista.test.ts`). Para sumar uno, agrégalo a su lista.
  **Foto comercial y foto real** (21 oct 2026): la foto comercial es la del producto en Producto; la foto real (`foto_url`,
  «Foto real del producto») es la que manda el proveedor. `FilaCompra.fotoComercial` = la de su primer producto con foto o, sin
  productos, la del producto con su mismo nombre (`productoDeCompra`); cada línea trae la suya (`lineas[].foto`, `ItemCompra.foto`:
  la del producto o la de otro con el mismo nombre, `fotoDeProducto`). Lógica pura en `src/lib/compras/foto-producto.ts` (con
  prueba) y carga en `cargarFotosDeProductos` (`fotos-productos-datos.ts`). La columna «Foto» de la lista muestra la comercial (o la
  real si no hay); la ficha pone «Foto comercial» (solo se ve) al lado de «Foto real del producto», arriba de los productos.
  **Productos en la ficha:** el bloque «Productos» (`productos-compra.tsx`, solo compras de país) va **dentro del formulario**,
  en el bloque «Compra» justo debajo de Etiquetas (`FormularioCompra` recibe `productos` y `FichaCompra` se lo
  pasa con `incrustado`). Como está dentro del `<form>` pero guarda por su cuenta (cada campo, al salir de él), su contenedor
  frena `onChange`/`onInput` (si no, escribir unidades encendía «Guardar cambios» de la compra) y bloquea Enter en sus campos
  (si no, enviaba la compra). Un campo nuevo ahí no debe llevar `name`: se colaría al guardar la compra. A solo lectura no hay
  formulario y el bloque queda al final de la ficha.
  **Tiempos y fallas** (`/compras/tiempos`): tiempo por tramo (con las fechas), tiempo en cada estado (con `wms_compra_eventos`),
  comparación por proveedor, vía, país, tienda o responsable, atrasadas e inconvenientes. **Atrasada** = abierta, ya salió y
  lleva más días en tránsito que el 90 % de los envíos de su vía (`umbralesTransito`). Los cálculos son puros, en
  `calculos-compras.ts` (prueba contra datos reales: `npx tsx scripts/probar-calculos-compras.ts`); los datos los carga
  `datos-compras.ts` (la vista elegida se recuerda en la cookie `compras-vista`). En los datos de ClickUp el envío suele ir
  antes del primer pago, por eso el tramo es «Creada → envío».
- **Compras: un solo tablero** (`/compras`, migración 0076). Arriba se elige qué se ve: 🗺️ Todos los países, uno solo o
  🌍 **Importadora** (`?ver=todos|PA|CR|…|importacion`; no depende del país de la barra de arriba). `wms_compras.tipo` es
  `'pais'` (compra nuestra, lleva `pais_id`) o `'importacion'` («Compras Importadora»: un **servicio a un cliente** que nos
  pide mercancía de cualquier parte del mundo y se la entregamos puerta a puerta; no es nuestra, así que **nunca lleva país**
  aunque se entregue en Panamá —el destino va en `paises_destino`— y nunca se mezcla con las compras de un país; lo impone
  un `check`). Los montos van en dólares en todos los países (`MONEDA_COMPRAS`). Cada columna lleva el emoji de su campo como
  en ClickUp (`EMOJI_CAMPO`, `conEmoji`, `def-compras.ts`). La ficha termina con la actividad (`actividad-compra.tsx`):
  adjuntos (fotos, documentos y videos en el bucket **privado** `wms-compras`, plan Pro, con enlaces firmados; si uno no se
  pudo copiar queda con su enlace de ClickUp),
  subtareas, comentarios y el **historial de etapa y estado** (`wms_compra_eventos`, con la hora: cada cambio que se guarda
  aquí lo anota `actualizarCompra`; es la base de los tiempos por etapa). Al pasar a Completado o Descartado se sella
  `cerrado_en`. **Importación desde ClickUp:** `scripts/clickup-exportar-compras.mjs` baja las listas «Compras Dropi» de cada
  país y «Compras Importadora🌍» a `datos-privados/` (con comentarios e historial de estados), `scripts/clickup-inventario-compras.mjs`
  hace el inventario de campos y `scripts/importar-compras-clickup.ts` importa (sin `--aplicar` solo informa; se puede repetir,
  actualiza por `clickup_id`; `--subir-adjuntos` copia los adjuntos). **Historial exacto de Etapa** (la API de ClickUp no da el
  de campos personalizados): se leyó en la página de ClickUp con la sesión de Hernán (el detalle de la Actividad que la
  página pide a su servidor, con la hora en ms), quedó en la conversación como bloques `@@ACT@@`;
  `scripts/extraer-etapas-transcripcion.mjs <conversación.jsonl>` arma `datos-privados/clickup-etapas.json` y
  `scripts/importar-etapas-actividad.ts --aplicar` lo carga (`origen` «clickup_actividad», rehace los suyos). Lo anterior al
  traspaso del 14 jul 2025 (todo a «12 - Completado», hoy «06 - Completado»: «Solicitud Local» se quitó el 6 oct 2026 y, el 10 oct 2026, Solicitud Internacional, Evaluación de Proveedor, Solicitud a Proveedor, Compra y Pago y Aviso Logística; las etapas se renumeraron, mismas claves, y la migración 0098 mueve las compras que siguieran en una quitada: ficha y Actividad las siguen leyendo como «… (ya no se usa)») es del campo «Etapa» viejo, con otra numeración (06 compra y pago,
  07 En China, 08 tracking, 10 completado); el traspaso no cuenta como cambio. Cargado el 7 oct 2026: 5.259 cambios de
  1.196 compras. **Países:** se agregan desde Configuración (sección Países) o, como en ClickUp, con «Agregar país» al final de «Elige el
  país» de la compra nueva (`SelectorPais`: se busca por nombre entre los países del mundo de `src/lib/paises-mundo.ts`, que
  salen de `Intl.DisplayNames`, y `agregarPaisRapido` lo crea y lo deja elegido; pide poder modificar Configuración). Ya no hay
  botón «＋ País» junto al selector de Compras. El selector de país de la
  barra de arriba (`PAISES_NAV`) sigue siendo fijo: es el contexto de Dropi. Cada compra guarda su tarea original en
  `clickup` (jsonb), así que ningún dato de ClickUp se pierde. El historial de la **Etapa** (campo personalizado) no sale por
  la API de ClickUp: solo el de Estado.
- **Pestañas del módulo (estilo ClickUp).** Un módulo con subpáginas muestra una
  franja de pestañas bajo las migas, también en `BarraMigas`. Se declaran en
  `PESTANAS_POR_MODULO` (`src/lib/pestanas.ts`, la clave es la ruta del módulo y
  la primera pestaña es el módulo mismo); una página de detalle cuenta en la
  pestaña de su módulo. Hoy: Retiros (Retiros, Cuentas destino), Usuarios
  (Usuarios y roles, Historial de auditoría) y Extractos (Cargar extracto,
  Diccionario de patrones). Al sumar una subpágina, agrégala ahí en vez de
  poner un enlace suelto en la página.
- **Tablas con barra de herramientas común** (Agrupar, filas cerradas, Filtros,
  Columnas — igual en todos los módulos, estilo ClickUp). Ya la usan Retiros,
  Alertas (las alertas y el inventario pendiente de retorno), Pedidos Dropi, Gastos, Usuarios, Auditoría, CRM Dropshippers
  (directorio e interacciones), Productos, Catálogo maestro, Cuentas destino,
  Configuración (plataformas y cuentas), Inteligencia competitiva (lista de
  proveedores), Inventario, Extractos (movimientos, agrupados por extracto) y
  Patrones bancarios. Quedan sin ella, a propósito, las tablas de resumen fijo
  (el comparativo por período y el historial de un proveedor). Para sumarla a
  otra tabla: describe
  sus campos en una `DefTabla` (`src/lib/tabla/motor.ts`; ver `gastos/def-gastos.ts`
  o `retiros/filtros.ts`) y, según lo que muestres, usa un componente listo de
  `src/components/tabla/`: `TablaDatos` (tabla que solo muestra datos, con
  columnas y una columna de acciones, que con `fija` queda pegada a la derecha)
  o `ListaDatos` (lista de tarjetas con
  su propio formulario; sin menú de columnas). Si la tabla tiene comportamiento
  propio (selección, fila que se edita), arma la suya con `useTablaInteractiva` +
  `useColumnas` y dibuja `<BarraHerramientas>`, como `retiros/tabla-retiros.tsx`.
  La lógica pura vive en `src/lib/tabla/` y el tooltip de cada botón sale solo;
  no copies la barra a mano. Lo que cada persona elige (filtros, vista,
  columnas) se guarda en su navegador con la `clave` de la tabla
  (`<clave>-filtros-v1`, `-vista-v1`, `-columnas-v2`). Las páginas sirven las
  filas ya listas (serializables) y la definición y las columnas de un cliente
  son constantes del módulo (si la definición depende del país, una por país y
  siempre la misma, como `defMovimientosBanco`). En la definición, `vistaInicial`
  hace que la tabla arranque agrupada (quien ya eligió una vista no la pierde) y
  `formatearValor` da un nombre legible a valores que ordenan bien pero se leen
  mal (una fecha ISO). **El encabezado y las celdas de una tabla usan las clases
  compartidas de `src/components/tabla/estilos-tabla.ts`** (`claseFilaEncabezado`,
  `claseEncabezadoColumna`, `claseCeldaColumna` y, para una columna de casilla de
  selección, `claseEncabezadoCasilla`/`claseCeldaCasilla`): mayúsculas pequeñas en
  el nombre de columna y un filete vertical entre columnas, estilo que antes solo
  tenía Retiros. `TablaDatos` ya las trae; las tablas que arman la suya
  (`retiros/tabla-retiros.tsx`, `pedidos-dropi/tabla-pedidos.tsx`,
  `alertas/tabla-alertas.tsx`, `productos/tabla-productos.tsx`,
  `retiros/dropi-sin-vincular.tsx`, el detalle de un proveedor en Inteligencia
  competitiva y las dos tablas del Centro de notificaciones) las importan en vez
  de repetir las clases a mano. No pongas un ícono de arrastrar decorativo en el
  encabezado: no arrastra nada (reordenar columnas es el menú «Columnas»). No pongas `total` si sumar mezclaría cosas distintas
  (entradas y salidas). Un filtro de un toque («Mis retiros») se pasa a
  `<BarraHerramientas atajos={[...]}>` (`AtajoFiltro`, `src/lib/tabla/atajos.ts`): es un
  filtro de selección que el botón enciende o apaga sin tocar los de otros campos.
- **Editar una fila en su sitio (Productos).** No pongas un formulario abierto en cada
  fila (Productos llegó a 240 controles y 530 KB de HTML): la fila muestra texto, un
  lápiz («Editar producto») la vuelve campos y aparecen Guardar y Cancelar
  (`productos/tabla-productos.tsx`). Un `<tr>` no puede ir dentro de un `<form>`:
  hay **un** `<form id="editar-producto">` para toda la tabla y los campos de la fila
  que se edita se ligan a él con el atributo `form`; como quedan fuera del `<form>`,
  Enter y Escape se atienden con un `onKeyDown` en la tarjeta. Solo se edita una fila
  a la vez y lo que sea un `<select>` grande (los SKU maestros) se dibuja **solo** en
  esa fila, no en todas. Si una columna editable está oculta en el menú «Columnas», su
  valor viaja en un campo oculto (si no, «Guardar» lo borraría). La acción del servidor
  valida lo que recibe (un campo ausente no es un campo vacío). Guardar y vincular el
  SKU maestro son dos acciones de módulos distintos (`productos` y `catalogo-maestro`):
  con solo lectura en uno no se ofrece lo del otro (`puedeEscribir`, `puedeVincular`).
- **Vistas guardadas.** Toda tabla con barra de herramientas trae el menú «Vistas»
  (`src/components/tabla/menu-vistas.tsx`): guarda con nombre lo que se ve (filtros,
  agrupación, cerrados y columnas), lo aplica de nuevo, elimina (con confirmación en
  la misma fila), restablece y **copia un enlace** a la vista
  (`?vista-<clave>=<código>`, `src/lib/tabla/vistas.ts`). Las vistas son de cada
  persona (`<clave>-vistas-guardadas-v1` en su navegador, máximo 20; no viajan a
  otro equipo ni otro navegador). Al abrir un enlace con una vista, se aplica, se
  quita el parámetro de la dirección y lo que la persona tenía queda guardado como
  «Antes del enlace». Compartir vistas con nombre para todo el equipo pediría una
  tabla en Supabase: no existe todavía.
- **Descargar lo que se ve.** Toda tabla con barra de herramientas trae el botón
  «Descargar»: un CSV (con BOM para Excel) de las filas que dejan los filtros, en
  el orden de la pantalla, armado en el navegador con la `DefTabla`
  (`src/lib/tabla/csv.ts`). Salen todos los `campos` de la definición, con los
  nombres que se ven; lo que sea un identificador y no un campo de filtro (el
  número de un retiro) va en `csvAntes`. Un texto que empieza por `=`, `+`, `-` o
  `@` se escribe con comilla para que Excel no lo ejecute. **Un solo botón de
  descarga por tabla**: no pongas un enlace «Descargar CSV» al lado. Si la tabla
  solo tiene cargada una parte de los datos (500 de 1 790 órdenes; los últimos 10
  extractos) y el servidor sabe armar el total (`/api/exportar-*`), la página pasa
  `descargaCompleta={{ href, etiqueta, detalle }}` (a `TablaDatos` o a
  `BarraHerramientas`) y el mismo botón abre un menú con «Lo que se ve» y esa
  descarga completa. Si la tabla ya trae todo (Alertas), el botón basta.
- **Selección de retiros (Retiros).** La tabla de Retiros tiene una casilla por fila
  y una en el encabezado («seleccionar los que se ven»); al marcar aparece
  `BarraLote` (`src/app/(app)/retiros/barra-lote.tsx`) fija abajo: dice cuántos
  hay seleccionados, deja descargar solo lo marcado y quitar la selección. **No
  cambia ningún dato**: no hay acciones en lote (se quitó el «Pasar a Abierto /
  Novedad / Cerrado»; el estado de un retiro cambia al conciliar, al cancelar o desde
  la ficha de «Modificar», junto a «Gestionado por»). La columna Estado de la tabla también es de solo lectura
  (una insignia, no un desplegable). Cuenta únicamente lo que está en pantalla (los
  grupos contraídos no cuentan). Con solo lectura en Retiros no se dibujan ni casillas
  ni barra (`puedeEscribir`). Si algún día vuelve una acción en lote: agrégala a
  `barra-lote.tsx` con su acción de servidor (permiso de escritura comprobado en el
  servidor, una sola escritura, un evento y una fila de auditoría por retiro con
  `registrarAuditoriaLote`, que consulta a la persona una vez) y pide confirmación
  en la misma barra, sin ventana.
- **Tarjetas de resumen que se pueden pulsar.** Una tarjeta de indicador (`KpiCard`,
  `src/components/ui/kpi-card.tsx`) que resume algo que la tabla de abajo lista
  **debe poder filtrar esa tabla** (o llevar a ella); no la dejes como caja muerta.
  Hay tres formas: (1) con `href` es un enlace, con resalte, anillo de foco y
  `activa` (`aria-current`) para la que está filtrando; si lleva un botón de ayuda
  («?») se pasa como `ayuda` y la tarjeta se vuelve un enlace extendido (un botón
  no puede ir dentro de un enlace). (2) **`KpiFiltro`** (`kpi-filtro.tsx`) es un
  botón con `aria-pressed` que pone o quita un filtro en la tabla **de la misma
  página**, sin recargar, compartiendo el almacén de filtros de la tabla; va en un
  componente de cliente del módulo (`retiros/tarjetas-resumen.tsx`,
  `catalogo-maestro/tarjetas-estado.tsx`, `gastos/tarjetas-mes.tsx`) porque una
  `DefTabla` con funciones no cruza de servidor a cliente. El filtro es un
  `AtajoFiltro` (`src/lib/tabla/atajos.ts`), que puede llevar `ademas` (filtros de
  otros campos: «cerrados» + el mes que suma la tarjeta). **Pulsar de nuevo la
  tarjeta activa quita el filtro** (al quitar el último, la tabla queda sin filtrar),
  y **las tarjetas de estado se pueden juntar** (`suma: true`: abiertos O con
  novedad; es coherente porque una fila tiene un solo estado). Las compuestas
  (cerrados + mes) no se combinan: se declaran `excluye` en las que suman y al
  pulsar una se apaga la otra. Ya lo usan Retiros, Catálogo, Gastos (categorías) y
  Alertas (Abiertas / Reclamadas / Resueltas). No hagas clicables las insignias de
  estado dentro de las filas: son estado, no controles. (3) Si la tabla solo
  trae una parte de los datos (Pedidos Dropi: 500 de miles), el filtro va **en el
  servidor**, en la dirección (`?estado=A&estado=B`, `?alertas=1`;
  `src/lib/pedidos/filtro-url.ts`), para que la tabla traiga todo lo de esos
  estados y el número de la tarjeta coincida; cada tarjeta es un enlace que suma su
  estado o, si ya estaba, lo quita, y «Alertas» se combina con los estados (las dos
  cosas a la vez). Las tarjetas conservan el período y el orden y el menú
  «Descargar» baja lo mismo que filtran. El número de una tarjeta debe ser el
  de lo que filtra (si suma el mes, el filtro incluye el mes). Las tarjetas de
  totales que no filtran nada (saldos de wallet, Inteligencia competitiva) no son
  pulsables. Las de «Pendientes de hoy» del Dashboard llevan a su módulo; la de
  Novedad no filtra porque cuenta todas las fechas y Pedidos muestra un período.
- **Paginación de las tablas.** Una tabla larga se pagina en el cliente:
  `useTablaInteractiva(def, filas, { porPagina: 50 })` (`src/components/tabla/usar-tabla.ts`)
  deja en `visibles` solo la página actual y expone `paginacion` (página, total,
  rango) e `irAPagina`; se dibuja con `<Paginacion>`
  (`src/components/tabla/paginacion.tsx`: «Mostrando 51–100 de 136», flechas y
  botones numerados con la página actual marcada con `aria-current="page"`). La
  cuenta de páginas y los botones con «…» salen de `src/lib/tabla/paginacion.ts`.
  **Solo se pagina sin filtros ni grupos**: con filtros o agrupando se ven todos los
  resultados (los grupos y el «N de M» del pie ya orientan). La página se olvida al
  cambiar los filtros, la agrupación o los cerrados. **Toda tabla la trae**:
  `TablaDatos` y `ListaDatos` paginan de 50 en 50 por defecto (`porPagina`, y con
  menos filas que eso la paginación no se ve), y Retiros, Pedidos y Alertas, que
  arman la suya, usan `useTablaInteractiva(..., { porPagina: POR_PAGINA })` +
  `<Paginacion>` + `useIrAPaginaArriba` (`usar-pagina-arriba.ts`: vuelve al
  principio de la tabla al cambiar de página y da el texto del aviso oculto). Es
  paginación **en el cliente**: la página sigue enviando todas las filas cargadas
  y solo dibuja 50, que es lo que pesa (el DOM y la hidratación); los filtros, las
  vistas guardadas y la descarga siguen trabajando sobre todas. Paginar en el
  servidor exigiría mover ahí filtros, agrupación y vistas: no se ha hecho. Lo
  que esté marcado (acciones en lote) cuenta solo en la página que se ve. **Filas por página a elección** (12 oct 2026):
  el pie de toda tabla paginada (`Paginacion`) trae el selector «Filas por página» con 50, 100, 500 o Todas
  (`src/lib/tabla/filas-por-pagina.ts`, con prueba). Lo elige cada persona, se guarda en su navegador
  (`tabla-filas-por-pagina-v1`, `useFilasPorPagina`) y vale para todas las tablas; sin elección, cada tabla usa su
  `porPagina`. `useTablaInteractiva` lo aplica solo (las tablas no cambian) y vuelve a la página 1 al cambiarlo. Con
  «Todas» o 500 y pocas filas queda una sola página y el selector sigue visible; con 50 filas o menos no se dibuja.
  «Todas» en una tabla grande como Compras (más de 1 000 filas con celdas editables) puede ir lento: por eso no es lo
  predeterminado.
- **Densidad y encabezado fijo de las tablas.** La caja de cada tabla de datos es
  `<ContenedorTabla ariaLabel="...">` (`src/components/tabla/contenedor-tabla.tsx`)
  y la `<table>` lleva la clase `tabla-datos`; los estilos están en
  `globals.css`. La densidad (Cómoda o Compacta, en el menú «Columnas») la elige
  cada persona y vale para todas las tablas (`densidad-filas-v1`). La barra de
  herramientas queda fija arriba al bajar la página y, si la tabla cabe sin
  desplazarse de lado, su encabezado queda fijo debajo de ella; si es más ancha
  que su tarjeta se desplaza de lado (como región con teclado) y el encabezado
  real no se puede fijar (un `sticky` no funciona dentro de una caja que se
  desplaza de lado). Una tabla con muchas columnas (Compras) pasa `fijarEncabezado`
  a `TablaDatos` y entonces, cuando el encabezado real sale de la pantalla por
  arriba, aparece una **copia** suya bajo la barra de herramientas (mismos anchos
  medidos, siguiendo el desplazamiento de lado; solo para ver, `aria-hidden`): solo
  se mueven las filas. Una columna con `total: (filas) => …` suma sobre **todas** las
  filas que deja ver la tabla (con sus filtros, no solo la página) y la tabla pega
  abajo una fila de totales (primera celda «Total»), encima de la barra de
  desplazamiento; Compras suma QTY, Monto Total, Primer Pago, Segundo Pago y Pagado a
  Proveedor. **Al agrupar, cada grupo cierra con su propia fila de «Subtotal»** (`filaSubtotal` de `TablaDatos`: la misma
  suma de cada columna con `total`, pero solo sobre las filas de ese grupo, y se ve también con el grupo contraído); la fila
  fija de abajo sigue siendo el total de todo lo que se ve. Así en Compras se lee lo que se debe por etapa (Tracking,
  Completado…) sin filtrar. Una barra de acciones en lote de una tabla con totales debe ir por
  encima de esa fila (`bottom-24`, no `bottom-4`). No pongas `overflow-hidden` en una tarjeta que contenga una
  tabla: rompe lo fijo. El encabezado fijo tiene `z-index: 15` (`globals.css`): lo
  que una fila eleve con `z-10` (casillas, desplegables, la celda de acciones fija)
  no debe pasar de 10 o se verá por encima del encabezado al bajar.
- **Formularios accesibles y títulos de página.** Todo campo tiene nombre: la etiqueta
  **envuelve** al campo (`<label className="flex flex-col gap-1"><span
  className={labelClass}>Nombre</span><input/></label>`, sin `id`, vale en componentes
  de servidor y de cliente), o lleva `htmlFor` con el `id` del campo (el campo de
  archivo y la contraseña). Nunca `<div><label>Nombre</label><input/></div>`: ese texto
  no está ligado al campo (pulsarlo no lo enfoca y un lector de pantalla no lo lee).
  Lo que se repite en una lista dice de quién es: `aria-label={`Costo de ${p.nombre}`}`,
  `Rol de ${usuario}`; un selector suelto (país, comparar) lleva `aria-label`. Corre
  `node scripts/revisar-formularios.cjs` antes de un PR con formularios: sale con error
  si una etiqueta no está ligada o un campo no tiene nombre. Cada página exporta su
  título (`export const metadata = { title: "Retiros" }`, con el nombre del menú; la
  plantilla del layout raíz agrega « · Ecomfive»); una página de cliente (login) no
  puede exportarlo y lo pone un `layout.tsx` de su carpeta. El texto secundario
  (`--muted-foreground`) mide ≥ 4,5:1 sobre el fondo, la tarjeta, `--muted` y `--accent`
  (la superficie de lo seleccionado) en los dos temas: si cambias esos colores, recalcula.
  El menú lateral y cada región de navegación llevan `aria-label`.
- **Borde de los campos de formulario.** Los `input`, `select` y `textarea` usan
  `fieldClass` / `fieldClassSm` (`src/components/ui/field.ts`), que llevan
  `border-border-control` (`--border-control`: 3:1 contra el fondo, WCAG 1.4.11).
  `border-border` (1.28:1) es solo para divisores y tarjetas: nunca lo pongas en
  un campo. Un campo con clases propias (como el buscador global) usa también
  `border-border-control`.
- **Sin textos descriptivos.** No agregues notas, subtítulos ni textos de ayuda que
  expliquen un bloque o un campo («como los pide Dropi», «se sugiere al crear un retiro»):
  la interfaz se entiende por sus títulos y etiquetas. Un aviso solo se muestra cuando
  algo falló o cuando la persona tiene que decidir algo (un error, una confirmación).
  El título de un bloque de una ficha lleva solo su ícono y su nombre (`Seccion`).
- **Carga de las páginas: qué se repite, qué se guarda y qué va en paralelo.**
  Cada consulta a Supabase cuesta un viaje de red, y una cadena de ellas es lo
  que hace lenta una página. Tres reglas:
  1. *Dentro de una petición* lo compartido se envuelve en `cache()` de React
     (`getUsuarioActual`, `getUsuarioIdSesion` en `src/lib/auth.ts`): el layout,
     la página y las acciones comparten una sola respuesta. El perfil trae el rol
     y sus permisos en **una** consulta (si la base no devuelve el embebido, cae a
     pedirlos aparte: el acceso nunca depende de eso).
  2. *Entre peticiones* solo se guarda en memoria lo que casi nunca cambia y es
     igual para todos, con `conTtl` (`src/lib/cache-ttl.ts`): el país
     (`getPaisActual`, 10 min), las plataformas de un país
     (`obtenerPlataformasPais`, 1 min) y el id de Dropi (`obtenerPlataformaDropiId`,
     10 min). Cada instancia del servidor vence por su cuenta, así que un cambio
     hecho a mano en la base tarda hasta ese tiempo en verse. **Nunca guardes así
     lo que es de una persona** (sesión, permisos, favoritos): un dato viejo ahí
     es un fallo de seguridad o un menú equivocado.
  3. *Consultas independientes* van en `Promise.all`, no una tras otra. Si una
     depende de otra (las plataformas del país), encadénala con `.then` dentro
     del mismo `Promise.all` en vez de esperar antes. El layout de `(app)` es el
     ejemplo: usuario, país, plataformas y favoritos arrancan a la vez y los
     contadores del menú no se esperan.
  4. *Contar, sumar y agrupar se hace en la base, no en JavaScript.* Cuando una
     página solo necesita totales, una función SQL (`create function … language
     sql stable`, ver `0037_resumen_pedidos_dropi.sql`) devuelve un renglón por
     grupo en vez de miles de filas. Se llama con `supabase.rpc` desde el cliente
     del servidor, y el código **conserva un plan B en JavaScript** (misma forma
     de respuesta) por si la migración aún no se corrió: ver
     `obtenerResumenPedidos`. Las funciones se prueban contra un Postgres real
     (PGlite) comparando su resultado con el del plan B.
  Para medir, no hay que adivinar: un servidor de Supabase falso que anota cada
  consulta y le suma latencia, con la app real apuntando a él, muestra cuántas
  hace cada página y en qué orden.
- Columnas calculadas se definen en la propia migración de SQL con
  `generated always as (...) stored` (ej. `monto_neto` en `retiros`) en vez
  de calcularse en el código.

- **CRM de dropshippers** (`/crm-dropshippers`, migraciones 0062, 0064, 0065 y 0066). Datos reales (ya no hay modo demo).
  Una ficha por dropshipper; **vende en varios países** (`dropshipper_paises`, M:N) y `pais_origen` es de dónde es (por su
  WhatsApp, formato E.164, `src/lib/crm/telefono.ts`). Los pedidos y casos llevan `pais_id` (no se suman colones y
  dólares). La lista salió de ClickUp («CRM DROPI»): `scripts/clickup-exportar-crm.mjs` la baja a `datos-privados/`
  (ignorada por git: son datos de clientes) y `scripts/importar-dropshippers-clickup.ts` la migra (sin `--aplicar` solo
  informa; junta por teléfono, correo o nombre; cada tarea de origen queda completa en `dropshippers.clickup`).
  **Cuentas de plataforma:** desde la ficha se vincula, a mano, el dropshipper con su usuario de Dropi
  (`dropshipper_cuentas`); los pedidos de Dropi traen `user_id` y `shop`, y `crm_sincronizar_ordenes()` (la corre
  `dropi-ingerir-ordenes.ts`) los pasa a `crm_ordenes`. El desempeño (guías, despachadas, entregadas, tasa de entrega =
  entregadas ÷ despachadas, productos) lo suman las funciones `crm_desempeno` y `crm_productos_vendidos` por período;
  *despachado* = ya salió de la bodega (`crm_estado_grupo`). Cada línea del pedido cuenta como una unidad.
  La pestaña **Vínculos** (`/crm-dropshippers/vinculos`) lista los usuarios de Dropi con pedidos que no son de ningún
  dropshipper, de más a menos pedidos, con una sugerencia por parecido del nombre de la tienda (`src/lib/crm/sugerencias.ts`;
  Dropi no manda más datos del dropshipper): se confirma uno a uno, nunca se vincula solo.
  **Áreas** (un solo CRM, `src/lib/crm/areas.ts`): Atención = módulo `crm-dropshippers`; Comercial = además el módulo
  `crm-comercial`. Atención **no** ve las notas, seguimientos ni cambios comerciales: se filtran en el servidor
  (`obtenerLineaDeTiempo`, `areaParaNota`); Comercial ve las dos. Captación: `dropshippers.fase` (captado → onboarding →
  activo) y la «transferencia» asigna un líder comercial (`responsable_id`). Atención puede «pasar a Comercial» un caso
  (crea un seguimiento). **Toda acción nueva del CRM** empieza con `requireModuloEscritura` del módulo de su área y
  devuelve `{ error }`; una lectura que muestre algo comercial exige `crm-comercial`.

## Dónde vive cada cosa

- `supabase/migrations/` — cambios de esquema, en orden numerado. Correr
  cada migración nueva manualmente en el editor SQL de Supabase.
- `src/app/(app)/<seccion>/page.tsx` — página de cada sección; `actions.ts`
  junto a ella con sus Server Actions.
- `src/components/` — componentes compartidos entre secciones.
- `src/lib/` — helpers de datos y lógica compartida (país actual, fechas,
  auditoría, etc.).
- `scripts/` — scripts que corren fuera del request cycle (ingestión de
  Dropi, mantenimiento de sesión, etc.), ejecutados con `npx tsx`.

## Interfaz: skills de diseño (obligatorio)

Todo cambio que cree o modifique interfaz (páginas, componentes, formularios,
PDF, estilos) pasa por estas dos skills, además del hook. En la respuesta
final se dice cuáles se usaron.

1. **`ui-ux-pro-max`** — antes de escribir: invocar la skill y consultar su
   buscador (requiere Python 3), por ejemplo
   `python .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>" --domain ux`
   (también `--design-system` y `--stack nextjs`). Antes de entregar, repasar
   la lista de verificación de `.claude/skills/ui-ux-pro-max/references/pro-rules.md`.
2. **`impeccable`** — dirección y revisión de diseño (`/impeccable`, por
   ejemplo `audit` o `polish`). Al terminar, correr el detector sobre lo que
   cambió: `.claude/skills/impeccable/scripts/impeccable.cmd detect --json <archivos>`
   (en macOS/Linux, sin `.cmd`).
3. **Hook de impeccable**: corre solo tras cada Edit/Write y al terminar la
   respuesta (`.claude/settings.json` → `.claude/hooks/impeccable-hook.cjs`,
   funciona igual en PowerShell, cmd y Bash). Cada ejecución queda anotada en
   `.impeccable/hook-runs.log`: si después de editar interfaz no aparece una
   línea nueva, el hook no está corriendo — avisar y correr el detector a mano.
   En un equipo nuevo, la primera vez descarga su motor: correr antes
   `.claude/skills/impeccable/scripts/impeccable.cmd engine-probe`.

## Trabajo pendiente conocido

- [RENDIMIENTO-PENDIENTE.md](RENDIMIENTO-PENDIENTE.md): diagnóstico de
  rendimiento de navegación entre páginas, con plan de arreglo priorizado.
  Los puntos 1 (Pedidos Dropi: el resumen se agrega en Postgres, migración 0037),
  2 y 3 (caché de país/plataformas y consultas en paralelo) ya están aplicados
  (Hernán confirmó el punto 1 el 21 sept 2026); queda el 4 (límite a los rangos de
  fechas personalizados).

## Flujo de trabajo con git

- Cambios se hacen en una rama propia (`git checkout -b nombre-rama`), no
  directo a `main`.
- Al terminar: `git push -u origin nombre-rama` y abrir un Pull Request a
  `main` en GitHub para revisión antes de mergear.
- Vercel genera un deploy de preview automático por cada rama/PR abierto,
  independiente del deploy de producción.
