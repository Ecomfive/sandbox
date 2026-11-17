"use server";

import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { SIN_ACCESO_TIENDA } from "@/lib/finanzas/acceso-tienda";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { enlazarOrden, unidadDeTexto, variantesPedido, type OrdenCandidata } from "@/lib/monday/columnas";
import { archivosVisibles, copiarPendientes, type ArchivoVisible } from "@/lib/monday/comprobantes";
import { hoyPanama } from "@/lib/postventa/datos";
import {
  ESTADOS,
  esTipo,
  formaPagoDespacho,
  GRUPO_ABIERTOS,
  grupoDe,
  GRUPOS,
  nombreSolicitud,
  NOTIFICAR,
  TIENDAS,
  TIPOS,
  textoSolicitud,
  type DatosSolicitud,
  type Linea,
} from "@/lib/postventa/reglas";
import { aplicarEstado, avisarCaso, registrarCaso, selloCaso, type Autor } from "@/lib/postventa/servidor";
import { createServiceClient } from "@/lib/supabase/server";
import { unidadDeTienda } from "@/lib/ventas/matriz";

type Resultado = { error?: string };
type Supabase = ReturnType<typeof createServiceClient>;

const MODULO = "despacho-cambios";
const MODULO_CUENTAS = "despacho-cambios-cuentas";
const BUCKET = "postventa-adjuntos";
const RUTAS = ["/despacho-cambios", "/despacho-ciudad"];
const esItem = (v: unknown): v is string => typeof v === "string" && /^([0-9]{1,20}|S[0-9a-f]{32})$/.test(v);
const esDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const autorDe = (u: UsuarioActual): Autor => ({ id: u.id, nombre: u.nombre ?? u.email });
const puedeVerCuentas = (u: UsuarioActual) => u.modulos.includes(MODULO_CUENTAS);
const nuevoId = () => `S${crypto.randomUUID().replace(/-/g, "")}`;
const revalidar = () => {
  for (const p of RUTAS) revalidatePath(p);
};

/** Si la persona puede ver esa tienda (unidad de Finanzas; sin tienda, solo quien no tiene límite). */
async function puedeVerLa(unidadId: string | null): Promise<boolean> {
  return puedeVerUnidad(await cargarTiendasPermitidas(), unidadId);
}

async function casoConPermiso(itemId: string, archivo = false): Promise<{ supabase: Supabase; usuario: UsuarioActual; fila: Record<string, unknown> } | { error: string }> {
  if (!esItem(itemId)) return { error: "Solicitud no válida." };
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const { data: fila, error } = await supabase.from("mon_postventa").select("*").eq("item_id", itemId).maybeSingle();
  if (error || !fila) return { error: "Esa solicitud ya no existe." };
  // Solo solicitudes de las tiendas de la persona (17 nov 2026: la gente de Nuvo, solo lo de Nuvo).
  if (!(await puedeVerLa((fila.unidad_id as string | null) ?? null))) return { error: SIN_ACCESO_TIENDA };
  if (fila.archivado_en && !archivo) return { error: "Esa solicitud está archivada: restáurala para cambiarla." };
  return { supabase, usuario, fila };
}

/** La orden de una tienda y un número (o null). */
async function enlazar(supabase: Supabase, numero: string | null, tienda: string | null): Promise<{ orden_id: string | null; unidad_id: string | null }> {
  const { data: unidades } = await supabase.from("fin_unidades").select("id, nombre");
  const unidad = unidadDeTexto(tienda, (unidades ?? []) as { id: string; nombre: string }[], unidadDeTienda);
  const variantes = variantesPedido(numero);
  if (!variantes.length) return { orden_id: null, unidad_id: unidad };
  const { data } = await supabase.from("ven_ordenes").select("id, unidad_id, numero, periodo").in("numero", variantes);
  const candidatas: OrdenCandidata[] = (data ?? []).map((o) => ({ id: o.id as string, unidad_id: o.unidad_id as string, numero: o.numero as string, periodo: String(o.periodo).slice(0, 10) }));
  const orden = enlazarOrden(numero, unidad, candidatas);
  return { orden_id: orden?.id ?? null, unidad_id: unidad ?? orden?.unidad_id ?? null };
}

