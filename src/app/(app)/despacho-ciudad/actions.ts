"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { esColumnaEtiqueta, ETIQUETAS, GRUPOS_DEVOLUCION, grupoPorAsesores, type Columna } from "@/lib/despacho/etiquetas";
import { enlazarOrden, esDesintegrado, grupoDeEstado, leerReglasEstado, unidadDeTexto, variantesPedido, type OrdenCandidata } from "@/lib/monday/columnas";
import { createServiceClient } from "@/lib/supabase/server";
import { actualizarEntregas } from "@/lib/tienda/actualizar-entregas";
import { unidadDeTienda } from "@/lib/ventas/matriz";

type Resultado = { error?: string };
type Supabase = ReturnType<typeof createServiceClient>;

const BUCKET = "despacho-comprobantes";
const RUTAS = ["/despacho-ciudad", "/despacho-devoluciones"];
const esItem = (v: unknown): v is string => typeof v === "string" && /^([0-9]{1,20}|S[0-9a-f]{32})$/.test(v);
const esDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const modulo = (clase: string) => (clase === "devolucion" ? "despacho-devoluciones" : "despacho-ciudad");

/** Columna del sistema para cada dato que se edita en el tablero. */
const ETIQUETA_A_COLUMNA: Record<Columna, string> = {
  tienda: "tienda_texto",
  courier: "courier",
  estado: "estado",
  edo_pago: "edo_pago",
  forma_pago: "forma_pago",
  turno: "turno",
  estado_asesores: "estado_asesores",
};
const NUMEROS: Record<string, { columna: string; titulo: string }> = {
  por_cobrar: { columna: "por_cobrar", titulo: "$ Por cobrar" },
  cobrado: { columna: "monto_cobrado", titulo: "$ Cobrado" },
  coste_envio: { columna: "coste_envio", titulo: "Coste envío" },
};
const TEXTOS: Record<string, { columna: string; titulo: string; max: number }> = {
  numero: { columna: "numero_pedido", titulo: "Pedido", max: 60 },
  comentario: { columna: "comentario", titulo: "Comentario", max: 1000 },
  obs_asesores: { columna: "observaciones_asesores", titulo: "Observaciones asesores", max: 500 },
};

/** La fila, con permiso de escritura en el módulo de su tablero. */
async function filaConPermiso(itemId: string): Promise<{ supabase: Supabase; usuario: UsuarioActual; fila: Record<string, unknown> } | { error: string }> {
  if (!esItem(itemId)) return { error: "Fila no válida." };
  const supabase = createServiceClient();
  const { data: fila, error } = await supabase.from("mon_despachos").select("*").eq("item_id", itemId).maybeSingle();
  if (error || !fila) return { error: "Esa fila ya no existe." };
  const usuario = await requireModuloEscritura(modulo(String(fila.clase)));
  return { supabase, usuario, fila };
}

const quien = (u: UsuarioActual) => u.nombre ?? u.email;

async function registrar(supabase: Supabase, itemId: string, usuario: UsuarioActual, texto: string) {
  await supabase.from("despacho_actividad").insert({ item_id: itemId, texto: texto.slice(0, 500), autor_id: usuario.id, autor_nombre: quien(usuario) });
}

/** Busca otra vez la orden de la fila (cambió el número o la tienda). */
async function enlazar(supabase: Supabase, numero: string | null, tienda: string | null): Promise<{ orden_id: string | null; unidad_id: string | null; periodo?: string }> {
  const { data: unidades } = await supabase.from("fin_unidades").select("id, nombre");
  const unidad = unidadDeTexto(tienda, (unidades ?? []) as { id: string; nombre: string }[], unidadDeTienda);
  const variantes = variantesPedido(numero);
  if (!variantes.length) return { orden_id: null, unidad_id: unidad };
  const { data } = await supabase.from("ven_ordenes").select("id, unidad_id, numero, periodo").in("numero", variantes);
  const candidatas: OrdenCandidata[] = (data ?? []).map((o) => ({ id: o.id as string, unidad_id: o.unidad_id as string, numero: o.numero as string, periodo: String(o.periodo).slice(0, 10) }));
  const orden = enlazarOrden(numero, unidad, candidatas);
  return { orden_id: orden?.id ?? null, unidad_id: unidad ?? orden?.unidad_id ?? null, ...(orden ? { periodo: orden.periodo } : {}) };
}

