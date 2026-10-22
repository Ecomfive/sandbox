"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CheckIcon, SugerenciaIcon } from "@/lib/nav-icons";
import type { ProveedorConsumo } from "@/lib/ia/precios";
import type { DiaConsumo, Desglose, EstadoSaldo, ResumenProveedor } from "@/lib/ia/saldo";
import { guardarUmbralIA, registrarCreditoIA } from "./consumo-actions";

export interface DatosConsumo {
  /** false si falta la migración 0134. */
  disponible: boolean;
  puedeEscribir: boolean;
  proveedores: {
    proveedor: ProveedorConsumo;
    etiqueta: string;
    estado: EstadoSaldo;
    saldoUsd: number | null;
    gastadoDesdeUsd: number;
    desde: string | null;
    umbralUsd: number;
    mes: ResumenProveedor;
  }[];
  dias: DiaConsumo[];
  porOperacion: Desglose[];
  porPersona: Desglose[];
  ultimos: { proveedor: ProveedorConsumo; operacion: string; modelo: string | null; persona: string | null; costoUsd: number; ok: boolean; creadoEn: string }[];
  creditos: { proveedor: ProveedorConsumo; tipo: "saldo" | "recarga"; montoUsd: number; nota: string | null; persona: string | null; creadoEn: string }[];
}

const usd = (n: number) => (Math.abs(n) < 1 && n !== 0 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });

const ESTADO: Record<EstadoSaldo, { texto: string; tono: Tone; barra: string }> = {
  ok: { texto: "Crédito al día", tono: "success", barra: "bg-success" },
  por_acabarse: { texto: "Por acabarse", tono: "warning", barra: "bg-warning" },
  agotado: { texto: "Agotado", tono: "destructive", barra: "bg-destructive" },
  sin_registro: { texto: "Sin saldo registrado", tono: "neutral", barra: "bg-border-control" },
};

/** El color de cada proveedor en la gráfica y su leyenda. */
const COLOR: Record<ProveedorConsumo, string> = { openai: "bg-azul", gemini: "bg-primario", anthropic: "bg-warning" };

const botonClaro = `inline-flex h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;

function Bloque({ titulo, children, className = "" }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`}>
      <h2 className="m-0 text-sm font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

