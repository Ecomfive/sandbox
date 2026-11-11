"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { ConfigPlan, LoteProducto } from "@/lib/finanzas/plan-compras";
import { guardarAjustesPlan, guardarLotePlan, llevarPlanAlPresupuesto } from "./actions";

const botonPrincipal = `inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;
const botonSecundario = `inline-flex h-8 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

function AvisoError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-center gap-1.5 text-xs">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
      {texto}
    </p>
  );
}

/** Meses del plan, anticipo, cuándo se paga el saldo y el lote mínimo general. «Guardar» aparece solo con un cambio. */
export function AjustesPlan({ config }: { config: ConfigPlan }) {
  const inicial = { meses: String(config.meses), anticipoPct: String(config.anticipoPct), saldoAl: config.saldoAl, loteMinimo: String(config.loteMinimo) };
  const [v, setV] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const cambio = (Object.keys(inicial) as (keyof typeof inicial)[]).some((k) => v[k].trim() !== inicial[k]);
  const campo = (k: "meses" | "anticipoPct" | "loteMinimo", etiqueta: string, ejemplo: string) => (
    <label className="flex flex-col gap-1">
      <span className={labelClassSm}>{etiqueta}</span>
      <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={`${fieldClassSm} w-24 text-right ${claseCifra}`} placeholder={ejemplo} />
    </label>
  );
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await guardarAjustesPlan(v).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else mostrarToast("Ajustes del plan guardados");
        });
      }}
    >
      {campo("meses", "Meses del plan", "Ej: 6")}
      {campo("anticipoPct", "Anticipo (%)", "Ej: 30")}
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Saldo</span>
        <select value={v.saldoAl} onChange={(e) => setV({ ...v, saldoAl: e.target.value === "llegada" ? "llegada" : "envio" })} className={`${fieldClassSm} w-36`}>
          <option value="envio">Al envío</option>
          <option value="llegada">A la llegada</option>
        </select>
      </label>
      {campo("loteMinimo", "Lote mínimo general", "Ej: 500")}
      {cambio && (
        <button type="submit" disabled={pendiente} className={botonPrincipal}>
          Guardar
        </button>
      )}
      <AvisoError texto={error} />
    </form>
  );
}

/** El lote mínimo, el múltiplo y la exclusión de un producto. */
export function LotePorProducto({ productos, lotes }: { productos: { skuId: string; codigo: string; producto: string }[]; lotes: Record<string, LoteProducto> }) {
  const [sku, setSku] = useState("");
  const [lote, setLote] = useState("");
  const [multiplo, setMultiplo] = useState("1");
  const [excluir, setExcluir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const elegir = (id: string) => {
    setSku(id);
    const l = lotes[id];
    setLote(l ? String(l.loteMinimo) : "");
    setMultiplo(l ? String(l.multiplo) : "1");
    setExcluir(l?.excluir ?? false);
    setError(null);
  };
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await guardarLotePlan(sku, { loteMinimo: lote.trim() || "0", multiplo: multiplo.trim() || "1", excluir }).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else mostrarToast("Lote guardado");
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Producto</span>
        <select value={sku} onChange={(e) => elegir(e.target.value)} className={`${fieldClassSm} w-72`}>
          <option value="">Elige un producto</option>
          {productos.map((p) => (
            <option key={p.skuId} value={p.skuId}>
              {p.codigo} {p.producto}
              {lotes[p.skuId] ? " ·" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Lote mínimo</span>
        <input inputMode="numeric" value={lote} onChange={(e) => setLote(e.target.value)} disabled={!sku} className={`${fieldClassSm} w-24 text-right ${claseCifra}`} placeholder="Ej: 300" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Múltiplo</span>
        <input inputMode="numeric" value={multiplo} onChange={(e) => setMultiplo(e.target.value)} disabled={!sku} className={`${fieldClassSm} w-20 text-right ${claseCifra}`} placeholder="Ej: 50" />
      </label>
      <label className="flex h-8 items-center gap-2 text-sm">
        <input type="checkbox" checked={excluir} onChange={(e) => setExcluir(e.target.checked)} disabled={!sku} />
        Fuera del plan
      </label>
      {sku && (
        <button type="submit" disabled={pendiente} className={botonPrincipal}>
          Guardar
        </button>
      )}
      <AvisoError texto={error} />
    </form>
  );
}

/** Lleva los pagos del plan al presupuesto de compras (lo que entra a la Proyección de caja), con confirmación. */
export function LlevarAlPresupuesto({ meses }: { meses: number }) {
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  if (!confirmar)
    return (
      <button type="button" className={botonSecundario} onClick={() => setConfirmar(true)}>
        Llevar al presupuesto de compras
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
        Reemplaza el presupuesto de compras de {meses} meses
      </span>
      <button
        type="button"
        disabled={pendiente}
        className={botonPrincipal}
        onClick={() => {
          setError(null);
          empezar(async () => {
            const r = await llevarPlanAlPresupuesto().catch(() => ({ error: "Se cortó la conexión." }) as { error?: string; meses?: number });
            if (r.error) setError(r.error);
            else {
              setConfirmar(false);
              mostrarToast(`Presupuesto de compras actualizado (${r.meses ?? 0} meses)`);
            }
          });
        }}
      >
        Reemplazar
      </button>
      <button type="button" className={botonSecundario} onClick={() => setConfirmar(false)}>
        Cancelar
      </button>
      <AvisoError texto={error} />
    </div>
  );
}