/** Tras un cambio que toca la entrega del pedido (estado, asesores, pago), se actualizan los pedidos después de responder. */
function actualizarPedidosDespues(usuario: UsuarioActual) {
  after(async () => {
    await actualizarEntregas(createServiceClient(), `${quien(usuario)} (Despacho ciudad)`, Date.now() + 25_000).catch(() => null);
  });
}

const sello = (usuario: UsuarioActual) => {
  const ahora = new Date().toISOString();
  return { editado_en: ahora, editado_por: usuario.id, actualizado_monday: ahora };
};

/**
 * Cambia una celda: una etiqueta (con su lista de Monday), un monto o un texto. Lo que cambia la entrega del pedido (estado, estado de los asesores, forma
 * de pago, cobrado) actualiza el pedido al terminar. En devoluciones, «Estado asesores» en DESINTEGRADO pasa la fila a Rechazados / cancelados.
 */
export async function cambiarCelda(itemId: string, campo: string, valor: string): Promise<Resultado> {
  const r = await filaConPermiso(itemId);
  if ("error" in r) return r;
  const { supabase, usuario, fila } = r;
  const set: Record<string, unknown> = sello(usuario);
  let antes: unknown;
  let titulo: string;
  let nuevo: string | number | null;
  if (esColumnaEtiqueta(campo)) {
    const v = valor.trim();
    if (v && !ETIQUETAS[campo].opciones.some((o) => o.nombre === v)) return { error: "Esa etiqueta no está en la lista." };
    const columna = ETIQUETA_A_COLUMNA[campo];
    titulo = ETIQUETAS[campo].titulo;
    antes = fila[columna];
    nuevo = v || null;
    set[columna] = nuevo;
    if (campo === "estado" || campo === "estado_asesores") {
      const { data: cfg } = await supabase.from("mon_config").select("estados").eq("id", 1).maybeSingle();
      const estado = campo === "estado" ? nuevo : (fila.estado as string | null);
      const asesores = campo === "estado_asesores" ? nuevo : (fila.estado_asesores as string | null);
      set.estado_grupo = esDesintegrado(asesores) ? "rechazado" : grupoDeEstado(estado as string | null, leerReglasEstado(cfg?.estados));
      const mover = campo === "estado_asesores" && fila.clase === "devolucion" ? grupoPorAsesores(nuevo as string | null) : null;
      if (mover) set.grupo = mover;
    }
  } else if (NUMEROS[campo]) {
    const t = valor.trim().replace(/[$\s]/g, "").replace(",", ".");
    const n = t ? Number(t) : null;
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100_000)) return { error: "Escribe un monto válido." };
    titulo = NUMEROS[campo].titulo;
    antes = fila[NUMEROS[campo].columna];
    nuevo = n === null ? null : Math.round(n * 100) / 100;
    set[NUMEROS[campo].columna] = nuevo;
  } else if (TEXTOS[campo]) {
    const t = valor.replace(/\s+/g, " ").trim().slice(0, TEXTOS[campo].max);
    titulo = TEXTOS[campo].titulo;
    antes = fila[TEXTOS[campo].columna];
    nuevo = t || null;
    set[TEXTOS[campo].columna] = nuevo;
    if (campo === "numero") set.nombre = nuevo;
  } else return { error: "Esa columna no se edita." };
  const igual = antes === null || antes === undefined ? nuevo === null : nuevo !== null && (typeof nuevo === "number" ? Number(antes) === nuevo : String(antes) === nuevo);
  if (igual) return {};
  if (campo === "numero" || campo === "tienda") Object.assign(set, await enlazar(supabase, (set.numero_pedido ?? fila.numero_pedido) as string | null, (set.tienda_texto ?? fila.tienda_texto) as string | null));
  const { error } = await supabase.from("mon_despachos").update(set).eq("item_id", itemId);
  if (error) return { error: "No se pudo guardar." };
  await registrar(supabase, itemId, usuario, `${titulo}: ${antes ?? "vacío"} → ${nuevo ?? "vacío"}${set.grupo ? ` (pasa a ${set.grupo})` : ""}`);
  if (["estado", "estado_asesores", "forma_pago", "cobrado"].includes(campo) || set.orden_id) actualizarPedidosDespues(usuario);
  for (const p of RUTAS) revalidatePath(p);
  return {};
}

