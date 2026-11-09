"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dinero, porcentaje } from "@/lib/af4/formato";
import { explicarVariacion, guardarNotasCierre, registrarCuadre } from "../control-actions";

const usd = (v: number | null | undefined) => dinero(v, "USD", { decimales: 2 });
const conSigno = (v: number) => dinero(v, "USD", { decimales: 2, conSigno: true });

function AvisoError({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
      <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
      {texto}
    </p>
  );
}

const botonOscuro = `rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`;

// ---------------------------------------------------------------------------------------------
// Cuadres
// ---------------------------------------------------------------------------------------------
export interface VistaCuadre {
  clase: "inventario" | "cartera_dropi";
  titulo: string;
  etiquetaLibros: string;
  etiquetaSistema: string;
  guardado: { libros: number; sistema: number; diferencia: number; explicacion: string | null; registrado: string } | null;
  /** El lado del sistema calculado ahora (null si no se pudo leer). */
  sistemaActual: number | null;
  librosSugerido: number | null;
  /** Lo que forma el lado del sistema y otras referencias, ya formateado. */
  partes: { etiqueta: string; valor: string }[];
  pistas: string[];
  tolerancia: number;
}

function TarjetaCuadre({ periodo, c, editable }: { periodo: string; c: VistaCuadre; editable: boolean }) {
  const [libros, setLibros] = useState(c.guardado ? String(c.guardado.libros) : c.librosSugerido !== null ? String(c.librosSugerido) : "");
  const [explicacion, setExplicacion] = useState(c.guardado?.explicacion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const g = c.guardado;
  const fuera = g ? Math.abs(g.diferencia) > c.tolerancia + 0.005 : false;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await registrarCuadre(periodo, c.clase, libros, explicacion);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast("Cuadre registrado");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`cuadre-${c.clase}`} className="flex min-w-0 flex-1 basis-80 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h3 id={`cuadre-${c.clase}`} className="m-0 flex items-center gap-2 text-sm font-semibold">
        {g && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${fuera && !g.explicacion ? "bg-warning" : "bg-success"}`} />}
        {c.titulo}
      </h3>
      {g && (
        <dl className="m-0 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className={labelClassSm}>{c.etiquetaLibros}</dt>
            <dd className="m-0 tabular-nums">{usd(g.libros)}</dd>
          </div>
          <div>
            <dt className={labelClassSm}>{c.etiquetaSistema}</dt>
            <dd className="m-0 tabular-nums">{usd(g.sistema)}</dd>
          </div>
          <div>
            <dt className={labelClassSm}>Diferencia</dt>
            <dd className={`m-0 font-medium tabular-nums ${fuera ? "text-destructive" : ""}`}>{conSigno(g.diferencia)}</dd>
          </div>
          <p className="col-span-3 m-0 text-xs text-muted-foreground">Registrado {g.registrado}</p>
        </dl>
      )}
      {c.partes.length > 0 && (
        <dl className="m-0 flex flex-col gap-1 border-t border-border pt-2 text-xs">
          {c.partes.map((p) => (
            <div key={p.etiqueta} className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{p.etiqueta}</dt>
              <dd className="m-0 tabular-nums">{p.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {c.pistas.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
          {c.pistas.map((p) => (
            <li key={p} className="flex items-start gap-1.5">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              {p}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form onSubmit={guardar} className="flex flex-col gap-2 border-t border-border pt-3">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>{c.etiquetaLibros} (USD)</span>
            <input
              value={libros}
              onChange={(e) => setLibros(e.target.value)}
              inputMode="decimal"
              placeholder="Ej: 25000.00"
              className={fieldClassSm}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Explicación de la diferencia</span>
            <textarea value={explicacion} onChange={(e) => setExplicacion(e.target.value)} rows={2} maxLength={2000} placeholder="Ej: mercancía en tránsito que el WMS todavía no recibe" className={fieldClassSm} />
          </label>
          <AvisoError texto={error} />
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{c.sistemaActual !== null ? `${c.etiquetaSistema}: ${usd(c.sistemaActual)}` : ""}</span>
            <button type="submit" disabled={enviando} aria-busy={enviando} className={botonOscuro}>
              {enviando ? "Guardando..." : g ? "Volver a cuadrar" : "Registrar cuadre"}
            </button>
          </span>
        </form>
      )}
    </section>
  );
}

export function CuadresCierre({ periodo, cuadres, editable }: { periodo: string; cuadres: VistaCuadre[]; editable: boolean }) {
  return (
    <div className="flex flex-wrap gap-4">
      {cuadres.map((c) => (
        <TarjetaCuadre key={c.clase} periodo={periodo} c={c} editable={editable} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Variaciones
// ---------------------------------------------------------------------------------------------
export interface VistaVariacion {
  clave: string;
  etiqueta: string;
  tipo: "seccion" | "detalle" | "resultado";
  actual: number;
  anterior: number;
  diferencia: number;
  pct: number | null;
  supera: boolean;
  explicacion: string | null;
}

function FilaVariacion({ periodo, l, editable }: { periodo: string; l: VistaVariacion; editable: boolean }) {
  const [texto, setTexto] = useState(l.explicacion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const cambio = texto.trim() !== (l.explicacion ?? "").trim();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await explicarVariacion(periodo, l.clave, texto);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(texto.trim() ? "Explicación guardada" : "Explicación quitada");
      router.refresh();
    });
  }

  const falta = l.supera && !l.explicacion;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 text-sm ${l.tipo === "detalle" ? "" : "font-medium"}`}>
          {l.supera && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${falta ? "bg-destructive" : "bg-success"}`} />}
          {l.etiqueta}
          {falta && <span className="sr-only"> (falta la explicación)</span>}
        </span>
        <span className="flex flex-wrap gap-x-4 text-xs tabular-nums text-muted-foreground">
          <span>Anterior {usd(l.anterior)}</span>
          <span className="text-foreground">Actual {usd(l.actual)}</span>
          <span className="text-foreground">
            {conSigno(l.diferencia)}
            {l.pct !== null ? ` (${porcentaje(l.pct, { conSigno: true })})` : ""}
          </span>
        </span>
      </div>
      {l.supera &&
        (editable ? (
          <form onSubmit={guardar} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <label className="flex flex-1 flex-col gap-1">
              <span className="sr-only">Explicación de la variación de {l.etiqueta}</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Ej: campaña de lanzamiento en la tienda principal"
                className={fieldClass}
              />
            </label>
            <button type="submit" disabled={enviando || !cambio} aria-busy={enviando} className={`${botonOscuro} shrink-0`}>
              {enviando ? "Guardando..." : "Guardar"}
            </button>
          </form>
        ) : (
          l.explicacion && <p className="m-0 text-xs text-muted-foreground">«{l.explicacion}»</p>
        ))}
      <AvisoError texto={error} />
    </li>
  );
}

export function VariacionesCierre({ periodo, lineas, editable }: { periodo: string; lineas: VistaVariacion[]; editable: boolean }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? lineas : lineas.filter((l) => l.supera);
  return (
    <div className="flex flex-col">
      {visibles.length ? (
        <ul className="m-0 list-none divide-y divide-border p-0">
          {visibles.map((l) => (
            <FilaVariacion key={l.clave} periodo={periodo} l={l} editable={editable} />
          ))}
        </ul>
      ) : (
        <p className="m-0 px-4 py-3 text-sm text-muted-foreground">Ninguna línea supera el umbral.</p>
      )}
      <div className="border-t border-border px-4 py-2">
        <button type="button" aria-pressed={todas} onClick={() => setTodas(!todas)} className={`text-xs text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
          {todas ? "Ver solo las que superan el umbral" : `Ver todas las líneas (${lineas.length})`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------------------------------
export function NotasCierre({ periodo, notas, editable }: { periodo: string; notas: string | null; editable: boolean }) {
  const [texto, setTexto] = useState(notas ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  if (!editable) return <p className="m-0 px-4 py-3 text-sm whitespace-pre-line">{notas || "Sin notas."}</p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await guardarNotasCierre(periodo, texto);
          if (r.error) return setError(r.error);
          mostrarToast("Notas guardadas");
          router.refresh();
        });
      }}
      className="flex flex-col gap-2 p-4"
    >
      <label className="flex flex-col gap-1">
        <span className="sr-only">Notas del cierre</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} placeholder="Ej: el proveedor de empaques facturó dos meses juntos" className={fieldClass} />
      </label>
      <AvisoError texto={error} />
      <span className="flex justify-end">
        <button type="submit" disabled={enviando || texto.trim() === (notas ?? "").trim()} aria-busy={enviando} className={botonOscuro}>
          {enviando ? "Guardando..." : "Guardar notas"}
        </button>
      </span>
    </form>
  );
}
