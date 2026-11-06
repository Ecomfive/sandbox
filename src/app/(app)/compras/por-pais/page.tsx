import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPorPais } from "./datos-por-pais";
import { TablaPorPais } from "./tabla-por-pais";

export const metadata = { title: "Por país" };

export const dynamic = "force-dynamic";

/**
 * Compras › Por país (5 nov 2026, pedido de Alcides; reemplaza la hoja «Gestión de Productos por País»): cada producto de Producto y, por
 * país, si ya existe ahí (publicado en Dropi o Drop, comprado o con stock) o todavía no, con la decisión «Enviar» o «Descartado». Son
 * decisiones de compra de Alcides: solo la abre quien tiene el módulo `compras-por-pais`, que se da por persona (migración 0232).
 */
export default async function ProductoPorPaisPage() {
  const usuario = await requireModulo("compras-por-pais");
  const supabase = createServiceClient();
  const [{ filas, paises, sinMigracion }, pais] = await Promise.all([cargarPorPais(usuario, supabase), getPaisActual(supabase)]);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Por país" oculto />
      {sinMigracion && (
        <p className="m-0 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-aviso" />
          Falta correr la migración 0231 en Supabase: hasta entonces no se pueden guardar «Enviar» ni «Descartado».
        </p>
      )}
      <TablaPorPais filas={filas} paises={paises} puedeEscribir={!usuario.modulosSoloLectura.includes("compras-por-pais")} codigoPaisBarra={pais.codigo} />
    </Pagina>
  );
}
