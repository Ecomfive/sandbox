import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { FiltroIcon } from "@/lib/nav-icons";
import { TablaFiltros } from "./tabla-filtros";
import type { FilaFiltro } from "./def-filtros";

export const metadata = { title: "Filtros · Compras" };

export const dynamic = "force-dynamic";

/** El embudo de cotización de productos candidatos (Sistema WMS › Compras › Filtros), calcado de la lista de
 * ClickUp «Productos y Filtro PA»: de en cola a aprobado o descartado, antes de convertirse en una Compra. */
export default async function FiltrosComprasPage() {
  const usuario = await requireModulo("compras");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: filtros } = await supabase
    .from("wms_filtro_productos")
    .select(
      "id, nombre, foto_url, estado_registro, estado, tipo_envio, tienda, qty_producto, precio_total, precio_unitario, prioridad, aprobacion_gestionada, comentarios, creado_en, landing_url, metrica_oferta, metrica_cpm, metrica_efectividad, metrica_hook_rate, metrica_ctr, metrica_cpa, metrica_gasto, metrica_compras, metrica_cvr, perfiles(nombre, email, avatar_url)"
    )
    .eq("pais_id", pais.id)
    .order("creado_en", { ascending: false })
    .limit(1000);

  const filasFiltro: FilaFiltro[] = (filtros ?? []).map((f) => {
    const asignado = f.perfiles as unknown as { nombre: string | null; email: string; avatar_url: string | null } | null;
    return {
      id: f.id,
      nombre: f.nombre,
      fotoUrl: f.foto_url,
      estadoRegistro: f.estado_registro,
      estado: f.estado,
      tipoEnvio: f.tipo_envio,
      tienda: f.tienda,
      qtyProducto: f.qty_producto === null ? null : Number(f.qty_producto),
      precioTotal: f.precio_total === null ? null : Number(f.precio_total),
      precioUnitario: f.precio_unitario === null ? null : Number(f.precio_unitario),
      prioridad: f.prioridad,
      asignadoNombre: asignado ? (asignado.nombre || asignado.email) : null,
      asignadoEmail: asignado?.email ?? null,
      asignadoAvatarUrl: asignado?.avatar_url ?? null,
      aprobacionGestionada: f.aprobacion_gestionada,
      comentarios: f.comentarios,
      creadoEn: f.creado_en,
      landingUrl: f.landing_url,
      metricaOferta: f.metrica_oferta === null ? null : Number(f.metrica_oferta),
      metricaCpm: f.metrica_cpm === null ? null : Number(f.metrica_cpm),
      metricaEfectividad: f.metrica_efectividad === null ? null : Number(f.metrica_efectividad),
      metricaHookRate: f.metrica_hook_rate === null ? null : Number(f.metrica_hook_rate),
      metricaCtr: f.metrica_ctr === null ? null : Number(f.metrica_ctr),
      metricaCpa: f.metrica_cpa === null ? null : Number(f.metrica_cpa),
      metricaGasto: f.metrica_gasto === null ? null : Number(f.metrica_gasto),
      metricaCompras: f.metrica_compras === null ? null : Number(f.metrica_compras),
      metricaCvr: f.metrica_cvr === null ? null : Number(f.metrica_cvr),
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Filtros" icono={FiltroIcon} oculto />

      <TablaFiltros
        filtros={filasFiltro}
        codigoPais={pais.codigo}
        paisId={pais.id}
        puedeEscribir={!usuario.modulosSoloLectura.includes("compras")}
      />
    </Pagina>
  );
}
