// «Actualizar datos» (19 nov 2026): de dónde sale la última vez de cada fuente y quién puede actualizarla. Cada fuente sale solo si la persona tiene
// el módulo de su pantalla de siempre; el botón, solo si además puede hacerlo allí (las mismas reglas de cada pantalla: aquí solo se muestran, la
// barrera real sigue en cada acción). Las lecturas que pasan por la extensión de Chrome (Dropi, Drop, Dunamixfy, SISCORE, Tu Winner) se abren en su
// pantalla; las que corre el servidor (Effi, Shopify, Monday, QuickBooks, Dropi finanzas, Meta) se corren desde aquí.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarPanel } from "@/app/(app)/publicaciones-dropi/actualizar/datos";
import type { UsuarioActual } from "@/lib/auth";
import { PARTES, sitioDe, puedeActualizarDropi, type ClaveParte, type Sitio } from "@/lib/dropi-actualizar/partes";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { NOMBRE_MODULO, ORDEN_CARGA, type ModuloImportable } from "@/lib/importar/reconocer";
import { getPaisActual } from "@/lib/pais";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { administraIntegraciones } from "@/lib/quickbooks/permiso";
import { tiendasDeLaPersona } from "@/lib/tienda/acceso";
import { estadoFuente, masNueva, type AccionFuente, type Fuente, type GrupoFuente } from "./estado";

/** Los días que se esperan entre lecturas: lo diario se atrasa pasado un día (26 h, como las tareas programadas); los Excel, pasado un mes. */
const DIARIA = 26;
const MENSUAL = 35 * 24;
/** La competencia cambia poco: se lee una vez por semana (24 nov 2026); se atrasa pasados 8 días. */
const SEMANAL = 8 * 24;
const VIGENCIA_CORRIENDO_MS = 40 * 60_000;

type FilaTarea = { tarea: string; inicio: string; fin: string | null; ok: boolean | null; error: string | null; disparo: string | null; usuario_id: string | null };

const tiene = (u: UsuarioActual, modulo: string) => u.modulos.includes(modulo);
const escribe = (u: UsuarioActual, modulo: string) => tiene(u, modulo) && !u.modulosSoloLectura.includes(modulo);
const reciente = (iso: string | null | undefined, ms: number) => Boolean(iso) && Date.now() - Date.parse(iso!) < ms;