const TEXTOS: Record<string, { columna: string; titulo: string; max: number }> = {
  nombre: { columna: "nombre", titulo: "Solicitud", max: 200 },
  numero: { columna: "numero_pedido", titulo: "Pedido", max: 40 },
  seguimiento: { columna: "seguimiento", titulo: "Seguimiento", max: 300 },
};
const NUMEROS: Record<string, { columna: string; titulo: string }> = {
  valor_envio: { columna: "valor_envio", titulo: "Valor de envío" },
  reembolso: { columna: "reembolso", titulo: "Valor reembolso" },
};
const FECHAS: Record<string, { columna: string; titulo: string }> = {
  fecha: { columna: "fecha", titulo: "Fecha" },
  fecha_notificacion: { columna: "fecha_notificacion", titulo: "Fecha notificación" },
};

/** Cambia una celda del tablero. El Estado aplica las automatizaciones de Monday (grupo, Notificar al cliente, avisos). */
export async function cambiarCaso(itemId: string, campo: string, valor: string): Promise<Resultado> {
  const r = await casoConPermiso(itemId);
  if ("error" in r) return r;
  const { supabase, usuario, fila } = r;
  const autor = autorDe(usuario);
  const v = String(valor ?? "").replace(/\s+/g, " ").trim();
  if (campo === "estado") {
    if (v && !ESTADOS.some((e) => e.nombre === v)) return { error: "Ese estado no está en la lista." };
    const res = await aplicarEstado(supabase, fila, v || null, autor);
    if (res.error) return res;
    revalidar();
    return {};
  }
  const set: Record<string, unknown> = selloCaso(autor);
  let titulo: string;
  let antes: unknown;
  let despues: string | number | null;
  if (campo === "notificar") {
    if (v && !NOTIFICAR.some((e) => e.nombre === v)) return { error: "Esa opción no está en la lista." };
    titulo = "Notificar al cliente";
    antes = fila.notificar;
    despues = v || null;
    set.notificar = despues;
    if (v === "Notificar") set.fecha_notificacion = hoyPanama();
  } else if (campo === "tienda") {
    if (v && !TIENDAS.some((e) => e.nombre === v)) return { error: "Esa tienda no está en la lista." };
    titulo = "Tienda";
    antes = fila.tienda_texto;
    despues = v || null;
    set.tienda_texto = despues;
    Object.assign(set, await enlazar(supabase, fila.numero_pedido as string | null, despues));
    if (!(await puedeVerLa((set.unidad_id as string | null) ?? null))) return { error: SIN_ACCESO_TIENDA };
  } else if (campo === "tipo") {
    const t = TIPOS.find((x) => x.nombre === v);
    if (!t) return { error: "Ese tipo no está en la lista." };
    titulo = "Tipo";
    const tipos = (fila.tipos as string[] | null) ?? [];
    antes = tipos.join(", ");
    set.tipos = [t.clave, ...tipos.filter((x) => x !== t.clave && x === "retiro")];
    despues = (set.tipos as string[]).join(", ");
  } else if (campo === "responsable") {
    if (v && !esUuid(v)) return { error: "Persona no válida." };
    let nombre: string | null = null;
    if (v) {
      const { data: p } = await supabase.from("perfiles").select("nombre, email").eq("id", v).eq("activo", true).maybeSingle();
      if (!p) return { error: "Esa persona no está activa." };
      nombre = (p.nombre as string | null) ?? String(p.email);
    }
    titulo = "Responsable";
    antes = fila.responsable_texto ?? fila.responsable_id;
    despues = nombre;
    set.responsable_id = v || null;
    set.responsable_texto = null;
  } else if (TEXTOS[campo]) {
    const t = v.slice(0, TEXTOS[campo].max);
    titulo = TEXTOS[campo].titulo;
    antes = fila[TEXTOS[campo].columna];
    despues = t || null;
    if (campo === "nombre" && !t) return { error: "La solicitud necesita un nombre." };
    set[TEXTOS[campo].columna] = despues;
    if (campo === "numero") Object.assign(set, await enlazar(supabase, despues, fila.tienda_texto as string | null));
  } else if (NUMEROS[campo]) {
    const t = v.replace(/[$\s]/g, "").replace(",", ".");
    const n = t ? Number(t) : null;
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100_000)) return { error: "Escribe un monto válido." };
    titulo = NUMEROS[campo].titulo;
    antes = fila[NUMEROS[campo].columna];
    despues = n === null ? null : Math.round(n * 100) / 100;
    set[NUMEROS[campo].columna] = despues;
  } else if (FECHAS[campo]) {
    if (v && !esDia(v)) return { error: "Fecha no válida." };
    titulo = FECHAS[campo].titulo;
    antes = fila[FECHAS[campo].columna];
    despues = v || null;
    set[FECHAS[campo].columna] = despues;
  } else return { error: "Esa columna no se edita." };
  const igual = (antes ?? null) === null ? despues === null : despues !== null && String(antes) === String(despues);
  if (igual) return {};
  const { error } = await supabase.from("mon_postventa").update(set).eq("item_id", itemId);
  if (error) return { error: "No se pudo guardar." };
  await registrarCaso(supabase, itemId, autor, `${titulo}: ${antes ?? "vacío"} → ${despues ?? "vacío"}`);
  if (campo === "responsable" && set.responsable_id) {
    await avisarCaso(supabase, { ...fila, responsable_id: set.responsable_id }, [{ a: "responsable", titulo: `Te asignaron: ${fila.nombre}`, texto: "Quedaste como responsable de esta solicitud." }], autor);
  }
  revalidar();
  return {};
}

