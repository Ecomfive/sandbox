import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { unidadesEnCamino } from "@/lib/compras/reponer";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { cargarResumenVentas } from "@/lib/publicaciones/ventas-datos";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarCompras } from "../datos-compras";
import { etiquetaEtapa, numeroOC } from "../def-compras";
import { ReponerCompras } from "../reponer-compras";

export const metadata = { title: "Reponer · Compras" };

export const dynamic = "force-dynamic";

/**
 * Compras › Reponer (solo un administrador, por ahora): lo que se vende en Dropi del país de la barra y se está acabando, por
 * SKU del sistema, con lo que ya viene en compras abiertas y cuánto comprar para cubrir 60 días de venta. Sale de Desempeño ›
 * Ventas Dropi (migración 0120).
 */
export default async function ReponerComprasPage() {
  const usuario = await requireModulo("compras");
  if (!esAdministrador(usuario)) redirect("/compras/lista");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [ventas, pubsR, datosCompras] = await Promise.all([
    cargarResumenVentas(supabase, pais.id),
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_publicaciones").select("dropi_id, skus_maestros(id, codigo, nombre)").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).order("id").range(d, h)),
    cargarCompras("todos"),
  ]);

  if (!ventas) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Reponer" oculto />
        <p role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Todavía no hay ventas de Dropi cargadas para {pais.nombre} (Desempeño › Ventas Dropi): sin ellas no se sabe qué reponer.
        </p>
      </Pagina>
    );
  }

  // El SKU del sistema de cada producto de Dropi, por el vínculo de Gestión de IDs Dropi.
  const skuDe: [number, { id: string; codigo: string; nombre: string }][] = [];
  for (const p of pubsR.data ?? []) {
    const sku = p.skus_maestros as { id: string; codigo: string; nombre: string } | null;
    if (!sku) continue;
    for (const id of String(p.dropi_id ?? "").match(/\d{3,6}/g) ?? []) skuDe.push([Number(id), sku]);
  }
  // Lo que ya viene en compras abiertas hacia este país.
  const delPais = datosCompras.error ? [] : datosCompras.compras.filter((c) => c.paisCodigo === pais.codigo || c.paisesDestino.includes(pais.codigo));
  const enCamino = unidadesEnCamino(
    delPais.map((c) => ({ numero: numeroOC(c.numero), etapa: c.etapa, etiquetaEtapa: etiquetaEtapa(c.etapa), anulada: !!c.anulada, planificacion: c.planificacion, lineas: c.lineas })),
  );

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Reponer" oculto />
      <ReponerCompras
        pais={pais}
        corte={ventas.corte}
        resumen={[...ventas.resumen.values()]}
        skuDe={skuDe}
        enCamino={[...enCamino.entries()]}
        comprasSinCargar={!!datosCompras.error}
      />
    </Pagina>
  );
}
