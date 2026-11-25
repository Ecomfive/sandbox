// Anuncios Meta › lo que toca la base para las señales de otros módulos (24 nov 2026, pedido de Alcides). Lee, de Inventario, Gestión de IDs Dropi, Análisis de competencia y Test productos, lo que se sabe de cada producto de las campañas:
// el inventario disponible y su ritmo de salida, el precio de venta con su margen y cuándo cambió, los competidores que venden lo mismo más barato y sus avisos, y el resultado de su test. Solo lee; solo datos operativos del producto
// (nada financiero de la empresa, de personas ni de clientes). El análisis es de `senales-modulos.ts`. Cada lectura que falla deja vacío su módulo y no frena a los demás.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { indexarCatalogo, productoDeCampana } from "./etapa-venta";
import type { DatosModulos } from "./senales-modulos";

const restar = (fecha: string, n: number) => new Date(new Date(`${fecha}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
const trozos = <T>(l: T[], n: number): T[][] => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

async function enTrozos<T extends Record<string, unknown>>(ids: (string | number)[], leer: (parte: (string | number)[]) => PromiseLike<{ data: T[] | null; error: unknown }>, tam = 150): Promise<T[]> {
  const out: T[] = [];
  for (const parte of trozos(ids, tam)) {
    try {
      const { data, error } = await leer(parte);
      if (!error && data) out.push(...data);
    } catch {
      // Un módulo que falla no frena a los demás.
    }
  }
  return out;
}

const vacio = (): DatosModulos => ({ stock: null, precios: [], competencia: { avisos: [], masBaratos: null }, test: null });

/**
 * Para cada producto de las campañas (el texto del producto, como «EO ACEITE VEGANIC»), lo que dicen los otros módulos. El producto de Producto se encuentra con la misma regla estricta que usa la etapa de venta (todas las palabras de la
 * campaña en su nombre): mejor no reconocerlo que reconocer uno equivocado; un producto sin reconocer queda sin señales.
 */
export async function leerDatosModulos(supabase: SupabaseClient, o: { paisId: string; productos: string[]; hoy: string }): Promise<Map<string, DatosModulos>> {
  const out = new Map<string, DatosModulos>(o.productos.map((p) => [p, vacio()]));
  try {
    // 1) El producto de Producto de cada campaña. Los hijos (variantes) suman a su producto.
    const skus = await traerTodasLasFilas<Record<string, unknown>>((a, b) => supabase.from("skus_maestros").select("id, nombre, clase, padre_id, tipo").order("id").range(a, b));
    const principales = skus.filter((s) => !s.padre_id && s.tipo !== "combo" && s.tipo !== "compuesto");
    const indice = indexarCatalogo(principales.map((s) => ({ nombre: String(s.nombre), clase: String(s.clase ?? "") })));
    const idDeNombre = new Map<string, string>();
    for (const s of principales) if (!idDeNombre.has(String(s.nombre))) idDeNombre.set(String(s.nombre), String(s.id));
    const skuDe = new Map<string, string>();
    for (const p of o.productos) {
      const m = productoDeCampana(p, indice);
      const id = m ? idDeNombre.get(m.nombre) : null;
      if (id) skuDe.set(p, id);
    }
    const skuIds = [...new Set(skuDe.values())];
    if (!skuIds.length) return out;
    const hijosDe = new Map<string, string[]>();
    for (const s of skus) if (s.padre_id && skuIds.includes(String(s.padre_id))) hijosDe.set(String(s.padre_id), [...(hijosDe.get(String(s.padre_id)) ?? []), String(s.id)]);
    const todosLosIds = [...new Set([...skuIds, ...[...hijosDe.values()].flat()])];
    const padreDe = new Map<string, string>(todosLosIds.map((id) => [id, id]));
    for (const [padre, hijos] of hijosDe) for (const h of hijos) padreDe.set(h, padre);

    // 2) Inventario: lo disponible y lo que viene en camino en las bodegas del país, y lo que salió en 30 días.
    const { data: bodegasF } = await supabase.from("wms_bodegas").select("id").eq("pais_id", o.paisId);
    const bodegas = new Set((bodegasF ?? []).map((b) => String(b.id)));
    const stock = new Map<string, { disponible: number; enCamino: number; salidas30: number }>();
    if (bodegas.size) {
      for (const f of await enTrozos(todosLosIds, (p) => supabase.from("wms_stock").select("sku_maestro_id, bodega_id, disponible, en_camino").in("sku_maestro_id", p))) {
        if (!bodegas.has(String(f.bodega_id))) continue;
        const padre = padreDe.get(String(f.sku_maestro_id))!;
        const e = stock.get(padre) ?? { disponible: 0, enCamino: 0, salidas30: 0 };
        e.disponible += num(f.disponible) ?? 0;
        e.enCamino += num(f.en_camino) ?? 0;
        stock.set(padre, e);
      }
      for (const f of await enTrozos(todosLosIds, (p) => supabase.from("wms_movimientos").select("sku_maestro_id, bodega_id, cambios").eq("tipo", "salida").gte("creado_en", `${restar(o.hoy, 30)}T00:00:00Z`).in("sku_maestro_id", p))) {
        if (!bodegas.has(String(f.bodega_id))) continue;
        const fisico = num((f.cambios as Record<string, unknown> | null)?.fisico);
        if (fisico === null || fisico >= 0) continue;
        const padre = padreDe.get(String(f.sku_maestro_id))!;
        const e = stock.get(padre) ?? { disponible: 0, enCamino: 0, salidas30: 0 };
        e.salidas30 += -fisico;
        stock.set(padre, e);
      }
    }

    // 3) Gestión de IDs Dropi: el precio de venta (activas), su margen y cuándo cambió.
    const pubs = await enTrozos(skuIds, (p) => supabase.from("dropi_publicaciones").select("sku_maestro_id, dropi_id, precio_venta, margen, ultimo_cambio_precio, estado_publicacion, duplicada_de").eq("pais_id", o.paisId).in("sku_maestro_id", p));
    const activas = pubs.filter((p) => p.estado_publicacion === "activo" && !p.duplicada_de);
    const preciosDe = new Map<string, DatosModulos["precios"]>();
    for (const p of activas) {
      const l = preciosDe.get(String(p.sku_maestro_id)) ?? [];
      const precio = num(p.precio_venta);
      if (precio !== null) l.push({ precio, margen: num(p.margen), ultimoCambio: p.ultimo_cambio_precio ? String(p.ultimo_cambio_precio).slice(0, 10) : null });
      preciosDe.set(String(p.sku_maestro_id), l);
    }

    // 4) Análisis de competencia: nuestros productos (por el ID de Dropi de sus publicaciones), los que son iguales y sus avisos recientes.
    const dropiIds = new Map<string, number[]>();
    for (const p of activas) for (const n of String(p.dropi_id ?? "").match(/\d+/g) ?? []) dropiIds.set(String(p.sku_maestro_id), [...(dropiIds.get(String(p.sku_maestro_id)) ?? []), Number(n)]);
    const todosDropi = [...new Set([...dropiIds.values()].flat())];
    const nuestros = todosDropi.length ? await enTrozos(todosDropi, (p) => supabase.from("competencia_productos").select("id, dropi_producto_id, precio").eq("pais_id", o.paisId).eq("es_nuestro", true).in("dropi_producto_id", p)) : [];
    const skuDeNuestro = new Map<string, string>();
    for (const n of nuestros) for (const [sku, ids] of dropiIds) if (ids.includes(Number(n.dropi_producto_id))) skuDeNuestro.set(String(n.id), sku);
    const idsNuestros = [...skuDeNuestro.keys()];
    const competencia = new Map<string, DatosModulos["competencia"]>();
    if (idsNuestros.length) {
      const iguales = await enTrozos(idsNuestros, (p) => supabase.from("competencia_productos").select("igual_a, precio, stock, es_nuestro, estado").eq("pais_id", o.paisId).eq("es_nuestro", false).in("igual_a", p));
      const alertas = await enTrozos(idsNuestros, (p) => supabase.from("competencia_alertas").select("nuestro_id, fecha, titulo").eq("pais_id", o.paisId).gte("fecha", `${restar(o.hoy, 21)}T00:00:00Z`).in("nuestro_id", p));
      const precioNuestro = new Map(nuestros.map((n) => [String(n.id), num(n.precio)]));
      for (const id of idsNuestros) {
        const sku = skuDeNuestro.get(id)!;
        const e = competencia.get(sku) ?? { avisos: [], masBaratos: null };
        const nuestro = precioNuestro.get(id);
        // Competidores que venden lo mismo, con stock, más baratos que nosotros.
        const baratos = iguales.filter((c) => String(c.igual_a) === id && (num(c.stock) ?? 0) > 0 && nuestro !== null && nuestro !== undefined && (num(c.precio) ?? Infinity) < nuestro);
        if (nuestro && baratos.length) {
          const minimo = Math.min(...baratos.map((c) => num(c.precio)!));
          const previo = e.masBaratos;
          e.masBaratos = previo ? { competidores: previo.competidores + baratos.length, minimo: Math.min(previo.minimo, minimo), nuestro: Math.max(previo.nuestro, nuestro) } : { competidores: baratos.length, minimo, nuestro };
        }
        for (const a of alertas) if (String(a.nuestro_id) === id) e.avisos.push({ fecha: String(a.fecha).slice(0, 10), titulo: String(a.titulo ?? "").slice(0, 120) });
        competencia.set(sku, e);
      }
    }

    // 4b) Test productos: el último test de cada producto.
    const tests = await enTrozos(skuIds, (p) => supabase.from("wms_productos_test").select("sku_maestro_id, fecha_test, estado, metrica_cpa, metrica_cvr").eq("pais_id", o.paisId).in("sku_maestro_id", p).order("fecha_test", { ascending: false }));
    const testDe = new Map<string, DatosModulos["test"]>();
    for (const t of tests) {
      const sku = String(t.sku_maestro_id);
      if (!testDe.has(sku)) testDe.set(sku, { fecha: t.fecha_test ? String(t.fecha_test).slice(0, 10) : null, cpa: num(t.metrica_cpa), cvr: num(t.metrica_cvr), estado: t.estado ? String(t.estado) : null });
    }

    for (const [producto, sku] of skuDe) {
      out.set(producto, { stock: stock.get(sku) ?? null, precios: preciosDe.get(sku) ?? [], competencia: competencia.get(sku) ?? { avisos: [], masBaratos: null }, test: testDe.get(sku) ?? null });
    }
  } catch {
    // Sin señales de otros módulos: el análisis sigue con lo de Meta.
  }
  return out;
}
