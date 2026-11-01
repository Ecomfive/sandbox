"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";

const MODULO = "inventario";
const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

export interface StockBodega {
  bodegaId: string;
  codigo: string;
  nombre: string;
  /** «externa»: su stock manda un tercero (Dropi…) y aquí es de solo lectura. */
  tipo: string;
  fisico: number;
  reservado: number;
  disponible: number;
  danado: number;
  inspeccion: number;
  retenido: number;
  enCamino: number;
  vencido: number;
}

/** Un lote de un producto con vencimiento y lo que hay de él en una bodega. */
export interface LoteStock {
  loteId: string;
  lote: string;
  fechaVencimiento: string;
  diasRestantes: number;
  estado: "vencido" | "por_vencer" | "vigente";
  bodegaId: string;
  bodega: string;
  cantidad: number;
}

/** Un envío a la bodega de Dropi: cuánto salió, de dónde y, cuando Dropi confirma, cuánto llegó. */
export interface EnvioDropi {
  id: string;
  enviadoEn: string;
  desde: string;
  /** La bodega externa a la que fue (Dropi, Effi, Boxfull…). */
  hacia: string;
  enviada: number;
  recibida: number | null;
  estado: "en_camino" | "recibido";
  referencia: string | null;
  motivo: string | null;
}

export interface MovimientoStock {
  id: string;
  creadoEn: string;
  bodega: string;
  ubicacion: string | null;
  tipo: string;
  cambios: Record<string, number>;
  origen: string;
  referencia: string | null;
  motivo: string | null;
  usuario: string | null;
}

/** El stock de un SKU en cada bodega del país y sus últimos movimientos, para su ficha. Basta poder abrir Inventario. */
export async function obtenerStockDeSku(skuId: string): Promise<{ bodegas: StockBodega[]; movimientos: MovimientoStock[]; lotes: LoteStock[]; envios: EnvioDropi[] } | { error: string }> {
  await requireModulo(MODULO);
  if (!ES_ID(skuId)) return { error: "SKU no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [porBodega, libro, lotesRpc, enviosRes] = await Promise.all([
    supabase.rpc("wms_stock_por_bodega", { p_sku: skuId, p_pais: pais.id }),
    supabase
      .from("wms_movimientos")
      .select("id, creado_en, tipo, cambios, origen, referencia, motivo, usuario_id, wms_bodegas!inner(nombre, pais_id), wms_ubicaciones!wms_movimientos_ubicacion_id_fkey(codigo)")
      .eq("sku_maestro_id", skuId)
      .eq("wms_bodegas.pais_id", pais.id)
      .order("creado_en", { ascending: false })
      .limit(30),
    supabase.rpc("wms_lotes_de_sku", { p_sku: skuId, p_pais: pais.id }),
    // Sin la migración 0214 no hay envíos: la ficha carga igual.
    supabase
      .from("wms_envios_dropi")
      .select("id, enviado_en, enviada, recibida, estado, referencia, motivo_diferencia, wms_bodegas!wms_envios_dropi_bodega_origen_id_fkey!inner(nombre, pais_id), destino:wms_bodegas!wms_envios_dropi_bodega_dropi_id_fkey(nombre)")
      .eq("sku_maestro_id", skuId)
      .eq("wms_bodegas.pais_id", pais.id)
      .order("enviado_en", { ascending: false })
      .limit(20),
  ]);
  if (porBodega.error) return { error: "No se pudo cargar el stock." };

  const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);
  // Quién hizo cada movimiento: el libro guarda el id de la cuenta; el nombre se busca aparte.
  const idsUsuario = [...new Set((libro.data ?? []).map((m) => m.usuario_id as string | null).filter((x): x is string => !!x))];
  const { data: perfiles } = idsUsuario.length > 0 ? await supabase.from("perfiles").select("id, nombre, email").in("id", idsUsuario) : { data: [] };
  const nombreDe = new Map((perfiles ?? []).map((p) => [p.id as string, (p.nombre as string | null) || (p.email as string)]));
  return {
    bodegas: (porBodega.data ?? []).map((b: Record<string, unknown>) => ({
      bodegaId: String(b.bodega_id),
      codigo: String(b.codigo),
      nombre: String(b.nombre),
      tipo: String(b.tipo),
      fisico: Number(b.fisico),
      reservado: Number(b.reservado),
      disponible: Number(b.disponible),
      danado: Number(b.danado),
      inspeccion: Number(b.inspeccion),
      retenido: Number(b.retenido),
      enCamino: Number(b.en_camino),
      vencido: Number(b.vencido ?? 0),
    })),
    // Los lotes pueden fallar sin romper la ficha (producto sin vencimiento o migración sin correr).
    lotes: lotesRpc.error
      ? []
      : (lotesRpc.data ?? []).map((l: Record<string, unknown>) => ({
          loteId: String(l.lote_id),
          lote: String(l.lote),
          fechaVencimiento: String(l.fecha_vencimiento),
          diasRestantes: Number(l.dias_restantes),
          estado: l.estado as LoteStock["estado"],
          bodegaId: String(l.bodega_id),
          bodega: String(l.bodega),
          cantidad: Number(l.cantidad),
        })),
    envios: enviosRes.error
      ? []
      : (enviosRes.data ?? []).map((e) => ({
          id: e.id as string,
          enviadoEn: e.enviado_en as string,
          desde: uno<{ nombre: string }>(e.wms_bodegas as never)?.nombre ?? "—",
          hacia: uno<{ nombre: string }>(e.destino as never)?.nombre ?? "—",
          enviada: Number(e.enviada),
          recibida: e.recibida === null ? null : Number(e.recibida),
          estado: e.estado as EnvioDropi["estado"],
          referencia: (e.referencia as string | null) ?? null,
          motivo: (e.motivo_diferencia as string | null) ?? null,
        })),
    // El libro puede fallar sin romper la ficha (si no se pudo leer, se muestra el stock igual).
    movimientos: libro.error
      ? []
      : (libro.data ?? []).map((m) => ({
          id: m.id as string,
          creadoEn: m.creado_en as string,
          bodega: uno<{ nombre: string }>(m.wms_bodegas as never)?.nombre ?? "—",
          ubicacion: uno<{ codigo: string }>(m.wms_ubicaciones as never)?.codigo ?? null,
          tipo: m.tipo as string,
          cambios: (m.cambios ?? {}) as Record<string, number>,
          origen: m.origen as string,
          referencia: (m.referencia as string | null) ?? null,
          motivo: (m.motivo as string | null) ?? null,
          usuario: (m.usuario_id as string | null) ? (nombreDe.get(m.usuario_id as string) ?? null) : null,
        })),
  };
}

