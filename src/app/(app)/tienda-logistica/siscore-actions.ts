"use server";

import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTiendas } from "@/lib/tienda/datos";
import { fuenteFinanzas } from "@/lib/tienda/datos-finanzas";
import { tiendaDeClienteSiscore } from "@/lib/tienda/siscore";
import { grupoDeEstadoGuia, leerLecturaSiscore, momentoEntrega, pedidoDeFactura, visitasSinEntregar } from "@/lib/tienda/siscore";
import { actualizarEntregas, completarDatosEntrega } from "@/lib/tienda/actualizar-entregas";

const RUTA = "/tienda-logistica";
const BUCKET = "wms-compras";
// La misma carpeta temporal de «Actualizar Dropi»: la extensión solo acepta subir ahí.
const CARPETA = "tmp-dropi-panel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr en Supabase la migración 0280 (guías de SISCORE).";

/** Una lectura en curso que no avanzó en este tiempo se da por abandonada (se cerró la pestaña o se cortó) y ya no frena otra. */
const VIVA_MS = 2 * 60_000;
const FALTA_AVANCE = "Falta correr en Supabase la migración 0294 (avance de SISCORE por tienda).";

export interface LecturaEnCurso {
  id: string;
  tiendaId: string | null;
  tienda: string;
  hechos: number;
  total: number;
  inicio: string;
  por: string | null;
}

const porcentaje = (hechos: number, total: number) => (total > 0 ? Math.min(99, Math.floor((hechos / total) * 100)) : 0);

/** Las lecturas de SISCORE que siguen avanzando (de cualquier tienda), para mostrar su porcentaje. Las que dejaron de avanzar se cierran. */
async function lecturasVivas(supabase: ReturnType<typeof createServiceClient>): Promise<LecturaEnCurso[] | null> {
  const { data, error } = await supabase
    .from("tienda_guias_lecturas")
    .select("id, tienda_id, hechos, total, inicio, avance_en, iniciado_por_nombre, tiendas(nombre)")
    .eq("estado", "corriendo")
    .gte("inicio", new Date(Date.now() - 6 * 60 * 60_000).toISOString());
  if (error) return null;
  const vivas: LecturaEnCurso[] = [];
  const muertas: string[] = [];
  for (const x of (data ?? []) as Record<string, unknown>[]) {
    const ultimo = Date.parse(String(x.avance_en ?? x.inicio));
    if (Date.now() - ultimo > VIVA_MS) {
      muertas.push(String(x.id));
      continue;
    }
    const t = (Array.isArray(x.tiendas) ? x.tiendas[0] : x.tiendas) as { nombre?: string } | null;
    vivas.push({ id: String(x.id), tiendaId: (x.tienda_id as string | null) ?? null, tienda: t?.nombre ?? "la tienda", hechos: Number(x.hechos ?? 0), total: Number(x.total ?? 0), inicio: String(x.inicio), por: (x.iniciado_por_nombre as string | null) ?? null });
  }
  if (muertas.length)
    await supabase.from("tienda_guias_lecturas").update({ estado: "error", fin: new Date().toISOString(), error: "Se dejó de actualizar (se cerró la pestaña o se cortó)." }).in("id", muertas);
  return vivas;
}

/** Lo que se está leyendo ahora en SISCORE, con su avance (lo pide la pantalla cada pocos segundos). */
export async function lecturasSiscoreEnCurso(): Promise<LecturaEnCurso[]> {
  try {
    await requireModulo("tienda-logistica");
  } catch {
    return [];
  }
  return (await lecturasVivas(createServiceClient())) ?? [];
}

/**
 * Empieza una lectura de SISCORE (14 nov 2026: por tienda). `clienteSesion` es la cuenta abierta en SISCORE («KENKU»); `tiendaElegida`, la tienda
 * que se mira en Logística. Si no coinciden, no lee (avisa con qué cuenta entrar). Solo frena una lectura de la **misma** tienda que siga avanzando.
 * Da la dirección firmada donde la extensión sube lo leído. Solo quien puede modificar Logística de tienda.
 */
