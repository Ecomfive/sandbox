import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { cargarCompras } from "../datos-compras";
import { PlanificacionCompras } from "../planificacion-compras";

export const metadata = { title: "Planificación · Compras" };

export const dynamic = "force-dynamic";

/** Compras › Planificación: lo que llega en el mes en curso y los 3 siguientes, por país y por producto. */
export default async function PlanificacionComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requirePestana("compras", "planificacion");
  const { ver } = await searchParams;
  const { compras, paises, vista, error } = await cargarCompras(ver);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Planificación de compras" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <PlanificacionCompras key={vista} compras={compras} vista={vista} paises={paises} />
      )}
    </Pagina>
  );
}
