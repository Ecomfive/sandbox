"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claseAccionAF4, claseCifra } from "@/components/af4/estilos-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { dinero2, entero, numero, porcentaje } from "@/lib/af4/formato";
import { ETIQUETA_METODO, METODOS_PAGO, type MetodoPago, type SupuestosUE } from "@/lib/finanzas/unidad-economica";
import { guardarSupuestosUE } from "./actions";

export interface TiendaSupuesto {
  id: string;
  nombre: string;
}

/**
 * Los supuestos que usa la unidad económica donde los datos no traen el dato (envío sin costo, vuelta y pérdida de una
 * devolución, comisión de cobro, margen objetivo, fijos por tienda), siempre a la vista; con permiso, «Cambiar supuestos».
 */
export function SupuestosUE({
  supuestos,
  tiendas,
  puedeEditar,
  enviosSupuestos,
  ordenes,
}: {
  supuestos: SupuestosUE;
  tiendas: TiendaSupuesto[];
  puedeEditar: boolean;
  /** Pedidos del período que usan el envío supuesto. */
  enviosSupuestos: number;
  ordenes: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const comisiones = METODOS_PAGO.filter((m) => supuestos.comisionPct[m] > 0);
  const fijos = Object.keys(supuestos.fijosPorTienda).length;
  const items: [string, string][] = [
    ["Envío sin costo cargado", `${dinero2(supuestos.envioPorOrden)} por pedido · ${entero(enviosSupuestos)} de ${entero(ordenes)} pedidos`],
    ["Vuelta de una devolución", `${numero(supuestos.envioVueltaFactor, 2)} × el envío de ida`],
    ["Producto perdido en una devolución", porcentaje(supuestos.perdidaDevolucionPct)],
    ["Comisión de cobro", comisiones.length ? comisiones.map((m) => `${ETIQUETA_METODO[m]} ${porcentaje(supuestos.comisionPct[m])}`).join(" · ") : "Ninguna"],
    ["Margen objetivo", porcentaje(supuestos.margenObjetivoPct)],
    ["Fijos por tienda", fijos ? `${entero(fijos)} con monto propio; el resto, administración del libro` : "Administración del libro"],
  ];
  return (
    <MarcoAF4
      id="titulo-supuestos-ue"
      titulo="Supuestos"
      accion={
        puedeEditar ? (
          <button type="button" onClick={() => setAbierto(true)} className={`${claseAccionAF4} ${anilloFoco}`}>
            Cambiar supuestos
          </button>
        ) : undefined
      }
    >
      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([t, v]) => (
          <div key={t} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-muted-foreground">{t}</dt>
            <dd className={`font-medium text-foreground ${claseCifra}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {puedeEditar && (
        <Ventana abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Supuestos de la unidad económica" lado="derecha" ancho="md">
          <FormularioSupuestos supuestos={supuestos} tiendas={tiendas} alTerminar={() => setAbierto(false)} />
        </Ventana>
      )}
    </MarcoAF4>
  );
}

function Numero({ etiqueta, valor, alCambiar, ejemplo, enfocar }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; ejemplo: string; enfocar?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClassSm}>{etiqueta}</span>
      <input
        inputMode="decimal"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={ejemplo}
        data-enfocar={enfocar || undefined}
        className={`${fieldClassSm} text-right ${claseCifra}`}
      />
    </label>
  );
}

function FormularioSupuestos({ supuestos, tiendas, alTerminar }: { supuestos: SupuestosUE; tiendas: TiendaSupuesto[]; alTerminar: () => void }) {
  const t = (n: number) => String(n);
  const [envio, setEnvio] = useState(t(supuestos.envioPorOrden));
  const [vuelta, setVuelta] = useState(t(supuestos.envioVueltaFactor));
  const [perdida, setPerdida] = useState(t(supuestos.perdidaDevolucionPct));
  const [objetivo, setObjetivo] = useState(t(supuestos.margenObjetivoPct));
  const [comision, setComision] = useState<Record<MetodoPago, string>>(
    Object.fromEntries(METODOS_PAGO.map((m) => [m, t(supuestos.comisionPct[m])])) as Record<MetodoPago, string>,
  );
  const [fijos, setFijos] = useState<Record<string, string>>(
    Object.fromEntries(tiendas.map((x) => [x.id, supuestos.fijosPorTienda[x.id] === undefined ? "" : t(supuestos.fijosPorTienda[x.id])])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await guardarSupuestosUE({
            envioPorOrden: envio,
            envioVueltaFactor: vuelta,
            perdidaDevolucionPct: perdida,
            margenObjetivoPct: objetivo,
            comisionPct: comision,
            fijosPorTienda: fijos,
          }).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else {
            mostrarToast("Supuestos guardados");
            alTerminar();
            router.refresh();
          }
        });
      }}
    >
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-semibold">Envío y devoluciones</legend>
        <Numero etiqueta="Envío por pedido sin costo (US$)" valor={envio} alCambiar={setEnvio} ejemplo="Ej: 3.65" enfocar />
        <Numero etiqueta="Vuelta (× envío de ida)" valor={vuelta} alCambiar={setVuelta} ejemplo="Ej: 1" />
        <Numero etiqueta="Producto perdido (%)" valor={perdida} alCambiar={setPerdida} ejemplo="Ej: 10" />
        <Numero etiqueta="Margen objetivo (%)" valor={objetivo} alCambiar={setObjetivo} ejemplo="Ej: 15" />
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-semibold">Comisión de cobro (%)</legend>
        {METODOS_PAGO.map((m) => (
          <Numero key={m} etiqueta={ETIQUETA_METODO[m]} valor={comision[m]} alCambiar={(v) => setComision((c) => ({ ...c, [m]: v }))} ejemplo="Ej: 3.5" />
        ))}
      </fieldset>
      {tiendas.length > 0 && (
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-2 text-sm font-semibold">Fijos por mes (US$)</legend>
          {tiendas.map((x) => (
            <Numero key={x.id} etiqueta={x.nombre} valor={fijos[x.id] ?? ""} alCambiar={(v) => setFijos((f) => ({ ...f, [x.id]: v }))} ejemplo="Administración del libro" />
          ))}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pendiente}
        className={`inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
      >
        {pendiente ? "Guardando…" : "Guardar supuestos"}
      </button>
    </form>
  );
}
