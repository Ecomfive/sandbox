// Análisis de competencia con Drop y Effi (6 nov 2026, migraciones 0234 y 0239): guarda una lectura del catálogo de una de las dos (la mandan
// `scrapingCompetenciaDrop` y `scrapingCompetenciaEffi` de scripts/scraping-proveedores-navegador.js al receptor de scripts/scraping-proveedores.ts). Lo mismo que
// competencia-guardar.ts con Dropi, en sus propias tablas: anota cada cambio, empareja cada producto de la competencia con el nuestro igual (por nombre y por
// foto) y deja las alertas. La primera búsqueda no deja alertas: todo es nuevo. Una lectura que trae mucho menos que lo guardado no toca nada: sería un catálogo
// a medias. Effi además dice las ventas de cada artículo: lo que subieron entre lecturas queda en el historial (evento `ventas`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { certezaIgual } from "../src/lib/competencia/certeza";
import { armarAlertas, type ProductoAlerta } from "../src/lib/competencia/analisis";
import { catalogoDrop } from "../src/lib/competencia/drop";
import { catalogoEffi } from "../src/lib/competencia/effi";
import { comparar, type Evento, type ProductoGuardado, type ProductoVisto } from "../src/lib/scraping/comparar";
import { indexar, yaVisto } from "../src/lib/scraping/cruces";

export interface LecturaCatalogo {
  tipo: "competencia-drop" | "competencia-effi";
  pais: string;
  inicio: string;
  duracionMs: number;
  paginas: number[];
  /** Las tarjetas del catálogo como las manda la pestaña; se revisan con `catalogoDrop` o `catalogoEffi`. */
  productos: unknown[];
}

/** Lo que hace falta de un producto de cualquiera de los dos catálogos. */
interface VistoCatalogo {
  clave: string;
  nombre: string;
  proveedorNombre: string;
  esNuestro: boolean;
  precio: number | null;
  precioSugerido: number | null;
  stock: number | null;
  categoria: string | null;
  foto: string | null;
  ventas: number | null;
  /** Las columnas propias de la plataforma. */
  extras: Record<string, unknown>;
}

interface Catalogo {
  nombre: string;
  tablas: { productos: string; busquedas: string; historial: string; alertas: string };
  /** La columna que identifica a un producto entre lecturas. */
  columnaClave: string;
  /** Las columnas propias que se conservan si una lectura no las trae. */
  conservar: string[];
  leer: (filas: unknown) => VistoCatalogo[];
}

const CATALOGOS: Record<LecturaCatalogo["tipo"], Catalogo> = {
  "competencia-drop": {
    nombre: "Drop",
    tablas: { productos: "drop_competencia_productos", busquedas: "drop_competencia_busquedas", historial: "drop_competencia_historial", alertas: "drop_competencia_alertas" },
    columnaClave: "drop_producto_id",
    conservar: ["creado_en_drop"],
    leer: (filas) => catalogoDrop(filas).map((v) => ({ ...v, clave: v.dropId, ventas: null, extras: { codigo: v.codigo, creado_en_drop: v.creadoEnDrop } })),
  },
  "competencia-effi": {
    nombre: "Effi",
    tablas: { productos: "effi_competencia_productos", busquedas: "effi_competencia_busquedas", historial: "effi_competencia_historial", alertas: "effi_competencia_alertas" },
    columnaClave: "effi_clave",
    conservar: ["ventas"],
    leer: (filas) => catalogoEffi(filas).map((v) => ({ ...v, extras: { codigo: v.codigo, proveedor_effi_id: v.proveedorId, ventas: v.ventas } })),
  },
};

type FilaGuardada = Record<string, unknown> & {
  id: string;
  proveedor_nombre: string;
  nombre: string;
  foto_huella: string | null;
  precio: string | null;
  stock: number | null;
  categoria: string | null;
  es_nuestro: boolean;
  estado: "activo" | "desaparecido";
  igual_a: string | null;
  igual_parecido: string | null;
  igual_metodo: string | null;
};

