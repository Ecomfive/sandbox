"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import Link from "next/link";
import { useState, useTransition } from "react";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DECISIONES, type Decision } from "@/lib/compras/sin-stock";
import { revisarAlertaSinStock } from "./actions";

export interface AlertaSinStock {
  id: string;
  nombre: string;
  skuId: string | null;
  codigo: string | null;
  foto: string | null;
  dropiIds: string[];
  detectadaEn: string;
  estado: "abierta" | "revisada" | "cerrada";
  decision: Decision | null;
  nota: string | null;
  revisadaPor: string | null;
  revisadaEn: string | null;
  cerradaEn: string | null;
  enCamino: number;
  cotizando: number;
}

const VISTAS = [
  { valor: "abierta", etiqueta: "Por revisar" },
  { valor: "revisada", etiqueta: "Revisadas" },
  { valor: "cerrada", etiqueta: "Volvió el stock" },
] as const;

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PA", {
    day: "numeric",
    month: "short",
    timeZone: "America/Panama",
  });
const entero = (n: number) => n.toLocaleString("es-PA");
const decisionDe = (d: Decision | null) => DECISIONES.find((x) => x.valor === d)?.etiqueta ?? null;

/**
 * Compras › Sin stock: las alertas de los productos que se quedaron sin stock en Dropi (migración 0167). «Por revisar» las nuevas; Compras
 * revisa el inventario manual y anota qué decidió (Revisar: Comprar, Hay inventario manual o No reponer, con una nota). Cuando Dropi le
 * vuelve a ver unidades al producto, la alerta se cierra sola y pasa a «Volvió el stock».
 */
export function ListaSinStock({ alertas, pais, puedeEscribir }: { alertas: AlertaSinStock[]; pais: string; puedeEscribir: boolean }) {
  const [vista, setVista] = useState<AlertaSinStock["estado"]>("abierta");
  const visibles = alertas.filter((a) => a.estado === vista);
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Qué alertas ver" className="flex flex-wrap items-center gap-2">
        {VISTAS.map((v) => {
          const n = alertas.filter((a) => a.estado === v.valor).length;
          const activa = vista === v.valor;
          return (
            <button
              key={v.valor}
              type="button"
              aria-pressed={activa}
              onClick={() => setVista(v.valor)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${anilloFoco} ${activa ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"}`}
            >
              {v.valor === "abierta" && n > 0 && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${activa ? "bg-background" : "bg-warning"}`} />}
              {v.etiqueta}
              <span className="tabular-nums opacity-70">{entero(n)}</span>
            </button>
          );
        })}
      </div>
      {visibles.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
          {vista === "abierta"
            ? `Nada por revisar en ${pais}: ningún producto se quedó sin stock en Dropi.`
            : vista === "revisada"
              ? "Ninguna alerta revisada que siga sin stock."
              : "Ningún producto volvió a tener stock en los últimos 30 días."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {visibles.map((a) => (
            <FilaAlerta key={a.id} a={a} puedeEscribir={puedeEscribir} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaAlerta({ a, puedeEscribir }: { a: AlertaSinStock; puedeEscribir: boolean }) {
  const puedeProducto = usePuedeAbrir("producto");
  const [revisando, setRevisando] = useState(false);
  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        {a.foto ? (
          <img src={a.foto} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover" />
        ) : (
          <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-border" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">
            {a.skuId && puedeProducto ? (
              <Link href={`/producto?abrir=${a.skuId}`} className="underline-offset-2 hover:underline">
                {a.nombre}
              </Link>
            ) : (
              a.nombre
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {a.codigo ? <span className="font-mono">{a.codigo}</span> : "Sin producto vinculado"} · ID{a.dropiIds.length > 1 ? "s" : ""} de Dropi{" "}
            {a.dropiIds.join(", ")}
          </span>
          <span className="text-sm text-muted-foreground">
            {a.estado === "cerrada" && a.cerradaEn
              ? `Sin stock desde el ${fecha(a.detectadaEn)} · volvió el ${fecha(a.cerradaEn)}`
              : `Sin stock desde el ${fecha(a.detectadaEn)}`}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
          {a.enCamino > 0 ? (
            <span className="font-medium text-success tabular-nums">{entero(a.enCamino)} en camino</span>
          ) : (
            <span className="text-muted-foreground">Nada en camino</span>
          )}
          {a.cotizando > 0 && <span className="text-warning tabular-nums">{entero(a.cotizando)} por cotizar</span>}
        </div>
      </div>
      {a.decision && (
        <p className="m-0 rounded-lg bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">{decisionDe(a.decision)}</span>
          {a.nota && <span> · {a.nota}</span>}
          <span className="text-muted-foreground">
            {" "}
            — {a.revisadaPor ?? "Alguien"}
            {a.revisadaEn ? `, ${fecha(a.revisadaEn)}` : ""}
          </span>
        </p>
      )}
      {puedeEscribir &&
        a.estado !== "cerrada" &&
        (revisando ? (
          <Revisar a={a} alTerminar={() => setRevisando(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setRevisando(true)}
            className={`self-start rounded-lg border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}
          >
            {a.decision ? "Cambiar la revisión" : "Revisar"}
          </button>
        ))}
    </li>
  );
}

function Revisar({ a, alTerminar }: { a: AlertaSinStock; alTerminar: () => void }) {
  const { mostrarToast } = useToast();
  const [decision, setDecision] = useState<Decision | null>(a.decision);
  const [nota, setNota] = useState(a.nota ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  function guardar() {
    if (!decision) return setError("Elige qué se decidió.");
    setError(null);
    empezar(async () => {
      const r = await revisarAlertaSinStock(a.id, decision, nota).catch(() => ({
        error: "No se pudo. Inténtalo de nuevo.",
      }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Revisión guardada");
        alTerminar();
      }
    });
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div role="radiogroup" aria-label={`Qué se decidió con ${a.nombre}`} className="flex flex-wrap gap-2">
        {DECISIONES.map((d) => (
          <button
            key={d.valor}
            type="button"
            role="radio"
            aria-checked={decision === d.valor}
            onClick={() => setDecision(d.valor)}
            className={`min-h-9 rounded-lg border px-3 text-sm font-medium ${anilloFoco} ${decision === d.valor ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}
          >
            {d.etiqueta}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Nota</span>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Ej: hay 40 unidades en bodega; se pide la OC esta semana"
          className={`${fieldClass} w-full`}
        />
      </label>
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className={`rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
        >
          {pendiente ? "Guardando..." : "Guardar revisión"}
        </button>
        <button
          type="button"
          onClick={alTerminar}
          disabled={pendiente}
          className={`rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
