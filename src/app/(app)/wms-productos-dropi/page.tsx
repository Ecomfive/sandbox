import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearMoneda } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { stockTotal, type Bodega, type ProductoDropiDatos } from "@/lib/wms/producto-dropi";
import type { FilaProductoDropi } from "./def-wms-dropi";
import { TablaWmsDropi } from "./tabla-wms-dropi";

export const metadata = { title: "Ficha producto Dropi" };

export const dynamic = "force-dynamic";

interface ProductoFila {
  id: string;
  numero: number;
  nombre: string;
  tipo: string;
  publicacion: string;
  aprobado: boolean;
  archivado: boolean;
  precio: number | null;
  precio_sugerido: number | null;
  categorias: string[] | null;
  stock: Record<string, number> | null;
  variaciones: { precio: number | null; precio_sugerido: number | null; stock: Record<string, number> }[] | null;
  creado_en: string;
  wms_dropi_producto_medios: { ruta: string; tipo: string; posicion: number }[];
}

export default async function WmsProductosDropiPage() {
  const usuario = await requireModulo("wms-productos-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data }, { data: bodegasData }] = await Promise.all([
    supabase
      .from("wms_dropi_productos")
      .select("id, numero, nombre, tipo, publicacion, aprobado, archivado, precio, precio_sugerido, categorias, stock, variaciones, creado_en, wms_dropi_producto_medios(ruta, tipo, posicion)")
      .eq("pais_id", pais.id)
      .order("creado_en", { ascending: false })
      .limit(1000),
    // El stock de un producto de Dropi va en la bodega «Dropi» (o en las que se agregaron desde su ficha, sin código). Sin la
    // migración 0053 (columna `codigo`) se ofrecen todas las bodegas, como antes.
    supabase
      .from("wms_bodegas")
      .select("id, nombre")
      .eq("pais_id", pais.id)
      .eq("activa", true)
      .or("codigo.eq.dropi,codigo.is.null")
      .order("nombre")
      .then((r) => (r.error ? supabase.from("wms_bodegas").select("id, nombre").eq("pais_id", pais.id).eq("activa", true).order("nombre") : r)),
  ]);

  const bodegas: Bodega[] = (bodegasData ?? []).map((b) => ({ id: b.id as string, nombre: b.nombre as string }));
  const nombreBodega = new Map(bodegas.map((b) => [b.id, b.nombre]));
  const moneda = (n: number) => formatearMoneda(n, pais.codigo);
  const rango = (valores: number[]) => {
    if (valores.length === 0) return "";
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return min === max ? moneda(min) : `${moneda(min)} – ${moneda(max)}`;
  };

  const filas: FilaProductoDropi[] = ((data ?? []) as unknown as ProductoFila[]).map((p) => {
    const variable = p.tipo === "variable";
    const variaciones = p.variaciones ?? [];
    const precios = variable ? variaciones.map((v) => v.precio).filter((x): x is number => x !== null) : p.precio !== null ? [Number(p.precio)] : [];
    const sugeridos = variable ? variaciones.map((v) => v.precio_sugerido).filter((x): x is number => x !== null) : p.precio_sugerido !== null ? [Number(p.precio_sugerido)] : [];
    // Stock por bodega (el de un producto variable es la suma de sus variaciones).
    const porBodega = new Map<string, number>();
    for (const s of variable ? variaciones.map((v) => v.stock ?? {}) : [p.stock ?? {}]) {
      for (const [b, n] of Object.entries(s)) porBodega.set(b, (porBodega.get(b) ?? 0) + (Number(n) || 0));
    }
    const conStock = [...porBodega.entries()].filter(([b]) => nombreBodega.has(b));
    const portada = [...p.wms_dropi_producto_medios].filter((m) => m.tipo === "imagen").sort((a, b) => a.posicion - b.posicion)[0];
    return {
      id: p.id,
      numero: Number(p.numero),
      nombre: p.nombre,
      tipo: p.tipo,
      stock: stockTotal({ tipo: variable ? "variable" : "simple", stock: p.stock ?? {}, variaciones: variaciones as unknown as ProductoDropiDatos["variaciones"] }),
      precio: rango(precios),
      precioSugerido: rango(sugeridos),
      precioNumero: precios.length > 0 ? Math.min(...precios) : null,
      categorias: p.categorias ?? [],
      bodegas: conStock.map(([b, n]) => `${nombreBodega.get(b)}: ${n}`),
      bodegasNombres: conStock.map(([b]) => nombreBodega.get(b) as string),
      aprobado: p.aprobado,
      privado: p.publicacion === "privado",
      archivado: p.archivado,
      portada: portada?.ruta ?? null,
      creado: p.creado_en.slice(0, 10),
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Ficha producto Dropi" oculto />
      <TablaWmsDropi
        productos={filas}
        paisId={pais.id}
        codigoPais={pais.codigo}
        bodegasIniciales={bodegas}
        puedeEscribir={!usuario.modulosSoloLectura.includes("wms-productos-dropi")}
      />
    </Pagina>
  );
}
