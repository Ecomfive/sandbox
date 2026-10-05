import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCompras, cargarEventos } from "../datos-compras";
import { TiemposCompras } from "../tiempos-compras";

export const metadata = { title: "Tiempos y fallas · Compras" };

export const dynamic = "force-dynamic";

/** Compras › Tiempos y fallas: cuánto tarda cada tramo y cada estado, comparado por proveedor, vía, país… y lo que falla. */
export default async function TiemposComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("compras");
  const { ver } = await searchParams;
  const { compras, paises, vista, error } = await cargarCompras(ver);
  const eventos = error ? [] : await cargarEventos(new Set(compras.map((c) => c.id)));
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