export async function empezarLecturaSiscore(clienteSesion: string | null, tiendaElegida: string | null): Promise<{ id: string; tienda: string | null; subida: { siscore: string } } | { error: string }> {
  let u;
  try {
    u = await requireModuloEscritura("tienda-logistica");
  } catch {
    return { error: "Tu rol solo puede ver Logística." };
  }
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas } = await cargarTiendas(supabase, pais.id);
  const deSesion = clienteSesion ? tiendaDeClienteSiscore(clienteSesion, tiendas) : null;
  const elegida = tiendaElegida && UUID.test(tiendaElegida) ? (tiendas.find((t) => t.id === tiendaElegida) ?? null) : null;
  if (elegida && clienteSesion && deSesion?.id !== elegida.id)
    return { error: `La sesión abierta en SISCORE es de ${clienteSesion}. Para ${elegida.nombre}, cierra sesión en SISCORE y entra con la cuenta de ${elegida.nombre}.` };
  const tienda = deSesion ?? elegida;
  const vivas = await lecturasVivas(supabase);
  if (!vivas) return { error: FALTA_AVANCE };
  const misma = vivas.find((v) => v.tiendaId === (tienda?.id ?? null));
  if (misma) return { error: `Ya se está leyendo Servientrega de ${misma.tienda}: ${porcentaje(misma.hechos, misma.total)} %${misma.total ? ` (${misma.hechos} de ${misma.total} guías)` : ""}. Espera a que termine.` };
  const { data, error } = await supabase
    .from("tienda_guias_lecturas")
    .insert({ iniciado_por: u.id, iniciado_por_nombre: u.nombre || u.email, tienda_id: tienda?.id ?? null, avance_en: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) return { error: /tienda_id|avance_en/.test(error?.message ?? "") ? FALTA_AVANCE : FALTA };
  const id = data.id as string;
  const { data: s, error: e } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${id}/siscore.json`, { upsert: true });
  if (e || !s) {
    await supabase.from("tienda_guias_lecturas").update({ estado: "error", fin: new Date().toISOString(), error: "No se pudo preparar la subida." }).eq("id", id);
    return { error: "No se pudo preparar la subida." };
  }
  return { id, tienda: tienda?.nombre ?? null, subida: { siscore: s.signedUrl } };
}

/** El avance de una lectura (guías con su rastreo leídas de cuántas): lo manda la pantalla que lee, para que cualquiera vea el porcentaje. */
export async function avanceLecturaSiscore(id: string, hechos: number, total: number): Promise<{ ok: true }> {
  try {
    await requireModuloEscritura("tienda-logistica");
  } catch {
    return { ok: true };
  }
  if (!UUID.test(String(id))) return { ok: true };
  const h = Math.max(0, Math.floor(Number(hechos) || 0));
  const t = Math.max(h, Math.floor(Number(total) || 0));
  await createServiceClient().from("tienda_guias_lecturas").update({ hechos: h, total: t, avance_en: new Date().toISOString() }).eq("id", id).eq("estado", "corriendo");
  return { ok: true };
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
    const tienda = tiendaDeClienteSiscore(lectura.cliente, tiendas);
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
    await supabase.from("tienda_guias_lecturas").update({ estado: "listo", fin: new Date().toISOString(), cliente: lectura.cliente, resumen, error: null, ...(tienda ? { tienda_id: tienda.id, hechos: resumen.guias, total: resumen.guias } : {}) }).eq("id", id);
    await supabase.storage.from(BUCKET).remove([ruta]);
    // Las órdenes despachadas que Servientrega (o Monday) ya dan por entregadas o devueltas pasan a esa fase (12 nov 2026, pedido de Hernán).
    // Con un tope de tiempo (14 nov 2026): con cientos de guías (Oferfy) lo que no alcance lo toma la próxima lectura de Monday o de SISCORE.
    await actualizarEntregas(supabase, "Servientrega (lectura de SISCORE)", Date.now() + 30_000).catch(() => null);
    // La fecha de despacho de los que salieron por Servientrega sin la fecha de Shopify (la emisión de la guía), 14 nov 2026.
    await completarDatosEntrega(supabase, Date.now() + 10_000).catch(() => 0);
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
