"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { aDolares, monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { motivoYaVisto, yaVisto } from "@/lib/scraping/cruces";
import { cargarReferencias } from "@/lib/scraping/referencias";
import { createServiceClient } from "@/lib/supabase/server";
import { ingerirLectura } from "@/lib/tuwinner/ingerir";
import { leerLectura, PAISES_TUWINNER, type PaisTuWinner } from "@/lib/tuwinner/tuwinner";

const RUTA = "/tu-winner";
const BUCKET = "wms-compras";
// La misma carpeta temporal de «Actualizar datos»: la extensión solo acepta subir ahí.
const CARPETA = "tmp-dropi-panel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr en Supabase la migración 0223 (Tu Winner).";
const revalidar = () => ["", "/canales", "/seguimiento", "/como"].forEach((r) => revalidatePath(`${RUTA}${r}`));

/**
 * Empieza una lectura de Tu Winner: la deja anotada y da la dirección firmada donde la extensión sube lo leído (vale 2 horas). Una sola a la vez: si hay
 * una de los últimos 10 minutos todavía en curso, no empieza otra.
 */
export async function empezarLecturaTuWinner(): Promise<{ id: string; subida: { tuwinner: string } } | { error: string }> {
  const u = await requireModuloEscritura("tu-winner");
  const supabase = createServiceClient();
  const { data: enCurso, error: errCurso } = await supabase
    .from("tuwinner_lecturas")
    .select("id")
    .eq("estado", "corriendo")
    .gte("inicio", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (errCurso) return { error: FALTA };
  if (enCurso?.length) return { error: "Ya se está leyendo Tu Winner. Espera a que termine." };
  const { data, error } = await supabase.from("tuwinner_lecturas").insert({ iniciado_por: u.id, iniciado_por_nombre: u.nombre || u.email }).select("id").single();
  if (error || !data) return { error: FALTA };
  const id = data.id as string;
  const { data: s, error: e } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${id}/tuwinner.json`, { upsert: true });
  if (e || !s) {
    await supabase.from("tuwinner_lecturas").update({ estado: "error", fin: new Date().toISOString(), error: "No se pudo preparar la subida." }).eq("id", id);
    return { error: "No se pudo preparar la subida." };
  }
  return { id, subida: { tuwinner: s.signedUrl } };
}

/** Guarda lo que subió la extensión: ganadores, stock de cada día y cambios. Borra el archivo temporal. */
export async function procesarLecturaTuWinner(id: string): Promise<{ resumen: Partial<Record<PaisTuWinner, number>>; eventos: number } | { error: string }> {
  await requireModuloEscritura("tu-winner");
  if (!UUID.test(String(id))) return { error: "Lectura no válida." };
  const supabase = createServiceClient();
  const ruta = `${CARPETA}/${id}/tuwinner.json`;
  const fallar = async (msg: string) => {
    await supabase.from("tuwinner_lecturas").update({ estado: "error", fin: new Date().toISOString(), error: msg.slice(0, 500) }).eq("id", id);
    return { error: msg };
  };
  const { data: archivo, error } = await supabase.storage.from(BUCKET).download(ruta);
  if (error || !archivo) return fallar("No llegó la lectura de Tu Winner al sistema.");
  let lectura;
  try {
    lectura = leerLectura(JSON.parse(await archivo.text()));
  } catch {
    lectura = null;
  }
  if (!lectura) return fallar("La lectura de Tu Winner llegó vacía o con otro formato.");
  try {
    const r = await ingerirLectura(supabase, lectura);
    await supabase.from("tuwinner_lecturas").update({ estado: "listo", fin: new Date().toISOString(), resumen: r.resumen, error: null }).eq("id", id);
    await supabase.storage.from(BUCKET).remove([ruta]);
    revalidar();
    return r;
  } catch (e) {
    return fallar(e instanceof Error ? e.message : "No se pudo guardar la lectura.");
  }
}

/** La lectura falló en la pestaña de Tu Winner (sesión vencida, Tu Winner no respondió…): queda anotada con el motivo. */
export async function fallarLecturaTuWinner(id: string, motivo: string): Promise<{ ok: true }> {
  await requireModuloEscritura("tu-winner");
  if (!UUID.test(String(id))) return { ok: true };
  await createServiceClient()
    .from("tuwinner_lecturas")
    .update({ estado: "error", fin: new Date().toISOString(), error: String(motivo ?? "").slice(0, 500) || "No se pudo leer Tu Winner." })
    .eq("id", id)
    .eq("estado", "corriendo");
  revalidar();
  return { ok: true };
}

/**
 * «A Selección»: crea la fila de Selección de productos de un ganador (fuente Tu Winner, su código TW-0001, en su país, con su precio pasado a dólares).
 * Llega **Seleccionado**; si ya se testeó, ya está en Producto, ya se compró o ya lo vendemos llega **Descartado** con el motivo (como Scraping). Un ganador
 * ya enviado no se vuelve a crear.
 */
export async function enviarTuWinnerASeleccion(pais: string, dropiId: string): Promise<{ codigo: string; descartado: boolean } | { error: string }> {
  const u = await requireModuloEscritura("tu-winner");
  if (!u.modulos.includes("seleccion-productos") || u.modulosSoloLectura.includes("seleccion-productos")) return { error: "Tu rol no puede agregar a Selección de productos." };
  if (!PAISES_TUWINNER.includes(pais as PaisTuWinner) || !/^\d{1,9}$/.test(String(dropiId))) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const clave = `${pais}|${dropiId}`;
  const { data: ya, error: errYa } = await supabase.from("wms_seleccion_productos").select("codigo_fuente").eq("tuwinner_clave", clave).maybeSingle();
  if (errYa) return { error: FALTA };
  if (ya) return { codigo: ya.codigo_fuente as string, descartado: false };
  const { data: p } = await supabase
    .from("tuwinner_productos")
    .select("nombre, proveedor, proveedor_dropi_id, plataforma, precio, precio_sugerido, categoria, foto_url, ventas_7d, stock")
    .eq("pais", pais)
    .eq("dropi_id", dropiId)
    .maybeSingle();
  if (!p) return { error: "Ese producto ya no está en Tu Winner." };
  const [{ data: paisFila }, { porUsd }, indice, { data: codigo, error: errCodigo }] = await Promise.all([
    supabase.from("paises").select("id").eq("codigo", pais).maybeSingle(),
    tasasUsd(supabase),
    cargarReferencias(supabase),
    supabase.rpc("wms_siguiente_codigo_fuente", { p_fuente: "tu_winner" }),
  ]);
  if (!paisFila) return { error: `El país ${pais} no está en Configuración › Países.` };
  if (errCodigo || !codigo) return { error: "No se pudo dar el código TW. ¿Ya se corrió la migración 0104?" };
  const moneda = monedaDePais(pais);
  const visto = yaVisto(p.nombre as string, null, indice);
  const { data: fila, error: errCrear } = await supabase
    .from("wms_seleccion_productos")
    .insert({
      pais_id: paisFila.id,
      nombre: p.nombre,
      estado: visto ? "descartado" : "seleccionado",
      motivo_descarte: visto ? motivoYaVisto(visto) : null,
      fuente: "tu_winner",
      codigo_fuente: codigo as string,
      foto_url: p.foto_url,
      url_pagina: `https://app.tuwinner.com/dashboard/winners?active=true&country=${pais}&dailySells=true`,
      costo_proveedor: aDolares(p.precio === null ? null : Number(p.precio), moneda, porUsd),
      precio_venta: aDolares(p.precio_sugerido === null ? null : Number(p.precio_sugerido), moneda, porUsd),
      precio_original: p.precio,
      moneda_original: moneda,
      categoria: (p.categoria as string | null)?.split(",")[0]?.trim().slice(0, 80) || null,
      notas: `Tu Winner: ${Number(p.ventas_7d ?? 0).toLocaleString("es-PA")} ventas en 7 días · stock ${Number(p.stock ?? 0).toLocaleString("es-PA")} · proveedor ${p.proveedor ?? "—"} · ID Dropi ${dropiId}`,
      tuwinner_clave: clave,
      creado_por: u.id,
    })
    .select("id, codigo_fuente")
    .single();
  if (errCrear || !fila) return { error: errCrear?.code === "23505" ? "Ese ganador ya está en Selección." : "No se pudo crear la fila en Selección." };
  await registrarAuditoria({
    accion: "crear_seleccion",
    entidad: "wms_seleccion_productos",
    entidadId: fila.id as string,
    detalle: `${fila.codigo_fuente} · ${p.nombre} (desde Tu Winner ${pais}${visto ? ", descartado: ya visto" : ""})`,
  });
  revalidar();
  revalidatePath("/seleccion-productos");
  return { codigo: fila.codigo_fuente as string, descartado: !!visto };
}