/** Mueve una fila a otro día (ciudad) o a otro grupo (devoluciones), como arrastrarla en Monday. */
export async function moverFila(itemId: string, destino: string): Promise<Resultado> {
  const r = await filaConPermiso(itemId);
  if ("error" in r) return r;
  const { supabase, usuario, fila } = r;
  const set: Record<string, unknown> = sello(usuario);
  let texto: string;
  if (fila.clase === "devolucion") {
    if (!GRUPOS_DEVOLUCION.some((g) => g.nombre === destino)) return { error: "Ese grupo no existe." };
    if (fila.grupo === destino) return {};
    set.grupo = destino;
    texto = `Movida a ${destino}`;
  } else {
    if (!esDia(destino)) return { error: "Día no válido." };
    if (fila.fecha_despacho === destino) return {};
    set.fecha_despacho = destino;
    if (!fila.orden_id) set.periodo = `${destino.slice(0, 7)}-01`;
    texto = `Movida del ${fila.fecha_despacho ?? "sin día"} al ${destino}`;
  }
  const { error } = await supabase.from("mon_despachos").update(set).eq("item_id", itemId);
  if (error) return { error: "No se pudo mover." };
  await registrar(supabase, itemId, usuario, texto);
  for (const p of RUTAS) revalidatePath(p);
  return {};
}

/** Una fila nueva en un día (ciudad) o en un grupo (devoluciones), con el repartidor y la tienda que se están mirando. */
export async function crearFila(clase: "ciudad" | "devolucion", destino: string, datos: { courier?: string | null; tienda?: string | null }): Promise<Resultado & { itemId?: string }> {
  const usuario = await requireModuloEscritura(modulo(clase));
  if (clase === "ciudad" ? !esDia(destino) : !GRUPOS_DEVOLUCION.some((g) => g.nombre === destino)) return { error: "Destino no válido." };
  const courier = datos.courier && ETIQUETAS.courier.opciones.some((o) => o.nombre === datos.courier) ? datos.courier : null;
  const tienda = datos.tienda && ETIQUETAS.tienda.opciones.some((o) => o.nombre === datos.tienda) ? datos.tienda : null;
  const supabase = createServiceClient();
  const itemId = `S${crypto.randomUUID().replace(/-/g, "")}`;
  const ahora = new Date().toISOString();
  const hoy = ahora.slice(0, 10);
  const { error } = await supabase.from("mon_despachos").insert({
    item_id: itemId,
    tablero_id: "sistema",
    clase,
    origen: "sistema",
    nombre: null,
    courier,
    tienda_texto: tienda,
    estado_grupo: "sin_estado",
    edo_pago: clase === "ciudad" ? "PENDIENTE" : null,
    estado_asesores: clase === "devolucion" ? "PENDIENTE" : null,
    fecha_despacho: clase === "ciudad" ? destino : null,
    grupo: clase === "devolucion" ? destino : null,
    periodo: `${(clase === "ciudad" ? destino : hoy).slice(0, 7)}-01`,
    editado_en: ahora,
    editado_por: usuario.id,
    actualizado_monday: ahora,
    leido_en: ahora,
  });
  if (error) return { error: "No se pudo crear la fila." };
  await registrar(supabase, itemId, usuario, "Creada en el sistema");
  for (const p of RUTAS) revalidatePath(p);
  return { itemId };
}

