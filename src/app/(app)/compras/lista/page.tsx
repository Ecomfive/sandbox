import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarColoresEtiquetas, cargarCompras } from "../datos-compras";
import type { Grupo } from "../calculos-compras";
import { TablaCompras } from "../tabla-compras";

export const metadata = { title: "Compras" };

export const dynamic = "force-dynamic";

const GRUPOS: Grupo[] = ["abiertas", "cotizando", "produccion", "transito", "atrasadas", "cerradas"];

/** Compras › Compras: el tablero (todas las columnas, agrupar, filtros de un toque) con la ficha de resumen a la derecha. */
export default async function ListaComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("compras");
  const { ver, grupo, etapa, abrir, comentario } = await searchParams;
  const [{ compras, paises, vista, error, verImportadora }, coloresEtiquetas] = await Promise.all([cargarCompras(ver), cargarColoresEtiquetas()]);
  const grupoInicial = typeof grupo === "string" && (GRUPOS as string[]).includes(grupo) ? (grupo as Grupo) : null;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Compras" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <TablaCompras
          key={`${vista}-${grupoInicial ?? ""}-${typeof etapa === "string" ? etapa : ""}-${typeof abrir === "string" ? abrir : ""}-${typeof comentario === "string" ? comentario : ""}`}
          compras={compras}
          vista={vista}
          verImportadora={verImportadora}
          paises={paises}
          puedeEscribir={!usuario.modulosSoloLectura.includes("compras")}
          puedeAgregarPais={usuario.modulos.includes("configuracion") && !usuario.modulosSoloLectura.includes("configuracion")}
          grupoInicial={grupoInicial}
          etapaInicial={typeof etapa === "string" ? etapa : ""}
          abrirInicial={typeof abrir === "string" ? abrir : null}
          coloresEtiquetas={coloresEtiquetas}
          comentarioInicial={typeof comentario === "string" ? comentario : null}
        />
      )}
    </Pagina>
  );
}
