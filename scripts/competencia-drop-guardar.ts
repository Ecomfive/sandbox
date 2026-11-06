// Análisis de competencia con Drop (6 nov 2026, migración 0234): guarda una lectura de todo el catálogo de dropshipper de Drop (la manda
// `scrapingCompetenciaDrop` de scripts/scraping-proveedores-navegador.js al receptor de scripts/scraping-proveedores.ts). Lo mismo que competencia-guardar.ts
// con Dropi, en sus propias tablas: anota cada cambio, empareja cada producto de la competencia con el nuestro igual (por nombre y por foto) y deja las
// alertas. La primera búsqueda no deja alertas: todo es nuevo. Una lectura que trae mucho menos que lo guardado no toca nada: sería un catálogo a medias.

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarAlertas, type ProductoAlerta } from "../src/lib/competencia/analisis";
import { catalogoDrop, type VistoDrop } from "../src/lib/competencia/drop";
import { comparar, type Evento, type ProductoGuardado, type ProductoVisto } from "../src/lib/scraping/comparar";
import { indexar, yaVisto } from "../src/lib/scraping/cruces";

export interface LecturaCompetenciaDrop {
  tipo: "competencia-drop";
  pais: string;
  inicio: string;
  duracionMs: number;
  paginas: number[];
  /** Las tarjetas del catálogo como las manda la pestaña; se revisan con `catalogoDrop`. */
  productos: unknown[];
}

interface FilaGuardada {
  id: string;
  drop_producto_id: string;
  proveedor_nombre: string;
  nombre: string;
  foto_huella: string | null;
  precio: string | null;
  stock: number | null;
  categoria: string | null;
  creado_en_drop: string | null;
  es_nuestro: boolean;
  estado: "activo" | "desaparecido";
  igual_a: string | null;
  igual_parecido: string | null;
  igual_metodo: string | null;
}

const PRODUCTOS = "drop_competencia_productos";

function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

async function enTrozos<T>(filas: T[], n: number, f: (trozo: T[]) => Promise<void>) {
  for (let i = 0; i < filas.length; i += n) await f(filas.slice(i, i + n));
}

