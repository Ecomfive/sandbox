"use client";

import { useEffect, useState } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { formatearMoneda } from "@/lib/formato";
import { obtenerDesempeno, type DesempenoPais, type ProductoVendido } from "./actions";
import { nombrePais } from "./def-crm";

const PERIODOS = [
  { id: "7", etiqueta: "7 días", dias: 7 },
  { id: "14", etiqueta: "14 días", dias: 14 },
  { id: "30", etiqueta: "30 días", dias: 30 },
  { id: "365", etiqueta: "1 año", dias: 365 },
  { id: "custom", etiqueta: "Personalizado", dias: 0 },
] as const;

/** AAAA-MM-DD en la hora de quien mira (no en UTC: de noche «hoy» en UTC ya es mañana). */
const aIso = (d: Date) => d.toLocaleDateString("en-CA");
const haceDias = (n: number) => aIso(new Date(Date.now() - (n - 1) * 86_400_000));

const porcentaje = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 1000) / 10} %` : "—");

function Cifra({ titulo, valor, destacada }: { titulo: string; valor: string | number; destacada?: boolean }) {
  return (
    <div className={`rounded-lg border border-border px-2.5 py-2 ${destacada ? "bg-accent" : "bg-card"}`}>
      <div className="text-[11px] text-muted-foreground">{titulo}</div>
      <div className="text-base font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

/**
 * Lo que ha hecho el dropshipper en sus cuentas de plataforma vinculadas, en el período que se elija: guías (pedidos),
 * despachadas, entregadas, tasa de entrega, devueltas, canceladas, ventas entregadas y productos. Cada país va aparte
 * (otra moneda). Despachada = ya salió de la bodega; tasa de entrega = entregadas ÷ despachadas.
 */
export function DesempenoDropshipper({ dropshipperId, tieneCuentas }: { dropshipperId: string; tieneCuentas: boolean }) {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("30");
  const [desde, setDesde] = useState(() => haceDias(30));
  const [hasta, setHasta] = useState(() => aIso(new Date()));
  const [datos, setDatos] = useState<{ paises: DesempenoPais[]; productos: ProductoVendido[] } | "error" | null>(null);

  function elegir(id: (typeof PERIODOS)[number]["id"]) {
    setPeriodo(id);
    const p = PERIODOS.find((x) => x.id === id);
    if (p && p.dias > 0) {
      setDesde(haceDias(p.dias));
      setHasta(aIso(new Date()));
    }
  }

  useEffect(() => {
    if (!tieneCuentas || !desde || !hasta || desde > hasta) return;
    let vigente = true;
    obtenerDesempeno(dropshipperId, desde, hasta)
      .then((r) => vigente && setDatos("error" in r ? "error" : r))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [dropshipperId, desde, hasta, tieneCuentas]);

  if (!tieneCuentas) {
    return <p className="m-0 text-[13px] text-muted-foreground">Vincula una cuenta de la plataforma para ver sus guías y entregas.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Período" className="flex flex-wrap gap-1">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={periodo === p.id}
            onClick={() => elegir(p.id)}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${anilloFoco} ${
              periodo === p.id ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-accent"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      {periodo === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={fieldClassSm} />
          </label>
          <label className="flex items-center gap-1">
            Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={fieldClassSm} />
          </label>
        </div>
      )}

      {datos === null && <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>}
      {datos === "error" && (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          No se pudo cargar el desempeño.
        </p>
      )}
      {datos && datos !== "error" && (
        <>
          {datos.paises.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">Sin pedidos en este período.</p>
          ) : (
            datos.paises.map((p) => (
              <div key={p.codigoPais} className="flex flex-col gap-1.5">
                {datos.paises.length > 1 && <h5 className="m-0 text-xs font-semibold">{nombrePais(p.codigoPais)}</h5>}
                <div className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3">
                  <Cifra titulo="Guías" valor={p.pedidos} />
                  <Cifra titulo="Despachadas" valor={p.despachados} />
                  <Cifra titulo="Entregadas" valor={p.entregados} />
                  <Cifra titulo="Tasa de entrega" valor={porcentaje(p.entregados, p.despachados)} destacada />
                  <Cifra titulo="Devueltas" valor={p.devueltos} />
                  <Cifra titulo="Canceladas" valor={p.cancelados} />
                </div>
                <p className="m-0 text-xs text-muted-foreground tabular-nums">
                  Ventas entregadas: {formatearMoneda(p.ventas, p.codigoPais)}
                  {p.conNovedad > 0 ? ` · ${p.conNovedad} con novedad` : ""}
                </p>
              </div>
            ))
          )}
          {datos.productos.length > 0 && (
            <div>
              <h5 className="mb-1 mt-0 text-xs font-semibold">Productos vendidos</h5>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                {datos.productos.map((p) => (
                  <li key={`${p.producto}-${p.sku ?? ""}`} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">{p.producto}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {p.unidades} {p.unidades === 1 ? "unidad" : "unidades"} · {p.entregadas} entr.
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
