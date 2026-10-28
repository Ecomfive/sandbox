// Gestión de IDs Dropi › Bodegas (pedido de Hernán, 22 oct 2026): guarda la lectura de «Mis productos» de ECOMFIVE en Dropi
// (scripts/scraping-proveedores-navegador.js › leerNuestrosProductos, migración 0131): el stock y las bodegas de cada producto, en
// `dropi_productos_proveedor` (de ahí salen «Sin stock», los días de inventario y Reponer). **No toca las publicaciones** (24 oct 2026,
// pedido de Hernán: el sistema manda; los productos se crean en el sistema y se mandan a Dropi). Lo que en Dropi no coincide con una
// publicación (precio, nombre, bodega, tipo, estado, productos sin publicación o que ya no están) solo se informa en el resumen.
// Lo llama el receptor (scripts/scraping-proveedores.ts recibir) al llegar una lectura `tipo: "nuestros"` y la tarea diaria (dropi-diario.ts).
//
// A mano, con una lectura guardada (por defecto solo informa; --aplicar escribe):
//   npx tsx scripts/publicaciones-sincronizar-dropi.ts datos-privados/scraping/pa-nuestros-<fecha>.json [--aplicar] [--todas-las-fotos]
//
// Además copia las fotos de cada publicación al sistema (migración 0153, `copiarFotosDropi`): hasta 300 por lectura (las demás, en la
// siguiente); `--todas-las-fotos` quita el tope.

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { copiarFotosDropi } from "./publicaciones-copiar-fotos";
import { revisarSinStock } from "../src/lib/compras/sin-stock-datos";
import {
  bodegasEnOrden,
  cambiosDesdeDropi,
  codigoBodega,
  idsDeDropi,
  normalizarProductoProveedor,
  productoPrincipal,
  productosNuevos,
  ubicacionDeProducto,
  type ProductoProveedor,
} from "../src/lib/publicaciones/sincronizar-dropi";

export interface LecturaNuestros {
  tipo: "nuestros";
  pais: string;
  inicio: string;
  duracionMs: number;
  /** Lo que devuelve Dropi de cada producto, más `archivado` (de la pestaña Archivados). */
  productos: (Record<string, unknown> & { archivado?: boolean })[];
}

function revisar<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
}

async function enTrozos<T>(filas: T[], n: number, f: (trozo: T[]) => Promise<void>) {
  for (let i = 0; i < filas.length; i += n) await f(filas.slice(i, i + n));
}