const TIPOS_MANUALES = ["entrada", "salida", "ajuste"] as const;

/**
 * Registra una entrada, una salida o un ajuste de inventario a mano. La cuenta la hace la base en una sola transacción
 * (`wms_registrar_movimiento`): un saldo puede quedar negativo (se corrige con otra entrada o un ajuste) y una bodega
 * externa no acepta movimientos a mano. Devuelve el error como valor, porque en producción Next.js oculta el mensaje de una
 * excepción.
 */
export async function registrarMovimientoStock(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const sku = texto(formData, "sku_id");
  const bodega = texto(formData, "bodega_id");
  const ubicacion = texto(formData, "ubicacion_id") || null;
  const tipo = texto(formData, "tipo");
  const cantidad = Number(texto(formData, "cantidad"));
  const referencia = texto(formData, "referencia").slice(0, 200) || null;
  const motivo = texto(formData, "motivo").slice(0, 500) || null;
  // Un producto con vencimiento se mueve por lote: entrada y ajuste nombran el lote (código y fecha si es nuevo); la salida puede no nombrarlo (sale primero lo que vence antes).
  const loteId = texto(formData, "lote_id") || null;
  const loteCodigo = texto(formData, "lote_codigo").slice(0, 80) || null;
  const vencimiento = texto(formData, "vencimiento") || null;

  if (!ES_ID(sku)) return { error: "SKU no válido." };
  if (!ES_ID(bodega)) return { error: "Elige la bodega." };
  if (ubicacion && !ES_ID(ubicacion)) return { error: "Ubicación no válida." };
  if (!(TIPOS_MANUALES as readonly string[]).includes(tipo)) return { error: "Tipo de movimiento no válido." };
  if (!Number.isInteger(cantidad) || cantidad === 0 || Math.abs(cantidad) > 1_000_000) return { error: "La cantidad debe ser un número entero distinto de cero." };
  if (tipo !== "ajuste" && cantidad < 0) return { error: "La cantidad debe ser positiva (para restar, usa una salida)." };
  if (tipo === "ajuste" && !motivo) return { error: "Un ajuste necesita un motivo." };
  if (loteId && !ES_ID(loteId)) return { error: "Lote no válido." };
  if (vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimiento)) return { error: "La fecha de vencimiento no es válida." };

  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, bodega))) return { error: "No tienes acceso al país de esa bodega." };
  // El país de la bodega va al final del detalle de la auditoría («· Panamá»): así su actividad se filtra por país.
  const { data: bodegaFila } = await supabase.from("wms_bodegas").select("paises(nombre)").eq("id", bodega).maybeSingle();
  const paisBodega = bodegaFila?.paises as { nombre: string } | { nombre: string }[] | null | undefined;
  const nombrePais = (Array.isArray(paisBodega) ? paisBodega[0] : paisBodega)?.nombre;
  const { data: maestro } = await supabase.from("skus_maestros").select("codigo, tipo, clase, maneja_vencimiento").eq("id", sku).maybeSingle();
  if (!maestro) return { error: "El SKU no existe." };
  if (maestro.tipo === "combo") return { error: "Un producto compuesto no guarda stock: se calcula de sus componentes." };
  if (maestro.clase === "test") return { error: "Es un producto de prueba: no tiene stock hasta que se pase a Activo." };

  if (maestro.maneja_vencimiento && tipo === "entrada" && !loteId && !(loteCodigo && vencimiento)) return { error: "Un producto con vencimiento necesita el lote y su fecha de vencimiento." };
  if (maestro.maneja_vencimiento && tipo === "ajuste" && !loteId && !loteCodigo) return { error: "Un ajuste de un producto con vencimiento necesita el lote." };
  if (!maestro.maneja_vencimiento && (loteId || loteCodigo || vencimiento)) return { error: "Este producto no maneja vencimiento." };

  const { error } = await supabase.rpc("wms_registrar_movimiento", {
    p_sku: sku,
    p_bodega: bodega,
    p_tipo: tipo,
    p_cantidad: cantidad,
    p_ubicacion: ubicacion,
    p_origen: "manual",
    p_referencia: referencia,
    p_motivo: motivo,
    p_usuario: usuario.id,
    p_lote: loteId,
    p_lote_codigo: loteCodigo,
    p_vencimiento: vencimiento,
  });
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo registrar el movimiento." };

  await registrarAuditoria({
    accion: "movimiento_inventario",
    entidad: "skus_maestros",
    entidadId: sku,
    detalle: `${tipo} ${cantidad} de ${maestro.codigo}${loteCodigo ? ` lote ${loteCodigo}` : ""}${referencia ? ` (${referencia})` : ""}${nombrePais ? ` · ${nombrePais}` : ""}`,
  });
  revalidatePath("/inventario");
  return {};
}

