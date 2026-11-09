"use client";

import { claseCifra } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { fechaCorta } from "@/lib/af4/fecha";
import { dias, dinero, entero, numero, SIN_DATO } from "@/lib/af4/formato";
import type { Reorden } from "@/lib/finanzas/inventario-decisiones";
import { CalendarioIcon, EnvioIcon, EstadoIcon, GastoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const usd = (v: number | null) => dinero(v);

export const ETIQUETA_ESTADO: Record<Reorden["estado"], string> = { comprar_ya: "Comprar ya", pronto: "En 14 días", cubierto: "Cubierto" };
const ETIQUETA_CAJA: Record<Reorden["caja"], string> = { alcanza: "Alcanza", no_alcanza: "No alcanza", sin_proyeccion: "Fuera de la proyección" };
const ETIQUETA_VIA: Record<string, string> = { mar: "Marítimo", aire: "Aéreo", tierra: "Terrestre" };

function Punto({ tono }: { tono: "warning" | "destructive" | "success" }) {
  const c = tono === "warning" ? "bg-warning" : tono === "destructive" ? "bg-destructive" : "bg-success";
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${c}`} />;
}

const DEF: DefTabla<Reorden> = {
  clave: "rentabilidad-reorden",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.codigo} ${f.producto}` },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [ETIQUETA_ESTADO[f.estado]], agrupable: true },
    { id: "caja", etiqueta: "Caja", tipo: "seleccion", valores: (f) => [ETIQUETA_CAJA[f.caja]], agrupable: true },
    { id: "via", etiqueta: "Vía", tipo: "seleccion", valores: (f) => [ETIQUETA_VIA[f.via] ?? f.via], agrupable: true },
    { id: "fecha", etiqueta: "Comprar el", tipo: "fecha", valor: (f) => f.fechaCompra },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (f) => f.monto ?? 0 },
  ],
  vistaInicial: { agrupar: "estado" },
};

const COLUMNAS: ColumnaTabla<Reorden, null>[] = [
  {
    id: "producto",
    label: "Producto",
    ocultable: false,
    clase: "max-w-sm",
    render: (f) => (
      <span className="line-clamp-2">
        <span className={`text-muted-foreground ${claseCifra}`}>{f.codigo}</span> {f.producto}
      </span>
    ),
  },
  { id: "stock", label: "Stock", ocultable: false, clase: num, render: (f) => entero(f.stock) },
  { id: "enCamino", label: "En camino", ocultable: true, clase: num, render: (f) => (f.enCamino ? entero(f.enCamino) : SIN_DATO) },
  { id: "ritmo", label: "Venta por día", ocultable: true, clase: num, render: (f) => numero(f.ritmoDiario, 2) },
  { id: "plazo", label: "Plazo", ocultable: true, clase: num, render: (f) => `${dias(f.plazoDias)} · ${ETIQUETA_VIA[f.via] ?? f.via}` },
  { id: "punto", label: "Punto de reorden", ocultable: false, clase: num, render: (f) => entero(f.puntoReorden) },
  {
    id: "fecha",
    label: "Comprar el",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        {f.estado !== "cubierto" && <Punto tono={f.estado === "comprar_ya" ? "destructive" : "warning"} />}
        {f.estado === "comprar_ya" ? (f.diasParaComprar < 0 ? `Atrasada ${dias(-f.diasParaComprar)}` : "Hoy") : fechaCorta(f.fechaCompra)}
      </span>
    ),
  },
  { id: "cantidad", label: "Cantidad", ocultable: false, clase: num, render: (f) => entero(f.cantidad) },
  { id: "monto", label: "Monto", ocultable: false, clase: `${num} font-medium`, render: (f) => (f.monto === null ? "Sin costo" : usd(f.monto)), total: (fs) => usd(fs.reduce((a, f) => a + (f.monto ?? 0), 0)) },
  {
    id: "caja",
    label: "Caja después",
    ocultable: false,
    clase: num,
    render: (f) =>
      f.caja === "sin_proyeccion" ? (
        <span className="text-muted-foreground">{ETIQUETA_CAJA.sin_proyeccion}</span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Punto tono={f.caja === "alcanza" ? "success" : "destructive"} />
          {usd(f.cajaDespues)}
        </span>
      ),
  },
];

const ICONOS: Record<string, IconoComp> = { producto: ProductoIcon, estado: EstadoIcon, caja: GastoIcon, via: EnvioIcon, fecha: CalendarioIcon, monto: GastoIcon };
const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };

export function TablaReorden({ filas }: { filas: Reorden[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.skuId}
      ariaLabel="Punto de reorden por producto"
      anchoMinimo="64rem"
      vacio="No hay productos con ventas en los últimos 90 días."
    />
  );
}
