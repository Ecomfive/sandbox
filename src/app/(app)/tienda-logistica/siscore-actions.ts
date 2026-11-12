"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTiendas } from "@/lib/tienda/datos";
import { fuenteFinanzas } from "@/lib/tienda/datos-finanzas";
import { nombreComparable } from "@/lib/tienda/ordenes-finanzas";
import { grupoDeEstadoGuia, leerLecturaSiscore, momentoEntrega, pedidoDeFactura, visitasSinEntregar } from "@/lib/tienda/siscore";

const RUTA = "/tienda-logistica";
const BUCKET = "wms-compras";
// La misma carpeta temporal de «Actualizar Dropi»: la extensión solo acepta subir ahí.
const CARPETA = "tmp-dropi-panel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr en Supabase la migración 0280 (guías de SISCORE).";

/**
 * Empieza una lectura de SISCORE (Servientrega): la deja anotada y da la dirección firmada donde la extensión sube lo leído. Una sola a la vez: si hay
 * una de los últimos 10 minutos todavía en curso, no empieza otra. Solo quien puede modificar Logística de tienda.
 */
export async function empezarLecturaSiscore(): Promise<{ id: string; subida: { siscore: string } } | { error: string }> {
  let u;
  try {
    u = await requireModuloEscritura("tienda-logistica");
  } catch {
    return { error: "Tu rol solo puede ver Logística." };
  }
  const supabase = createServiceClient();
  const { data: enCurso, error: errCurso } = await supabase
    .from("tienda_guias_lecturas")
    .select("id")
    .eq("estado", "corriendo")
    .gte("inicio", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (errCurso) return { error: FALTA };
  if (enCurso?.length) return { error: "Ya se está leyendo SISCORE. Espera a que termine." };
  const { data, error } = await supabase.from("tienda_guias_lecturas").insert({ iniciado_por: u.id, iniciado_por_nombre: u.nombre || u.email }).select("id").single();
  if (error || !data) return { error: FALTA };
  const id = data.id as string;
  const { data: s, error: e } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${id}/siscore.json`, { upsert: true });
  if (e || !s) {
    await supabase.from("tienda_guias_lecturas").update({ estado: "error", fin: new Date().toISOString(), error: "No se pudo preparar la subida." }).eq("id", id);
    return { error: "No se pudo preparar la subida." };
  }
  return { id, subida: { siscore: s.signedUrl } };
}

/**
 * Guarda lo que subió la extensión: cada guía con su tienda (el cliente de SISCORE, «KENKU» = Kenku) y su pedido (la «Factura» es el número de Shopify),
 * el grupo de su estado, las visitas sin entregar, cuándo se entregó y el rastreo. Borra el archivo temporal.
 */
export async function procesarLecturaSiscore(id: string): Promise<{ guias: number; conPedido: number; cliente: string } | { error: string }> {
  try {
    await requireModuloEscritura("tienda-logistica");
  } catch {
    return { error: "Tu rol solo puede ver Logística." };
  }
  if (!UUID.test(String(id))) return { error: "Lectura no válida." };
  const supabase = createServiceClient();
  const ruta = `${CARPETA}/${id}/siscore.json`;
  const fallar = async (msg: string) => {
    await supabase.from("tienda_guias_lecturas").update({ estado: "error", fin: new Date().toISOString(), error: msg.slice(0, 500) }).eq("id", id);
    return { error: msg };
  };
  const { data: archivo, error } = await supabase.storage.from(BUCKET).download(ruta);
  if (error || !archivo) return fallar("No llegó la lectura de SISCORE al sistema.");
  let lectura;
  try {
    lectura = leerLecturaSiscore(JSON.parse(await archivo.text()));
  } catch {
    lectura = null;
  }
  if (!lectura) return fallar("La lectura de SISCORE llegó vacía o con otro formato.");
  try {
    // La tienda del cliente de SISCORE y su unidad de Finanzas (donde están sus órdenes).
    const pais = await getPaisActual(supabase);
    const { tiendas } = await cargarTiendas(supabase, pais.id);
    const tienda = tiendas.find((t) => nombreComparable(t.nombre) === nombreComparable(lectura.cliente)) ?? null;
    const unidad = tienda ? ((await fuenteFinanzas(supabase, [tienda], pais.codigo)).unidadDe.get(tienda.id) ?? null) : null;
    // Los pedidos de esas guías, por su número en esa unidad.
    const numeros = [...new Set(lectura.guias.map((g) => pedidoDeFactura(g.factura)).filter((n): n is string => !!n))];
    const ordenDe = new Map<string, string>();
    if (unidad)
      for (let i = 0; i < numeros.length; i += 200) {
        const { data } = await supabase.from("ven_ordenes").select("id, numero").eq("unidad_id", unidad).in("numero", numeros.slice(i, i + 200));
        for (const o of data ?? []) ordenDe.set(String(o.numero).toUpperCase(), o.id as string);
      }
    const filas = lectura.guias.map((g) => {
      const numero = pedidoDeFactura(g.factura);
      const { visitas, motivo } = visitasSinEntregar(g.historial);
      return {
        guia: g.guia,
        tienda_id: tienda?.id ?? null,
        cliente: g.cliente,
        numero_pedido: numero,
        orden_id: numero ? (ordenDe.get(numero) ?? null) : null,
        destino: g.destino,
        servicio: g.servicio,
        proceso: g.proceso,
        estado: g.estado,
        estado_grupo: grupoDeEstadoGuia(g.estado),
        fecha_estado: g.fecha_estado,
        fecha_emision: g.fecha_emision,
        recaudo: g.recaudo,
        visitas_sin_entregar: visitas,
        ultimo_motivo: motivo,
        entregada_en: momentoEntrega(g.historial),
        historial: g.historial,
        leida_en: lectura.leido_en,
      };
    });
    for (let i = 0; i < filas.length; i += 200) {
      const { error: e } = await supabase.from("tienda_guias").upsert(filas.slice(i, i + 200), { onConflict: "guia" });
      if (e) return fallar(`No se pudieron guardar las guías: ${e.message}`);
    }
    const resumen = { cliente: lectura.cliente, guias: filas.length, conPedido: filas.filter((f) => f.orden_id).length, desde: lectura.desde, hasta: lectura.hasta };
    await supabase.from("tienda_guias_lecturas").update({ estado: "listo", fin: new Date().toISOString(), cliente: lectura.cliente, resumen, error: null }).eq("id", id);
    await supabase.storage.from(BUCKET).remove([ruta]);
    revalidatePath(RUTA);
    return { guias: resumen.guias, conPedido: resumen.conPedido, cliente: lectura.cliente };
  } catch (e) {
    return fallar(e instanceof Error ? e.message : "No se pudo guardar la lectura de SISCORE.");
  }
}

/** La lectura falló en la pestaña de SISCORE (sesión vencida, SISCORE no respondió…): queda anotada con el motivo. */
export async function fallarLecturaSiscore(id: string, motivo: string): Promise<{ ok: true }> {
  try {
    await requireModuloEscritura("tienda-logistica");
  } catch {
    return { ok: true };
  }
  if (!UUID.test(String(id))) return { ok: true };
  await createServiceClient()
    .from("tienda_guias_lecturas")
    .update({ estado: "error", fin: new Date().toISOString(), error: String(motivo ?? "").slice(0, 500) || "No se pudo leer SISCORE." })
    .eq("id", id)
    .eq("estado", "corriendo");
  return { ok: true };
}