/** El crédito de un proveedor: saldo estimado, gasto del mes y, con permiso, el formulario para registrar saldo o recarga y el aviso. */
function TarjetaProveedor({ p, puedeEscribir, disponible }: { p: DatosConsumo["proveedores"][number]; puedeEscribir: boolean; disponible: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [tipo, setTipo] = useState<"saldo" | "recarga">(p.estado === "sin_registro" ? "saldo" : "recarga");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [umbral, setUmbral] = useState(String(p.umbralUsd));
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  const e = ESTADO[p.estado];
  const base = p.saldoUsd === null ? 0 : p.saldoUsd + p.gastadoDesdeUsd;
  const fraccion = p.saldoUsd === null || base <= 0 ? 0 : Math.max(0, Math.min(1, p.saldoUsd / base));
  const editable = puedeEscribir && disponible;

  function registrar(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await registrarCreditoIA({ proveedor: p.proveedor, tipo, monto, nota }).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) return setError(r.error);
      setMonto("");
      setNota("");
      mostrarToast(tipo === "saldo" ? "Saldo registrado" : "Recarga registrada");
      router.refresh();
    });
  }

  function guardarAviso() {
    setError(null);
    empezar(async () => {
      const r = await guardarUmbralIA(p.proveedor, umbral).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) return setError(r.error);
      mostrarToast("Aviso guardado");
      router.refresh();
    });
  }

  return (
    <section aria-label={`Crédito de ${p.etiqueta}`} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2.5 text-base font-semibold">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primario-suave text-primario">
            <SugerenciaIcon className="h-4 w-4" />
          </span>
          {p.etiqueta}
          <span className="text-xs font-normal text-muted-foreground">{p.proveedor === "gemini" ? "imágenes" : "texto"}</span>
        </h2>
        <Badge tone={e.tono}>{e.texto}</Badge>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl leading-none font-semibold tabular-nums ${p.estado === "agotado" ? "text-destructive" : p.estado === "por_acabarse" ? "text-warning" : ""}`}>{p.saldoUsd === null ? "—" : usd(p.saldoUsd)}</span>
          <span className="text-xs text-muted-foreground">{p.saldoUsd === null ? "Registra el saldo para ver cuánto queda" : `saldo estimado${p.desde ? ` · desde el ${fecha(p.desde)}` : ""}`}</span>
        </div>
        <div role="progressbar" aria-label={`Crédito restante de ${p.etiqueta}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraccion * 100)} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${e.barra}`} style={{ width: `${fraccion * 100}%` }} />
        </div>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Este mes</dt>
          <dd className="m-0 font-semibold tabular-nums">{usd(p.mes.costoUsd)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Usos</dt>
          <dd className="m-0 font-semibold tabular-nums">
            {p.mes.llamadas}
            {p.mes.errores > 0 && <span className="text-xs font-normal text-destructive"> · {p.mes.errores} con error</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{p.proveedor === "gemini" ? "Imágenes" : "Tokens"}</dt>
          <dd className="m-0 font-semibold tabular-nums">{(p.proveedor === "gemini" ? p.mes.imagenes : p.mes.tokens).toLocaleString("es-PA")}</dd>
        </div>
      </dl>

      {editable && (
        <div className="flex flex-col gap-3">
          <form onSubmit={registrar} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Registrar</span>
                <select value={tipo} onChange={(ev) => setTipo(ev.target.value as "saldo" | "recarga")} className={`${fieldClass} w-40`}>
                  <option value="saldo">Saldo de hoy</option>
                  <option value="recarga">Recarga</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Monto (US$)</span>
                <input value={monto} onChange={(ev) => setMonto(ev.target.value)} inputMode="decimal" required placeholder="Ej: 20.00" className={`${fieldClass} w-28 tabular-nums`} />
              </label>
              <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                <span className={labelClassSm}>Nota (opcional)</span>
                <input value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={200} placeholder="Ej: recarga de octubre" className={`${fieldClass} w-full`} />
              </label>
              <button type="submit" disabled={guardando || !monto.trim()} className={botonOscuro}>
                <CheckIcon aria-hidden="true" className="h-4 w-4" />
                Guardar
              </button>
            </div>
          </form>
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Avisar cuando queden menos de (US$)</span>
              <input value={umbral} onChange={(ev) => setUmbral(ev.target.value)} inputMode="decimal" className={`${fieldClass} w-28 tabular-nums`} />
            </label>
            <button type="button" disabled={guardando || umbral.trim() === String(p.umbralUsd)} onClick={guardarAviso} className={botonClaro}>
              Guardar aviso
            </button>
          </div>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      {!editable && <p className="m-0 text-xs text-muted-foreground">Aviso: cuando queden menos de {usd(p.umbralUsd)}.</p>}
    </section>
  );
}

/** El gasto de los últimos días, una barra por día repartida por proveedor. */
function Grafica({ dias, proveedores }: { dias: DiaConsumo[]; proveedores: DatosConsumo["proveedores"] }) {
  const max = Math.max(0.01, ...dias.map((d) => d.total));
  const total = dias.reduce((s, d) => s + d.total, 0);
  return (
    <Bloque titulo="Gasto de los últimos 30 días">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
          {proveedores.map((p) => (
            <li key={p.proveedor} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${COLOR[p.proveedor]}`} />
              {p.etiqueta}
            </li>
          ))}
        </ul>
        <span className="tabular-nums">
          Total: <span className="font-semibold text-foreground">{usd(total)}</span>
        </span>
      </div>
      <div role="img" aria-label={`Gasto por día de los últimos 30 días; en total ${usd(total)}`} className="flex h-36 items-end gap-1">
        {dias.map((d) => (
          <div key={d.dia} title={`${fecha(`${d.dia}T12:00:00Z`)}: ${usd(d.total)}`} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: `${(d.total / max) * 100}%`, minHeight: d.total > 0 ? 3 : 0 }}>
              {proveedores.map((p) => {
                const v = d.porProveedor[p.proveedor] ?? 0;
                return v > 0 ? <span key={p.proveedor} className={COLOR[p.proveedor]} style={{ height: `${(v / d.total) * 100}%` }} /> : null;
              })}
            </div>
            {d.total === 0 && <span className="h-0.5 w-full rounded-full bg-border" />}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{fecha(`${dias[0]?.dia}T12:00:00Z`)}</span>
        <span>hoy</span>
      </div>
    </Bloque>
  );
}

