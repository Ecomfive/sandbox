@AGENTS.md

# Sistema Gestión de Plataformas Ecomfive

Ver [PRODUCT.md](PRODUCT.md) para el propósito del producto, usuarios y
alcance actual (Costa Rica + Panamá, Dropi). Este archivo es para
convenciones técnicas del código.

## Stack

- Next.js (App Router), Server Components y Server Actions.
- Supabase: Postgres + Storage. RLS activado en todas las tablas
  (`for all using (auth.role() = 'authenticated')`).
- Hosting en Vercel, desplegado desde el repo `Ecomfive/sandbox` en GitHub,
  CI/CD automático en push a `main`.
- Sin autenticación de usuarios finales todavía (ver PRODUCT.md) — es una
  limitación temporal conocida, no una decisión de diseño definitiva.

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
- **País de cada persona.** `getPaisActual` (`src/lib/pais.ts`) resuelve el país con
  este orden: la cookie `pais_actual` de este navegador; si no hay, el último país que
  la persona eligió (`perfiles.pais_preferido`, migración 0038, que `setPaisActual`
  guarda al cambiar de país); y si tampoco, Costa Rica. La consulta a `perfiles` solo
  se hace **sin cookie** (otro equipo, cookies borradas), para no sumar un viaje a
  cada página; con cookie manda la cookie aunque en otro equipo se haya elegido otro
  país. Sin la migración todo sigue como antes (cookie o Costa Rica).
- **Buscador con Ctrl K.** El buscador de la barra de arriba
  (`src/components/busqueda-global.tsx`) se abre con Ctrl K (o ⌘ K) desde cualquier
  página. Sin escribir muestra las páginas recientes (`paleta-recientes-v1`, en el
  navegador de cada persona) y otras a las que ir; al escribir filtra las páginas
  del menú al instante y pide al servidor retiros (por correlativo: `#0007` o `7`),
  pedidos, productos y dropshippers (`src/lib/busqueda-global.ts`, que respeta los
  módulos de la persona). Es un combobox con flechas, Enter y Escape. La lista de
  páginas sale del menú y de las pestañas de cada módulo
  (`paginasBuscables`, `src/lib/paleta.ts`): una página nueva del menú se puede
  buscar sola; un resultado nuevo del servidor se agrega en `buscarGlobal`.
