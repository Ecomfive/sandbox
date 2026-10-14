// Análisis de competencia (Investigación, 14 oct 2026): guarda una lectura de todo el catálogo de Dropi de un país (la manda
// `scrapingCompetencia` de scripts/scraping-proveedores-navegador.js al receptor de scripts/scraping-proveedores.ts).
// Anota cada cambio (precio, stock, aparece, desaparece), empareja cada producto de la competencia con el nuestro igual
// (ECOMFIVE, por nombre y por foto) y deja las alertas en `competencia_alertas`. La primera búsqueda de un país no deja
// alertas: todo es nuevo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarAlertas, normalizarCompetencia, type ProductoAlerta, type VistoCompetencia } from "../src/lib/competencia/analisis";
import { comparar, type Evento, type ProductoGuardado } from "../src/lib/scraping/comparar";
import { indexar, yaVisto } from "../src/lib/scraping/cruces";

interface LecturaCompetencia {
  pais: string;
  inicio: string;
  duracionMs: number;
  paginas: number[];
  productos: unknown[];
}

interface FilaGuardada {
  id: string;
  dropi_producto_id: number;
  proveedor_dropi_id: number;
  proveedor_nombre: string;
  nombre: string;
  foto_url: string | null;
  foto_huella: string | null;
  precio: string | null;
  stock: number | null;
  es_nuestro: boolean;
  estado: "activo" | "desaparecido";
  igual_a: string | null;
  igual_parecido: string | null;
  igual_metodo: string | null;
  pais_id: string;
  sku: string | null;
}

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
        .from("competencia_productos")
        .select("id, dropi_producto_id, proveedor_dropi_id, proveedor_nombre, nombre, foto_url, foto_huella, precio, stock, es_nuestro, estado, igual_a, igual_parecido, igual_metodo, pais_id, sku")
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