function TablaDesglose({ titulo, filas, vacio }: { titulo: string; filas: Desglose[]; vacio: string }) {
  const max = Math.max(0.0001, ...filas.map((f) => f.costoUsd));
  return (
    <Bloque titulo={titulo}>
      {filas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {filas.slice(0, 8).map((f) => (
            <li key={f.clave} className="flex flex-col gap-1 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{f.clave}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{usd(f.costoUsd)}</span>
                  <span className="text-xs text-muted-foreground"> · {f.usos} {f.usos === 1 ? "uso" : "usos"}</span>
                </span>
              </div>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="barra-neon h-full rounded-full" style={{ width: `${(f.costoUsd / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}

export function PanelConsumo({ datos }: { datos: DatosConsumo }) {
  const alertas = datos.proveedores.filter((p) => p.estado === "por_acabarse" || p.estado === "agotado");
  const etiquetaDe = (p: ProveedorConsumo) => datos.proveedores.find((x) => x.proveedor === p)?.etiqueta ?? p;
  return (
    <div className="flex flex-col gap-6">
      {!datos.disponible && (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Para ver y anotar el consumo falta correr en Supabase la migración 0134.
        </p>
      )}
      {alertas.map((p) => (
        <p key={p.proveedor} role="alert" className={`m-0 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${p.estado === "agotado" ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning"}`}>
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.estado === "agotado" ? "bg-destructive" : "bg-warning"}`} />
          {p.estado === "agotado" ? `El crédito de ${p.etiqueta} se agotó: recárgalo para que siga funcionando.` : `El crédito de ${p.etiqueta} está por acabarse: quedan unos ${usd(p.saldoUsd ?? 0)} (aviso con menos de ${usd(p.umbralUsd)}).`}
        </p>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        {datos.proveedores.map((p) => (
          <TarjetaProveedor key={p.proveedor} p={p} puedeEscribir={datos.puedeEscribir} disponible={datos.disponible} />
        ))}
      </div>

      <Grafica dias={datos.dias} proveedores={datos.proveedores} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TablaDesglose titulo="Este mes, por uso" filas={datos.porOperacion} vacio="Todavía no se ha usado la IA este mes." />
        <TablaDesglose titulo="Este mes, por persona" filas={datos.porPersona} vacio="Todavía no se ha usado la IA este mes." />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Bloque titulo="Últimos usos">
          {datos.ultimos.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Sin usos todavía.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {datos.ultimos.map((u, i) => (
                <li key={`${u.creadoEn}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 truncate font-medium">
                      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${COLOR[u.proveedor]}`} />
                      {u.operacion}
                      <span className="text-xs font-normal text-muted-foreground">{etiquetaDe(u.proveedor)}</span>
                      {!u.ok && <Badge tone="destructive">Con error</Badge>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {u.persona ?? "Sin nombre"} · {fechaHora(u.creadoEn)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{usd(u.costoUsd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
        <Bloque titulo="Saldos y recargas registrados">
          {datos.creditos.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Todavía no se registró ninguno.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {datos.creditos.map((c, i) => (
                <li key={`${c.creadoEn}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">
                      {etiquetaDe(c.proveedor)} · {c.tipo === "saldo" ? "saldo" : "recarga"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.persona ?? "Sin nombre"} · {fecha(c.creadoEn)}
                      {c.nota ? ` · ${c.nota}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{usd(c.montoUsd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>
      </div>
      <p className="m-0 text-xs text-muted-foreground">Los costos son estimados con los precios públicos de cada proveedor: ni OpenAI ni Gemini los devuelven. El saldo es lo último que se registró menos lo gastado desde entonces.</p>
    </div>
  );
}