export async function guardarNuestrosProductos(supabase: SupabaseClient, l: LecturaNuestros, aplicar = true, maxFotos = 300) {
  const t0 = Date.now();
  const codigo = /^[a-z]{2}$/.test(l.pais) ? l.pais.toUpperCase() : "PA";
  const pais = revisar(await supabase.from("paises").select("id, nombre").eq("codigo", codigo).maybeSingle(), "País") as { id: string; nombre: string } | null;
  if (!pais) throw new Error(`El país ${codigo} no está en Configuración › Países.`);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const leidoEn = new Date().toISOString();

  // Un producto puede venir en las dos pestañas por un instante: manda la de activos.
  const productos = new Map<number, ProductoProveedor>();
  for (const o of l.productos) {
    const p = normalizarProductoProveedor(o, !!o.archivado);
    if (p && !(productos.get(p.id) && p.archivado)) productos.set(p.id, p);
  }
  if (!productos.size) throw new Error("La lectura no trae productos.");

  const pubs = revisar(
    await supabase.from("dropi_publicaciones").select("id, nombre, dropi_id, ubicacion, precio_venta, tipo_publicacion, estado_publicacion").eq("pais_id", pais.id),
    "Publicaciones",
  ) as { id: string; nombre: string; dropi_id: string | null; ubicacion: string | null; precio_venta: number | null; tipo_publicacion: string | null; estado_publicacion: string | null }[];

  // Lo que había en la lectura anterior: un producto que no estaba ahí es nuevo (en la primera lectura del país, null).
  const previos = revisar(await supabase.from("dropi_productos_proveedor").select("dropi_producto_id").eq("pais_id", pais.id), "Lectura anterior") as { dropi_producto_id: number }[];
  const anteriores = previos.length ? new Set(previos.map((p) => Number(p.dropi_producto_id))) : null;

  // Las publicaciones con un nombre nuestro esperando «Aplicar en Dropi» (migración 0137): ese nombre no se pisa.
  let pendientes = await supabase.from("dropi_cambios_pendientes").select("publicacion_id, nombre, precio").eq("pais_id", pais.id).in("estado", ["pendiente", "error"]);
  if (pendientes.error) pendientes = (await supabase.from("dropi_cambios_pendientes").select("publicacion_id, nombre").eq("pais_id", pais.id).in("estado", ["pendiente", "error"])) as typeof pendientes;
  const filasPendientes = (pendientes.data ?? []) as { publicacion_id: string; nombre: string | null; precio?: number | null }[];
  const conNombrePendiente = new Set(filasPendientes.filter((x) => x.nombre).map((x) => x.publicacion_id));
  const conPrecioPendiente = new Set(filasPendientes.filter((x) => x.precio != null).map((x) => x.publicacion_id));

  const usados = new Set<number>();
  const cambios: { id: string; nombre: string; dropiId: number; cambios: ReturnType<typeof cambiosDesdeDropi>["cambios"]; detalle: string[] }[] = [];
  const noEstan: string[] = [];
  // Publicaciones cuyo producto ya no está en Dropi (se eliminó): se archivan solas, sin borrar nada (22 oct 2026).
  const desaparecidas: { id: string; nombre: string; dropiId: string }[] = [];
  for (const pub of pubs) {
    const ids = idsDeDropi(pub.dropi_id);
    ids.forEach((id) => usados.add(id));
    if (!ids.length) continue;
    const p = productoPrincipal(ids, productos);
    if (!p) {
      noEstan.push(`${pub.dropi_id} ${pub.nombre}`);
      // Solo si el ID sí estaba en la lectura anterior: así una publicación con el ID mal escrito desde siempre no se archiva sola.
      if (pub.estado_publicacion !== "archivado" && anteriores && ids.some((id) => anteriores.has(id))) desaparecidas.push({ id: pub.id, nombre: pub.nombre, dropiId: String(pub.dropi_id) });
      continue;
    }
    const r = cambiosDesdeDropi(
      { ubicacion: pub.ubicacion, precioVenta: pub.precio_venta === null ? null : Number(pub.precio_venta), tipo: pub.tipo_publicacion, estadoPublicacion: pub.estado_publicacion, nombre: pub.nombre, nombrePendiente: conNombrePendiente.has(pub.id), precioPendiente: conPrecioPendiente.has(pub.id) },
      p,
      hoy,
    );
    if (r.detalle.length) cambios.push({ id: pub.id, nombre: pub.nombre, dropiId: p.id, ...r });
  }
  // Producto nuevo en Dropi → su publicación, con su bodega, precio y tipo (como «Producto nuevo», para vincularlo a Producto).
  const nuevos = productosNuevos(productos.values(), usados, anteriores);
  const sinPublicacion = [...productos.values()].filter((p) => !p.archivado && !usados.has(p.id) && !nuevos.includes(p)).map((p) => `${p.id} ${p.nombre}`);
  const cuenta = (campo: string) => cambios.filter((c) => campo in c.cambios).length;
  const resumen = {
    pais: pais.nombre,
    productos: productos.size,
    activos: [...productos.values()].filter((p) => !p.archivado).length,
    archivados: [...productos.values()].filter((p) => p.archivado).length,
    publicaciones: pubs.length,
    // Solo se informan (no se escriben): lo que Dropi tiene distinto, lo que ya no está y lo que está en Dropi sin publicación.
    distintasEnDropi: cambios.length,
    ubicacion: cuenta("ubicacion"),
    precio: cuenta("precio_venta"),
    tipo: cuenta("tipo_publicacion"),
    estado: cuenta("estado_publicacion"),
    nombre: cuenta("nombre"),
    idNoEstaEnDropi: noEstan,
    yaNoEstanEnDropi: desaparecidas.map((d) => `${d.dropiId} ${d.nombre}`),
    nuevosEnDropiSinPublicacion: nuevos.map((p) => `${p.id} ${p.nombre} (${p.bodegas.length ? codigoBodega(bodegasEnOrden(p.bodegas)[0].id) : "sin bodega"})`),
    enDropiSinPublicacion: sinPublicacion,
    aplicado: aplicar,
  };
  const detalle = cambios.map((c) => `${c.nombre} (${c.dropiId}): ${c.detalle.join("; ")}`);
  if (!aplicar) return { ...resumen, detalle };

  const filas = [...productos.values()].map((p) => ({
    pais_id: pais.id,
    dropi_producto_id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    archivado: p.archivado,
    privado: p.privado,
    precio: p.precio,
    precio_sugerido: p.precioSugerido,
    stock: p.stock,
    stock_privado: p.stockPrivado,
    bodegas: p.bodegas,
    categorias: p.categorias,
    fotos: p.fotos,
    creado_dropi: p.creado ? `${p.creado.slice(0, 19)}${codigo === "CR" || codigo === "MX" ? "-06:00" : "-05:00"}` : null,
    leido_en: leidoEn,
  }));
  await enTrozos(filas, 500, async (t) => void revisar(await supabase.from("dropi_productos_proveedor").upsert(t, { onConflict: "pais_id,dropi_producto_id" }), "Guardar productos"));
  // Lo que Dropi ya no lista (eliminado) sale de la tabla: se reemplaza en cada lectura.
  revisar(await supabase.from("dropi_productos_proveedor").delete().eq("pais_id", pais.id).lt("leido_en", leidoEn), "Quitar los que ya no están");

  // **Primera carga de un país** (28 oct 2026, Costa Rica, pedido de Hernán): si el país todavía no tiene ninguna publicación, se crea una
  // por cada producto de Dropi (activo → «Producto nuevo», archivado → archivado), con su bodega, precio y tipo, para vincularla después
  // a Producto. Solo esa vez: desde el 24 oct el sistema manda y la lectura ya no crea publicaciones (lo nuevo solo se informa).
  let creadasPrimeraCarga: string[] = [];
  if (!pubs.length) {
    const lista = [...productos.values()];
    const creadas: { id: string; dropi_id: string }[] = [];
    await enTrozos(lista, 200, async (t) => {
      creadas.push(
        ...(revisar(
          await supabase
            .from("dropi_publicaciones")
            .insert(
              t.map((p) => ({
                pais_id: pais.id,
                nombre: p.nombre,
                dropi_id: String(p.id),
                estado: p.archivado ? "archivado" : "producto_nuevo",
                estado_publicacion: p.archivado ? "archivado" : "activo",
                tipo_publicacion: p.privado ? "privado" : "publico",
                precio_venta: p.precio,
                ubicacion: ubicacionDeProducto(p),
                fecha_publicacion: (p.creado ?? hoy).slice(0, 10),
              })),
            )
            .select("id, dropi_id"),
          "Crear las publicaciones de la primera carga",
        ) as { id: string; dropi_id: string }[]),
      );
    });
    await enTrozos(creadas, 200, async (t) =>
      void revisar(
        await supabase.from("historial_auditoria").insert(
          t.map((c) => {
            const p = productos.get(Number(c.dropi_id))!;
            const b = p.bodegas.length ? bodegasEnOrden(p.bodegas)[0] : null;
            return {
              usuario_id: null,
              usuario_nombre: "Sistema",
              accion: "crear_publicacion_dropi",
              entidad: "dropi_publicaciones",
              entidad_id: c.id,
              detalle: `${p.nombre} (ID ${p.id}) · primera carga de ${pais.nombre}${p.archivado ? " · archivado en Dropi" : ""}${b ? ` · bodega ${codigoBodega(b.id)} ${b.nombre}` : ""}`,
            };
          }),
        ),
        "Actividad de la primera carga",
      ),
    );
    creadasPrimeraCarga = creadas.map((c) => c.dropi_id);
    // Las publicaciones recién creadas también copian sus fotos en esta misma lectura.
    pubs.push(
      ...(revisar(
        await supabase.from("dropi_publicaciones").select("id, nombre, dropi_id, ubicacion, precio_venta, tipo_publicacion, estado_publicacion").eq("pais_id", pais.id),
        "Publicaciones creadas",
      ) as typeof pubs),
    );
  }

  // Las fotos de cada publicación al sistema (migración 0153): las que falten se copian del CDN de Dropi al bucket. Un problema aquí
  // no tumba la lectura: queda en el resumen y se reintenta mañana.
  let fotos: Awaited<ReturnType<typeof copiarFotosDropi>> | { error: string };
  try {
    fotos = await copiarFotosDropi(supabase, { id: pais.id, codigo }, l.productos, productos, pubs, maxFotos);
  } catch (e) {
    fotos = { error: String((e as Error)?.message ?? e) };
  }

  // Desde el 24 oct 2026 (pedido de Hernán) el sistema manda: los productos se crean en el sistema y se mandan a Dropi, así que esta
  // lectura ya no crea, cambia ni archiva publicaciones (antes «Dropi manda»). Lo que no coincide solo se informa en el resumen.
  revisar(
    await supabase.from("dropi_productos_proveedor_lecturas").insert({
      pais_id: pais.id,
      leido_en: leidoEn,
      productos: resumen.productos,
      activos: resumen.activos,
      archivados: resumen.archivados,
      publicaciones_actualizadas: 0,
      duracion_ms: l.duracionMs + (Date.now() - t0),
    }),
    "Lectura",
  );
  // Compras › Sin stock (migración 0167): con el stock nuevo se abren las alertas de lo que se quedó sin stock y se cierran las de lo que
  // volvió a tener. Un problema aquí no tumba la lectura: queda en el resumen.
  let sinStock: Awaited<ReturnType<typeof revisarSinStock>>;
  try {
    sinStock = await revisarSinStock(supabase, { id: pais.id, codigo });
  } catch (e) {
    sinStock = { error: String((e as Error)?.message ?? e) };
  }
  return { ...resumen, creadasPrimeraCarga, fotos, sinStock, detalle };
}

// Uso directo con un archivo guardado.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/publicaciones-sincronizar-dropi.ts")) {
  const [archivo, ...resto] = process.argv.slice(2);
  if (!archivo) {
    console.log("Uso: npx tsx scripts/publicaciones-sincronizar-dropi.ts <lectura.json> [--aplicar] [--todas-las-fotos]");
  } else {
    process.loadEnvFile(".env.local");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const l = JSON.parse(readFileSync(archivo, "utf8")) as LecturaNuestros;
    guardarNuestrosProductos(supabase, l, resto.includes("--aplicar"), resto.includes("--todas-las-fotos") ? Infinity : 300).then(
      (r) => console.dir(r, { depth: null, maxArrayLength: null }),
      (e) => {
        console.error(e);
        process.exitCode = 1;
      },
    );
  }
}
