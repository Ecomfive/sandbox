# Plan de acción: extensión propia para investigar anuncios de Meta («Ecomfive · Anuncios»)

**Estado: PENDIENTE, no se ejecuta todavía** (decisión de Jhokser, 26 oct 2026). Este documento es para retomarlo sin repetir el análisis.
Origen: análisis de la extensión **AdGrab** (Facebook Ads Library Research, v0.3.115, un solo desarrollador, 122 usuarios, 0 reseñas, 29 US$/mes la versión Pro),
probada en la Biblioteca de anuncios de Meta el 26 oct 2026.

## 1. Para qué nos sirve

Hoy encontramos productos con Test productos, Scraping de proveedores, Drop Killer, Tu Winner e Instagram. Nos falta mirar **lo que la competencia ya
anuncia y lleva tiempo anunciando**: un anuncio activo mucho tiempo y con muchas versiones es un producto que vende. Eso alimenta:

| Módulo del sistema | Qué recibiría |
|---|---|
| **Testing Lab › Fuentes** (junto a Instagram, Scraping, Drop Killer) | Una fuente nueva: «Anuncios de Meta», con cada producto anunciado, sus días activos, versiones y cuántos anunciantes lo venden. |
| **Selección de productos** | Los ganadores entran como «Seleccionado» con su puntaje, y el cruce `yaVisto` (ya testeado, ya en Producto, ya comprado, ya lo vendemos en Dropi) los descarta o los marca. |
| **Análisis de competencia / Inteligencia competitiva** | Para cada producto que ya vendemos en Dropi: quién lo anuncia, desde cuándo, si el anunciante sube o baja anuncios, y a qué precio y tienda lleva. |
| **Gestión de IDs Dropi** | Alerta cuando un competidor empieza a escalar un producto nuestro (recomendación de precio o de combo). |
| **Generador de landings** | Creativos, copy y ganchos de referencia guardados por producto. |
| **Hoy** | Pendientes nuevos en la cola: «3 productos ganadores nuevos», «un competidor duplicó sus anuncios de X». |

## 2. Qué copiamos de AdGrab y qué hacemos mejor

| AdGrab (lo que vimos) | Nuestra versión |
|---|---|
| Barra sobre la Biblioteca con días activos, versiones (×N), plataforma de tienda | Igual, pero los datos **se guardan en nuestro sistema** y se cruzan con Producto, Compras y Dropi. |
| Lista «Productos»: anuncios agrupados por página de destino | Agrupar por **producto** (destino normalizado + foto), con número de anunciantes = saturación. |
| Perfil del anunciante (formatos, ganchos, CTAs, antigüedad) | Igual, y con **historial** (cuántos anuncios activos tuvo cada día). |
| Seguir tienda (revisa una vez al día) | Seguimiento diario con tendencia y alerta en «Hoy». |
| Descarga de videos por tienda | Guardar creativos en nuestro Storage, asociados al producto; descarga masiva apagada por defecto. |
| Detección de Shopify, WhatsApp, WooCommerce, Funnelish… abriendo la tienda en el navegador | Hacerla **en el servidor** (sin abrir pestañas ni usar la IP de la persona), con grado de confianza («probable»). |
| Datos solo en el equipo de cada persona | Compartidos por todo el equipo, con permisos del sistema. |
| Exportar a CSV (la ficha lo promete, no vimos el botón) | Exportar con `TablaDatos`, como el resto del sistema. |
| Sin puntaje | **Puntaje de ganador** con pesos visibles y editables (como las Reglas de Gestión de IDs). |
| Funciones que fallan sin decir por qué (Engagement, Destapar funnel) | Cada función termina con resultado o con error claro. |

## 3. Decisiones que hay que tomar antes de empezar (Fase 0)

1. **Una extensión aparte o dentro de «Ecomfive · Dropi».** Recomendado: **aparte**. Así la que toca Meta no comparte permisos ni perfil con la que usa la
   sesión de Dropi, y un bloqueo de Meta no afecta a Dropi.
2. **Con o sin sesión de Facebook.** La Biblioteca se puede ver sin iniciar sesión. Recomendado: **sin sesión**, en un perfil de Chrome dedicado; es la mejor
   defensa contra bloqueos de la cuenta personal.
3. **Países y productos de interés** (Panamá, Costa Rica, México, Colombia…): define qué búsquedas se corren.
4. **Quién la usa** (al inicio una o dos personas, como «Actualizar Dropi»).
5. **Aceptar el riesgo de términos de Meta.** La API oficial solo entrega anuncios políticos y de la UE; para anuncios comerciales de la región solo se
   puede leer la página. Es uso interno de datos públicos, pero va contra las condiciones de Meta: hay que decidirlo de forma consciente.