function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

async function enTrozos<T>(filas: T[], n: number, f: (trozo: T[]) => Promise<void>) {
  for (let i = 0; i < filas.length; i += n) await f(filas.slice(i, i + n));
}

async function todas(supabase: SupabaseClient, c: Catalogo, paisId: string): Promise<FilaGuardada[]> {
  const columnas: string = `id, ${c.columnaClave}, proveedor_nombre, nombre, foto_huella, precio, stock, categoria, ${c.conservar.join(", ")}, es_nuestro, estado, igual_a, igual_parecido, igual_metodo`;
  const filas: FilaGuardada[] = [];
  for (let desde = 0; ; desde += 1000) {
    const data = revisar(
      await supabase
        .from(c.tablas.productos)
        .select<string, FilaGuardada>(columnas)
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

export async function guardarCatalogo(supabase: SupabaseClient, l: LecturaCatalogo, calcularHuellas: (filtro: string, tabla: string, columna: string) => Promise<number>) {
  const t0 = Date.now();
  const c = CATALOGOS[l.tipo];
  const { tablas } = c;
  const claveDe = (g: FilaGuardada) => String(g[c.columnaClave]);
  const pais = revisar(await supabase.from("paises").select("id, nombre").eq("codigo", "CR").maybeSingle(), "País");
  if (!pais) throw new Error("Costa Rica no está en Configuración › Países.");
  const vistos = c.leer(l.productos);
  if (!vistos.length) throw new Error(`La lectura no trae productos de ${c.nombre}.`);
  const antes = await todas(supabase, c, pais.id);
  const activos = antes.filter((g) => g.estado === "activo").length;
  if (vistos.length < activos / 2) throw new Error(`La lectura trae ${vistos.length} productos y había ${activos}: no se guarda, puede ser un catálogo a medias.`);

  const { count: previas } = await supabase.from(tablas.busquedas).select("id", { count: "exact", head: true }).eq("pais_id", pais.id).eq("estado", "lista");
  const primera = !previas;
  const busqueda = revisar(await supabase.from(tablas.busquedas).insert({ pais_id: pais.id, inicio: l.inicio, estado: "corriendo" }).select("id").single(), "Crear búsqueda") as { id: string };

  try {
    // 1. La comparación con lo guardado. `comparar` cuenta con IDs numéricos (los de Dropi): cada producto lleva uno solo para esto.
    const numeros = new Map<string, number>();
    const numero = (id: string) => numeros.get(id) ?? (numeros.set(id, numeros.size + 1), numeros.size);
    const porNumero = new Map<number, VistoCatalogo>(vistos.map((v) => [numero(v.clave), v]));
    const guardados: ProductoGuardado[] = antes.map((g) => ({
      id: g.id,
      dropiId: numero(claveDe(g)),
      nombre: g.nombre,
      privado: false,
      precio: g.precio === null ? null : Number(g.precio),
      stock: g.stock,
      estado: g.estado,
    }));
    const aVisto = (n: number, v: VistoCatalogo): ProductoVisto => ({
      dropiId: n,
      sku: null,
      nombre: v.nombre,
      foto: v.foto,
      privado: false,
      precio: v.precio,
      precioSugerido: v.precioSugerido,
      stock: v.stock,
      categoria: v.categoria,
      creadoEnDropi: null,
    });
    const r = comparar(guardados, [...porNumero].map(([n, v]) => aVisto(n, v)));
    const ahora = new Date().toISOString();

    // 2. Todo lo visto queda activo con su último precio y stock. Lo que una lectura no trae (en Drop la ficha pudo no leerse) conserva lo que había.
    const guardadoPorClave = new Map(antes.map((g) => [claveDe(g), g]));
    const idPorClave = new Map(antes.map((g) => [claveDe(g), g.id]));
    await enTrozos(vistos, 500, async (trozo) => {
      const data = revisar(
        await supabase
          .from(tablas.productos)
          .upsert(
            trozo.map((v) => {
              const g = guardadoPorClave.get(v.clave);
              return {
                ...v.extras,
                ...Object.fromEntries(c.conservar.map((k) => [k, v.extras[k] ?? g?.[k] ?? null])),
                pais_id: pais.id,
                [c.columnaClave]: v.clave,
                proveedor_nombre: v.proveedorNombre,
                nombre: v.nombre,
                foto_url: v.foto,
                precio: v.precio,
                precio_sugerido: v.precioSugerido,
                stock: v.stock,
                categoria: v.categoria ?? g?.categoria ?? null,
                es_nuestro: v.esNuestro,
                estado: "activo",
                ultima_vez: ahora,
              };
            }),
            { onConflict: `pais_id,${c.columnaClave}` },
          )
          .select<string, FilaGuardada>(`id, ${c.columnaClave}` as string),
        "Guardar productos",
      ) as FilaGuardada[];
      for (const f of data) idPorClave.set(claveDe(f), f.id);
    });
    // Drop: el catálogo muestra el ID público de nuestros productos aunque «Mis productos» a veces no lo dé (7 nov 2026). Gestión de IDs Drop lo toma de aquí si le falta.
    if (l.tipo === "competencia-drop") {
      for (const v of vistos) {
        const codigo = v.extras.codigo;
        if (!v.esNuestro || typeof codigo !== "string") continue;
        revisar(await supabase.from("drop_publicaciones").update({ codigo }).eq("pais_id", pais.id).eq("drop_id", v.clave).is("codigo", null), "ID de Drop de nuestros productos");
      }
    }
    const desaparecidos = r.desaparecidos.map((d) => d.id);
    await enTrozos(desaparecidos, 300, async (trozo) => {
      revisar(await supabase.from(tablas.productos).update({ estado: "desaparecido" }).in("id", trozo), "Desaparecidos");
    });

    // 3. Historial: cada cambio.
    const historial: (Evento & { producto_id: string; busqueda_id: string; fecha: string })[] = [];
    const fila = (id: string, e: Evento) => ({ ...e, producto_id: id, busqueda_id: busqueda.id, fecha: ahora });
    for (const n of r.nuevos) {
      const id = idPorClave.get(porNumero.get(n.dropiId)!.clave);
      if (id) historial.push(fila(id, { evento: "primera_vez", precio: n.precio, stock: n.stock, precio_antes: null, stock_antes: null, detalle: null }));
    }
    const cambios = r.vistos.map((c) => ({ id: c.id, eventos: c.eventos.filter((e) => e.evento === "precio" || e.evento === "stock" || e.evento === "reaparecio") }));
    for (const c of cambios) for (const e of c.eventos) historial.push(fila(c.id, e));
    for (const d of r.desaparecidos) historial.push(fila(d.id, { ...d.evento, detalle: "Dejó de aparecer en el catálogo" }));
    // Las ventas que muestra la plataforma: lo que subieron entre una lectura y otra es lo vendido de verdad.
    for (const v of vistos) {
      const g = guardadoPorClave.get(v.clave);
      const previas = g && typeof g.ventas === "number" ? g.ventas : null;
      if (previas !== null && v.ventas !== null && v.ventas > previas) historial.push(fila(g!.id, { evento: "ventas", precio: null, stock: v.ventas, precio_antes: null, stock_antes: previas, detalle: null }));
    }
    await enTrozos(historial, 500, async (trozo) => {
      revisar(await supabase.from(tablas.historial).insert(trozo), "Historial");
    });

    // 4. Huellas de las fotos nuevas y emparejamiento con los nuestros (por nombre o por foto).
    const huellas = await calcularHuellas(pais.id, tablas.productos, "pais_id");
    const actuales = await todas(supabase, c, pais.id);
    const nuestros = actuales.filter((p) => p.es_nuestro && p.estado === "activo");
    const indice = indexar(nuestros.map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: p.foto_huella, detalle: "" })));
    for (const p of actuales) {
      if (p.es_nuestro) continue;
      const v = yaVisto(p.nombre, p.foto_huella, indice);
      const igual = v ? { igual_a: v.id, igual_parecido: String(Math.round(v.parecido * 100)), igual_metodo: v.porFoto ? "foto" : "nombre" } : { igual_a: null, igual_parecido: null, igual_metodo: null };
      if (p.igual_a === igual.igual_a && (p.igual_metodo ?? null) === igual.igual_metodo) continue;
      Object.assign(p, igual);
      revisar(await supabase.from(tablas.productos).update({ ...igual, igual_parecido: igual.igual_parecido === null ? null : Number(igual.igual_parecido) }).eq("id", p.id), "Emparejar");
    }

    // 5. Alertas (no en la primera búsqueda).
    let alertas = 0;
    if (!primera) {
      // Las alertas que comparan con lo nuestro (bajó el precio, vende más barato, bajó el stock) solo si es el mismo producto (`certezaIgual`, 7 nov 2026).
      const porIdActual = new Map(actuales.map((p) => [p.id, p]));
      // Lo que ya revisó la IA manda (migración 0246; sin ella, nada).
      const { data: verificaciones } = await supabase.from("competencia_verificaciones").select("producto_id, nuestro_id, veredicto").eq("plataforma", (l.tipo === "competencia-drop" ? "drop" : "effi"));
      const veredicto = new Map((verificaciones ?? []).map((v) => [`${v.producto_id}|${v.nuestro_id}`, v.veredicto as string]));
      const exacto = (p: { id: string; nombre: string; foto_huella: string | null; igual_a: string | null; igual_metodo: string | null }) => {
        const n = p.igual_a ? porIdActual.get(p.igual_a) : undefined;
        const v = p.igual_a ? veredicto.get(`${p.id}|${p.igual_a}`) : undefined;
        if (v) return v === "mismo" ? p.igual_a : null;
        return n && certezaIgual({ nombre: n.nombre, huella: n.foto_huella }, { nombre: p.nombre, huella: p.foto_huella }, p.igual_metodo) === "exacto" ? p.igual_a : null;
      };
      const productos = new Map<string, ProductoAlerta>(
        actuales.map((p) => [p.id, { id: p.id, nombre: p.nombre, proveedorNombre: p.proveedor_nombre, esNuestro: p.es_nuestro, precio: p.precio === null ? null : Number(p.precio), stock: p.stock, igualA: exacto(p) }]),
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
          await supabase.from(tablas.alertas).insert(
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
    const detalle = `${vistos.length} productos de ${c.nombre} leídos en ${Math.round(l.duracionMs / 1000)} s; guardado en ${Math.round((Date.now() - t0) / 1000)} s. ${nuestros.length} productos nuestros, ${iguales} de la competencia iguales a los nuestros, ${huellas} huellas nuevas.`;
    revisar(
      await supabase
        .from(tablas.busquedas)
        .update({ estado: "lista", fin: new Date().toISOString(), productos: vistos.length, proveedores, nuevos: r.cuentas.nuevos, cambios: historial.length, alertas, duracion_ms: totalMs, detalle })
        .eq("id", busqueda.id),
      "Cerrar búsqueda",
    );
    return { pais: pais.nombre, productos: vistos.length, proveedores, nuestros: nuestros.length, iguales, nuevos: r.cuentas.nuevos, desaparecidos: desaparecidos.length, cambios: historial.length, alertas, duracionMs: totalMs, detalle };
  } catch (e) {
    await supabase.from(tablas.busquedas).update({ estado: "fallida", fin: new Date().toISOString(), detalle: String(e instanceof Error ? e.message : e).slice(0, 500) }).eq("id", busqueda.id);
    throw e;
  }
}