/** Mueve la solicitud a otro grupo, como arrastrarla en Monday (el Estado no cambia). */
export async function moverCaso(itemId: string, grupo: string): Promise<Resultado> {
  const r = await casoConPermiso(itemId);
  if ("error" in r) return r;
  if (!GRUPOS.some((g) => g.nombre === grupo)) return { error: "Ese grupo no existe." };
  if (grupoDe(r.fila.grupo as string | null) === grupo) return {};
  const { error } = await r.supabase.from("mon_postventa").update({ grupo, ...selloCaso(autorDe(r.usuario)) }).eq("item_id", itemId);
  if (error) return { error: "No se pudo mover." };
  await registrarCaso(r.supabase, itemId, autorDe(r.usuario), `Movida a ${grupo}`);
  revalidar();
  return {};
}

/** Una actualización (comentario) en la solicitud, como en Monday. */
export async function comentarCaso(itemId: string, texto: string): Promise<Resultado> {
  const r = await casoConPermiso(itemId);
  if ("error" in r) return r;
  const t = String(texto ?? "").trim().slice(0, 3000);
  if (!t) return { error: "Escribe la actualización." };
  const { error } = await r.supabase.from("postventa_notas").insert({ item_id: itemId, texto: t, autor_id: r.usuario.id, autor_nombre: autorDe(r.usuario).nombre });
  if (error) return { error: "No se pudo guardar." };
  await r.supabase.from("mon_postventa").update(selloCaso(autorDe(r.usuario))).eq("item_id", itemId);
  return {};
}

const TIPOS_ARCHIVO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

