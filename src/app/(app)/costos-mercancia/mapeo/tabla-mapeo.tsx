"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon, GastoIcon, PedidoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { FilaMapeo } from "@/lib/finanzas/cargar-costos";
import { aplicarCostosAProductos, mapearProductoDropi } from "../actions";
import { claseCifra } from "@/components/af4/estilos-af4";
import { dinero, SIN_DATO } from "@/lib/af4/formato";
import { usd4 } from "../tabla-costos";

const DEF: DefTabla<FilaMapeo> = {
  clave: "costos-mapeo",
  campos: [
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [f.estado], agrupable: true },
    { id: "enProductos", etiqueta: "En Productos y márgenes", tipo: "seleccion", valores: (f) => [f.productos.length ? "Sí" : "No"], agrupable: true },
    { id: "productoDropi", etiqueta: "Producto en Dropi", tipo: "texto", valor: (f) => f.productoDropi },
    { id: "diferencia", etiqueta: "Diferencia", tipo: "numero", valor: (f) => f.diferencia ?? 0 },
  ],
  vistaInicial: { agrupar: "estado" },
};
const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = { estado: PedidoIcon, enProductos: ProductoIcon, productoDropi: ProductoIcon, diferencia: GastoIcon };
const botonBarra = `inline-flex min-h-8 items-center gap-1.5 !rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;

const COLUMNAS: ColumnaTabla<FilaMapeo, null>[] = [
  { id: "productoDropi", label: "Producto en Dropi", ocultable: false, clase: "max-w-sm", render: (f) => <span className="line-clamp-2">{f.productoDropi}</span> },
  {
    id: "productoCosto",
    label: "Producto de costo",
    ocultable: false,
    clase: "max-w-sm",
    render: (f) =>
      f.productoCosto ? (
        <span className="flex items-center gap-1.5">
          {f.estado === "Sugerido" && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
          <span className="line-clamp-2">{f.productoCosto}</span>
          {f.estado === "Sugerido" && <span className="sr-only">(sugerido)</span>}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  { id: "costoReal", label: "Costo real", ocultable: false, clase: `text-right whitespace-nowrap ${claseCifra}`, render: (f) => (f.costoReal === null ? SIN_DATO : usd4(f.costoReal)) },
  {
    id: "costoActual",
    label: "En Productos y márgenes",
    ocultable: true,
    clase: `text-right whitespace-nowrap text-muted-foreground ${claseCifra}`,
    render: (f) => (f.productos.length ? (f.costoActual === null ? "Sin costo" : usd4(f.costoActual)) : "No está"),
  },
  {
    id: "diferencia",
    label: "Diferencia",
    ocultable: true,
    clase: `text-right whitespace-nowrap ${claseCifra}`,
    render: (f) => (f.diferencia === null || Math.abs(f.diferencia) < 0.005 ? SIN_DATO : dinero(f.diferencia, "USD", { decimales: 2, decimalesMax: 4, conSigno: true })),
  },
];

export function TablaMapeo({ filas, puedeEscribir, puedeAplicar }: { filas: FilaMapeo[]; puedeEscribir: boolean; puedeAplicar: boolean }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      // Agrupada desde el principio: sin esto se veían todos los productos de una vez.
      paginarSiempre
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.clave}
      ariaLabel="Productos de Dropi y su costo real"
      vacio="No hay productos de Dropi ni mapeos cargados."
      seleccion={
        puedeEscribir
          ? { etiqueta: (f) => `Seleccionar ${f.productoDropi}`, barra: (marcadas, quitar) => <Barra marcadas={marcadas} quitar={quitar} puedeAplicar={puedeAplicar} /> }
          : undefined
      }
    />
  );
}

function Barra({ marcadas, quitar, puedeAplicar }: { marcadas: FilaMapeo[]; quitar: () => void; puedeAplicar: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const sugeridas = marcadas.filter((f) => f.estado === "Sugerido" && f.productoCostoClave);
  const aplicables = marcadas.flatMap((f) => (f.costoReal !== null ? f.productos.map((p) => ({ id: p.id, costo: f.costoReal! })) : []));

  return (
    <div role="region" aria-label="Productos seleccionados" className="sticky bottom-24 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg">
      <p role="status" className={`m-0 font-medium ${claseCifra}`}>
        {marcadas.length} {marcadas.length === 1 ? "seleccionado" : "seleccionados"}
      </p>
      <button
        type="button"
        className={botonBarra}
        disabled={pendiente || !sugeridas.length}
        onClick={() =>
          iniciar(async () => {
            for (const f of sugeridas) {
              const r = await mapearProductoDropi(f.productoDropi, f.productoCostoClave);
              if (r.error) {
                mostrarToast(r.error, "destructive");
                return;
              }
            }
            mostrarToast(`${sugeridas.length} sugerencias confirmadas`);
            quitar();
            router.refresh();
          })
        }
      >
        Confirmar sugerencias ({sugeridas.length})
      </button>
      {puedeAplicar && (
        <button
          type="button"
          className={botonBarra}
          disabled={pendiente || !aplicables.length}
          onClick={() =>
            iniciar(async () => {
              const r = await aplicarCostosAProductos(aplicables);
              if ("error" in r) mostrarToast(r.error, "destructive");
              else {
                mostrarToast(`Costo real puesto en ${r.aplicados} productos`);
                quitar();
                router.refresh();
              }
            })
          }
        >
          Usar costo real en Productos y márgenes ({aplicables.length})
        </button>
      )}
      {pendiente && <span className="text-muted-foreground">Guardando…</span>}
      <Tooltip texto="Quitar selección">
        <button type="button" onClick={quitar} aria-label="Quitar la selección" className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
          <CerrarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
