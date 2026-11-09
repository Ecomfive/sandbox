"use client";

import { useMemo, useState, useTransition } from "react";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { useToast } from "@/components/ui/toast";
import { guardarNotaTraslado } from "./actions";

export interface FilaTraslado {
  id: string;
  numero: string;
  fecha: string;
  desde: string;
  hacia: string;
  quien: string | null;
  notas: string;
  lineas: { codigo: string; nombre: string; foto: string | null; numero: number | null; barras: string | null; cantidad: number; cajas: string | null }[];
}

const fechaHora = (f: string) => new Date(f).toLocaleString("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function NotaTraslado({ fila, puedeEscribir }: { fila: FilaTraslado; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [nota, setNota] = useState(fila.notas);
  const [pendiente, empezar] = useTransition();
  if (!puedeEscribir) return fila.notas ? <p className="m-0 text-sm [overflow-wrap:anywhere]">{fila.notas}</p> : null;
  return (
    <label className="flex flex-col gap-1">
      <span className={labelClassSm}>Notas</span>
      <textarea
        value={nota}
        rows={2}
        maxLength={500}
        disabled={pendiente}
        onChange={(e) => setNota(e.target.value)}
        onBlur={() => {
          if (nota.trim() === fila.notas) return;
          empezar(async () => {
            const r = await guardarNotaTraslado(fila.id, nota).catch(() => ({ error: "No se pudo guardar la nota." }));
            mostrarToast(r.error ?? "Nota guardada", r.error ? "destructive" : undefined);
          });
        }}
        placeholder="Ej: traslado del 7 nov, número 0042, lo llevó Luis"
        className={`${fieldClassSm} h-auto w-full py-1.5`}
      />
    </label>
  );
}

function Traslado({ t, puedeEscribir }: { t: FilaTraslado; puedeEscribir: boolean }) {
  const unidades = t.lineas.reduce((s, l) => s + l.cantidad, 0);
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <b className="font-semibold tabular-nums">{t.numero}</b>
        <span className="inline-flex min-w-0 items-center gap-2 font-medium">
          <span>{t.desde}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            →
          </span>
          <span className="sr-only">hacia</span>
          <span>{t.hacia}</span>
        </span>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {t.lineas.length} {t.lineas.length === 1 ? "producto" : "productos"} · {unidades.toLocaleString("es-PA")} unidades
        </span>
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        {fechaHora(t.fecha)}
        {t.quien ? ` · ${t.quien}` : ""}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {t.lineas.map((l) => (
          <li key={l.codigo} className="flex items-center gap-2.5 text-sm">
            <MiniaturaFoto url={l.foto} nombre={l.nombre} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{l.nombre}</span>
              <span className="block truncate text-xs text-muted-foreground">{l.codigo}</span>
              <CodigosProducto numero={l.numero} barras={l.barras} className="block" />
              {l.cajas && <span className="block text-xs text-muted-foreground">{l.cajas}</span>}
            </span>
            <span className="font-medium tabular-nums">{l.cantidad.toLocaleString("es-PA")}</span>
          </li>
        ))}
      </ul>
      <NotaTraslado fila={t} puedeEscribir={puedeEscribir} />
    </li>
  );
}

/** El historial de traslados: qué se movió, de dónde a dónde, cuándo, quién y sus notas. El filtro muestra lo que entró o salió de una bodega. */
export function ListaTraslados({ filas, bodegas, puedeEscribir }: { filas: FilaTraslado[]; bodegas: string[]; puedeEscribir: boolean }) {
  const [bodega, setBodega] = useState("");
  const visibles = useMemo(() => (bodega ? filas.filter((f) => f.desde === bodega || f.hacia === bodega) : filas), [filas, bodega]);
  return (
    <div className="flex flex-col gap-4">
      <label className="flex w-fit flex-col gap-1">
        <span className={labelClassSm}>Ver una bodega</span>
        <select value={bodega} onChange={(e) => setBodega(e.target.value)} className={`${fieldClassSm} min-w-48`}>
          <option value="">Todas</option>
          {bodegas.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      {visibles.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{filas.length ? "Esa bodega no tiene traslados." : "Todavía no hay traslados. Crea uno con «Nuevo traslado»."}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          {visibles.map((t) => (
            <Traslado key={t.id} t={t} puedeEscribir={puedeEscribir} />
          ))}
        </ul>
      )}
    </div>
  );
}