/** Sube un adjunto (comprobante del reembolso, foto del producto…) al almacenamiento privado. */
export async function subirAdjuntoCaso(itemId: string, datos: FormData): Promise<Resultado> {
  const r = await casoConPermiso(itemId);
  if ("error" in r) return r;
  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || !archivo.size) return { error: "Elige una foto o un PDF." };
  const ext = TIPOS_ARCHIVO[archivo.type];
  if (!ext) return { error: "Solo fotos (JPG, PNG, WEBP, HEIC) o PDF." };
  if (archivo.size > 10 * 1024 * 1024) return { error: "El archivo pasa de 10 MB." };
  const ruta = `${itemId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await r.supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) return { error: "No se pudo subir el archivo." };
  const lista = [...((r.fila.adjuntos as string[] | null) ?? []), `storage:${ruta}`].slice(-20);
  await r.supabase.from("mon_postventa").update({ adjuntos: lista, ...selloCaso(autorDe(r.usuario)) }).eq("item_id", itemId);
  await registrarCaso(r.supabase, itemId, autorDe(r.usuario), "Subió un adjunto");
  revalidar();
  return {};
}

/** Guarda (o borra, con texto vacío) los datos para hacer el reembolso. Solo con el permiso «despacho-cambios-cuentas». */
export async function guardarCuentaCaso(itemId: string, datos: string): Promise<Resultado> {
  const r = await casoConPermiso(itemId);
  if ("error" in r) return r;
  if (!puedeVerCuentas(r.usuario)) return { error: "No tienes permiso para los datos del reembolso." };
  const t = String(datos ?? "").trim().slice(0, 1000);
  const { error } = t
    ? await r.supabase.from("postventa_cuentas").upsert({ item_id: itemId, datos: t, escrito_por: r.usuario.id, escrito_en: new Date().toISOString() }, { onConflict: "item_id" })
    : await r.supabase.from("postventa_cuentas").delete().eq("item_id", itemId);
  if (error) return { error: "No se pudo guardar." };
  await registrarCaso(r.supabase, itemId, autorDe(r.usuario), t ? "Anotó los datos para el reembolso" : "Borró los datos para el reembolso");
  return {};
}

/** Programa la solicitud en Despacho ciudad: crea la fila del reparto (forma de pago CAMBIO, RETIRO o COMPLEMENTO) para `dia`. */
export async function programarEnDespacho(itemId: string, dia: string): Promise<Resultado> {
  const r = await casoConPermiso(itemId);
  if ("error" in r) return r;
  if (!esDia(dia)) return { error: "Elige el día del reparto." };
  return programar(r.supabase, r.fila, dia, autorDe(r.usuario));
}

async function programar(supabase: Supabase, fila: Record<string, unknown>, dia: string, autor: Autor): Promise<Resultado> {
  const itemId = String(fila.item_id);
  if (fila.despacho_item_id) {
    const { data: ya } = await supabase.from("mon_despachos").select("item_id, archivado_en").eq("item_id", fila.despacho_item_id as string).maybeSingle();
    if (ya && !ya.archivado_en) return { error: "Ya está programada en Despacho ciudad." };
  }
  const tipos = (fila.tipos as string[] | null) ?? [];
  const forma = formaPagoDespacho(tipos, !!fila.enviar);
  const despachoId = nuevoId();
  const ahora = new Date().toISOString();
  const resumen = [fila.retirar ? `Retirar: ${fila.retirar}` : null, fila.enviar ? `Entregar: ${fila.enviar}` : null].filter(Boolean).join(" · ") || String(fila.nombre);
  const cobra = fila.envio_paga === "cliente" && fila.valor_envio !== null ? Number(fila.valor_envio) : null;
  const { error } = await supabase.from("mon_despachos").insert({
    item_id: despachoId,
    tablero_id: "sistema",
    clase: "ciudad",
    origen: "sistema",
    nombre: fila.numero_pedido ? String(fila.numero_pedido).replace(/^#/, "") : null,
    numero_pedido: fila.numero_pedido ? String(fila.numero_pedido).replace(/^#/, "") : null,
    tienda_texto: fila.tienda_texto ?? null,
    orden_id: fila.orden_id ?? null,
    unidad_id: fila.unidad_id ?? null,
    forma_pago: forma,
    edo_pago: cobra ? "PENDIENTE" : null,
    por_cobrar: cobra,
    coste_envio: fila.valor_envio ?? null,
    comentario: `${forma}: ${resumen}`.slice(0, 1000),
    estado_grupo: "sin_estado",
    fecha_despacho: dia,
    periodo: `${dia.slice(0, 7)}-01`,
    editado_en: ahora,
    editado_por: autor.id,
    actualizado_monday: ahora,
    leido_en: ahora,
  });
  if (error) return { error: "No se pudo crear el reparto." };
  await supabase.from("despacho_actividad").insert({ item_id: despachoId, texto: `Creada desde Cambios y reembolsos: ${String(fila.nombre).slice(0, 300)}`, autor_id: autor.id, autor_nombre: autor.nombre });
  const diaTexto = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  await supabase.from("mon_postventa").update({ despacho_item_id: despachoId, seguimiento: `Programado en Despacho ciudad ${diaTexto}`, ...selloCaso(autor) }).eq("item_id", itemId);
  await registrarCaso(supabase, itemId, autor, `Programada en Despacho ciudad para el ${diaTexto}`);
  revalidar();
  return {};
}

/** Archiva una solicitud (creada por error o que sobra). No se borra: se ve en «Archivados» y se puede restaurar. */
export async function archivarCaso(itemId: string): Promise<Resultado> {
  const r = await casoConPermiso(itemId, true);
  if ("error" in r) return r;
  if (r.fila.archivado_en) return {};
  const { error } = await r.supabase
    .from("mon_postventa")
    .update({ archivado_en: new Date().toISOString(), archivado_por: r.usuario.id, ...selloCaso(autorDe(r.usuario)) })
    .eq("item_id", itemId);
  if (error) return { error: "No se pudo archivar." };
  await registrarCaso(r.supabase, itemId, autorDe(r.usuario), "Archivada");
  revalidar();
  return {};
}

export async function restaurarCaso(itemId: string): Promise<Resultado> {
  const r = await casoConPermiso(itemId, true);
  if ("error" in r) return r;
  if (!r.fila.archivado_en) return {};
  const { error } = await r.supabase.from("mon_postventa").update({ archivado_en: null, archivado_por: null, ...selloCaso(autorDe(r.usuario)) }).eq("item_id", itemId);
  if (error) return { error: "No se pudo restaurar." };
  await registrarCaso(r.supabase, itemId, autorDe(r.usuario), "Restaurada desde Archivados");
  revalidar();
  return {};
}

export interface DetalleCaso {
  notas: { id: string; texto: string; autor: string; cuando: string }[];
  actividad: { id: string; texto: string; autor: string; cuando: string }[];
  adjuntos: ArchivoVisible[];
  /** Los datos para el reembolso: null si no hay; undefined si no tiene permiso para verlos. */
  cuenta?: string | null;
  hayCuenta: boolean;
  despacho: { dia: string | null; courier: string | null; estado: string | null } | null;
  solicitud: string | null;
}

/** Lo que muestra el panel de una solicitud. */
export async function detalleCaso(itemId: string): Promise<DetalleCaso | { error: string }> {
  if (!esItem(itemId)) return { error: "Solicitud no válida." };
  const usuario = await requireModulo(MODULO);
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("mon_postventa").select("adjuntos, despacho_item_id, solicitud, unidad_id").eq("item_id", itemId).maybeSingle();
  if (!fila) return { error: "Esa solicitud ya no existe." };
  if (!(await puedeVerLa((fila.unidad_id as string | null) ?? null))) return { error: SIN_ACCESO_TIENDA };
  const [{ data: notas }, { data: actividad }, { data: cuenta }, despacho] = await Promise.all([
    supabase.from("postventa_notas").select("id, texto, autor_nombre, creado_en").eq("item_id", itemId).order("creado_en", { ascending: false }).limit(100),
    supabase.from("postventa_actividad").select("id, texto, autor_nombre, creado_en").eq("item_id", itemId).order("creado_en", { ascending: false }).limit(100),
    supabase.from("postventa_cuentas").select("datos").eq("item_id", itemId).maybeSingle(),
    fila.despacho_item_id
      ? supabase.from("mon_despachos").select("fecha_despacho, courier, estado").eq("item_id", fila.despacho_item_id as string).maybeSingle().then((x) => x.data)
      : Promise.resolve(null),
  ]);
  const { archivos: adjuntos, porCopiar } = await archivosVisibles(supabase, (fila.adjuntos as string[] | null) ?? [], BUCKET);
  if (porCopiar.length) after(() => copiarPendientes(createServiceClient(), porCopiar));
  const fmt = (x: { id: string; texto: string; autor_nombre: string | null; creado_en: string }) => ({ id: x.id, texto: x.texto, autor: x.autor_nombre ?? "Alguien del equipo", cuando: x.creado_en });
  return {
    notas: (notas ?? []).map(fmt),
    actividad: (actividad ?? []).map(fmt),
    adjuntos,
    hayCuenta: !!cuenta,
    ...(puedeVerCuentas(usuario) ? { cuenta: (cuenta?.datos as string | undefined) ?? null } : {}),
    despacho: despacho ? { dia: (despacho.fecha_despacho as string | null) ?? null, courier: (despacho.courier as string | null) ?? null, estado: (despacho.estado as string | null) ?? null } : null,
    solicitud: (fila.solicitud as string | null) ?? null,
  };
}

export interface PedidoEncontrado {
  numero: string;
  fecha: string;
  total: number;
  estado: string;
  metodo: string | null;
  lineas: Linea[];
}

/** Busca el pedido de una tienda para el formulario: su fecha, total, estado y productos. */
export async function buscarPedido(tienda: string, numero: string): Promise<{ pedido: PedidoEncontrado | null } | { error: string }> {
  await requireModulo(MODULO);
  if (!TIENDAS.some((t) => t.nombre === tienda)) return { error: "Elige la tienda." };
  const n = String(numero ?? "").trim();
  if (n.replace(/\D/g, "").length < 3) return { pedido: null };
  const supabase = createServiceClient();
  const { orden_id, unidad_id } = await enlazar(supabase, `#${n.replace(/^#/, "")}`, tienda);
  if (!(await puedeVerLa(unidad_id))) return { error: SIN_ACCESO_TIENDA };
  if (!orden_id) return { pedido: null };
  const [{ data: o }, { data: lineas }] = await Promise.all([
    supabase.from("ven_ordenes").select("numero, fecha, total, estado_entrega, metodo_pago").eq("id", orden_id).maybeSingle(),
    supabase.from("ven_orden_lineas").select("producto, cantidad, es_servicio").eq("orden_id", orden_id).order("linea"),
  ]);
  if (!o) return { pedido: null };
  return {
    pedido: {
      numero: String(o.numero),
      fecha: String(o.fecha),
      total: Number(o.total),
      estado: String(o.estado_entrega),
      metodo: (o.metodo_pago as string | null) ?? null,
      lineas: (lineas ?? []).filter((l) => !l.es_servicio).map((l) => ({ producto: String(l.producto), cantidad: Number(l.cantidad) })),
    },
  };
}

