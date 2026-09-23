import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ESTADOS_PRODUCTO,
  SUCURSAL_PREDETERMINADA,
  UNIDADES_PESO,
  type MedioDatos,
  type ProductoDatos,
  type VarianteDatos,
} from "@/lib/wms/producto";
import { FichaProductoShopify } from "../ficha-producto-shopify";

export const metadata = { title: "Ficha producto Shopify" };

export const dynamic = "force-dynamic";

const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export default async function WmsProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireModulo("wms-productos");
  const { id } = await params;
  if (!/^[0-9a-fA-F-]{8,64}$/.test(id)) notFound();

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: p } = await supabase
    .from("wms_productos")
    .select(
      "*, wms_producto_variantes(*, wms_producto_inventario(sucursal, disponible, comprometido, no_disponible)), wms_producto_medios(id, ruta, nombre_archivo, tipo, alt, posicion)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  type Fila = Record<string, unknown>;
  const filasVariantes = ((p.wms_producto_variantes ?? []) as Fila[]).sort((a, b) => Number(a.posicion) - Number(b.posicion));
  // Todas las variantes comparten la misma lista de sucursales: la unión de las que tengan datos.
  const sucursales = [
    ...new Set(filasVariantes.flatMap((v) => ((v.wms_producto_inventario ?? []) as Fila[]).map((i) => String(i.sucursal)))),
  ];
  if (sucursales.length === 0) sucursales.push(SUCURSAL_PREDETERMINADA);

  const variantes: VarianteDatos[] = filasVariantes.map((v) => {
    const inv = (v.wms_producto_inventario ?? []) as Fila[];
    return {
      id: String(v.id),
      opciones: (v.opciones ?? {}) as Record<string, string>,
      precio: numero(v.precio),
      precio_comparacion: numero(v.precio_comparacion),
      costo: numero(v.costo),
      sku: (v.sku as string | null) ?? "",
      codigo_barras: (v.codigo_barras as string | null) ?? "",
      peso: numero(v.peso),
      unidad_peso: UNIDADES_PESO.find((u) => u === v.unidad_peso) ?? "kg",
      inventario: sucursales.map((s) => {
        const fila = inv.find((i) => i.sucursal === s);
        return {
          sucursal: s,
          disponible: Number(fila?.disponible ?? 0),
          comprometido: Number(fila?.comprometido ?? 0),
          no_disponible: Number(fila?.no_disponible ?? 0),
        };
      }),
    };
  });

  const medios: MedioDatos[] = ((p.wms_producto_medios ?? []) as Fila[])
    .sort((a, b) => Number(a.posicion) - Number(b.posicion))
    .map((m) => ({
      id: String(m.id),
      ruta: String(m.ruta),
      nombre_archivo: (m.nombre_archivo as string | null) ?? "",
      tipo: m.tipo === "video" ? "video" : "imagen",
      alt: (m.alt as string | null) ?? "",
    }));

  const inicial: ProductoDatos = {
    titulo: p.titulo,
    descripcion: p.descripcion ?? "",
    estado: ESTADOS_PRODUCTO.find((e) => e === p.estado) ?? "borrador",
    categoria: p.categoria ?? "",
    tipo: p.tipo ?? "",
    proveedor: p.proveedor ?? "",
    colecciones: p.colecciones ?? [],
    etiquetas: p.etiquetas ?? [],
    plantilla_tema: p.plantilla_tema,
    canales: p.canales ?? [],
    cobrar_impuesto: p.cobrar_impuesto,
    seguimiento_inventario: p.seguimiento_inventario,
    vender_sin_existencias: p.vender_sin_existencias,
    es_fisico: p.es_fisico,
    embalaje: p.embalaje ?? "",
    pais_origen: p.pais_origen ?? "",
    codigo_sa: p.codigo_sa ?? "",
    seo_titulo: p.seo_titulo ?? "",
    seo_descripcion: p.seo_descripcion ?? "",
    seo_url: p.seo_url ?? "",
    metacampos: p.metacampos ?? [],
    opciones: p.opciones ?? [],
    variantes,
    medios,
  };

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EtiquetaMiga texto={p.titulo} />
      <FichaProductoShopify
        key={p.actualizado_en}
        id={p.id}
        inicial={inicial}
        paisId={p.pais_id}
        codigoPais={pais.codigo}
        puedeEscribir={!usuario.modulosSoloLectura.includes("wms-productos")}
      />
    </Pagina>
  );
}