- **Ficha de un retiro.** Un clic en su `#` abre un panel a la derecha
  (`<Ventana lado="derecha" ancho="lg">`, `retiros/vista-rapida-retiro.tsx`) con su barra
  de pasos (Creado, Aprobado, Recibido — no es lo mismo que `estado`, ver
  `pasosDelRetiro`). **La ficha ya es el formulario**
  (`retiros/formulario-editar-retiro.tsx`, sin un botón "Modificar" aparte, mismo patrón
  que la ficha de cuenta destino): se cambia un campo y arriba, junto a los botones
  grandes de Conciliar, Novedad (solo en un retiro abierto), Abrir (solo en novedad),
  Cancelar y Eliminar, aparecen "Guardar cambios" y "Cancelar" — que solo se ven con
  cambios sin guardar. Guardar no cierra la ficha. **«Conciliar», «Novedad» y «Abrir» no
  abren una ventana en el medio**: despliegan una sección al final de la misma ficha,
  **encima del historial** (`SeccionConciliarRetiro`, `SeccionNovedadRetiro`,
  `SeccionResolverNovedad`; solo una a la vez), la ficha
  baja hasta ella (`irAlPanel`, sin movimiento suave si se pidió menos animación) y el foco
  entra en su primer campo. Conciliar pide **Recibido** e **ID / Referencia, obligatorios**
  (Recibido: si se aleja de «A recibir» más de lo tolerado, `conciliarRetiro` no concilia y
  lo dice). El **soporte** es **opcional**: se adjunta con un botón que es **solo un
  ícono**, sin texto (`BotonAdjuntar` con `AdjuntoIcon`; ya con archivo se marca en verde y
  su nombre queda en el tooltip), pero no bloquea conciliar si no se adjunta uno — ni en la
  ficha ni en el servidor (`conciliarRetiro`). Novedad pide una
  **nota** (obligatoria, hasta 500 caracteres): `agregarNovedadRetiro` pasa el retiro a
  novedad y deja la nota en su historial («Novedad: …») y en la auditoría; entonces aparece
  «Abrir». **«Abrir» no reabre el retiro**: baja a una sección con **la nota de la novedad**
  (`SeccionResolverNovedad`, que la saca del historial con `novedadVigente`,
  `src/lib/retiros/novedad.ts`: la nota más reciente que no esté ya resuelta ni sustituida
  por un estado puesto a mano; sin nota lo dice) y el botón **«Resuelto»**, que es lo único
  que quita la novedad (`reabrirRetiro`: el retiro vuelve a abierto). Las secciones de
  Conciliar y Novedad usan el botón grande de `BotonCrear` y
  `useFaltantes` (apagado hasta llenar lo obligatorio; pulsarlo así lleva al dato que
  falta), y al terminar suben `versionHistorial` para que el historial se vuelva a pedir.
  El selector de Estado se ve siempre, hasta en un retiro cancelado: es la forma de
  reabrirlo. Sin pestañas: los campos y los datos que no se editan (Recibido, Cierre,
  Creado por —quien creó el retiro, no se reasigna—, Consolidación, Estado en Dropi,
  Soporte) van seguidos, y **el historial
  de actividad (`HistorialGenerico`, con `obtener={obtenerActividadRetiro}`) es siempre lo
  último de la ficha**, debajo de Conciliar o Novedad cuando están desplegadas; por eso no
  vive dentro del formulario. **No le pongas `key` a `HistorialGenerico`** en la ficha: con
  una `key={fila.id}` al conciliar o agregar una novedad la sección se quedaba en
  «Conciliando…» y no se cerraba (el estado pendiente de la acción no terminaba). Con
  cambios sin guardar, cerrar la ficha pide confirmación.
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
- **Contadores en el menú lateral.** Las páginas donde se resuelve un pendiente
  (Alertas de inventario, Pedidos Dropi, Conciliación de Retiros) muestran una
  pastilla con cuántos hay, y el grupo o la sección cerrados muestran la suma de
  lo que esconden (con el riel colapsado, sobre el ícono). El reparto vive en
  `calcularPendientesMenu` (`src/lib/contadores-menu.ts`), que parte de
  `obtenerPendientesHoy` (solo `count` con `head`, nada de traer filas) y respeta
  los módulos de la persona; para sumar una página, agrégala ahí. **El layout no
  espera la consulta**: crea la promesa y el menú la lee con `use()` dentro de un
  `Suspense` (`src/components/sidebar.tsx`), así que el menú sale al instante y
  los números llegan después; si la consulta falla, el menú sale sin contadores.
  Los números se calculan al cargar el layout, no en cada navegación entre páginas
  (el layout persiste): se ven al día tras recargar o al refrescar la ruta. La
  pastilla dice «3 pendientes» a los lectores de pantalla (texto oculto, no una
  región en vivo).
- **Riel del menú colapsado.** Con el menú colapsado (solo íconos), pulsar el ícono
  de una sección (Proveeduría, Tiendas, Catálogo, Recursos Humanos) abre a su
  derecha un **panel** con las páginas de esa sección y sus contadores
  (`PanelSeccion`, `src/components/sidebar-panel.tsx`), para ir a ellas sin
  desplegar el menú. Va por portal a `<body>`; el foco pasa a la primera página;
  se cierra con Escape (el foco vuelve al ícono), al pulsar fuera, al pulsar el
  mismo ícono o al elegir una página, y Tab más allá de la última página lo cierra
  y sigue desde el ícono. El ícono lleva `data-panel-abridor` y `aria-expanded`.
  Todo control del riel debe tener nombre accesible aunque no muestre texto
  (`aria-label` cuando `!expanded`). Con el menú desplegado nada cambia (las
  secciones se abren en el propio menú).
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
  que esté marcado (acciones en lote) cuenta solo en la página que se ve.
- **Densidad y encabezado fijo de las tablas.** La caja de cada tabla de datos es
  `<ContenedorTabla ariaLabel="...">` (`src/components/tabla/contenedor-tabla.tsx`)
  y la `<table>` lleva la clase `tabla-datos`; los estilos están en
  `globals.css`. La densidad (Cómoda o Compacta, en el menú «Columnas») la elige
  cada persona y vale para todas las tablas (`densidad-filas-v1`). La barra de
  herramientas queda fija arriba al bajar la página y, si la tabla cabe sin
  desplazarse de lado, su encabezado queda fijo debajo de ella; si es más ancha
  que su tarjeta se desplaza de lado (como región con teclado) y el encabezado no
  se fija, porque un encabezado fijo no funciona dentro de una caja que se
  desplaza de lado. No pongas `overflow-hidden` en una tarjeta que contenga una
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