export async function guardarCompetencia(
  supabase: SupabaseClient,
  l: LecturaCompetencia,
  calcularHuellas: (filtro: string, tabla: string, columna: string) => Promise<number>,
) {
  const t0 = Date.now();
  const codigo = /^[a-z]{2}$/.test(l.pais) ? l.pais.toUpperCase() : "PA";
  const pais = revisar(await supabase.from("paises").select("id, nombre").eq("codigo", codigo).maybeSingle(), "País");
  if (!pais) throw new Error(`El país ${codigo} no está en Configuración › Países.`);
  const { count: previas } = await supabase.from("competencia_busquedas").select("id", { count: "exact", head: true }).eq("pais_id", pais.id).eq("estado", "lista");
  const primera = !previas;
  const busqueda = revisar(await supabase.from("competencia_busquedas").insert({ pais_id: pais.id, inicio: l.inicio, estado: "corriendo" }).select("id").single(), "Crear búsqueda") as { id: string };

  try {
    // 1. Lo guardado, lo leído y la comparación (precio, stock, nuevos, desaparecidos).
    const antes = await todas(supabase, pais.id);
    const vistos = l.productos.map(normalizarCompetencia).filter((v): v is VistoCompetencia => v !== null);
    const unicos = new Map(vistos.map((v) => [v.dropiId, v]));
    const guardados: ProductoGuardado[] = antes.map((g) => ({
      id: g.id,
      dropiId: Number(g.dropi_producto_id),
      nombre: g.nombre,
      privado: false,
      precio: g.precio === null ? null : Number(g.precio),
      stock: g.stock,
      estado: g.estado,
    }));
    const r = comparar(guardados, [...unicos.values()].map((v) => ({ ...v, privado: false })));
    const ahora = new Date().toISOString();

    // 2. Todo lo visto queda activo con su último precio y stock.
    const idPorDropi = new Map(antes.map((g) => [Number(g.dropi_producto_id), g.id]));
    await enTrozos([...unicos.values()], 500, async (trozo) => {
      const data = revisar(
        await supabase
          .from("competencia_productos")
          .upsert(
            trozo.map((v) => ({
              pais_id: pais.id,
              dropi_producto_id: v.dropiId,
              proveedor_dropi_id: v.proveedorId,
              proveedor_nombre: v.proveedorNombre,
              sku: v.sku,
              nombre: v.nombre,
              foto_url: v.foto,
              precio: v.precio,
              precio_sugerido: v.precioSugerido,
              stock: v.stock,
              categoria: v.categoria,
              creado_en_dropi: v.creadoEnDropi,
              es_nuestro: v.esNuestro,
              estado: "activo",
              ultima_vez: ahora,
            })),
            { onConflict: "pais_id,dropi_producto_id" },
          )
          .select("id, dropi_producto_id"),
        "Guardar productos",
      ) as { id: string; dropi_producto_id: number }[];
      for (const f of data) idPorDropi.set(Number(f.dropi_producto_id), f.id);
    });
    const desaparecidos = r.desaparecidos.map((d) => d.id);
    await enTrozos(desaparecidos, 300, async (trozo) => {
      revisar(await supabase.from("competencia_productos").update({ estado: "desaparecido" }).in("id", trozo), "Desaparecidos");
    });

    // 3. Historial: cada cambio (sin los de «privatizado»/«publicado», que en la competencia no aplican).
    const historial: (Evento & { producto_id: string; busqueda_id: string; fecha: string })[] = [];
    const fila = (id: string, e: Evento) => ({ ...e, producto_id: id, busqueda_id: busqueda.id, fecha: ahora });
    for (const n of r.nuevos) {
      const id = idPorDropi.get(n.dropiId);
      if (!id) continue;
      historial.push(fila(id, { evento: "primera_vez", precio: n.precio, stock: n.stock, precio_antes: null, stock_antes: null, detalle: null }));
    }
    const cambios = r.vistos.map((c) => ({ id: c.id, eventos: c.eventos.filter((e) => e.evento === "precio" || e.evento === "stock" || e.evento === "reaparecio") }));
    for (const c of cambios) for (const e of c.eventos) historial.push(fila(c.id, e));
    for (const d of r.desaparecidos) historial.push(fila(d.id, { ...d.evento, detalle: "Dejó de aparecer en el catálogo" }));
    await enTrozos(historial, 500, async (trozo) => {
      revisar(await supabase.from("competencia_historial").insert(trozo), "Historial");
    });

    // 4. Huellas de las fotos nuevas y emparejamiento con los nuestros (por nombre o por foto).
    const huellas = await calcularHuellas(pais.id, "competencia_productos", "pais_id");
    const actuales = await todas(supabase, pais.id);
    const nuestros = actuales.filter((p) => p.es_nuestro && p.estado === "activo");
    const indice = indexar(nuestros.map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: p.foto_huella, detalle: "" })));
    const cambiosIgual: FilaGuardada[] = [];
    for (const p of actuales) {
      if (p.es_nuestro) continue;
      const v = yaVisto(p.nombre, p.foto_huella, indice);
      const igual = v ? { igual_a: v.id, igual_parecido: String(Math.round(v.parecido * 100)), igual_metodo: v.porFoto ? "foto" : "nombre" } : { igual_a: null, igual_parecido: null, igual_metodo: null };
      if (p.igual_a !== igual.igual_a || (p.igual_metodo ?? null) !== igual.igual_metodo) {
        Object.assign(p, igual);
        cambiosIgual.push(p);
      }
    }
    await enTrozos(cambiosIgual, 500, async (trozo) => {
      revisar(
        await supabase.from("competencia_productos").upsert(
          trozo.map((p) => ({
            id: p.id,
            pais_id: p.pais_id,
            dropi_producto_id: p.dropi_producto_id,
            proveedor_dropi_id: p.proveedor_dropi_id,
            proveedor_nombre: p.proveedor_nombre,
            nombre: p.nombre,
            igual_a: p.igual_a,
            igual_parecido: p.igual_parecido === null ? null : Number(p.igual_parecido),
            igual_metodo: p.igual_metodo,
          })),
          { onConflict: "id" },
        ),
        "Emparejar",
      );
    });

    // 5. Alertas (no en la primera búsqueda del país).
    let alertas = 0;
    if (!primera) {
      const productos = new Map<string, ProductoAlerta>(
        actuales.map((p) => [p.id, { id: p.id, nombre: p.nombre, proveedorNombre: p.proveedor_nombre, esNuestro: p.es_nuestro, precio: p.precio === null ? null : Number(p.precio), stock: p.stock, igualA: p.igual_a }]),
      );
      const provAntes = new Set(antes.map((g) => Number(g.proveedor_dropi_id)));
      const provNuevos = new Map<number, { nombre: string; productos: number }>();
      for (const v of unicos.values()) {
        if (provAntes.has(v.proveedorId)) continue;
        const x = provNuevos.get(v.proveedorId) ?? { nombre: v.proveedorNombre, productos: 0 };
        x.productos++;
        provNuevos.set(v.proveedorId, x);
      }
      const lista = armarAlertas({
        productos,
        cambios,
        desaparecidos,
        proveedoresNuevos: [...provNuevos.values()],
      });
      await enTrozos(lista, 500, async (trozo) => {
        revisar(
          await supabase.from("competencia_alertas").insert(
            trozo.map((a) => ({ pais_id: pais.id, busqueda_id: busqueda.id, fecha: ahora, tipo: a.tipo, producto_id: a.productoId, nuestro_id: a.nuestroId, titulo: a.titulo, detalle: a.detalle })),
          ),
          "Alertas",
        );
      });
      alertas = lista.length;
    }

    const proveedores = new Set([...unicos.values()].map((v) => v.proveedorId)).size;
    const totalMs = l.duracionMs + (Date.now() - t0);
    const iguales = actuales.filter((p) => p.igual_a && p.estado === "activo").length;
    const detalle = `${l.paginas.length} páginas de Dropi en ${Math.round(l.duracionMs / 1000)} s; guardado en ${Math.round((Date.now() - t0) / 1000)} s. ${nuestros.length} productos nuestros, ${iguales} de la competencia iguales a uno nuestro, ${huellas} huellas de foto nuevas.${primera ? " Primera búsqueda: sin alertas." : ""}`;
    revisar(
      await supabase
        .from("competencia_busquedas")
        .update({ estado: "lista", fin: new Date().toISOString(), productos: unicos.size, proveedores, nuevos: r.cuentas.nuevos, cambios: historial.length, alertas, duracion_ms: totalMs, detalle })
        .eq("id", busqueda.id),
      "Cerrar búsqueda",
    );
    return { pais: pais.nombre, productos: unicos.size, proveedores, nuestros: nuestros.length, iguales, nuevos: r.cuentas.nuevos, desaparecidos: desaparecidos.length, cambios: historial.length, alertas, duracionMs: totalMs, detalle };
  } catch (e) {
    await supabase.from("competencia_busquedas").update({ estado: "fallida", fin: new Date().toISOString(), detalle: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", busqueda.id);
    throw e;
  }
}
