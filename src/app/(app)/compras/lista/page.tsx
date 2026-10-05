import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarCompras } from "../datos-compras";
import type { Grupo } from "../calculos-compras";
import { ListaCompras } from "../lista-compras";

export const metadata = { title: "Compras" };

export const dynamic = "force-dynamic";

const GRUPOS: Grupo[] = ["abiertas", "cotizando", "produccion", "transito", "atrasadas", "cerradas"];

/** Compras › Compras: la lista con búsqueda, filtros de un toque y la ficha fija a la derecha (como Productos Test). */
export default async function ListaComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("compras");
  const { ver, grupo, etapa } = await searchParams;
  const { compras, paises, vista, error } = await cargarCompras(ver);
  const grupoInicial = typeof grupo === "string" && (GRUPOS as string[]).includes(grupo) ? (grupo as Grupo) : null;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Compras" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <ListaCompras
          key={`${vista}-${grupoInicial ?? ""}-${typeof etapa === "string" ? etapa : ""}`}
          compras={compras}
          vista={vista}
          paises={paises}
          puedeEscribir={!usuario.modulosSoloLectura.includes("compras")}
          puedeAgregarPais={usuario.modulos.includes("configuracion") && !usuario.modulosSoloLectura.includes("configuracion")}
          grupoInicial={grupoInicial}
          etapaInicial={typeof etapa === "string" ? etapa : ""}
        />
      )}
    </Pagina>
  );
}