6. **Cómo se distribuye:** instalada en modo desarrollador o como `.zip` interno; no se publica en la Chrome Web Store.

## 4. Arquitectura propuesta

- **Extensión MV3 «Ecomfive · Anuncios»** (carpeta `extension/ecomfive-anuncios`, mismo estilo que `extension/ecomfive-dropi`):
  - *Lector* en `facebook.com/ads/library/*`: recorre las tarjetas y saca id de la biblioteca, anunciante y página, fecha de inicio (→ días activos), versiones
    (el dato `collation_count` que usa Meta), formato (video, imagen, carrusel), copy, botón (CTA), enlace de destino y país. Se prefiere leer las respuestas
    internas de la página sobre el texto de la pantalla, que cambia más.
  - *Puente* (`puente.js`) igual al de «Ecomfive · Dropi»: el sistema le pide la lectura por `window.postMessage` y la extensión sube lo leído por **direcciones
    firmadas** a una carpeta temporal (mismo patrón de `tmp-dropi-panel`). Nada de credenciales ni de la sesión de Facebook sale de la pestaña.
  - *Ventana flotante* (como la barra de AdGrab) con lo mínimo: filtros, «traer más», y «enviar al sistema».
- **Servidor (Next.js + Supabase):**
  - `src/lib/anuncios/` con lógica pura y pruebas: `normalizarDestino` (quita rastreo, agrupa por dominio y producto), `detectarPlataforma(html)` (Shopify, Woo,
    Funnelish, ClickFunnels, WhatsApp, checkout), `puntajeGanador`, `agruparPorProducto`.
  - La **detección de tienda** baja la página con `descargarPublico` (el descargador seguro ya existente, sin red interna y con tope de tamaño).
  - Cruces con lo que ya hay: `yaVisto`, `repetidos`, `cargarSugerencias` y la huella de foto (`foto_huella`).
- **Seguimiento diario:** una tarea programada (como «dropi-diario», desde la copia de tareas) que pide a la extensión recorrer las tiendas seguidas, o la propia
  extensión con `chrome.alarms` mientras el perfil esté abierto. Decidir en la Fase 0.

## 5. Modelo de datos (migraciones nuevas; RLS activado y sin políticas)

- `anuncios_busquedas`: quién, cuándo, palabra o anunciante, país, filtros, cuántos anuncios se leyeron.
- `anuncios_meta`: `biblioteca_id` único, `pagina_id`, anunciante, país, `fecha_inicio`, `activo`, `versiones`, formato, copy, CTA, `destino_url`, `dominio`,
  `plataforma_tienda`, `tiene_whatsapp` (sí/no, **sin guardar el número**), `creativo_ruta`, `huella`, `visto_primera`, `visto_ultima`, `metricas` (jsonb).
- `anuncios_historial`: una fila por día y anunciante o tienda con cuántos anuncios activos tiene (de ahí salen las tendencias y las alertas).
- `anuncios_productos`: el producto agrupado (destino normalizado + foto), con número de anunciantes, antigüedad del más viejo y puntaje.
- `anuncios_tiendas`: tiendas seguidas, quién las sigue, desde cuándo y el umbral de alerta.
- Bucket privado `anuncios-creativos` (rutas confinadas con `rutaPropia`, archivos revisados por su contenido).
- Nada de contraseñas ni cookies de Meta. Auditoría con `registrarAuditoria` y entidades nuevas en `MODULO_DE_ENTIDAD`.

## 6. Fases (estimadas en días de trabajo)

| Fase | Entrega | Criterio de aceptación | Días |
|---|---|---|---|
| **0. Decisiones y prueba rápida** | Las decisiones de la sección 3 y un lector desechable contra 3 búsquedas reales (Panamá, Costa Rica, México) | Se leen ≥ 90 % de las tarjetas con días, versiones y destino | 1–2 |
| **1. Lector y panel básico** | Extensión mínima + módulo «Anuncios» (lista con `TablaDatos`, ficha, migración) + guía en el Centro de ayuda | Una búsqueda queda guardada y se ve en el sistema con sus filtros y su CSV | 5 |
| **2. Tienda y producto** | `detectarPlataforma` en el servidor, agrupación por producto, saturación (anunciantes por producto) | La lista «Productos» de una búsqueda coincide con la de AdGrab (10 productos en «limpiador a vapor» Colombia) | 4 |
| **3. Ganadores y Selección** | Puntaje de ganador con pesos editables, botón «Enviar a Selección» con cruce `yaVisto`, pendiente en «Hoy» | Un ganador entra a Selección con su motivo y no duplica uno ya visto | 4 |
| **4. Seguimiento** | Tiendas seguidas, historial diario, tendencia y alertas | Una tienda que duplica sus anuncios genera una alerta en 24 h | 5 |
| **5. Creativos y landings** | Guardar creativos y copy por producto; ganchos más usados; referencia en el Generador de landings | Desde un producto se abren sus creativos guardados | 4 |
| **6. Competencia de lo nuestro** | Monitoreo por palabra clave de cada producto publicado en Dropi; recomendación en Gestión de IDs | Un producto nuestro muestra «N anunciantes, el más viejo desde…» | 3 |
| **7. Endurecimiento** | Pruebas, botón de apagado remoto, guía de uso y empaquetado interno | Revisión de seguridad hecha y checklist de la sección 7 cumplido | 2 |