/** Una actualización (comentario) en la fila, como los de Monday. */
export async function comentarFila(itemId: string, texto: string): Promise<Resultado> {
  const r = await filaConPermiso(itemId);
  if ("error" in r) return r;
  const t = String(texto ?? "").trim().slice(0, 2000);
  if (!t) return { error: "Escribe la actualización." };
  const { error } = await r.supabase.from("despacho_notas").insert({ item_id: itemId, texto: t, autor_id: r.usuario.id, autor_nombre: quien(r.usuario) });
  return error ? { error: "No se pudo guardar." } : {};
}

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

/** Sube la foto o el PDF del comprobante de pago (hasta 10 MB) al almacenamiento privado del sistema. */
export async function subirComprobante(itemId: string, datos: FormData): Promise<Resultado> {
  const r = await filaConPermiso(itemId);
  if ("error" in r) return r;
  const archivo = datos.get("archivo");
  if (!(archivo instanceof File) || !archivo.size) return { error: "Elige una foto o un PDF." };
  const ext = TIPOS[archivo.type];
  if (!ext) return { error: "Solo fotos (JPG, PNG, WEBP, HEIC) o PDF." };
  if (archivo.size > 10 * 1024 * 1024) return { error: "El archivo pasa de 10 MB." };
  const ruta = `${itemId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await r.supabase.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) return { error: "No se pudo subir el archivo." };
  const lista = [...((r.fila.comprobantes as string[] | null) ?? []), `storage:${ruta}`].slice(-10);
  await r.supabase.from("mon_despachos").update({ comprobantes: lista, ...sello(r.usuario) }).eq("item_id", itemId);
  await registrar(r.supabase, itemId, r.usuario, "Subió un comprobante");
  for (const p of RUTAS) revalidatePath(p);
  return {};
}

export interface DetalleFila {
  notas: { id: string; texto: string; autor: string; cuando: string }[];
  actividad: { id: string; texto: string; autor: string; cuando: string }[];
  comprobantes: { url: string; enMonday: boolean }[];
}

/** Lo que muestra el panel de una fila: actualizaciones, actividad y comprobantes (los del sistema con un enlace que vence en 10 minutos). */
export async function detalleFila(itemId: string): Promise<DetalleFila | { error: string }> {
  if (!esItem(itemId)) return { error: "Fila no válida." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("mon_despachos").select("clase, comprobantes").eq("item_id", itemId).maybeSingle();
  if (!fila) return { error: "Esa fila ya no existe." };
  await requireModulo(modulo(String(fila.clase)));
  const [{ data: notas }, { data: actividad }] = await Promise.all([
    supabase.from("despacho_notas").select("id, texto, autor_nombre, creado_en").eq("item_id", itemId).order("creado_en", { ascending: false }).limit(100),
    supabase.from("despacho_actividad").select("id, texto, autor_nombre, creado_en").eq("item_id", itemId).order("creado_en", { ascending: false }).limit(100),
  ]);
  const comprobantes: DetalleFila["comprobantes"] = [];
  for (const c of (fila.comprobantes as string[] | null) ?? []) {
    if (c.startsWith("storage:")) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(c.slice(8), 600);
      if (data?.signedUrl) comprobantes.push({ url: data.signedUrl, enMonday: false });
    } else if (/^https:\/\/[a-z0-9-]+\.monday\.com\//.test(c)) comprobantes.push({ url: c, enMonday: true });
  }
  const fmt = (x: { id: string; texto: string; autor_nombre: string | null; creado_en: string }) => ({ id: x.id, texto: x.texto, autor: x.autor_nombre ?? "Alguien del equipo", cuando: x.creado_en });
  return { notas: (notas ?? []).map(fmt), actividad: (actividad ?? []).map(fmt), comprobantes };
}