/** Todas las fuentes que la persona puede ver, en el orden del panel. */
export async function cargarFuentes(supabase: SupabaseClient, u: UsuarioActual): Promise<Fuente[]> {
  const permitidas = await cargarTiendasPermitidas();
  const todaLaEmpresa = permitidas === null;
  const desde60 = new Date(Date.now() - 60 * 24 * 3_600_000).toISOString();
  const auditoria = (accion: string) =>
    supabase.from("historial_auditoria").select("usuario_nombre, creado_en").eq("accion", accion).gte("creado_en", desde60).order("creado_en", { ascending: false }).limit(1).maybeSingle();

  const verDropi = tiene(u, "publicaciones-dropi") || tiene(u, "retiros");
  const verEffi = tiene(u, "publicaciones-effi") || tiene(u, "analisis-competencia");
  const verTareas = tiene(u, "deliverys") || tiene(u, "cierre-mes") || tiene(u, "panel-financiero") || tiene(u, "ventas-tiendas");
  const archivos = ORDEN_CARGA.filter((m) => m !== "ventas-tiendas" && tiene(u, m));
  const vacio = Promise.resolve({ data: null });

  const [dropi, effi, tareas, matriz, matrizExcel, matrizPedido, siscore, saldo, meta, metaManual, tuwinner, importaciones, conteo, conexiones, competenciaDrop] = await Promise.all([
    verDropi ? cargarPanel(supabase) : null,
    verEffi ? supabase.from("effi_publicaciones").select("ultima_vez").eq("en_effi", true).order("ultima_vez", { ascending: false }).limit(1).maybeSingle() : vacio,
    verTareas
      ? supabase
          .from("fin_tareas_ejecuciones")
          .select("tarea, inicio, fin, ok, error, disparo, usuario_id")
          .in("tarea", ["monday", "quickbooks", "dropi-finanzas", "shopify-ventas"])
          .order("inicio", { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] as FilaTarea[] }),
    tiene(u, "tienda-reporteria") ? auditoria("importar_matriz_reporteria") : vacio,
    tiene(u, "tienda-reporteria")
      ? supabase.from("fin_importaciones").select("usuario_nombre, creado_en, terminado_en, estado").eq("modulo", "ventas-tiendas").order("creado_en", { ascending: false }).limit(1).maybeSingle()
      : vacio,
    // Sin registro de la carga (la primera se hizo con un script, 17 nov 2026): el último pedido nuevo que llegó de la Matriz.
    tiene(u, "tienda-reporteria")
      ? supabase.from("ven_ordenes").select("creado_en").eq("origen", "Excel Matriz").order("creado_en", { ascending: false }).limit(1).maybeSingle()
      : vacio,
    tiene(u, "tienda-logistica")
      ? supabase.from("tienda_guias_lecturas").select("estado, inicio, fin, error, iniciado_por_nombre").order("inicio", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    tiene(u, "retiros") ? supabase.from("saldos_wallet").select("actualizado_en").order("actualizado_en", { ascending: false }).limit(1).maybeSingle() : vacio,
    tiene(u, "anuncios-meta") ? supabase.from("meta_cuentas").select("ultima_lectura_en, ultimo_error").eq("activa", true) : Promise.resolve({ data: [] }),
    tiene(u, "anuncios-meta") ? auditoria("leer_cuentas_meta") : vacio,
    tiene(u, "tu-winner") ? supabase.from("tuwinner_lecturas").select("estado, inicio, fin, error, iniciado_por_nombre").order("inicio", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    archivos.length
      ? supabase.from("fin_importaciones").select("modulo, usuario_nombre, creado_en, terminado_en, estado").in("modulo", archivos).order("creado_en", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    tiene(u, "inventario") ? auditoria("conteo_inventario") : vacio,
    tiene(u, "ventas-tiendas") ? supabase.from("ven_tiendas_conexion").select("unidad_id, activo, ultima_lectura, ultimo_error") : Promise.resolve({ data: [] }),
    // La competencia en Drop (24 nov 2026): cada lectura queda en drop_competencia_busquedas (lista, fallida o corriendo).
    tiene(u, "analisis-competencia") ? supabase.from("drop_competencia_busquedas").select("estado, inicio, fin, detalle").order("inicio", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);

  // Los nombres de quien corrió a mano una tarea programada.
  const filasTarea = (tareas.data ?? []) as FilaTarea[];
  const ids = [...new Set(filasTarea.map((t) => t.usuario_id).filter((x): x is string => Boolean(x)))];
  const { data: perfiles } = ids.length ? await supabase.from("perfiles").select("id, nombre, email").in("id", ids) : { data: [] };
  const nombreDe = new Map(((perfiles ?? []) as { id: string; nombre: string | null; email: string | null }[]).map((p) => [p.id, p.nombre || p.email || "—"]));

  const fuentes: Fuente[] = [];
  const agregar = (
    f: Omit<Fuente, "estado"> & { corriendo?: boolean; conError?: boolean },
    plazo: number | null,
  ) => {
    const { corriendo, conError, ...resto } = f;
    fuentes.push({ ...resto, estado: estadoFuente({ fecha: f.fecha, error: conError, corriendo }, plazo) });
  };
  /** La última corrida de una tarea programada (Monday, QuickBooks, Dropi finanzas, pedidos de Shopify). */
  const deTarea = (clave: string) => {
    const t = filasTarea.find((x) => x.tarea === clave);
    if (!t) return { fecha: null, quien: null, error: null, corriendo: false, conError: false };
    const corriendo = !t.fin && reciente(t.inicio, 2 * 3_600_000);
    return {
      fecha: t.fin ?? t.inicio,
      quien: t.disparo === "manual" ? (t.usuario_id ? (nombreDe.get(t.usuario_id) ?? "—") : "—") : "Automática",
      error: t.ok === false ? (t.error ?? "Falló") : null,
      corriendo,
      conError: t.ok === false || (!t.fin && !corriendo),
    };
  };

  // ── Plataformas ──
  if (dropi && tiene(u, "publicaciones-dropi")) {
    const puede = puedeActualizarDropi(u) && escribe(u, "publicaciones-dropi");
    const SITIOS: { sitio: Sitio; nombre: string; que: string; sesion: string }[] = [
      { sitio: "pa", nombre: "Dropi Panamá", que: "Pedidos, cartera, retiros, stock y ventas", sesion: "Dropi Panamá" },
      { sitio: "cr", nombre: "Dropi Costa Rica", que: "Pedidos, cartera, retiros, stock y ventas", sesion: "Dropi Costa Rica" },
      { sitio: "mx", nombre: "Dropi México", que: "Pedidos, cartera, retiros, stock y ventas", sesion: "Dropi México" },
      { sitio: "drop", nombre: "Drop (Costa Rica)", que: "Productos, precio, stock y ventas por día", sesion: "Drop" },
      { sitio: "duna", nombre: "Dunamixfy (Costa Rica)", que: "Productos, precio, stock, ventas y dropshippers", sesion: "Dunamixfy" },
    ];
    for (const s of SITIOS) {
      const claves = PARTES.filter((p) => p.tipo !== "effi" && sitioDe(p.lector) === s.sitio).map((p) => p.clave) as ClaveParte[];
      const ultimas = claves.map((c) => dropi.ultima[c]).filter((x) => x !== undefined);
      const fecha = masNueva(...ultimas.map((x) => x.fecha));
      const conError = ultimas.some((x) => x.estado === "error");
      const corrida = dropi.corridas.find((c) => claves.some((k) => c.partes[k]?.fin));
      const enCurso = dropi.corridas.find((c) => c.estado === "corriendo" && reciente(c.inicio, VIGENCIA_CORRIENDO_MS) && c.pedidas.some((k) => claves.includes(k)));
      const porTarea = ultimas.find((x) => x.fecha === fecha)?.porTarea;
      agregar(
        {
          clave: `dropi-${s.sitio}`,
          grupo: "plataformas",
          nombre: s.nombre,
          que: s.que,
          fecha,
          quien: porTarea ? "Automática" : (corrida?.quien ?? null),
          error: conError ? (ultimas.find((x) => x.estado === "error")?.detalle ?? "Falló") : null,
          automatica: null,
          requisito: `Con la extensión y la sesión de ${s.sesion}`,
          donde: { texto: "Gestión de IDs", href: puede ? "/publicaciones-dropi/actualizar" : "/publicaciones-dropi" },
          accion: puede ? { tipo: "ventana", ventana: { tipo: "dropi", sitio: s.sitio }, titulo: `Actualizar ${s.nombre}`, texto: "Actualizar" } : null,
          corriendo: Boolean(enCurso),
          conError,
        },
        DIARIA,
      );
    }
  }
  if (verEffi) {
    const puede = escribe(u, "publicaciones-effi") && puedeVerPais(u.paisesPermitidos, "CR");
    agregar(
      {
        clave: "effi",
        grupo: "plataformas",
        nombre: "Effi (Costa Rica)",
        que: "Stock de nuestras bodegas, ventas y nuestros precios en Competencia",
        fecha: ((effi.data as { ultima_vez?: string } | null)?.ultima_vez as string | undefined) ?? null,
        quien: null,
        error: null,
        automatica: "Sola, todos los días 6:00 a. m.",
        requisito: "Y a mano cuando haga falta",
        donde: tiene(u, "publicaciones-effi") ? { texto: "Gestión de IDs › Effi", href: "/publicaciones-effi" } : { texto: "Análisis de competencia", href: "/analisis-competencia" },
        accion: puede ? { tipo: "correr", clave: "effi", texto: "Actualizar" } : null,
      },
      DIARIA,
    );
  }

  // ── Tiendas ──
  if (tiene(u, "tienda-productos")) {
    const pais = await getPaisActual(supabase);
    const { tiendas } = await tiendasDeLaPersona(supabase, pais.id, undefined);
    const conectadas = tiendas.filter((t) => t.estado === "conectada");
    const { data: ultima } = conectadas.length
      ? await supabase.from("tienda_variantes").select("actualizado_en").in("tienda_id", conectadas.map((t) => t.id)).order("actualizado_en", { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    agregar(
      {
        clave: "shopify-productos",
        grupo: "tiendas",
        nombre: "Productos de Shopify",
        que: conectadas.length ? `Productos y variantes de ${conectadas.map((t) => t.nombre).join(", ")}` : "Productos y variantes de las tiendas conectadas",
        fecha: (ultima?.actualizado_en as string | undefined) ?? null,
        quien: null,
        error: null,
        automatica: "Sola al abrir Gestión de tienda, cada 12 h",
        requisito: "Y a mano cuando haga falta",
        donde: { texto: "Productos de Shopify", href: "/tienda-tiendas/productos" },
        accion:
          escribe(u, "tienda-productos") && conectadas.length
            ? { tipo: "correr", clave: "shopify-productos", texto: "Traer", tiendas: conectadas.map((t) => ({ id: t.id, nombre: t.nombre })) }
            : null,
      },
      DIARIA,
    );
  }
  if (tiene(u, "ventas-tiendas")) {
    const activas = ((conexiones.data ?? []) as { unidad_id: string; activo: boolean; ultima_lectura: string | null; ultimo_error: string | null }[]).filter((c) => c.activo);
    const t = deTarea("shopify-ventas");
    const fecha = masNueva(t.fecha, ...activas.map((c) => c.ultima_lectura));
    const conError = activas.some((c) => c.ultimo_error) || (t.conError && t.fecha === fecha);
    let tiendas: { id: string; nombre: string }[] = [];
    if (activas.length) {
      const { data: unidades } = await supabase.from("fin_unidades").select("id, nombre").in("id", activas.map((c) => c.unidad_id));
      tiendas = ((unidades ?? []) as { id: string; nombre: string }[]).map((x) => ({ id: x.id, nombre: x.nombre }));
    }
    agregar(
      {
        clave: "shopify-pedidos",
        grupo: "tiendas",
        nombre: "Pedidos de Shopify",
        que: "Órdenes y reembolsos de las tiendas conectadas",
        fecha,
        quien: t.fecha === fecha ? t.quien : null,
        error: conError ? (activas.find((c) => c.ultimo_error)?.ultimo_error ?? t.error ?? "Falló") : null,
        automatica: "Sola, todos los días 4:40 a. m.",
        requisito: "Y a mano cuando haga falta",
        donde: { texto: "Ventas › Pipeline", href: "/ventas-tiendas/pipeline" },
        // Por tienda conectada en Pipeline; si las tiendas vienen de las apps de Shopify (sin conexión en Pipeline), la tarea programada para quien la
        // puede correr (Tareas programadas).
        accion:
          todaLaEmpresa && escribe(u, "ventas-tiendas") && tiendas.length
            ? { tipo: "correr", clave: "shopify-pedidos", texto: "Sincronizar", tiendas }
            : escribe(u, "usuarios")
              ? { tipo: "correr", clave: "shopify-ventas", texto: "Correr ahora" }
              : null,
        corriendo: t.corriendo,
        conError,
      },
      DIARIA,
    );
  }
  if (tiene(u, "tienda-reporteria")) {
    const a = matriz.data as { usuario_nombre: string | null; creado_en: string } | null;
    const x = matrizExcel.data as { usuario_nombre: string | null; creado_en: string; terminado_en: string | null; estado: string } | null;
    const deExcel = x && x.estado === "terminada" ? (x.terminado_en ?? x.creado_en) : null;
    const ultimoPedido = (matrizPedido.data as { creado_en?: string } | null)?.creado_en ?? null;
    const registrada = masNueva(a?.creado_en, deExcel);
    const fecha = masNueva(registrada, ultimoPedido);
    agregar(
      {
        clave: "matriz",
        grupo: "tiendas",
        nombre: "La Matriz",
        que: "Pedidos de la hoja de administración",
        fecha,
        quien: !fecha || fecha !== registrada ? null : fecha === a?.creado_en ? a.usuario_nombre : (x?.usuario_nombre ?? null),
        error: null,
        automatica: null,
        requisito: "Sube el Excel de la Matriz",
        donde: { texto: "Reportería", href: "/tienda-reporteria" },
        accion: todaLaEmpresa && escribe(u, "tienda-reporteria") ? { tipo: "matriz", texto: "Actualizar" } : null,
      },
      DIARIA,
    );
  }

  // ── Entregas ──
  if (tiene(u, "tienda-logistica")) {
    const filas = (siscore.data ?? []) as { estado: string; inicio: string; fin: string | null; error: string | null; iniciado_por_nombre: string | null }[];
    const ultima = filas[0];
    const buena = filas.find((f) => f.estado === "listo");
    const conError = ultima?.estado === "error";
    agregar(
      {
        clave: "siscore",
        grupo: "entregas",
        nombre: "Servientrega (SISCORE)",
        que: "Estado y rastreo de las guías de interior",
        fecha: conError ? (ultima.fin ?? ultima.inicio) : (buena?.fin ?? null),
        quien: (conError ? ultima : buena)?.iniciado_por_nombre ?? null,
        error: conError ? (ultima.error ?? "Falló") : null,
        automatica: null,
        requisito: "Con la extensión y la sesión de SISCORE de cada tienda",
        donde: { texto: "Gestión de tienda › Logística", href: "/tienda-pedidos/logistica" },
        accion: todaLaEmpresa && escribe(u, "tienda-logistica") ? { tipo: "ventana", ventana: { tipo: "siscore" }, titulo: "Actualizar Servientrega (SISCORE)", texto: "Actualizar" } : null,
        corriendo: ultima?.estado === "corriendo" && reciente(ultima.inicio, VIGENCIA_CORRIENDO_MS),
        conError,
      },
      DIARIA,
    );
  }
  if (tiene(u, "deliverys")) {
    const t = deTarea("monday");
    agregar(
      {
        clave: "monday",
        grupo: "entregas",
        nombre: "Monday",
        que: "Despachos y entregas de ciudad",
        fecha: t.fecha,
        quien: t.quien,
        error: t.error,
        automatica: "Sola, todos los días 5:30 a. m.",
        requisito: "Y a mano cuando haga falta",
        donde: { texto: "Deliverys › Monday", href: "/deliverys/monday" },
        accion: todaLaEmpresa && escribe(u, "deliverys") && administraIntegraciones(u) ? { tipo: "correr", clave: "monday", texto: "Leer ahora" } : null,
        corriendo: t.corriendo,
        conError: t.conError,
      },
      DIARIA,
    );
  }

  // ── Finanzas ──
  if (tiene(u, "panel-financiero")) {
    const t = deTarea("dropi-finanzas");
    const puede = escribe(u, "usuarios");
    agregar(
      {
        clave: "dropi-finanzas",
        grupo: "finanzas",
        nombre: "Dropi al portal financiero",
        que: "Entregados, ganancias y billetera",
        fecha: t.fecha,
        quien: t.quien,
        error: t.error,
        automatica: "Sola, todos los días 4:30 a. m.",
        requisito: null,
        donde: puede ? { texto: "Tareas programadas", href: "/panel-financiero/tareas" } : { texto: "Estado del sistema", href: "/panel-financiero/estado-sistema" },
        accion: puede ? { tipo: "correr", clave: "dropi-finanzas", texto: "Correr ahora" } : null,
        corriendo: t.corriendo,
        conError: t.conError,
      },
      DIARIA,
    );
  }
  if (tiene(u, "retiros")) {
    const puede = puedeActualizarDropi(u) && escribe(u, "publicaciones-dropi");
    agregar(
      {
        clave: "retiros",
        grupo: "finanzas",
        nombre: "Retiros y saldo de Dropi",
        que: "Saldo de la billetera y retiros de cada país",
        fecha: ((saldo.data as { actualizado_en?: string } | null)?.actualizado_en as string | undefined) ?? null,
        quien: null,
        error: null,
        automatica: null,
        requisito: "Se trae con «Actualizar» de Dropi de cada país",
        donde: { texto: "Retiros", href: "/retiros" },
        accion: puede ? { tipo: "ventana", ventana: { tipo: "dropi", sitio: null }, titulo: "Actualizar Dropi (retiros y saldo de cada país)", texto: "Actualizar" } : null,
      },
      DIARIA,
    );
  }
  if (tiene(u, "cierre-mes")) {
    const t = deTarea("quickbooks");
    agregar(
      {
        clave: "quickbooks",
        grupo: "finanzas",
        nombre: "QuickBooks",
        que: "Plan de cuentas, resultados y ventas",
        fecha: t.fecha,
        quien: t.quien,
        error: t.error,
        automatica: "Sola, todos los días 4:50 a. m.",
        requisito: "Y a mano cuando haga falta",
        donde: { texto: "Cierre de mes › QuickBooks", href: "/cierre-mes/quickbooks" },
        accion: escribe(u, "cierre-mes") && administraIntegraciones(u) ? { tipo: "correr", clave: "quickbooks", texto: "Leer ahora" } : null,
        corriendo: t.corriendo,
        conError: t.conError,
      },
      DIARIA,
    );
  }

  // ── Marketing e investigación ──
  if (tiene(u, "anuncios-meta")) {
    const cuentas = (meta.data ?? []) as { ultima_lectura_en: string | null; ultimo_error: string | null }[];
    const fecha = masNueva(...cuentas.map((c) => c.ultima_lectura_en));
    const manual = metaManual.data as { usuario_nombre: string | null; creado_en: string } | null;
    const conError = cuentas.some((c) => c.ultimo_error);
    agregar(
      {
        clave: "meta",
        grupo: "marketing",
        nombre: "Meta (anuncios)",
        que: "Campañas, gasto y videos de las cuentas activas",
        fecha,
        // La lectura manual deja auditoría; la de la tarea, no: si la manual es de los mismos minutos, fue esa persona.
        quien: fecha && manual && Math.abs(Date.parse(manual.creado_en) - Date.parse(fecha)) < 10 * 60_000 ? manual.usuario_nombre : fecha ? "Automática" : null,
        error: conError ? (cuentas.find((c) => c.ultimo_error)?.ultimo_error ?? "Falló") : null,
        automatica: "Sola, 3 veces al día",
        requisito: "A mano lee las cuentas del país elegido arriba",
        donde: { texto: "Anuncios Meta", href: "/anuncios-meta" },
        accion: escribe(u, "anuncios-meta") ? { tipo: "correr", clave: "meta", texto: "Leer ahora" } : null,
        conError,
      },
      DIARIA,
    );
  }
  if (tiene(u, "tu-winner")) {
    const filas = (tuwinner.data ?? []) as { estado: string; inicio: string; fin: string | null; error: string | null; iniciado_por_nombre: string | null }[];
    const ultima = filas[0];
    const buena = filas.find((f) => f.estado === "listo");
    const conError = ultima?.estado === "error";
    agregar(
      {
        clave: "tu-winner",
        grupo: "marketing",
        nombre: "Tu Winner",
        que: "Productos ganadores por país",
        fecha: conError ? (ultima.fin ?? ultima.inicio) : (buena?.fin ?? null),
        quien: (conError ? ultima : buena)?.iniciado_por_nombre ?? null,
        error: conError ? (ultima.error ?? "Falló") : null,
        automatica: null,
        requisito: "Con la extensión y la sesión de Tu Winner",
        donde: { texto: "Tu Winner", href: "/tu-winner" },
        accion: escribe(u, "tu-winner") ? { tipo: "ventana", ventana: { tipo: "tuwinner" }, titulo: "Actualizar Tu Winner", texto: "Actualizar" } : null,
        corriendo: ultima?.estado === "corriendo" && reciente(ultima.inicio, VIGENCIA_CORRIENDO_MS),
        conError,
      },
      DIARIA,
    );
  }
  if (tiene(u, "analisis-competencia")) {
    const filas = ((competenciaDrop.data ?? []) as { estado: string; inicio: string; fin: string | null; detalle: string | null }[]).filter(Boolean);
    const ultima = filas[0];
    const buena = filas.find((f) => f.estado === "lista");
    const conError = ultima?.estado === "fallida";
    agregar(
      {
        clave: "drop-competencia",
        grupo: "marketing",
        nombre: "Drop: competencia",
        que: "El catálogo de Drop con los demás proveedores (para «Bajar precio»)",
        fecha: conError ? (ultima.fin ?? ultima.inicio) : (buena?.fin ?? buena?.inicio ?? null),
        quien: null,
        error: conError ? (ultima.detalle ?? "Falló") : null,
        automatica: null,
        requisito: "En el perfil de Chrome con la sesión de dropshipper de Drop",
        donde: { texto: "Análisis de competencia", href: "/analisis-competencia" },
        accion: escribe(u, "analisis-competencia") ? { tipo: "ventana", ventana: { tipo: "competencia-drop" }, titulo: "Leer la competencia de Drop", texto: "Actualizar" } : null,
        corriendo: ultima?.estado === "corriendo" && reciente(ultima.inicio, VIGENCIA_CORRIENDO_MS),
        conError,
      },
      SEMANAL,
    );
  }

  // ── Archivos (los Excel que se suben a mano) ──
  const imps = (importaciones.data ?? []) as { modulo: ModuloImportable; usuario_nombre: string | null; creado_en: string; terminado_en: string | null; estado: string }[];
  for (const m of archivos) {
    const ultima = imps.find((i) => i.modulo === m);
    const buena = imps.find((i) => i.modulo === m && i.estado === "terminada");
    const conError = ultima?.estado === "fallida";
    const corriendo = ultima?.estado === "en_curso" && reciente(ultima.creado_en, VIGENCIA_CORRIENDO_MS);
    const vista = conError ? ultima : buena;
    agregar(
      {
        clave: `excel-${m}`,
        grupo: "archivos",
        nombre: NOMBRE_MODULO[m],
        que: "Excel que se sube a mano",
        fecha: vista ? (vista.terminado_en ?? vista.creado_en) : null,
        quien: vista?.usuario_nombre ?? null,
        error: conError ? "La última carga no terminó" : null,
        automatica: null,
        requisito: null,
        donde: { texto: NOMBRE_MODULO[m], href: `/${m}` },
        accion: escribe(u, m) ? { tipo: "ventana", ventana: { tipo: "excel", modulo: m }, titulo: `Subir Excel: ${NOMBRE_MODULO[m]}`, texto: "Subir Excel" } : null,
        corriendo,
        conError,
      },
      MENSUAL,
    );
  }
  if (tiene(u, "inventario")) {
    const c = conteo.data as { usuario_nombre: string | null; creado_en: string } | null;
    agregar(
      {
        clave: "excel-conteo",
        grupo: "archivos",
        nombre: "Conteo de inventario",
        que: "Conteo físico para el WMS",
        fecha: c?.creado_en ?? null,
        quien: c?.usuario_nombre ?? null,
        error: null,
        automatica: null,
        requisito: null,
        donde: { texto: "Rentabilidad › Inventario", href: "/rentabilidad/inventario" },
        accion: escribe(u, "inventario") ? { tipo: "ventana", ventana: { tipo: "conteo" }, titulo: "Subir el conteo de inventario", texto: "Subir Excel" } : null,
      },
      null,
    );
  }

  return fuentes;
}

export { veAlgunaFuente } from "./modulos";

export type { AccionFuente, Fuente, GrupoFuente };
