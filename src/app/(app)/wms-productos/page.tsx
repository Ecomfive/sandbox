import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { formatearMoneda } from "@/lib/formato";
import type { FilaProductoWms } from "./def-wms-productos";
import { TablaWmsProductos } from "./tabla-wms-productos";

export const metadata = { title: "Ficha producto Shopify" };

export const dynamic = "force-dynamic";

interface ProductoConHijos {
  id: string;
  titulo: string;
  estado: string;
  categoria: string | null;
  tipo: string | null;
  proveedor: string | null;
  creado_en: string;
  wms_producto_medios: { ruta: string; posicion: number; tipo: string }[];
  wms_producto_variantes: { precio: number | null; wms_producto_inventario: { en_existencia: number }[] }[];
}

export default async function WmsProductosPage() {
  const usuario = await requireModulo("wms-productos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data } = await supabase
    .from("wms_productos")
    .select(
      "id, titulo, estado, categoria, tipo, proveedor, creado_en, wms_producto_medios(ruta, posicion, tipo), wms_producto_variantes(precio, wms_producto_inventario(en_existencia))"
    )
    .eq("pais_id", pais.id)
    .order("creado_en", { ascending: false })
    .limit(1000);

  const filas: FilaProductoWms[] = ((data ?? []) as unknown as ProductoConHijos[]).map((p) => {
    const portada = [...p.wms_producto_medios].filter((m) => m.tipo === "imagen").sort((a, b) => a.posicion - b.posicion)[0];
    const precios = p.wms_producto_variantes.map((v) => v.precio).filter((x): x is number => x !== null);
    const min = precios.length > 0 ? Math.min(...precios) : null;
    const max = precios.length > 0 ? Math.max(...precios) : null;
    return {
      id: p.id,
      titulo: p.titulo,
      estado: p.estado,
      categoria: p.categoria ?? "",
      tipo: p.tipo ?? "",
      proveedor: p.proveedor ?? "",
      portada: portada?.ruta ?? null,
      variantes: p.wms_producto_variantes.length,
      existencias: p.wms_producto_variantes.reduce((s, v) => s + v.wms_producto_inventario.reduce((t, i) => t + i.en_existencia, 0), 0),
      precio:
        min === null || max === null
          ? ""
          : min === max
            ? formatearMoneda(min, pais.codigo)
            : `${formatearMoneda(min, pais.codigo)} – ${formatearMoneda(max, pais.codigo)}`,
      creado: p.creado_en.slice(0, 10),
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Ficha producto Shopify" oculto />
      <TablaWmsProductos productos={filas} puedeEscribir={!usuario.modulosSoloLectura.includes("wms-productos")} />
    </Pagina>
  );
}