/** El nombre del país de una bodega, para el final del detalle de la auditoría («· Panamá»). */
async function paisDeBodega(supabase: ReturnType<typeof createServiceClient>, bodega: string): Promise<string | null> {
  const { data } = await supabase.from("wms_bodegas").select("paises(nombre)").eq("id", bodega).maybeSingle();
  const p = data?.paises as { nombre: string } | { nombre: string }[] | null | undefined;
  return (Array.isArray(p) ? p[0] : p)?.nombre ?? null;
}

const errorDeBase = (mensaje: string, porDefecto: string) => (mensaje.length < 200 ? mensaje : porDefecto);

/**
 * Transferencia entre dos bodegas propias del mismo país: sale de una y entra en la otra en la misma transacción
 * (`wms_transferir`). En un producto con vencimiento pasa el lote elegido o, sin elegir, los que vencen antes.
 */
export async function transferirStock(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const sku = texto(formData, "sku_id");
  const desde = texto(formData, "desde_id");
  const hacia = texto(formData, "hacia_id");
  const cantidad = Number(texto(formData, "cantidad"));
  const loteId = texto(formData, "lote_id") || null;
  const referencia = texto(formData, "referencia").slice(0, 200) || null;
  const motivo = texto(formData, "motivo").slice(0, 500) || null;
  if (!ES_ID(sku)) return { error: "SKU no válido." };
  if (!ES_ID(desde) || !ES_ID(hacia)) return { error: "Elige las dos bodegas." };
  if (desde === hacia) return { error: "La bodega de origen y la de destino son la misma." };
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 1_000_000) return { error: "La cantidad debe ser un número entero mayor que cero." };
  if (loteId && !ES_ID(loteId)) return { error: "Lote no válido." };

  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, desde)) || !(await puedeVerBodega(supabase, usuario.paisesPermitidos, hacia))) {
    return { error: "No tienes acceso al país de esas bodegas." };
  }
  const [{ data: maestro }, { data: bodegas }] = await Promise.all([
    supabase.from("skus_maestros").select("codigo").eq("id", sku).maybeSingle(),
    supabase.from("wms_bodegas").select("id, nombre").in("id", [desde, hacia]),
  ]);
  if (!maestro) return { error: "El SKU no existe." };
  const { error } = await supabase.rpc("wms_transferir", {
    p_sku: sku,
    p_desde: desde,
    p_hacia: hacia,
    p_cantidad: cantidad,
    p_lote: loteId,
    p_referencia: referencia,
    p_motivo: motivo,
    p_usuario: usuario.id,
  });
  if (error) return { error: errorDeBase(error.message, "No se pudo hacer la transferencia.") };
  const nombre = (id: string) => (bodegas ?? []).find((b) => b.id === id)?.nombre ?? "otra bodega";
  const pais = await paisDeBodega(supabase, desde);
  await registrarAuditoria({
    accion: "movimiento_inventario",
    entidad: "skus_maestros",
    entidadId: sku,
    detalle: `transferencia ${cantidad} de ${maestro.codigo} de ${nombre(desde)} a ${nombre(hacia)}${referencia ? ` (${referencia})` : ""}${pais ? ` · ${pais}` : ""}`,
  });
  revalidatePath("/inventario");
  return {};
}

