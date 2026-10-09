import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCompras, cargarEventos } from "../datos-compras";
import { DashboardCompras } from "../dashboard-compras";

export const metadata = { title: "Dashboard · Compras" };

export const dynamic = "force-dynamic";

/** Compras › Dashboard: toda la operación de compras a la vez, con filtros que se cruzan entre todas las gráficas. */
export default async function DashboardComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("compras");
  const { ver } = await searchParams;
  const { compras, paises, vista, error } = await cargarCompras(ver);
  const eventos = error ? [] : await cargarEventos(new Set(compras.map((c) => c.id)));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dashboard de compras" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <DashboardCompras key={vista} compras={compras} eventos={eventos} vista={vista} paises={paises} />
      )}
    </Pagina>
  );
}