async function todas(supabase: SupabaseClient, paisId: string): Promise<FilaGuardada[]> {
  const filas: FilaGuardada[] = [];
  for (let desde = 0; ; desde += 1000) {
    const data = revisar(
      await supabase
        .from(PRODUCTOS)
        .select("id, drop_producto_id, proveedor_nombre, nombre, foto_huella, precio, stock, categoria, creado_en_drop, es_nuestro, estado, igual_a, igual_parecido, igual_metodo")
        .eq("pais_id", paisId)
        .order("id")
        .range(desde, desde + 999),
      "Productos guardados",
    ) as FilaGuardada[];
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

export async function guardarCompetenciaDrop(supabase: SupabaseClient, l: LecturaCompetenciaDrop, calcularHuellas: (filtro: string, tabla: string, columna: string) => Promise<number>) {
  const t0 = Date.now();
  const pais = revisar(await supabase.from("paises").select("id, nombre").eq("codigo", "CR").maybeSingle(), "País");
  if (!pais) throw new Error("Costa Rica no está en Configuración › Países.");
  const vistos = catalogoDrop(l.productos);
  if (!vistos.length) throw new Error("La lectura no trae productos de Drop.");
  const antes = await todas(supabase, pais.id);
  const activos = antes.filter((g) => g.estado === "activo").length;
  if (vistos.length < activos / 2) throw new Error(`La lectura trae ${vistos.length} productos y había ${activos}: no se guarda, puede ser un catálogo a medias.`);

  const { count: previas } = await supabase.from("drop_competencia_busquedas").select("id", { count: "exact", head: true }).eq("pais_id", pais.id).eq("estado", "lista");
  const primera = !previas;
  const busqueda = revisar(await supabase.from("drop_competencia_busquedas").insert({ pais_id: pais.id, inicio: l.inicio, estado: "corriendo" }).select("id").single(), "Crear búsqueda") as { id: string };

  try {
    // 1. La comparación con lo guardado. `comparar` cuenta con IDs numéricos (los de Dropi): cada ID de Drop lleva uno solo para esto.
    const numeros = new Map<string, number>();
    const numero = (id: string) => numeros.get(id) ?? (numeros.set(id, numeros.size + 1), numeros.size);
    const porNumero = new Map<number, VistoDrop>(vistos.map((v) => [numero(v.dropId), v]));
    const guardados: ProductoGuardado[] = antes.map((g) => ({
      id: g.id,
      dropiId: numero(g.drop_producto_id),
      nombre: g.nombre,
      privado: false,
      precio: g.precio === null ? null : Number(g.precio),
      stock: g.stock,
      estado: g.estado,
    }));
    const aVisto = (n: number, v: VistoDrop): ProductoVisto => ({
      dropiId: n,
      sku: null,
      nombre: v.nombre,
      foto: v.foto,
      privado: false,
      precio: v.precio,
      precioSugerido: v.precioSugerido,
      stock: v.stock,
      categoria: v.categoria,
      creadoEnDropi: v.creadoEnDrop,
    });
    const r = comparar(guardados, [...porNumero].map(([n, v]) => aVisto(n, v)));
    const ahora = new Date().toISOString();

    // 2. Todo lo visto queda activo con su último precio y stock. La categoría y la fecha salen de la ficha: si esta vez no se pudo leer, se conserva lo que había.
    const guardadoPorDrop = new Map(antes.map((g) => [g.drop_producto_id, g]));
    const idPorDrop = new Map(antes.map((g) => [g.drop_producto_id, g.id]));
    await enTrozos(vistos, 500, async (trozo) => {
      const data = revisar(
        await supabase
          .from(PRODUCTOS)
          .upsert(
            trozo.map((v) => {
              const g = guardadoPorDrop.get(v.dropId);
              return {
                pais_id: pais.id,
                drop_producto_id: v.dropId,
                codigo: v.codigo,
                proveedor_nombre: v.proveedorNombre,
                nombre: v.nombre,
                foto_url: v.foto,
                precio: v.precio,
                precio_sugerido: v.precioSugerido,
                stock: v.stock,
                categoria: v.categoria ?? g?.categoria ?? null,
                creado_en_drop: v.creadoEnDrop ?? g?.creado_en_drop ?? null,
                es_nuestro: v.esNuestro,
                estado: "activo",
                ultima_vez: ahora,
              };
            }),
            { onConflict: "pais_id,drop_producto_id" },
          )
          .select("id, drop_producto_id"),
        "Guardar productos",
      ) as { id: string; drop_producto_id: string }[];
      for (const f of data) idPorDrop.set(f.drop_producto_id, f.id);
    });
    const desaparecidos = r.desaparecidos.map((d) => d.id);
    await enTrozos(desaparecidos, 300, async (trozo) => {
      revisar(await supabase.from(PRODUCTOS).update({ estado: "desaparecido" }).in("id", trozo), "Desaparecidos");
    });

    // 3. Historial: cada cambio.
    const historial: (Evento & { producto_id: string; busqueda_id: string; fecha: string })[] = [];
    const fila = (id: string, e: Evento) => ({ ...e, producto_id: id, busqueda_id: busqueda.id, fecha: ahora });
    for (const n of r.nuevos) {
      const id = idPorDrop.get(porNumero.get(n.dropiId)!.dropId);
      if (id) historial.push(fila(id, { evento: "primera_vez", precio: n.precio, stock: n.stock, precio_antes: null, stock_antes: null, detalle: null }));
    }
    const cambios = r.vistos.map((c) => ({ id: c.id, eventos: c.eventos.filter((e) => e.evento === "precio" || e.evento === "stock" || e.evento === "reaparecio") }));
    for (const c of cambios) for (const e of c.eventos) historial.push(fila(c.id, e));
    for (const d of r.desaparecidos) historial.push(fila(d.id, { ...d.evento, detalle: "Dejó de aparecer en el catálogo" }));
    await enTrozos(historial, 500, async (trozo) => {
      revisar(await supabase.from("drop_competencia_historial").insert(trozo), "Historial");
    });

    // 4. Huellas de las fotos nuevas y emparejamiento con los nuestros (por nombre o por foto).
    const huellas = await calcularHuellas(pais.id, PRODUCTOS, "pais_id");
    const actuales = await todas(supabase, pais.id);
    const nuestros = actuales.filter((p) => p.es_nuestro && p.estado === "activo");
    const indice = indexar(nuestros.map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: p.foto_huella, detalle: "" })));
    for (const p of actuales) {
      if (p.es_nuestro) continue;
      const v = yaVisto(p.nombre, p.foto_huella, indice);
      const igual = v ? { igual_a: v.id, igual_parecido: String(Math.round(v.parecido * 100)), igual_metodo: v.porFoto ? "foto" : "nombre" } : { igual_a: null, igual_parecido: null, igual_metodo: null };
      if (p.igual_a === igual.igual_a && (p.igual_metodo ?? null) === igual.igual_metodo) continue;
      Object.assign(p, igual);
      revisar(await supabase.from(PRODUCTOS).update({ ...igual, igual_parecido: igual.igual_parecido === null ? null : Number(igual.igual_parecido) }).eq("id", p.id), "Emparejar");
    }

    // 5. Alertas (no en la primera búsqueda).
    let alertas = 0;
    if (!primera) {
      const productos = new Map<string, ProductoAlerta>(
        actuales.map((p) => [p.id, { id: p.id, nombre: p.nombre, proveedorNombre: p.proveedor_nombre, esNuestro: p.es_nuestro, precio: p.precio === null ? null : Number(p.precio), stock: p.stock, igualA: p.igual_a }]),
      );
      const provAntes = new Set(antes.map((g) => g.proveedor_nombre));
      const provNuevos = new Map<string, { nombre: string; productos: number }>();
      for (const v of vistos) {
        if (provAntes.has(v.proveedorNombre) || v.esNuestro) continue;
        const x = provNuevos.get(v.proveedorNombre) ?? { nombre: v.proveedorNombre, productos: 0 };
        x.productos++;
        provNuevos.set(v.proveedorNombre, x);
      }
      const lista = armarAlertas({ productos, cambios, desaparecidos, proveedoresNuevos: [...provNuevos.values()], moneda: "CRC" });
      await enTrozos(lista, 500, async (trozo) => {
        revisar(
          await supabase.from("drop_competencia_alertas").insert(
            trozo.map((a) => ({ pais_id: pais.id, busqueda_id: busqueda.id, fecha: ahora, tipo: a.tipo, producto_id: a.productoId, nuestro_id: a.nuestroId, titulo: a.titulo, detalle: a.detalle })),
          ),
          "Alertas",
        );
      });
      alertas = lista.length;
    }

    const proveedores = new Set(vistos.map((v) => v.proveedorNombre)).size;
    const totalMs = l.duracionMs + (Date.now() - t0);
    const iguales = actuales.filter((p) => p.igual_a && p.estado === "activo").length;
    const detalle = `${vistos.length} productos de Drop leídos en ${Math.round(l.duracionMs / 1000)} s; guardado en ${Math.round((Date.now() - t0) / 1000)} s. ${nuestros.length} productos nuestros, ${iguales} de la competencia iguales a los nuestros, ${huellas} huellas nuevas.`;
    revisar(
      await supabase
        .from("drop_competencia_busquedas")
        .update({ estado: "lista", fin: new Date().toISOString(), productos: vistos.length, proveedores, nuevos: r.cuentas.nuevos, cambios: historial.length, alertas, duracion_ms: totalMs, detalle })
        .eq("id", busqueda.id),
      "Cerrar búsqueda",
    );
    return { pais: pais.nombre, productos: vistos.length, proveedores, nuestros: nuestros.length, iguales, nuevos: r.cuentas.nuevos, desaparecidos: desaparecidos.length, cambios: historial.length, alertas, duracionMs: totalMs, detalle };
  } catch (e) {
    await supabase.from("drop_competencia_busquedas").update({ estado: "fallida", fin: new Date().toISOString(), detalle: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", busqueda.id);
    throw e;
  }
}
