import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePestana } from "@/lib/auth";
import { cargarColoresEtiquetas, cargarColoresTiendas, cargarCompras } from "../datos-compras";
import type { Grupo } from "../calculos-compras";
import { TablaCompras } from "../tabla-compras";

export const metadata = { title: "Compras" };

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «Crear compra» desde Compras › Reponer llega con `?reponer=<id del SKU>.<cantidad>`: abre la compra nueva con ese producto. */
function leerReponer(v: string | string[] | undefined): { skuId: string; cantidad: number } | null {
  if (typeof v !== "string") return null;
  const [skuId, n] = v.split(".");
  const cantidad = Number(n);
  return UUID.test(skuId ?? "") && Number.isInteger(cantidad) && cantidad > 0 && cantidad < 1e7 ? { skuId, cantidad } : null;
}

const GRUPOS: Grupo[] = ["abiertas", "cotizando", "produccion", "transito", "atrasadas", "cerradas"];

/** Compras › Compras: el tablero (todas las columnas, agrupar, filtros de un toque) con la ficha de resumen a la derecha. */
export default async function ListaComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requirePestana("compras", "lista");
  const { ver, grupo, etapa, abrir, comentario, reponer } = await searchParams;
  const reponerInicial = leerReponer(reponer);
  const [{ compras, paises, vista, error, restricciones }, coloresEtiquetas, coloresTiendas] = await Promise.all([cargarCompras(ver), cargarColoresEtiquetas(), cargarColoresTiendas()]);
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
          key={`${vista}-${grupoInicial ?? ""}-${typeof etapa === "string" ? etapa : ""}-${typeof abrir === "string" ? abrir : ""}-${typeof comentario === "string" ? comentario : ""}-${reponerInicial ? `${reponerInicial.skuId}.${reponerInicial.cantidad}` : ""}`}
          compras={compras}
          vista={vista}
         
          paises={paises}
          puedeEscribir={!usuario.modulosSoloLectura.includes("compras")}
          restricciones={restricciones}
          puedeAgregarPais={usuario.modulos.includes("configuracion") && !usuario.modulosSoloLectura.includes("configuracion")}
          grupoInicial={grupoInicial}
          etapaInicial={typeof etapa === "string" ? etapa : ""}
          abrirInicial={typeof abrir === "string" ? abrir : null}
          coloresEtiquetas={coloresEtiquetas}
          coloresTiendas={coloresTiendas}
          comentarioInicial={typeof comentario === "string" ? comentario : null}
          reponerInicial={reponerInicial}
        />
      )}
    </Pagina>
  );
}
