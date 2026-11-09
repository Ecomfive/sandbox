"use server";

import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { DIAS_PARA_ARCHIVAR, porOrdenesPendientes } from "@/lib/publicaciones/archivar";
import { montoDePais } from "@/lib/moneda/simbolo";
import { revalidatePath } from "next/cache";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { normalizarDatosDevolver, normalizarUnidades, type DatosDevolver } from "@/lib/publicaciones/apagar-dropi";
import { normalizarDatosCrear, type DatosCrearDropi, type FotoCrear } from "@/lib/publicaciones/crear-dropi";
import { unaPorFoto } from "@/lib/publicaciones/fotos-dropi";
import { destinosDe, normalizarDatosPrivatizar, quienesDe, type DatosPrivatizar } from "@/lib/publicaciones/privatizar-dropi";
import type { VariacionLeida } from "@/lib/publicaciones/privatizar-variable";
import { normalizarDatosStock, textoVariacion, type DatosStock } from "@/lib/publicaciones/stock-dropi";
import { normalizarDatosReserva, reservasDeDropi, type DatosReserva } from "@/lib/publicaciones/reservas-dropi";
import { codigoBodega } from "@/lib/publicaciones/sincronizar-dropi";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 100;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Lo que el favorito dice de una variación releída, ya limpio; null si no sirve. */
function normalizarVariacionReleida(crudo: unknown): { firma: string; bodegas: { id: number; stock: number }[] } | null {
  const v = (typeof crudo === "object" && crudo !== null ? crudo : {}) as { firma?: unknown; bodegas?: unknown };
  if (typeof v.firma !== "string" || !v.firma || !Array.isArray(v.bodegas)) return null;
  const bodegas = (v.bodegas as { id?: unknown; stock?: unknown }[])
    .slice(0, 20)
    .filter((b) => Number.isInteger(b?.id) && (b.id as number) > 0 && Number.isInteger(b?.stock) && (b.stock as number) >= 0)
    .map((b) => ({ id: b.id as number, stock: b.stock as number }));
  return { firma: v.firma, bodegas };
}

export interface CambioParaDropi {
  id: string;
  /**
   * «republicar» = crear el producto de nuevo en Dropi y archivar el viejo sin stock (0145); «apagar» = sacar el stock y archivar (0148);
   * «archivar» = archivar o sacar de Archivados (0151); «crear» = publicar la publicación nueva en Dropi (0151); «privatizar» = dejarle
   * unidades a un dropshipper en un producto privado nuevo (0154); «stock» = dejar una bodega con unas unidades (0173).
   */
  tipo: "cambio" | "republicar" | "apagar" | "archivar" | "crear" | "privatizar" | "stock" | "reserva";
  /** «stock»: la bodega y las unidades que deben quedar (al favorito viaja como `datos`). */
  stock: DatosStock | null;
  /** «reserva» (migración 0254): a qué correo y cuántas unidades deben quedar reservadas (al favorito viaja como `datos`). */
  reserva: DatosReserva | null;
  /** «archivar»: true = sacarlo de Archivados. */
  restaurar: boolean;
  /** «cambio»: la descripción nueva (null = no se cambia) y las fotos que se suben. */
  descripcion: string | null;
  fotos: FotoCrear[];
  /** «crear»: todo lo que Dropi pide para publicar el producto. */
  datos: DatosCrearDropi | null;
  /** «privatizar»: a quién, cuántas unidades, de qué bodega y con qué nombre y precio (al favorito viaja como `datos`). */
  privatizar: DatosPrivatizar | null;
  /** «apagar»: además de sacar el stock, quitar la privatización (un producto privado, asignado a un correo). */
  quitarPrivados: boolean;
  /** «apagar» de «Quitar privatización»: a qué público se le devuelven las unidades del privado (al favorito viaja como `datos`). */
  devolver: DatosDevolver | null;
  /** El producto nuevo que un intento anterior de republicar ya creó en Dropi (el favorito sigue desde ahí). */
  nuevo: number | null;
  producto: number;
  /** null = no se cambia el nombre. */
  nombre: string | null;
  guia: string | null;
  /** null = no se cambia (migración 0139). */
  precio: number | null;
  sugerido: number | null;
  precioAntes: number | null;
  sugeridoAntes: number | null;
  publicacion: string;
}

async function paisDeCodigo(codigo: string, permitidos: string[] | null) {
  if (typeof codigo !== "string" || !/^[a-z]{2}$/i.test(codigo)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("paises").select("id, nombre").eq("codigo", codigo.toUpperCase()).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.id as string))) return null;
  return { id: data.id as string, nombre: data.nombre as string };
}

/** Lo que se copia de la publicación vieja a la nueva al republicar (todo lo que es de la publicación, no de Dropi ni de ClickUp). */
const COPIAR_AL_REPUBLICAR = [
  "pais_id",
  "nombre",
  "tipo_publicacion",
  "privatizado_a",
  "privatizado_email",
  "dropshipper_id",
  "precio_venta",
  "costo_mercancia",
  "fulfillment",
  "coste_real",
  "ubicacion",
  "estado_reposicion",
  "competencia",
  "ultima_revision",
  "ultimo_cambio_precio",
  "foto_url",
  "foto_huella",
  "notas",
  "responsable_id",
  "sku_maestro_id",
] as const;

/** Lo que se copia de la publicación pública a la privada que nace al privatizar (el nombre, el precio y el dropshipper son los de la privatización). */
const COPIAR_AL_PRIVATIZAR = ["pais_id", "costo_mercancia", "fulfillment", "coste_real", "ubicacion", "estado_reposicion", "competencia", "ultimo_cambio_precio", "foto_url", "foto_huella", "responsable_id", "sku_maestro_id"] as const;

/**
 * Al terminar una privatización (pedido de Jhokser, 26 oct 2026): crea en el sistema la publicación privada con el ID nuevo de Dropi, el nombre «P-XX …»,
 * el dropshipper (`privatizado_a`, `privatizado_email`), el precio acordado y el mismo producto vinculado, y la enlaza con la pública en «relacionados».
 * Si la privada ya existe (otro intento o alguien la cargó), la usa.
 */