Total aproximado: **28–30 días** de trabajo. Se puede parar después de la Fase 3 y ya da valor.

## 7. Reglas contra bloqueos y riesgos (obligatorias)

- Leer **sin sesión** de Facebook, en un perfil de Chrome dedicado; nunca la cuenta principal.
- Solo **lectura**: la extensión no hace clic en nada que publique, siga, reaccione ni envíe.
- Ritmo humano: pausas aleatorias de 1,5 a 4 s entre cargas, tope de anuncios por búsqueda, tope de búsquedas por hora y por día, y **pausa automática** si la
  página responde con error, captcha o aviso de bloqueo (con aviso claro a la persona).
- Descarga masiva de videos apagada por defecto, con tope bajo (50).
- **Apagado remoto:** una bandera en el sistema que desactiva la extensión si Meta cambia algo o hay un problema.
- Registro de actividad por persona (cuántas lecturas y cuándo).
- Permisos mínimos: solo la Biblioteca de anuncios y el sistema; nada de «todos los sitios». Sin código remoto. Mensajes solo desde el origen del sistema.
- Números de WhatsApp: **no guardarlos**, solo si el anuncio lleva WhatsApp.
- Aviso al equipo: los datos son públicos pero la lectura va contra las condiciones de Meta; es un uso interno y se puede perder el acceso.

## 8. Qué NO haremos (por ahora)

- Publicar la extensión o venderla.
- Engagement real de las publicaciones y alcance de la UE (dependen de datos que Meta no entrega para la región).
- Descargas masivas sin límite.
- Usar la sesión de Facebook de nadie.

## 9. Cómo saber que funcionó

- Ganadores encontrados por mes que entran a Selección y cuántos de ellos terminan en Test productos o Compras.
- Productos que **descartamos** por estar saturados antes de testearlos.
- Competidores que escalan un producto nuestro y detectamos antes de que bajen nuestras ventas.
- Tiempo para pasar de «vi un anuncio» a «está en Selección» (hoy es manual).

## 10. Preguntas abiertas

1. ¿Una extensión nueva o la actual? (recomendado: nueva)
2. ¿Quién la mantiene cuando Meta cambie la página? Hay que asignar a una persona.
3. ¿El seguimiento diario corre en la copia de tareas de Hernán o dentro de la extensión?
4. ¿Qué países y qué palabras clave empezamos a vigilar?
5. ¿Queremos exponer los datos a Contenido y ofertas (copy y creativos) desde la Fase 1?

## Anexo: lo observado en AdGrab (26 oct 2026)

- Barra inferior: «# Ads» (mínimo de versiones: con 3, de 28 anuncios quedó 1), Scroll automático, país, idioma, tienda (dropshipping, Shopify, Funnelish,
  WooCommerce, ClickFunnels, Hotmart, WhatsApp), «Productos», orden (Meta, más días activos, más nuevos, más versiones), descarga masiva con tope (50, 120, 300,
  sin tope), solo nuevos, Panel (Guardados, Tiendas seguidas, Historial de descargas), modo oscuro, limpiar filtros.
- Cada tarjeta: días activos, menú «Abrir» (página de destino, su página en Facebook, anuncios del dominio, enlace, perfil del anunciante, destapar funnel,
  creativos reales, seguir tienda, descargar todos sus videos), Engagement, versiones ×N, copiar, guardar y descargar.
- Perfil del anunciante probado con «Ofertas24Col»: mezcla de formatos, gancho más usado, destinos, botones, antigüedad (mediana 129 días), versiones.
- Lista «Productos» probada con «limpiador a vapor» (Colombia): 10 productos con su dominio y número de anuncios.
- Detección de plataforma probada: 14 Shopify, 3 Funnelish, 11 WhatsApp, 8 dropshipping (de 28 anuncios cargados).
- No comprobados: Engagement (devolvió «dark post»), Destapar funnel, alcance y gasto de la UE, descargas y «Seguir tienda».
- Ficha: desarrollador hoyosf500, 122 usuarios, 0 reseñas, planes Free (10 descargas al mes) y Pro (29 US$/mes), autenticación con Supabase, sitio en Lovable.
