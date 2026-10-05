import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCompras } from "./datos-compras";
import { InformeCompras } from "./informe-compras";

export const metadata = { title: "Compras" };

export const dynamic = "force-dynamic";

/** Compras › Informe: el resumen de la operación de compras por día, semana o mes, de todos los países, uno o Importadora. */
export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("compras");
  const { ver } = await searchParams;
  const { compras, paises, vista, error } = await cargarCompras(ver);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Compras" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <InformeCompras
          key={vista}
          compras={compras}
          vista={vista}
          paises={paises}
          puedeAgregarPais={usuario.modulos.includes("configuracion") && !usuario.modulosSoloLectura.includes("configuracion")}
        />
      )}
    </Pagina>
  );
}