async function crearPrivada(
  supabase: ReturnType<typeof createServiceClient>,
  fila: Record<string, unknown>,
  d: DatosPrivatizar,
  nuevo: number,
  usuario: { id: string },
): Promise<{ id: string } | { error: string }> {
  if (typeof fila.nueva_publicacion_id === "string") return { id: fila.nueva_publicacion_id };
  const { data: publica } = await supabase.from("dropi_publicaciones").select("*").eq("id", fila.publicacion_id as string).maybeSingle();
  if (!publica) return { error: "La publicación pública ya no está en el sistema." };
  const { data: existente } = await supabase.from("dropi_publicaciones").select("id").eq("pais_id", publica.pais_id).eq("dropi_id", String(nuevo)).limit(1).maybeSingle();
  let id = existente?.id as string | undefined;
  if (!id) {
    const copia: Record<string, unknown> = {};
    for (const k of COPIAR_AL_PRIVATIZAR) copia[k] = publica[k] ?? null;
    const { data, error } = await supabase
      .from("dropi_publicaciones")
      .insert({
        ...copia,
        nombre: d.nombre,
        dropi_id: String(nuevo),
        estado: "al_dia",
        estado_publicacion: "activo",
        tipo_publicacion: "privado",
        privatizado_a: destinosDe(d).map((x) => x.dropshipper || x.correo).filter(Boolean).join(" y ") || null,
        privatizado_email: d.correo || null,
        dropshipper_id: d.dropshipperId,
        precio_venta: d.precio,
        fecha_publicacion: new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }),
        relacionados: [publica.id as string],
        creado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Se privatizó en Dropi, pero no se pudo crear la publicación privada en el sistema." };
    id = data.id as string;
    await registrarAuditoria({ accion: "crear_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: id, detalle: `${d.nombre} (ID ${nuevo}) · privatizada a ${quienesDe(d)} desde el ID ${publica.dropi_id ?? "—"}` });
  }
  await supabase.from("dropi_publicaciones").update({ relacionados: [...new Set([...((publica.relacionados as string[] | null) ?? []), id])], actualizado_en: new Date().toISOString() }).eq("id", publica.id as string);
  return { id };
}

/**
 * Al terminar una republicación (pedido de Hernán, 23 oct 2026): crea en el sistema la publicación nueva con los datos de la vieja,
 * el ID nuevo de Dropi y el mismo producto vinculado, publicada hoy y activa, y archiva la vieja; cada una queda en «relacionados»
 * de la otra. Si la nueva ya existe (otro intento o alguien la cargó), la usa.
 */
/**
 * Una tarea que deja el sistema en una publicación al aplicar algo en Dropi (8 nov 2026, pedido de Alcides): le toca a quien pidió el cambio (`creado_por` de la
 * cola) si sigue activa; si no, al responsable de la publicación; si no, a quien pulsó «Aplicar en Dropi». Avisa en su campana. Si falla, el cambio no se pierde.
 */
async function tareaDelSistema(
  supabase: ReturnType<typeof createServiceClient>,
  fila: Record<string, unknown>,
  publicacionId: string,
  t: { titulo: string; nota: string; dias: number; prioridad: "alta" | "normal" },
  usuario: { id: string; nombre?: string | null; email?: string | null },
) {
  const { data: pub } = await supabase.from("dropi_publicaciones").select("nombre, responsable_id").eq("id", publicacionId).maybeSingle();
  const candidatos = [fila.creado_por, pub?.responsable_id, usuario.id].filter((x): x is string => typeof x === "string" && UUID.test(x));
  let responsable: { id: string; nombre: string } | null = null;
  for (const id of candidatos) {
    const { data } = await supabase.from("perfiles").select("nombre, email, activo").eq("id", id).maybeSingle();
    if (data && data.activo !== false) {
      responsable = { id, nombre: ((data.nombre as string | null) || (data.email as string | null) || "Sin nombre").trim() };
      break;
    }
  }
  if (!responsable) return;
  const plazo = new Date(Date.now() + t.dias * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const yo = usuario.nombre || usuario.email || null;
  const base = { publicacion_id: publicacionId, titulo: t.titulo.slice(0, 200), nota: t.nota.slice(0, 1000), responsable_id: responsable.id, responsable_nombre: responsable.nombre, plazo, creado_por: usuario.id, creado_por_nombre: yo };
  let r = await supabase.from("dropi_publicaciones_tareas").insert({ ...base, estado: "por_hacer", prioridad: t.prioridad });
  // Sin la migración 0178 se guarda sin estado ni prioridad.
  if (r.error) r = await supabase.from("dropi_publicaciones_tareas").insert(base);
  if (r.error) return;
  await registrarAuditoria({ accion: "crear_tarea_publicacion", entidad: "dropi_publicaciones", entidadId: publicacionId, detalle: `Tarea: ${t.titulo} · le toca a ${responsable.nombre} · «${base.nota}»` });
  if (responsable.id !== usuario.id)
    await supabase.from("notificaciones_usuario").insert({
      usuario_id: responsable.id,
      tipo: "tarea",
      titulo: `Tarea en Gestión de IDs Dropi: ${t.titulo}`.slice(0, 300),
      texto: `${pub?.nombre ?? "Publicación"} · ${base.nota}`.slice(0, 600),
      href: "/publicaciones-dropi/tareas",
      autor_id: usuario.id,
      autor_nombre: yo,
    });
}

/** La tarea «subir la foto que faltó» de una republicación (8 nov 2026): en la publicación nueva, con el ID viejo de donde sacarla, para mañana. */
async function tareaFotosQueFaltan(
  supabase: ReturnType<typeof createServiceClient>,
  fila: Record<string, unknown>,
  nuevaId: string,
  nuevo: number,
  fotos: string[],
  motivo: string | null,
  usuario: { id: string; nombre?: string | null; email?: string | null },
) {
  const { data: vieja } = await supabase.from("dropi_publicaciones").select("numero").eq("id", fila.publicacion_id as string).maybeSingle();
  const uno = fotos.length === 1;
  await tareaDelSistema(
    supabase,
    fila,
    nuevaId,
    {
      titulo: `Subir ${uno ? "la foto que faltó" : `las ${fotos.length} fotos que faltaron`} en el ID ${nuevo}`,
      nota: [
        `Al republicar no se pudo copiar ${uno ? "esta foto" : "estas fotos"} al ID nuevo ${nuevo}: súbela${uno ? "" : "s"} a mano en Dropi.`,
        `Sácala${uno ? "" : "s"} del ID viejo ${fila.dropi_producto_id}${vieja?.numero != null ? ` (${numeroPublicacion(Number(vieja.numero))})` : ""}, que quedó archivado.`,
        `Foto${uno ? "" : "s"}: ${fotos.join(", ")}.`,
        motivo ? `Motivo: ${motivo}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      dias: 1,
      prioridad: "alta",
    },
    usuario,
  );
}

/**
 * Dropi no dejó archivar por órdenes en curso (8 nov 2026, pedido de Alcides): el cambio se da por hecho y queda una tarea para archivarlo en Dropi en
 * `DIAS_PARA_ARCHIVAR` días, cuando ya no tenga órdenes pendientes. `por` dice qué se estaba haciendo («Al republicar como ID 12005», «Al apagar»…).
 */
async function tareaArchivarDespues(
  supabase: ReturnType<typeof createServiceClient>,
  fila: Record<string, unknown>,
  publicacionId: string,
  por: string,
  motivo: string | null,
  usuario: { id: string; nombre?: string | null; email?: string | null },
) {
  await tareaDelSistema(
    supabase,
    fila,
    publicacionId,
    {
      titulo: `Archivar en Dropi el ID ${fila.dropi_producto_id}`,
      nota: [
        `${por}, Dropi no dejó archivar el ID ${fila.dropi_producto_id} porque tenía órdenes en curso (pendientes, con guía generada o sin movimientos).`,
        "Ya quedó sin stock. Archívalo en Dropi cuando esas órdenes se despachen.",
        motivo ? `Dropi dijo: ${motivo.slice(0, 300)}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      dias: DIAS_PARA_ARCHIVAR,
      prioridad: "normal",
    },
    usuario,
  );
}

async function crearRepublicada(
  supabase: ReturnType<typeof createServiceClient>,
  fila: Record<string, unknown>,
  nuevo: number,
  usuario: { id: string },
): Promise<{ id: string } | { error: string }> {
  if (typeof fila.nueva_publicacion_id === "string") return { id: fila.nueva_publicacion_id };
  const { data: vieja } = await supabase.from("dropi_publicaciones").select("*").eq("id", fila.publicacion_id as string).maybeSingle();
  if (!vieja) return { error: "La publicación vieja ya no está en el sistema." };
  const { data: existente } = await supabase.from("dropi_publicaciones").select("id").eq("pais_id", vieja.pais_id).eq("dropi_id", String(nuevo)).limit(1).maybeSingle();
  let id = existente?.id as string | undefined;
  if (!id) {
    const datos: Record<string, unknown> = {};
    for (const k of COPIAR_AL_REPUBLICAR) datos[k] = vieja[k] ?? null;
    // El precio elegido al republicar (27 oct 2026) es el de la nueva; si cambió, también su último cambio de precio.
    const precioElegido = fila.precio === null || fila.precio === undefined ? null : Number(fila.precio);
    if (precioElegido !== null && precioElegido > 0) {
      if (Math.abs(precioElegido - Number(vieja.precio_venta ?? 0)) > 0.004) datos.ultimo_cambio_precio = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
      datos.precio_venta = precioElegido;
    }
    const relacionados = [...new Set([...((vieja.relacionados as string[] | null) ?? []), vieja.id as string])];
    const { data, error } = await supabase
      .from("dropi_publicaciones")
      .insert({
        ...datos,
        dropi_id: String(nuevo),
        estado: vieja.estado === "archivado" ? "al_dia" : vieja.estado,
        estado_publicacion: "activo",
        fecha_publicacion: new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }),
        relacionados,
        creado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: "Se republicó en Dropi, pero no se pudo crear la publicación nueva en el sistema." };
    id = data.id as string;
    await registrarAuditoria({ accion: "crear_publicacion_dropi", entidad: "dropi_publicaciones", entidadId: id, detalle: `${vieja.nombre} (ID ${nuevo}) · republicada desde el ID ${vieja.dropi_id ?? "—"}` });
  }
  await supabase
    .from("dropi_publicaciones")
    .update({ estado: "archivado", estado_publicacion: "archivado", relacionados: [...new Set([...((vieja.relacionados as string[] | null) ?? []), id])], actualizado_en: new Date().toISOString() })
    .eq("id", vieja.id as string);
  return { id };
}

/**
 * Al publicar una publicación nueva en Dropi (migración 0151): apenas Dropi crea el producto, la publicación toma su ID (así la lectura de
 * «Mis productos» no la vuelve a crear como un «Producto nuevo»); y cuando todo salió bien, deja de ser un borrador y pasa a Activo. Si
 * Dropi creó el producto pero falló un paso después, la publicación sigue «Sin publicar» con su ID y el próximo «Aplicar en Dropi» sigue desde ahí.
 */
async function publicadaEnDropi(supabase: ReturnType<typeof createServiceClient>, fila: Record<string, unknown>, ok: boolean, nuevo: number | null, ahora: string) {
  if (!nuevo) return;
  const cambios: Record<string, unknown> = { dropi_id: String(nuevo), actualizado_en: ahora };
  if (ok) {
    cambios.estado_publicacion = "activo";
    cambios.fecha_publicacion = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  }
  await supabase.from("dropi_publicaciones").update(cambios).eq("id", fila.publicacion_id as string);
}

/**
 * Pone en la lectura de «Mis productos» (`dropi_productos_proveedor`) el stock que el favorito acaba de dejar y releer en Dropi: las bodegas con
 * stock y el total (lo demás lo trae la próxima lectura). El nombre de una bodega que Dropi no mande se conserva del que ya estaba.
 */
async function stockAlSistema(supabase: ReturnType<typeof createServiceClient>, paisId: string, productoId: number, bodegas: { id: number; nombre: string; stock: number }[]) {
  const { data: fila } = await supabase.from("dropi_productos_proveedor").select("bodegas").eq("pais_id", paisId).eq("dropi_producto_id", productoId).maybeSingle();
  if (!fila) return;
  const nombres = new Map((Array.isArray(fila.bodegas) ? (fila.bodegas as { id: number; nombre?: string }[]) : []).map((b) => [Number(b.id), String(b.nombre ?? "")]));
  const nuevas = bodegas.filter((b) => b.stock > 0).map((b) => ({ id: b.id, nombre: b.nombre || nombres.get(b.id) || "", stock: b.stock }));
  await supabase.from("dropi_productos_proveedor").update({ bodegas: nuevas, stock: nuevas.reduce((t, b) => t + b.stock, 0) }).eq("pais_id", paisId).eq("dropi_producto_id", productoId);
}

/** Pone en la lectura de «Mis productos» lo que el favorito releyó de una variación, para que la ficha la muestre sin esperar la lectura (5 nov 2026). */
async function variacionAlSistema(supabase: ReturnType<typeof createServiceClient>, paisId: string, productoId: number, v: { firma: string; bodegas: { id: number; stock: number }[] }) {
  const { data: fila } = await supabase.from("dropi_productos_proveedor").select("variaciones").eq("pais_id", paisId).eq("dropi_producto_id", productoId).maybeSingle();
  if (!Array.isArray(fila?.variaciones)) return;
  const variaciones = (fila.variaciones as VariacionLeida[]).map((x) => (x.firma === v.firma ? { ...x, bodegas: v.bodegas } : x));
  await supabase.from("dropi_productos_proveedor").update({ variaciones }).eq("pais_id", paisId).eq("dropi_producto_id", productoId);
}

/**
 * Los cambios que esperan para Dropi en un país (pendientes y los que dieron error, para reintentarlos), para el favorito «Aplicar en
 * Dropi». No lleva nada de la sesión de Dropi: el favorito los aplica desde su pestaña.
 */
export async function pendientesParaDropi(codigoPais: string): Promise<{ error?: string; pais?: string; cambios?: CambioParaDropi[] }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pais = await paisDeCodigo(codigoPais, usuario.paisesPermitidos);
  if (!pais) return { error: "Ese país no está en el sistema o no lo puedes ver." };
  const leer = (columnas: string) =>
    createServiceClient().from("dropi_cambios_pendientes").select(`${columnas}, dropi_publicaciones!publicacion_id(nombre)` as "*").eq("pais_id", pais.id).in("estado", ["pendiente", "error"]).order("creado_en").limit(MAX);
  let r = await leer("id, publicacion_id, tipo, restaurar, descripcion, fotos, datos, quitar_privados, nuevo_dropi_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  // Sin la migración 0151, sin archivar, publicar, descripción ni fotos; sin la 0148, sin apagados; sin la 0145, sin republicaciones.
  if (r.error) r = await leer("id, tipo, quitar_privados, nuevo_dropi_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  if (r.error) r = await leer("id, tipo, nuevo_dropi_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  if (r.error) r = await leer("id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes");
  if (r.error) r = await leer("id, dropi_producto_id, nombre, nombre_guia");
  const { data, error } = r as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null };
  if (error) return { error: /does not exist|schema cache/i.test(error.message) ? "Falta correr en Supabase la migración 0137." : "No se pudieron leer los cambios pendientes." };
  // «Republicar» sube las fotos copiadas en el sistema (migración 0153), la principal primero: así no depende del CDN de Dropi, que
  // desde su pestaña no deja leerlas. Sin fotos copiadas (o sin la migración), el favorito las toma de Dropi como antes.
  const deSistema = new Map<string, { url: string; nombre: string }[]>();
  const republicar = (data ?? []).filter((f) => (f.tipo === "republicar" || f.tipo === "privatizar") && typeof f.publicacion_id === "string").map((f) => f.publicacion_id as string);
  if (republicar.length) {
    const fotos = await createServiceClient()
      .from("dropi_publicacion_fotos")
      .select("publicacion_id, nombre, url, ruta")
      .in("publicacion_id", republicar)
      .eq("en_dropi", true)
      .order("principal", { ascending: false })
      .order("orden");
    const crudas = new Map<string, { url: string; nombre: string; ruta: string | null }[]>();
    for (const f of fotos.error ? [] : (fotos.data ?? []))
      crudas.set(f.publicacion_id as string, [...(crudas.get(f.publicacion_id as string) ?? []), { url: f.url as string, nombre: f.nombre as string, ruta: f.ruta as string | null }]);
    // Cada foto una sola vez, aunque Dropi la tenga repetida con el mismo nombre o con otro (28 oct 2026, PUB-0446): si no, cada
    // republicación copia todas las repetidas.
    for (const [id, fs] of crudas) deSistema.set(id, unaPorFoto(fs).map(({ url, nombre }) => ({ url, nombre })));
  }
  return {
    pais: pais.nombre,
    cambios: (data ?? []).map((f) => ({
      id: f.id as string,
      tipo: f.tipo === "republicar" ? ("republicar" as const) : f.tipo === "apagar" ? ("apagar" as const) : f.tipo === "archivar" ? ("archivar" as const) : f.tipo === "crear" ? ("crear" as const) : f.tipo === "privatizar" ? ("privatizar" as const) : f.tipo === "stock" ? ("stock" as const) : f.tipo === "reserva" ? ("reserva" as const) : ("cambio" as const),
      stock: f.tipo === "stock" ? normalizarDatosStock(f.datos) : null,
      reserva: f.tipo === "reserva" ? normalizarDatosReserva(f.datos) : null,
      restaurar: f.restaurar === true,
      descripcion: (f.descripcion as string | null | undefined) ?? null,
      fotos: f.tipo === "republicar" || f.tipo === "privatizar" ? (deSistema.get(f.publicacion_id as string) ?? []) : normalizarDatosCrear({ fotos: f.fotos }).fotos,
      datos: f.tipo === "crear" ? normalizarDatosCrear(f.datos) : null,
      privatizar: f.tipo === "privatizar" ? normalizarDatosPrivatizar(f.datos) : null,
      quitarPrivados: f.quitar_privados === true,
      devolver: f.tipo === "apagar" ? normalizarDatosDevolver(f.datos) : null,
      nuevo: num(f.nuevo_dropi_id),
      producto: f.dropi_producto_id == null ? 0 : Number(f.dropi_producto_id),
      nombre: (f.nombre as string | null) ?? null,
      guia: (f.nombre_guia as string | null) ?? null,
      precio: num(f.precio),
      sugerido: num(f.precio_sugerido),
      precioAntes: num(f.precio_antes),
      sugeridoAntes: num(f.precio_sugerido_antes),
      publicacion: ((f.dropi_publicaciones as { nombre?: string } | null)?.nombre ?? "") as string,
    })),
  };
}

/**
 * Guarda lo que el favorito hizo en Dropi con cada cambio (aplicado, o el motivo del error). Solo acepta cambios de ese país que
 * seguían pendientes o con error; cada resultado queda en la actividad de su publicación a nombre de quien pulsó el favorito.
 */
export async function guardarResultadosDropi(codigoPais: string, resultados: unknown): Promise<{ error?: string; aplicados?: number; errores?: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pais = await paisDeCodigo(codigoPais, usuario.paisesPermitidos);
  if (!pais) return { error: "País no válido." };
  if (!Array.isArray(resultados) || resultados.length > MAX) return { error: "Resultados no válidos." };
  const limpios = resultados
    .map((r) => r as { id?: unknown; ok?: unknown; error?: unknown; nuevo?: unknown; archivado?: unknown; aviso?: unknown; salida?: unknown; antes?: unknown; stock?: unknown; bodegas?: unknown; variacion?: unknown; unidades?: unknown; devuelto?: unknown; reservas?: unknown; privado?: unknown; fotosFaltan?: unknown; archivoPendiente?: unknown })
    .filter((r) => typeof r.id === "string" && UUID.test(r.id))
    .map((r) => ({
      id: r.id as string,
      ok: r.ok === true,
      // «apagar»: si además quedó archivado (Dropi no archiva con órdenes pendientes: queda pendiente y se reintenta).
      archivado: r.archivado === true,
      // «privatizar»: ya se le sacó el stock al público (un reintento no lo saca otra vez).
      salida: r.salida === true,
      // «apagar» de «Quitar privatización»: las unidades que se le sacaron al privado y si ya se le devolvieron al público.
      unidades: normalizarUnidades(r.unidades),
      devuelto: r.devuelto === true,
      error: typeof r.error === "string" ? r.error.slice(0, 500) : "Sin detalle",
      // «crear»: un aviso que no impidió publicar (por ejemplo, las garantías que Dropi no dejó poner).
      aviso: typeof r.aviso === "string" ? r.aviso.slice(0, 300) : null,
      // «stock»: lo que había en Dropi, lo que quedó en la bodega y todas sus bodegas releídas (para poner el stock en el sistema sin esperar la lectura).
      antes: Number.isInteger(r.antes) && (r.antes as number) >= 0 ? (r.antes as number) : null,
      stock: Number.isInteger(r.stock) && (r.stock as number) >= 0 ? (r.stock as number) : null,
      bodegas: Array.isArray(r.bodegas)
        ? (r.bodegas as unknown[])
            .slice(0, 20)
            .map((b) => b as { id?: unknown; nombre?: unknown; stock?: unknown })
            .filter((b) => Number.isInteger(b.id) && (b.id as number) > 0 && Number.isInteger(b.stock) && (b.stock as number) >= 0)
            .map((b) => ({ id: b.id as number, nombre: String(b.nombre ?? "").slice(0, 80), stock: b.stock as number }))
        : null,
      // «stock» de una variación: cómo quedó esa variación en cada bodega.
      variacion: normalizarVariacionReleida(r.variacion),
      // «reserva»: las reservas vivas que releyó el favorito y si Dropi lo tiene como producto privado.
      reservas: Array.isArray(r.reservas) ? reservasDeDropi({ private_product_inventories: (r.reservas as unknown[]).slice(0, 50) }) : null,
      privado: typeof r.privado === "boolean" ? r.privado : null,
      // «republicar»: las fotos que no se pudieron copiar (8 nov 2026): se crea la tarea de subirlas a mano.
      // «republicar»: Dropi no dejó archivar el viejo por órdenes en curso (se da por hecha y queda la tarea).
      archivoPendiente: typeof r.archivoPendiente === "string" ? r.archivoPendiente.slice(0, 500) : null,
      fotosFaltan: Array.isArray(r.fotosFaltan) ? (r.fotosFaltan as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 120)) : [],
      // El ID del producto que creó una republicación (aunque haya fallado un paso después).
      nuevo: Number.isInteger(r.nuevo) && (r.nuevo as number) > 0 && (r.nuevo as number) < 100_000_000 ? (r.nuevo as number) : null,
    }));
  if (!limpios.length) return { aplicados: 0, errores: 0 };
  const supabase = createServiceClient();
  const leerFilas = (columnas: string) =>
    supabase.from("dropi_cambios_pendientes").select(columnas).eq("pais_id", pais.id).in("estado", ["pendiente", "error"]).in("id", limpios.map((r) => r.id));
  let lectura = await leerFilas("id, tipo, restaurar, descripcion, fotos, datos, quitar_privados, nuevo_dropi_id, nueva_publicacion_id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos, creado_por");
  if (lectura.error) lectura = await leerFilas("id, tipo, quitar_privados, nuevo_dropi_id, nueva_publicacion_id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos");
  if (lectura.error) lectura = await leerFilas("id, tipo, nuevo_dropi_id, nueva_publicacion_id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos");
  if (lectura.error) lectura = await leerFilas("id, publicacion_id, dropi_producto_id, nombre, nombre_guia, precio, precio_sugerido, intentos");
  if (lectura.error) lectura = await leerFilas("id, publicacion_id, dropi_producto_id, nombre, nombre_guia, intentos");
  const filas = (lectura.data ?? []) as unknown as Record<string, unknown>[];
  const porId = new Map((filas ?? []).map((f) => [f.id as string, f]));
  const ahora = new Date().toISOString();
  const auditoria: Parameters<typeof registrarAuditoriaLote>[0] = [];
  let aplicados = 0;
  let errores = 0;
  for (const r of limpios) {
    const f = porId.get(r.id);
    if (!f) continue;
    if (f.tipo === "apagar") {
      // Sin stock en Dropi pero sin archivar: sigue pendiente (con el motivo) y el próximo «Aplicar en Dropi» solo repite el archivado.
      // Sin stock pero Dropi no deja archivar por órdenes en curso (8 nov 2026): se da por hecho y queda una tarea para archivarlo en un mes.
      const conTarea = r.ok && !r.archivado && porOrdenesPendientes(r.error);
      const hecho = r.ok && (r.archivado || conTarea);
      const parcial = r.ok && !hecho;
      // «Quitar privatización»: se guarda lo que se le sacó al privado y si ya volvió al público, así un reintento no lo devuelve dos veces.
      const dv = normalizarDatosDevolver(f.datos);
      const devolver = dv ? { ...dv, unidades: dv.unidades ?? r.unidades, devuelto: dv.devuelto || r.devuelto } : null;
      await supabase
        .from("dropi_cambios_pendientes")
        .update({
          ...(hecho ? { estado: "aplicado", aplicado_en: ahora, error: null } : parcial ? { estado: "pendiente", error: r.error } : { estado: "error", error: r.error }),
          intentos: Number(f.intentos) + 1,
          ...(devolver ? { datos: devolver } : {}),
        })
        .eq("id", r.id);
      const totalDevuelto = devolver?.unidades ? Object.values(devolver.unidades).reduce((t, n) => t + n, 0) : 0;
      const devuelta = dv && !dv.devuelto && r.devuelto ? (totalDevuelto ? ` · ${totalDevuelto} u. devueltas al público (ID ${dv.publico})` : " · no tenía unidades que devolver") : "";
      // Sin stock y sin privatización en Dropi (aunque no haya dejado archivar): en el sistema la publicación deja de ser de ese correo.
      let privatizacion = "";
      if (r.ok && f.quitar_privados === true) {
        const { data: antes } = await supabase.from("dropi_publicaciones").select("privatizado_a, privatizado_email").eq("id", f.publicacion_id as string).maybeSingle();
        const previo = [antes?.privatizado_a, antes?.privatizado_email].filter(Boolean).join(" · ");
        if (previo) {
          await supabase.from("dropi_publicaciones").update({ privatizado_a: null, privatizado_email: null, actualizado_en: ahora }).eq("id", f.publicacion_id as string);
          privatizacion = ` · privatización quitada (antes: ${previo})`;
        }
      }
      // Archivado en Dropi: ahora sí queda archivada también en el sistema.
      if (hecho) await supabase.from("dropi_publicaciones").update({ estado: "archivado", estado_publicacion: "archivado", actualizado_en: ahora }).eq("id", f.publicacion_id as string);
      if (conTarea) await tareaArchivarDespues(supabase, f, f.publicacion_id as string, "Al apagarlo", r.error, usuario);
      auditoria.push({
        accion: hecho ? "dropi_apagado" : parcial ? "dropi_apagado_parcial" : "dropi_apagado_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: hecho
          ? `ID ${f.dropi_producto_id}: sin stock${conTarea ? "; Dropi no dejó archivarlo por órdenes en curso (tarea para archivarlo en un mes)" : " y archivado"} en Dropi${privatizacion}${devuelta} (desde Dropi)`
          : `ID ${f.dropi_producto_id} · ${r.error}${privatizacion}${devuelta}`,
      });
      if (hecho) aplicados++;
      else errores++;
      continue;
    }
    if (f.tipo === "reserva") {
      const d = normalizarDatosReserva(f.datos);
      await supabase
        .from("dropi_cambios_pendientes")
        .update(r.ok ? { estado: "aplicado", aplicado_en: ahora, error: null, intentos: Number(f.intentos) + 1 } : { estado: "error", error: r.aviso ? `${r.error} ${r.aviso}`.slice(0, 500) : r.error, intentos: Number(f.intentos) + 1 })
        .eq("id", r.id);
      // Lo que releyó el favorito pasa al sistema sin esperar la próxima lectura (sin la migración 0254 no hay dónde: queda para la lectura).
      if (r.reservas)
        await supabase
          .from("dropi_productos_proveedor")
          .update({ reservas: r.reservas, ...(r.privado !== null ? { privado_producto: r.privado } : {}), ...(r.stock !== null ? { stock: r.stock } : {}) })
          .eq("pais_id", pais.id)
          .eq("dropi_producto_id", Number(f.dropi_producto_id));
      const que = d.unidades === 0 ? `quitar la reserva de ${d.correo}` : `reservar ${d.unidades} u. a ${d.correo}`;
      auditoria.push({
        accion: r.ok ? "dropi_reserva_aplicada" : "dropi_reserva_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: r.ok
          ? `ID ${f.dropi_producto_id} · ${d.unidades === 0 ? `sin reserva para ${d.correo}` : `${d.correo}: ${d.antes ?? 0} → ${d.unidades} u. reservadas`}${r.aviso ? ` · ${r.aviso}` : ""} (desde Dropi)`
          : `ID ${f.dropi_producto_id} · ${que} · ${r.error}${r.aviso ? ` · ${r.aviso}` : ""}`,
      });
      if (r.ok) aplicados++;
      else errores++;
      continue;
    }
    if (f.tipo === "stock") {
      const d = normalizarDatosStock(f.datos);
      await supabase
        .from("dropi_cambios_pendientes")
        .update(r.ok ? { estado: "aplicado", aplicado_en: ahora, error: null, intentos: Number(f.intentos) + 1 } : { estado: "error", error: r.error, intentos: Number(f.intentos) + 1 })
        .eq("id", r.id);
      // Confirmado en Dropi: el sistema muestra ya ese stock (lo que releyó el favorito), sin esperar la próxima lectura de «Mis productos».
      if (r.ok && r.bodegas) await stockAlSistema(supabase, pais.id, Number(f.dropi_producto_id), r.bodegas);
      if (r.ok && r.variacion && r.variacion.firma === d.firma) await variacionAlSistema(supabase, pais.id, Number(f.dropi_producto_id), r.variacion);
      const bodega = `${codigoBodega(d.bodega)}${d.nombreBodega ? ` · ${d.nombreBodega}` : ""}${textoVariacion(d)}`;
      auditoria.push({
        accion: r.ok ? "dropi_stock_aplicado" : "dropi_stock_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: r.ok
          ? `ID ${f.dropi_producto_id} · stock en ${bodega}: ${r.antes ?? "—"} → ${r.stock ?? d.unidades} u. («${d.concepto}»)${r.aviso ? ` · ${r.aviso}` : ""} (desde Dropi)`
          : `ID ${f.dropi_producto_id} · stock en ${bodega} a ${d.unidades} u. · ${r.error}`,
      });
      if (r.ok) aplicados++;
      else errores++;
      continue;
    }
    if (f.tipo === "archivar") {
      // El sistema ya cambió la publicación al pedirlo: aquí solo se confirma que Dropi quedó igual (o el motivo para reintentar).
      const restaurar = f.restaurar === true;
      // Dropi no deja archivar por órdenes en curso (8 nov 2026): se da por hecho (el sistema ya la tiene archivada) y queda una tarea para dentro de un mes.
      const conTarea = !r.ok && !restaurar && porOrdenesPendientes(r.error);
      const ok = r.ok || conTarea;
      await supabase
        .from("dropi_cambios_pendientes")
        .update(ok ? { estado: "aplicado", aplicado_en: ahora, error: conTarea ? r.error : null, intentos: Number(f.intentos) + 1 } : { estado: "error", error: r.error, intentos: Number(f.intentos) + 1 })
        .eq("id", r.id);
      if (conTarea) await tareaArchivarDespues(supabase, f, f.publicacion_id as string, "Al archivarlo", r.error, usuario);
      auditoria.push({
        accion: ok ? (restaurar ? "dropi_restaurada" : "dropi_archivada") : "dropi_archivar_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: ok
          ? `ID ${f.dropi_producto_id}: ${restaurar ? "fuera de Archivados en Dropi" : conTarea ? "Dropi no dejó archivarlo por órdenes en curso (tarea para archivarlo en un mes)" : "archivado en Dropi"} (desde Dropi)`
          : `ID ${f.dropi_producto_id} · ${r.error}`,
      });
      if (ok) aplicados++;
      else errores++;
      continue;
    }
    if (f.tipo === "crear") {
      const nuevo = r.nuevo ?? (f.nuevo_dropi_id == null ? null : Number(f.nuevo_dropi_id));
      await publicadaEnDropi(supabase, f, r.ok, nuevo, ahora);
      await supabase
        .from("dropi_cambios_pendientes")
        .update({
          ...(r.ok && nuevo ? { estado: "aplicado", aplicado_en: ahora, error: null } : { estado: "error", error: r.ok ? "Dropi no devolvió el ID del producto nuevo." : r.error }),
          intentos: Number(f.intentos) + 1,
          nuevo_dropi_id: nuevo,
          dropi_producto_id: nuevo,
        })
        .eq("id", r.id);
      const hecho = r.ok && !!nuevo;
      auditoria.push({
        accion: hecho ? "dropi_publicada" : "dropi_crear_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: hecho ? `Publicada en Dropi con el ID ${nuevo}${r.aviso ? ` · ${r.aviso}` : ""} (desde Dropi)` : `${nuevo ? `ID nuevo ${nuevo} · ` : ""}${r.error}`,
      });
      if (hecho) aplicados++;
      else errores++;
      continue;
    }
    if (f.tipo === "privatizar") {
      const d = normalizarDatosPrivatizar(f.datos);
      const nuevo = r.nuevo ?? (f.nuevo_dropi_id == null ? null : Number(f.nuevo_dropi_id));
      // Terminó en Dropi: la publicación privada en el sistema (una sola vez).
      const creada = r.ok && nuevo ? await crearPrivada(supabase, f, d, nuevo, usuario) : null;
      const ok = r.ok && !!nuevo && !!creada && !("error" in creada);
      const error = !r.ok ? r.error : !nuevo ? "Dropi no devolvió el ID del producto privado." : creada && "error" in creada ? creada.error : "Sin detalle";
      const quien = d.dropshipper || d.correo;
      await supabase
        .from("dropi_cambios_pendientes")
        .update({
          ...(ok ? { estado: "aplicado", aplicado_en: ahora, error: null } : { estado: "error", error }),
          intentos: Number(f.intentos) + 1,
          nuevo_dropi_id: nuevo,
          // Si ya se le sacó el stock al público, queda anotado: el próximo intento no lo saca otra vez.
          datos: { ...(typeof f.datos === "object" && f.datos !== null ? (f.datos as Record<string, unknown>) : {}), salida: d.salida || r.salida },
          ...(creada && !("error" in creada) ? { nueva_publicacion_id: creada.id } : {}),
        })
        .eq("id", r.id);
      auditoria.push({
        accion: ok ? "dropi_privatizada" : "dropi_privatizar_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: ok
          ? `ID ${f.dropi_producto_id} → ID privado ${nuevo} para ${quien} (${d.correo}) · ${d.unidades} u. pasaron del público al privado${r.aviso ? ` · ${r.aviso}` : ""} (desde Dropi)`
          : `ID ${f.dropi_producto_id}${nuevo ? ` · ID privado ${nuevo}` : ""} para ${quien} · ${error}`,
      });
      if (ok) aplicados++;
      else errores++;
      continue;
    }
    if (f.tipo === "republicar") {
      const nuevo = r.nuevo ?? (f.nuevo_dropi_id == null ? null : Number(f.nuevo_dropi_id));
      // Terminó en Dropi: la publicación nueva en el sistema (una sola vez) y la vieja archivada.
      const creada = r.ok && nuevo ? await crearRepublicada(supabase, f, nuevo, usuario) : null;
      const ok = r.ok && !!nuevo && !!creada && !("error" in creada);
      const error = !r.ok ? r.error : !nuevo ? "Dropi no devolvió el ID del producto nuevo." : creada && "error" in creada ? creada.error : "Sin detalle";
      await supabase
        .from("dropi_cambios_pendientes")
        .update({
          ...(ok ? { estado: "aplicado", aplicado_en: ahora, error: null } : { estado: "error", error }),
          intentos: Number(f.intentos) + 1,
          nuevo_dropi_id: nuevo,
          ...(creada && !("error" in creada) ? { nueva_publicacion_id: creada.id } : {}),
        })
        .eq("id", r.id);
      // Fotos que no se pudieron copiar (8 nov 2026, pedido de Alcides): la republicación termina igual y queda una tarea en la publicación nueva para subirlas
      // a mano, sacándolas del ID viejo. Le toca a quien pidió republicar (si sigue activa), si no al responsable de la publicación, si no a quien aplicó.
      if (ok && creada && !("error" in creada) && r.fotosFaltan.length) await tareaFotosQueFaltan(supabase, f, creada.id, nuevo!, r.fotosFaltan, r.aviso, usuario);
      if (ok && r.archivoPendiente) await tareaArchivarDespues(supabase, f, f.publicacion_id as string, `Al republicar como ID ${nuevo}`, r.archivoPendiente, usuario);
      auditoria.push({
        accion: ok ? "dropi_republicada" : "dropi_republicar_error",
        entidad: "dropi_publicaciones",
        entidadId: f.publicacion_id as string,
        detalle: ok
          ? `ID ${f.dropi_producto_id} → ID nuevo ${nuevo}: ${r.archivoPendiente ? "sin stock; Dropi no dejó archivarlo por órdenes en curso (tarea para archivarlo en un mes)" : "archivada en Dropi sin stock"}${r.fotosFaltan.length ? ` · faltan ${r.fotosFaltan.length} foto(s) por subir (tarea creada)` : ""} (desde Dropi)`
          : `ID ${f.dropi_producto_id}${nuevo ? ` · ID nuevo ${nuevo}` : ""} · ${error}`,
      });
      if (ok) aplicados++;
      else errores++;
      continue;
    }
    await supabase
      .from("dropi_cambios_pendientes")
      .update(r.ok ? { estado: "aplicado", aplicado_en: ahora, error: null, intentos: Number(f.intentos) + 1 } : { estado: "error", error: r.error, intentos: Number(f.intentos) + 1 })
      .eq("id", r.id);
    auditoria.push({
      accion: r.ok ? "dropi_nombre_aplicado" : "dropi_nombre_error",
      entidad: "dropi_publicaciones",
      entidadId: f.publicacion_id as string,
      detalle: r.ok
        ? `ID ${f.dropi_producto_id} · ${[f.nombre ? `«${f.nombre}»` : "", f.nombre_guia ? `guía «${f.nombre_guia}»` : "", f.precio != null ? `precio ${montoDePais(Number(f.precio), codigoPais)}` : "", f.precio_sugerido != null ? `sugerido ${montoDePais(Number(f.precio_sugerido), codigoPais)}` : "", f.descripcion ? "descripción" : ""].filter(Boolean).join(" · ")} (desde Dropi)`
        : `ID ${f.dropi_producto_id} · ${r.error}`,
    });
    // Un precio aplicado es un cambio de precio de hoy (30 oct 2026): la ficha no espera a que lo vea la lectura del catálogo.
    if (r.ok && f.precio != null)
      await supabase
        .from("dropi_publicaciones")
        .update({ ultimo_cambio_precio: new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" }) })
        .eq("id", f.publicacion_id as string);
    // Lo aplicado en Dropi deja hechas las tareas abiertas que pedían eso mismo en esa publicación (migración 0128): el precio, las
    // de subir o bajar el precio; el nombre, la de optimizar el título; la descripción y las fotos, las suyas. Así nadie tiene que
    // pulsar «Ya lo hice» después de «Aplicar en Dropi».
    if (r.ok) {
      const fotos = Array.isArray(f.fotos) ? f.fotos.length : 0;
      const hechas: { tipos: string[]; nota: string }[] = [
        ...(f.precio != null ? [{ tipos: ["subir_precio", "igualar_precio"], nota: `Aplicado en Dropi: ${montoDePais(Number(f.precio), codigoPais)}` }] : []),
        ...(f.nombre ? [{ tipos: ["optimizar_titulo"], nota: `Aplicado en Dropi: «${f.nombre}»` }] : []),
        ...(f.descripcion ? [{ tipos: ["mejorar_descripcion"], nota: "Aplicado en Dropi: descripción nueva" }] : []),
        ...(fotos ? [{ tipos: ["mas_fotos"], nota: `Aplicado en Dropi: ${fotos} ${fotos === 1 ? "foto" : "fotos"}` }] : []),
      ];
      for (const h of hechas)
        await supabase
          .from("dropi_publicaciones_decisiones")
          .update({ hecha_en: ahora, hecha_por_nombre: usuario.nombre || usuario.email, hecha_como: "dropi", hecha_nota: h.nota })
          .eq("publicacion_id", f.publicacion_id as string)
          .eq("decision", "aceptada")
          .in("tipo", h.tipos)
          .is("hecha_en", null);
    }
    if (r.ok) aplicados++;
    else errores++;
  }
  await registrarAuditoriaLote(auditoria);
  revalidatePath("/publicaciones-dropi");
  return { aplicados, errores };
}
