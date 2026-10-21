import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { cargarCompras, cargarEventos } from "../datos-compras";
import { TiemposCompras } from "../tiempos-compras";

export const metadata = { title: "Tiempos y fallas · Compras" };

export const dynamic = "force-dynamic";

/** Compras › Tiempos y fallas: cuánto tarda cada tramo y cada estado, comparado por proveedor, vía, país… y lo que falla. */
export default async function TiemposComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requirePestana("compras", "tiempos");
  // Los eventos (todos, ~12 000 filas) se piden a la vez que las compras y se filtran después: antes esperaban a las compras.
  const { ver } = await searchParams;
  const datosP = cargarCompras(ver);
  const eventosP = cargarEventos();
  const { compras, paises, vista, error } = await datosP;
  const ids = new Set(compras.map((c) => c.id));
  const eventos = error ? [] : (await eventosP).filter((e) => ids.has(e.compraId));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tiempos y fallas" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <TiemposCompras key={vista} compras={compras} eventos={eventos} vista={vista} paises={paises} />
      )}
    </Pagina>
  );
}
