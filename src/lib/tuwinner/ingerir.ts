// Guarda una lectura de Tu Winner (2 nov 2026): los ganadores de cada país con su último precio, proveedor, stock y ventas de 7 días, el stock de cada día
// y lo que cambió (entró, salió, cambió de precio o de proveedor). Recibe el cliente de Supabase y usa rutas relativas porque también lo usa `scripts/`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cambiosDeLectura, fotoTuWinner, type LecturaTuWinner, type PaisTuWinner, type ProductoAntes } from "./tuwinner";

/** El día de Panamá (UTC−5) de un momento: Tu Winner y el equipo trabajan con ese día. */
export const diaPanama = (iso: string): string => new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10);

function* enLotes<T>(items: T[], tam: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += tam) yield items.slice(i, i + tam);
}

/** Guarda la lectura. Devuelve cuántos ganadores quedó de cada país y cuántos cambios se anotaron. Lanza un error con el motivo si algo falla. */
export async function ingerirLectura(supabase: SupabaseClient, lectura: LecturaTuWinner): Promise<{ resumen: Partial<Record<PaisTuWinner, number>>; eventos: number }> {
  const resumen: Partial<Record<PaisTuWinner, number>> = {};
  let totalEventos = 0;
  const hoy = diaPanama(lectura.leido_en);
  for (const [pais, items] of Object.entries(lectura.paises) as [PaisTuWinner, NonNullable<LecturaTuWinner["paises"][PaisTuWinner]>][]) {
    const { data: antesR, error: errAntes } = await supabase.from("tuwinner_productos").select("dropi_id, ganador, ganador_desde, precio, proveedor").eq("pais", pais);
    if (errAntes) throw new Error(/does not exist|schema cache/i.test(errAntes.message) ? "Falta correr la migración 0223 (Tu Winner) en la base." : `No se pudo leer lo anterior: ${errAntes.message}`);
    const antes: ProductoAntes[] = (antesR ?? []).map((a) => ({
      dropi_id: a.dropi_id as string,
      ganador: !!a.ganador,
      ganador_desde: (a.ganador_desde as string | null) ?? null,
      precio: a.precio === null ? null : Number(a.precio),
      proveedor: (a.proveedor as string | null) ?? null,
    }));
    const { eventos, ganadorDesde, salieron } = cambiosDeLectura(antes, items, hoy);

    const filas = items.map((p, i) => ({
      pais,
      dropi_id: p.dropi_id,
      tw_id: p.tw_id,
      nombre: p.nombre,
      proveedor: p.proveedor,
      proveedor_dropi_id: p.proveedor_id,
      plataforma: p.plataforma,
      precio: p.precio,
      precio_sugerido: p.sugerido,
      categoria: p.categoria,
      foto_url: fotoTuWinner(pais, p.tw_id, p.imagen_v),
      ventas_7d: p.ventas7,
      stock: p.stock,
      ganador: true,
      posicion: i + 1,
      ganador_desde: ganadorDesde.get(p.dropi_id) ?? hoy,
      ultima_vez: lectura.leido_en,
    }));
    for (const lote of enLotes(filas, 200)) {
      const { error } = await supabase.from("tuwinner_productos").upsert(lote, { onConflict: "pais,dropi_id" });
      if (error) throw new Error(`No se pudieron guardar los productos de ${pais}: ${error.message}`);
    }
    for (const lote of enLotes(salieron, 200)) {
      const { error } = await supabase.from("tuwinner_productos").update({ ganador: false, posicion: null, ganador_desde: null }).eq("pais", pais).in("dropi_id", lote);
      if (error) throw new Error(`No se pudieron marcar los que salieron de ${pais}: ${error.message}`);
    }
    const dias = items.flatMap((p) => p.dias.map(([dia, stock]) => ({ pais, dropi_id: p.dropi_id, dia, stock })));
    for (const lote of enLotes(dias, 500)) {
      const { error } = await supabase.from("tuwinner_dias").upsert(lote, { onConflict: "pais,dropi_id,dia" });
      if (error) throw new Error(`No se pudo guardar el stock de cada día de ${pais}: ${error.message}`);
    }
    if (eventos.length) {
      const { error } = await supabase.from("tuwinner_eventos").insert(eventos.map((e) => ({ pais, dropi_id: e.dropi_id, momento: lectura.leido_en, tipo: e.tipo, antes: e.antes, despues: e.despues })));
      if (error) throw new Error(`No se pudieron anotar los cambios de ${pais}: ${error.message}`);
    }
    resumen[pais] = items.length;
    totalEventos += eventos.length;
  }
  return { resumen, eventos: totalEventos };
}
