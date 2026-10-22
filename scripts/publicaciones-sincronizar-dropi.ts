// Gestión de IDs Dropi › Bodegas (pedido de Hernán, 22 oct 2026): guarda la lectura de «Mis productos» de ECOMFIVE en Dropi
// (scripts/scraping-proveedores-navegador.js › leerNuestrosProductos, migración 0131) y pone en cada publicación la ubicación,
// el precio, el tipo y el estado que dice Dropi: Dropi manda. Un producto nuevo en Dropi (activo, sin publicación y que no estaba
// en la lectura anterior) entra como publicación «Producto nuevo» con su bodega. Cada publicación que cambia o se crea queda en su
// actividad a nombre de «Sistema». Lo llama el receptor (scripts/scraping-proveedores.ts recibir) al llegar una lectura `tipo: "nuestros"`.
//
// A mano, con una lectura guardada (por defecto solo informa; --aplicar escribe):
//   npx tsx scripts/publicaciones-sincronizar-dropi.ts datos-privados/scraping/pa-nuestros-<fecha>.json [--aplicar]

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

export async function guardarNuestrosProductos(supabase: SupabaseClient, l: LecturaNuestros, aplicar = true) {
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
  const pendientes = await supabase.from("dropi_cambios_pendientes").select("publicacion_id").eq("pais_id", pais.id).in("estado", ["pendiente", "error"]);
  const conNombrePendiente = new Set(((pendientes.data ?? []) as { publicacion_id: string }[]).map((x) => x.publicacion_id));

  const usados = new Set<number>();
  const cambios: { id: string; nombre: string; dropiId: number; cambios: ReturnType<typeof cambiosDesdeDropi>["cambios"]; detalle: string[] }[] = [];
  const noEstan: string[] = [];
  for (const pub of pubs) {
    const ids = idsDeDropi(pub.dropi_id);
    ids.forEach((id) => usados.add(id));
    if (!ids.length) continue;
    const p = productoPrincipal(ids, productos);
    if (!p) {
      noEstan.push(`${pub.dropi_id} ${pub.nombre}`);
      continue;
    }
    const r = cambiosDesdeDropi(
      { ubicacion: pub.ubicacion, precioVenta: pub.precio_venta === null ? null : Number(pub.precio_venta), tipo: pub.tipo_publicacion, estadoPublicacion: pub.estado_publicacion, nombre: pub.nombre, nombrePendiente: conNombrePendiente.has(pub.id) },
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
    actualizadas: cambios.length,
    ubicacion: cuenta("ubicacion"),
    precio: cuenta("precio_venta"),
    tipo: cuenta("tipo_publicacion"),
    estado: cuenta("estado_publicacion"),
    nombre: cuenta("nombre"),
    idNoEstaEnDropi: noEstan,
    creadas: nuevos.map((p) => `${p.id} ${p.nombre} (${p.bodegas.length ? codigoBodega(bodegasEnOrden(p.bodegas)[0].id) : "sin bodega"})`),
    enDropiSinPublicacion: sinPublicacion,
    aplicado: aplicar,
  };
  if (!aplicar) return { ...resumen, detalle: cambios.map((c) => `${c.nombre} (${c.dropiId}): ${c.detalle.join("; ")}`) };

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
    creado_dropi: p.creado ? `${p.creado.slice(0, 19)}-05:00` : null,
    leido_en: leidoEn,
  }));
  await enTrozos(filas, 500, async (t) => void revisar(await supabase.from("dropi_productos_proveedor").upsert(t, { onConflict: "pais_id,dropi_producto_id" }), "Guardar productos"));
  // Lo que Dropi ya no lista (eliminado) sale de la tabla: se reemplaza en cada lectura.
  revisar(await supabase.from("dropi_productos_proveedor").delete().eq("pais_id", pais.id).lt("leido_en", leidoEn), "Quitar los que ya no están");

  for (const c of cambios) {
    revisar(await supabase.from("dropi_publicaciones").update({ ...c.cambios, actualizado_en: leidoEn }).eq("id", c.id), `Actualizar ${c.nombre}`);
  }
  await enTrozos(cambios, 200, async (t) =>
    void revisar(
      await supabase.from("historial_auditoria").insert(
        t.map((c) => ({ usuario_id: null, usuario_nombre: "Sistema", accion: "sincronizar_dropi_publicacion", entidad: "dropi_publicaciones", entidad_id: c.id, detalle: `ID ${c.dropiId} · ${c.detalle.join(" · ")}` })),
      ),
      "Actividad",
    ),
  );
  if (nuevos.length) {
    const creadas = revisar(
      await supabase
        .from("dropi_publicaciones")
        .insert(
          nuevos.map((p) => ({
            pais_id: pais.id,
            nombre: p.nombre,
            dropi_id: String(p.id),
            estado: "producto_nuevo",
            estado_publicacion: "activo",
            tipo_publicacion: p.privado ? "privado" : "publico",
            precio_venta: p.precio,
            ubicacion: ubicacionDeProducto(p),
            fecha_publicacion: (p.creado ?? hoy).slice(0, 10),
          })),
        )
        .select("id, dropi_id"),
      "Crear publicaciones nuevas",
    ) as { id: string; dropi_id: string }[];
    revisar(
      await supabase.from("historial_auditoria").insert(
        creadas.map((c) => {
          const p = productos.get(Number(c.dropi_id))!;
          const b = p.bodegas.length ? bodegasEnOrden(p.bodegas)[0] : null;
          return {
            usuario_id: null,
            usuario_nombre: "Sistema",
            accion: "crear_publicacion_dropi",
            entidad: "dropi_publicaciones",
            entidad_id: c.id,
            detalle: `${p.nombre} (ID ${p.id}) · producto nuevo en Dropi${b ? ` · bodega ${codigoBodega(b.id)} ${b.nombre}` : ""}`,
          };
        }),
      ),
      "Actividad de las nuevas",
    );
  }
  revisar(
    await supabase.from("dropi_productos_proveedor_lecturas").insert({
      pais_id: pais.id,
      leido_en: leidoEn,
      productos: resumen.productos,
      activos: resumen.activos,
      archivados: resumen.archivados,
      publicaciones_actualizadas: cambios.length,
      duracion_ms: l.duracionMs + (Date.now() - t0),
    }),
    "Lectura",
  );
  return resumen;
}

// Uso directo con un archivo guardado.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/publicaciones-sincronizar-dropi.ts")) {
  const [archivo, ...resto] = process.argv.slice(2);
  if (!archivo) {
    console.log("Uso: npx tsx scripts/publicaciones-sincronizar-dropi.ts <lectura.json> [--aplicar]");
  } else {
    process.loadEnvFile(".env.local");
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const l = JSON.parse(readFileSync(archivo, "utf8")) as LecturaNuestros;
    guardarNuestrosProductos(supabase, l, resto.includes("--aplicar")).then(
      (r) => console.dir(r, { depth: null, maxArrayLength: null }),
      (e) => {
        console.error(e);
        process.exitCode = 1;
      },
    );
  }
}
