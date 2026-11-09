"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_CIERRE, type FilaCierre } from "@/lib/deliverys/cargar";
import { TASA_OBJETIVO, sentidoNeto, textoSemanaCorto } from "@/lib/deliverys/liquidacion";
import { fechaCorta } from "@/lib/af4/fecha";
import { CalendarioIcon, CheckIcon, EnvioIcon, EstadoIcon, GastoIcon, PersonaIcon, ResultadosIcon, TiendaIcon, WalletIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_CIERRES, DEF_CIERRES_TODOS } from "./def-cierres";
import { FichaCierre } from "./ficha-cierre";
import { TONO_ESTADO_CIERRE } from "./estado-cierre";
import { dinero2, entero, fraccion } from "@/lib/af4/formato";

const NOMBRE: NombreFilas = { singular: "cierre", plural: "cierres" };
const ICONOS: Record<string, IconoComp> = {
  semana: CalendarioIcon,
  estado: EstadoIcon,
  repartidor: PersonaIcon,
  sentido: WalletIcon,
  entregas: EnvioIcon,
  tasa: ResultadosIcon,
  a_pagar: GastoIcon,
  efectivo: WalletIcon,
  neto: GastoIcon,
  aparte: TiendaIcon,
  pago: CheckIcon,
};

const suma = (filas: FilaCierre[], f: (x: FilaCierre) => number) => dinero2(filas.reduce((a, x) => a + f(x), 0));

const COLUMNAS: ColumnaTabla<FilaCierre, null>[] = [
  {
    id: "repartidor",
    label: "Repartidor",
    ocultable: false,
    render: (f) => {
      const baja = f.tasaEntrega !== null && f.tasaEntrega < TASA_OBJETIVO;
      return (
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {baja && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
            {f.repartidor}
            {baja && <span className="sr-only"> (tasa de entrega bajo el objetivo)</span>}
          </span>
          {f.documento && <span className="text-xs text-muted-foreground tabular-nums">{f.documento}</span>}
        </span>
      );
    },
  },
  { id: "semana", label: "Semana", ocultable: true, clase: "whitespace-nowrap tabular-nums text-muted-foreground", render: (f) => textoSemanaCorto(f.semana) },
  { id: "estado", label: "Estado", ocultable: true, render: (f) => <Badge tone={TONO_ESTADO_CIERRE[f.estado]}>{ETIQUETA_ESTADO_CIERRE[f.estado]}</Badge> },
  {
    id: "entregas",
    label: "Entregas",
    descripcion: "Entregadas · fallidas (se pagan) · devueltas",
    ocultable: true,
    clase: "whitespace-nowrap text-right tabular-nums",
    render: (f) => (
      <span className="flex flex-col items-end">
        <span>{f.entregas}</span>
        <span className="text-xs text-muted-foreground">
          {f.fallidas} fall. · {f.devueltas} dev.
        </span>
      </span>
    ),
    total: (filas) => entero(filas.reduce((a, x) => a + x.entregas, 0)),
  },
  { id: "tasa", label: "Tasa", ocultable: true, clase: "whitespace-nowrap text-right tabular-nums", render: (f) => fraccion(f.tasaEntrega, { decimales: 0 }) },
  {
    id: "a_pagar",
    label: "A pagar",
    descripcion: "Tarifas y propinas de las tiendas propias",
    ocultable: true,
    clase: "whitespace-nowrap text-right tabular-nums",
    render: (f) => dinero2(f.aPagar),
    total: (filas) => suma(filas, (x) => x.aPagar),
  },
  {
    id: "ajustes",
    label: "Adelantos y descuentos",
    ocultable: true,
    clase: "whitespace-nowrap text-right tabular-nums text-muted-foreground",
    render: (f) => (f.adelantos + f.descuentos ? dinero2(-(f.adelantos + f.descuentos)) : "—"),
    total: (filas) => suma(filas, (x) => -(x.adelantos + x.descuentos)),
  },
  {
    id: "efectivo",
    label: "Efectivo cobrado",
    ocultable: true,
    clase: "whitespace-nowrap text-right tabular-nums text-muted-foreground",
    render: (f) => (f.cobradoEfectivo ? dinero2(-f.cobradoEfectivo) : "—"),
    total: (filas) => suma(filas, (x) => -x.cobradoEfectivo),
  },
  {
    id: "neto",
    label: "Neto",
    descripcion: "Positivo: se le paga. Negativo: el repartidor entrega la diferencia",
    ocultable: false,
    clase: "whitespace-nowrap text-right tabular-nums font-medium",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        {sentidoNeto(f.neto) === "rendir" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />}
        {dinero2(f.neto)}
        {sentidoNeto(f.neto) === "rendir" && <span className="sr-only"> (debe entregar)</span>}
      </span>
    ),
    total: (filas) => suma(filas, (x) => x.neto),
  },
  {
    id: "aparte",
    label: "Clicksi (aparte)",
    descripcion: "Lo de las tiendas que pagan sus envíos por su cuenta",
    ocultable: true,
    clase: "whitespace-nowrap text-right tabular-nums text-muted-foreground",
    render: (f) => (f.aparte ? dinero2(f.aparte) : "—"),
    total: (filas) => suma(filas, (x) => x.aparte),
  },
  {
    id: "pago",
    label: "Pago",
    ocultable: true,
    clase: "whitespace-nowrap text-muted-foreground",
    render: (f) => (f.fechaPago ? `${fechaCorta(f.fechaPago)}${f.reciboNumero ? ` · N.º ${String(f.reciboNumero).padStart(4, "0")}` : ""}` : "—"),
  },
];

/** Los cierres de los repartidores; toda la fila abre su ficha (detalle, cerrar semana, registrar pago y recibo). */
export function TablaCierres({ filas, todos = false, puedeEscribir }: { filas: FilaCierre[]; todos?: boolean; puedeEscribir: boolean }) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const fila = abierta ? filas.find((f) => f.id === abierta.id) : null;
  const i = abierta ? abierta.orden.indexOf(abierta.id) : -1;
  const ir = (k: number) => (abierta?.orden[k] ? () => setAbierta((a) => (a ? { ...a, id: a.orden[k] } : a)) : undefined);
  return (
    <>
      <TablaDatos
        def={todos ? DEF_CIERRES_TODOS : DEF_CIERRES}
        filas={filas}
        columnas={todos ? COLUMNAS : COLUMNAS.filter((c) => c.id !== "semana")}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        formatearTotal={(v) => dinero2(v)}
        abrirFila={{ etiqueta: (f) => `Abrir el cierre de ${f.repartidor} (${textoSemanaCorto(f.semana)})`, alAbrir: (f, orden) => setAbierta({ id: f.id, orden }) }}
        ariaLabel="Cierres de los repartidores"
        vacio="No hay entregas en esta semana."
      />
      {abierta && fila && (
        <FichaCierre
          key={abierta.id}
          repartidorId={fila.repartidorId}
          semana={fila.semana}
          puedeEscribir={puedeEscribir}
          anterior={ir(i - 1)}
          siguiente={ir(i + 1)}
          alCerrar={() => setAbierta(null)}
        />
      )}
    </>
  );
}
