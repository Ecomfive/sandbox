"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";

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
export async function obtenerStockDeSku(skuId: string): Promise<{ bodegas: StockBodega[]; movimientos: MovimientoStock[]; lotes: LoteStock[] } | { error: string }> {
  await requireModulo(MODULO);
  if (!ES_ID(skuId)) return { error: "SKU no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [porBodega, libro, lotesRpc] = await Promise.all([
    supabase.rpc("wms_stock_por_bodega", { p_sku: skuId, p_pais: pais.id }),
    supabase
      .from("wms_movimientos")
      .select("id, creado_en, tipo, cambios, origen, referencia, motivo, usuario_id, wms_bodegas!inner(nombre, pais_id), wms_ubicaciones!wms_movimientos_ubicacion_id_fkey(codigo)")
      .eq("sku_maestro_id", skuId)
      .eq("wms_bodegas.pais_id", pais.id)
      .order("creado_en", { ascending: false })
      .limit(30),
    supabase.rpc("wms_lotes_de_sku", { p_sku: skuId, p_pais: pais.id }),
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
  const { data: maestro } = await supabase.from("skus_maestros").select("codigo, tipo, clase, maneja_vencimiento").eq("id", sku).maybeSingle();
  if (!maestro) return { error: "El SKU no existe." };
  if (maestro.tipo === "combo") return { error: "Un producto compuesto no guarda stock: se calcula de sus componentes." };
  if (maestro.clase === "test") return { error: "Es un producto de prueba: no tiene stock hasta que se marque como físico." };

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
    detalle: `${tipo} ${cantidad} de ${maestro.codigo}${loteCodigo ? ` lote ${loteCodigo}` : ""}${referencia ? ` (${referencia})` : ""}`,
  });
  revalidatePath("/inventario");
  return {};
}
