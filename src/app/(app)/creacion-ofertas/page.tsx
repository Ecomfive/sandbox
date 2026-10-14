import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { VistaOfertas, type ProductoOferta } from "./vista-ofertas";

export const metadata = { title: "Creación de ofertas" };

export const dynamic = "force-dynamic";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Testing Lab › Producción: los productos de Selección en «Crear oferta» (del país de la barra de arriba), cada uno con sus
 * ofertas (de 1 a 3: nombre, unidades y precio en dólares) y el margen frente al costo del proveedor.
 */
export default async function CreacionOfertasPage() {
  const usuario = await requireModulo("creacion-ofertas");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: filas, error } = await supabase
    .from("wms_seleccion_productos")
    .select("id, numero, nombre, fuente, codigo_fuente, foto_url, costo_proveedor, precio_venta, url_pagina")
    .eq("pais_id", pais.id)
    .eq("estado", "crear_oferta")
    .order("numero", { ascending: false })
    .limit(500);
  const ids = (filas ?? []).map((f) => f.id);
  const { data: ofertas, error: errorOfertas } = ids.length
    ? await supabase.from("wms_seleccion_ofertas").select("id, seleccion_id, orden, nombre, unidades, precio, notas").in("seleccion_id", ids).order("orden")
    : { data: [], error: null };

  if (error || errorOfertas) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Creación de ofertas" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las ofertas. Falta correr en Supabase las migraciones 0104 y 0106.
        </p>
      </Pagina>
    );
  }

  const productos: ProductoOferta[] = (filas ?? []).map((f) => ({
    id: f.id,
    numero: f.numero,
    nombre: f.nombre,
    fuente: f.fuente,
    codigoFuente: f.codigo_fuente,
    foto: f.foto_url,
    costo: num(f.costo_proveedor),
    precioReferencia: num(f.precio_venta),
    url: f.url_pagina,
    ofertas: (ofertas ?? [])
      .filter((o) => o.seleccion_id === f.id)
      .map((o) => ({ id: o.id, orden: o.orden, nombre: o.nombre, unidades: o.unidades, precio: num(o.precio), notas: o.notas })),
  }));

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Creación de ofertas" oculto />
      <VistaOfertas productos={productos} puedeEscribir={!usuario.modulosSoloLectura.includes("creacion-ofertas")} />
    </Pagina>
  );
}