/**
 * Remisión a una bodega externa del país (Dropi, Effi, Boxfull, Dunamixfy): las unidades salen de una bodega propia y la
 * remisión queda «en camino» hasta que el tercero diga cuántas llegaron (`recibirEnvioDropi`). Lo que hay en la bodega externa
 * no se mueve aquí: lo dice el tercero (la lectura de Dropi) y las remisiones son la base para cuadrarlo.
 */
export async function remitirAExterna(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const sku = texto(formData, "sku_id");
  const desde = texto(formData, "desde_id");
  const hacia = texto(formData, "hacia_id");
  const cantidad = Number(texto(formData, "cantidad"));
  const loteId = texto(formData, "lote_id") || null;
  const referencia = texto(formData, "referencia").slice(0, 200) || null;
  if (!ES_ID(sku)) return { error: "SKU no válido." };
  if (!ES_ID(desde)) return { error: "Elige de qué bodega sale." };
  if (!ES_ID(hacia)) return { error: "Elige a qué bodega va." };
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 1_000_000) return { error: "La cantidad debe ser un número entero mayor que cero." };
  if (loteId && !ES_ID(loteId)) return { error: "Lote no válido." };

  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, desde)) || !(await puedeVerBodega(supabase, usuario.paisesPermitidos, hacia))) {
    return { error: "No tienes acceso al país de esas bodegas." };
  }
  const [{ data: maestro }, { data: destino }] = await Promise.all([
    supabase.from("skus_maestros").select("codigo").eq("id", sku).maybeSingle(),
    supabase.from("wms_bodegas").select("nombre").eq("id", hacia).maybeSingle(),
  ]);
  if (!maestro) return { error: "El SKU no existe." };
  const { error } = await supabase.rpc("wms_enviar_a_externa", {
    p_sku: sku,
    p_desde: desde,
    p_hacia: hacia,
    p_cantidad: cantidad,
    p_lote: loteId,
    p_referencia: referencia,
    p_usuario: usuario.id,
  });
  if (error) {
    if (/wms_enviar_a_externa/.test(error.message)) return { error: "Falta correr la migración 0215 en la base." };
    return { error: errorDeBase(error.message, "No se pudo registrar la remisión.") };
  }
  const pais = await paisDeBodega(supabase, desde);
  await registrarAuditoria({
    accion: "envio_dropi_inventario",
    entidad: "skus_maestros",
    entidadId: sku,
    detalle: `Remisión a ${destino?.nombre ?? "bodega externa"}: ${cantidad} de ${maestro.codigo}${referencia ? ` (${referencia})` : ""}${pais ? ` · ${pais}` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/remisiones");
  return {};
}

/** El tercero (Dropi, Effi…) confirmó una remisión: cuántas unidades dice que llegaron. Si no son las enviadas, el motivo es obligatorio. */
export async function recibirEnvioDropi(envioId: string, recibida: number, motivo: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!ES_ID(envioId)) return { error: "Envío no válido." };
  if (!Number.isInteger(recibida) || recibida < 0 || recibida > 1_000_000) return { error: "Escribe cuántas unidades llegaron." };
  const nota = motivo.trim().slice(0, 500);
  const supabase = createServiceClient();
  const { data: envio } = await supabase.from("wms_envios_dropi").select("sku_maestro_id, bodega_origen_id, enviada, skus_maestros(codigo)").eq("id", envioId).maybeSingle();
  if (!envio) return { error: "El envío no existe." };
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, envio.bodega_origen_id as string))) return { error: "No tienes acceso al país de ese envío." };
  const { error } = await supabase.rpc("wms_recibir_envio_dropi", { p_envio: envioId, p_recibida: recibida, p_motivo: nota || null, p_usuario: usuario.id });
  if (error) return { error: errorDeBase(error.message, "No se pudo guardar la recepción.") };
  const m = envio.skus_maestros as { codigo: string } | { codigo: string }[] | null;
  const codigo = (Array.isArray(m) ? m[0] : m)?.codigo ?? "";
  const pais = await paisDeBodega(supabase, envio.bodega_origen_id as string);
  await registrarAuditoria({
    accion: "envio_dropi_recibido",
    entidad: "skus_maestros",
    entidadId: envio.sku_maestro_id as string,
    detalle: `Recibieron ${recibida} de ${envio.enviada} de ${codigo}${recibida !== envio.enviada && nota ? `: ${nota}` : ""}${pais ? ` · ${pais}` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/remisiones");
  return {};
}
