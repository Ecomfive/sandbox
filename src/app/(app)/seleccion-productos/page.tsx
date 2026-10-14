import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { cargarRepetidos } from "@/lib/scraping/referencias";
import { createServiceClient } from "@/lib/supabase/server";
import type { FilaSeleccion } from "./def-seleccion";
import { TablaSeleccion } from "./tabla-seleccion";

export const metadata = { title: "Selección de productos" };

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Testing Lab › Selección: el tablero donde caen los candidatos de las fuentes (o los que se crean a mano) y se decide
 * cuáles se testean. Va por el país de la barra de arriba, como Test productos y Filtro de productos.
 */
export default async function SeleccionProductosPage() {
  const usuario = await requireModulo("seleccion-productos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [filasR, perfilesR, categoriasR, ofertasR, repetidosEn] = await Promise.all([
    supabase
      .from("wms_seleccion_productos")
      .select("id, numero, nombre, estado, fuente, codigo_fuente, fecha_captacion, foto_url, url_pagina, url_ad_library, costo_proveedor, precio_venta, categoria, responsable_id, notas, creado_en, motivo_descarte, precio_original, moneda_original, perfiles!wms_seleccion_productos_responsable_id_fkey(nombre, email)")
      .eq("pais_id", pais.id)
      .order("numero", { ascending: false })
      .limit(1000),
    supabase.from("perfiles").select("id, nombre, email").eq("activo", true).order("nombre"),
    // Las categorías que ya usan Test productos y la propia Selección, para sugerirlas al escribir.
    supabase.from("wms_productos_test").select("categoria").not("categoria", "is", null).limit(1000),
    supabase.from("wms_seleccion_ofertas").select("seleccion_id"),
    cargarRepetidos(supabase),
  ]);
  const ofertasDe = new Map<string, number>();
  for (const o of ofertasR.data ?? []) ofertasDe.set(o.seleccion_id, (ofertasDe.get(o.seleccion_id) ?? 0) + 1);

  if (filasR.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Selección de productos" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudo cargar la selección. Falta correr en Supabase las migraciones 0104 y 0107.
        </p>
      </Pagina>
    );
  }

  const filas: FilaSeleccion[] = (filasR.data ?? []).map((f) => {
    const r = (Array.isArray(f.perfiles) ? f.perfiles[0] : f.perfiles) as { nombre: string | null; email: string } | null;
    return {
      id: f.id,
      numero: f.numero,
      nombre: f.nombre,
      estado: f.estado,
      fuente: f.fuente,
      codigoFuente: f.codigo_fuente,
      fechaCaptacion: f.fecha_captacion,
      fotoUrl: f.foto_url,
      urlPagina: f.url_pagina,
      urlAdLibrary: f.url_ad_library,
      costoProveedor: num(f.costo_proveedor),
      precioVenta: num(f.precio_venta),
      categoria: f.categoria,
      responsableId: f.responsable_id,
      responsableNombre: r ? r.nombre || r.email : null,
      notas: f.notas,
      creadoEn: f.creado_en,
      motivoDescarte: f.motivo_descarte,
      prioridad: [...(repetidosEn.get(f.id) ?? [])],
      ofertas: ofertasDe.get(f.id) ?? 0,
      precioOriginal: num(f.precio_original),
      monedaOriginal: f.moneda_original,
    };
  });
  const responsables = (perfilesR.data ?? []).map((p) => ({ id: p.id as string, nombre: (p.nombre as string | null) || (p.email as string) }));
  const categorias = [...new Set([...(categoriasR.data ?? []).map((c) => String(c.categoria).trim()), ...filas.map((f) => f.categoria ?? "")].filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Selección de productos" oculto />
      <TablaSeleccion
        filas={filas}
        codigoPais={pais.codigo}
        puedeEscribir={!usuario.modulosSoloLectura.includes("seleccion-productos")}
        responsables={responsables}
        categorias={categorias}
      />
    </Pagina>
  );
}