export interface NuevaSolicitud {
  tienda: string;
  numero: string;
  tipos: string[];
  retirar: Linea[];
  enviar: Linea[];
  reembolso: number | null;
  reembolsoComo: string | null;
  motivo: string;
  detalle: string | null;
  costoEnvio: number | null;
  envioPaga: "empresa" | "cliente";
  responsableId: string | null;
  fecha: string | null;
  cuenta: string | null;
  programar: boolean;
}

const lineasLimpias = (l: unknown): Linea[] =>
  (Array.isArray(l) ? l : [])
    .map((x) => ({ cantidad: Math.round(Number((x as Linea).cantidad)), producto: String((x as Linea).producto ?? "").replace(/\s+/g, " ").trim().slice(0, 120) }))
    .filter((x) => x.producto && Number.isFinite(x.cantidad) && x.cantidad > 0 && x.cantidad < 1000)
    .slice(0, 20);

/** Crea una solicitud con el formulario: arma el nombre y el texto de siempre, la enlaza al pedido y, si se pide, la programa en Despacho ciudad. */
export async function crearSolicitud(d: NuevaSolicitud): Promise<Resultado & { itemId?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const autor = autorDe(usuario);
  if (!TIENDAS.some((t) => t.nombre === d.tienda)) return { error: "Elige la tienda." };
  const numero = String(d.numero ?? "").trim().replace(/^#\s*/, "").toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(numero)) return { error: "Escribe el número de pedido." };
  const tipos = [...new Set((d.tipos ?? []).filter(esTipo))];
  if (!tipos.length) return { error: "Elige qué hay que hacer (cambio, reembolso…)." };
  const retirar = lineasLimpias(d.retirar);
  const enviar = lineasLimpias(d.enviar);
  if (retirar.length && !tipos.includes("retiro") && !tipos.includes("cambio")) tipos.push("retiro");
  const monto = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100_000 ? null : Math.round(Number(v) * 100) / 100);
  const reembolso = tipos.includes("reembolso") ? monto(d.reembolso) : null;
  const costoEnvio = monto(d.costoEnvio);
  const motivo = String(d.motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!motivo) return { error: "Elige el motivo." };
  const detalle = String(d.detalle ?? "").replace(/\s+/g, " ").trim().slice(0, 500) || null;
  const envioPaga = d.envioPaga === "cliente" ? "cliente" : "empresa";
  if (d.fecha && !esDia(d.fecha)) return { error: "Fecha no válida." };
  if (d.responsableId && !esUuid(d.responsableId)) return { error: "Persona no válida." };
  if (d.programar && !d.fecha) return { error: "Para programarla en Despacho ciudad, elige la fecha." };
  const datos: DatosSolicitud = { tienda: d.tienda, numero, tipos, retirar, enviar, reembolso, reembolsoComo: d.reembolsoComo ? String(d.reembolsoComo).slice(0, 40) : null, motivo, detalle, costoEnvio, enviaPaga: envioPaga };
  const supabase = createServiceClient();
  const enlace = await enlazar(supabase, `#${numero}`, d.tienda);
  if (!(await puedeVerLa(enlace.unidad_id))) return { error: SIN_ACCESO_TIENDA };
  const itemId = nuevoId();
  const ahora = new Date().toISOString();
  const textoLineas = (l: Linea[]) => (l.length ? l.map((x) => `${x.cantidad} × ${x.producto}`).join(", ") : null);
  const fila = {
    item_id: itemId,
    tablero_id: "sistema",
    origen: "sistema",
    nombre: nombreSolicitud(datos),
    tienda_texto: d.tienda,
    numero_pedido: `#${numero}`,
    ...enlace,
    tipos,
    estado: "En Proceso",
    grupo: GRUPO_ABIERTOS,
    retirar: textoLineas(retirar),
    enviar: textoLineas(enviar),
    reembolso,
    reembolso_texto: reembolso !== null ? `$${reembolso.toFixed(2)}${datos.reembolsoComo ? ` (${datos.reembolsoComo.toLowerCase()})` : ""}` : null,
    costo_envio: costoEnvio !== null ? `$${costoEnvio.toFixed(2)} · lo paga ${envioPaga === "empresa" ? "la empresa" : "el cliente"}` : null,
    valor_envio: costoEnvio,
    envio_paga: costoEnvio !== null ? envioPaga : null,
    motivo,
    observacion: detalle,
    solicitud: textoSolicitud(datos),
    responsable_id: d.responsableId || null,
    fecha: d.fecha || null,
    notas: 0,
    creado_por: usuario.id,
    creado_monday: ahora,
    actualizado_monday: ahora,
    editado_en: ahora,
    editado_por: usuario.id,
    leido_en: ahora,
  };
  const { error } = await supabase.from("mon_postventa").insert(fila);
  if (error) return { error: /column|relation/.test(error.message) ? "Falta correr en Supabase la migración 0972." : "No se pudo crear la solicitud." };
  await registrarCaso(supabase, itemId, autor, "Creada en el sistema");
  if (d.cuenta && puedeVerCuentas(usuario)) await supabase.from("postventa_cuentas").insert({ item_id: itemId, datos: String(d.cuenta).trim().slice(0, 1000), escrito_por: usuario.id });
  if (fila.responsable_id && fila.responsable_id !== usuario.id)
    await avisarCaso(supabase, fila, [{ a: "responsable", titulo: `Nueva solicitud: ${fila.nombre}`, texto: "Quedaste como responsable de esta solicitud." }], autor);
  if (d.programar && d.fecha) {
    const p = await programar(supabase, fila, d.fecha, autor);
    if (p.error) return { error: `La solicitud se creó, pero no se pudo programar: ${p.error}`, itemId };
  }
  revalidar();
  return { itemId };
}
