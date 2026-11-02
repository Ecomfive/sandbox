"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { AlertaIcon } from "@/lib/nav-icons";
import type { CandidatoUnir, ProductoUnido, ResumenUnion } from "@/lib/wms/unir-productos";
import { ETIQUETA_CLASE, numeroProducto, TONO_CLASE } from "./def-producto";
import { buscarParaUnir, simularUnion, unirProductos } from "./unir-actions";

function Miniatura({ foto }: { foto: string | null }) {
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border" />
  );
}

/** Un producto de la unión, con lo que le pasa: se queda (el más viejo) o se elimina. El rol va escrito, no solo en color. */
function FilaResultado({ rol, p }: { rol: "queda" | "elimina"; p: ProductoUnido }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Miniatura foto={p.foto} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${rol === "queda" ? "bg-success" : "bg-destructive"}`} />
          {rol === "queda" ? "Se queda (el más viejo)" : "Se elimina"}
        </p>
        <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">
          {numeroProducto(p.numero)} · {p.codigo}
        </p>
        <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.nombre}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={TONO_CLASE[p.clase] ?? "neutral"}>{ETIQUETA_CLASE[p.clase] ?? p.clase}</Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{formatearFecha(p.creado)}</span>
      </div>
    </div>
  );
}

/**
 * Unir el producto abierto con su duplicado (28 oct 2026, solo administradores): se busca el otro, se ve qué se movería (la base lo
 * simula sin cambiar nada) y solo entonces se puede unir. Siempre se queda el más viejo y recibe todo lo del otro; el servidor lo decide
 * y lo vuelve a comprobar al unir. Si la base se niega (el sobrante tiene stock o movimientos, por ejemplo), dice por qué.
 */
export function UnirProducto({
  producto,
  alCerrar,
  alUnido,
}: {
  producto: { id: string; numero: number | null; codigo: string; nombre: string; foto: string | null };
  alCerrar: () => void;
  alUnido: (r: ResumenUnion) => void;
}) {
  const id = useId();
  const [consulta, setConsulta] = useState("");
  const [candidatos, setCandidatos] = useState<CandidatoUnir[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [elegido, setElegido] = useState<CandidatoUnir | null>(null);
  const [resumen, setResumen] = useState<ResumenUnion | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [errorUnion, setErrorUnion] = useState<string | null>(null);
  const [uniendo, startUnir] = useTransition();
  // Cada búsqueda y cada simulación lleva su turno: una respuesta que llega tarde (de algo que ya se cambió) se ignora.
  const turnoBusqueda = useRef(0);
  const turnoSimulacion = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  function alEscribir(valor: string) {
    setConsulta(valor);
    clearTimeout(temporizador.current);
    const turno = ++turnoBusqueda.current;
    if (valor.trim().length < 2) {
      setCandidatos(null);
      setBuscando(false);
      setErrorBusqueda(null);
      return;
    }
    setBuscando(true);
    temporizador.current = setTimeout(async () => {
      const r = await buscarParaUnir(producto.id, valor).catch(() => ({ error: "No se pudo buscar." }));
      if (turno !== turnoBusqueda.current) return;
      setBuscando(false);
      if ("error" in r) {
        setErrorBusqueda(r.error);
        setCandidatos(null);
      } else {
        setErrorBusqueda(null);
        setCandidatos(r.candidatos);
      }
    }, 250);
  }

  function elegir(c: CandidatoUnir) {
    const turno = ++turnoSimulacion.current;
    setElegido(c);
    setResumen(null);
    setErrorUnion(null);
    setCalculando(true);
    simularUnion(producto.id, c.id)
      .catch(() => ({ error: "No se pudo revisar la unión." }))
      .then((r) => {
        if (turno !== turnoSimulacion.current) return;
        setCalculando(false);
        if ("error" in r) setErrorUnion(r.error);
        else setResumen(r);
      });
  }

  function cambiar() {
    turnoSimulacion.current++;
    setElegido(null);
    setResumen(null);
    setErrorUnion(null);
    setCalculando(false);
  }

  function unir() {
    if (!elegido || !resumen || uniendo) return;
    setErrorUnion(null);
    startUnir(async () => {
      const r = await unirProductos(producto.id, elegido.id).catch(() => ({ error: "No se pudo unir. Inténtalo de nuevo." }));
      if ("error" in r) setErrorUnion(r.error);
      else alUnido(r);
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Unir con otro producto" ancho="md">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Miniatura foto={producto.foto} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="m-0 text-xs font-medium text-muted-foreground">Producto abierto</p>
            <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">
              {numeroProducto(producto.numero)} · {producto.codigo}
            </p>
            <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{producto.nombre}</p>
          </div>
        </div>

        {!elegido ? (
          <div className="flex flex-col gap-3">
            <label htmlFor={`${id}-buscar`} className={`flex flex-col gap-1.5 ${labelClass}`}>
              Buscar el duplicado
              <input
                id={`${id}-buscar`}
                data-enfocar
                value={consulta}
                onChange={(e) => alEscribir(e.target.value)}
                autoComplete="off"
                placeholder="Ej: polvo, POLVO/DENTAL o 141"
                className={`${fieldClass} w-full font-normal`}
              />
            </label>
            {buscando && (
              <p role="status" className="m-0 text-sm text-muted-foreground">
                Buscando…
              </p>
            )}
            {errorBusqueda && (
              <p role="alert" className="m-0 text-sm text-destructive">
                {errorBusqueda}
              </p>
            )}
            {!buscando && candidatos && candidatos.length === 0 && <p className="m-0 text-sm text-muted-foreground">Ningún producto coincide.</p>}
            {!buscando && candidatos && candidatos.length > 0 && (
              <ul className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-y-auto p-0">
                {candidatos.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => elegir(c)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg border border-border bg-card p-2 text-left hover:bg-muted ${anilloFoco}`}>
                      <Miniatura foto={c.foto} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium [overflow-wrap:anywhere]">
                          {numeroProducto(c.numero)} · {c.codigo}
                        </span>
                        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.nombre}</span>
                      </span>
                      <Badge tone={TONO_CLASE[c.clase] ?? "neutral"}>{ETIQUETA_CLASE[c.clase] ?? c.clase}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-semibold">Unir con</h3>
              <button type="button" onClick={cambiar} disabled={uniendo} className={`inline-flex min-h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                Elegir otro
              </button>
            </div>
            {!resumen && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <Miniatura foto={elegido.foto} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">
                    {numeroProducto(elegido.numero)} · {elegido.codigo}
                  </p>
                  <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{elegido.nombre}</p>
                </div>
              </div>
            )}
            {calculando && (
              <p role="status" className="m-0 text-sm text-muted-foreground">
                Revisando qué se movería…
              </p>
            )}
            {errorUnion && (
              <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
                {errorUnion}
              </p>
            )}
            {resumen && (
              <>
                <FilaResultado rol="queda" p={resumen.conservar} />
                <FilaResultado rol="elimina" p={resumen.eliminar} />
                <div className="flex flex-col gap-1.5">
                  <h4 className="m-0 text-xs font-medium text-muted-foreground">Pasa al que se queda</h4>
                  {resumen.lineas.length > 0 ? (
                    <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-sm">
                      {resumen.lineas.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="m-0 text-sm">No tenía nada vinculado.</p>
                  )}
                </div>
                <p className="m-0 flex items-center gap-2 text-sm font-medium text-destructive">
                  <AlertaIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  No se puede deshacer.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} disabled={uniendo} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={unir}
            disabled={!resumen || uniendo}
            className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
          >
            {uniendo ? "Uniendo…" : "Unir productos"}
          </button>
        </div>
      </div>
    </Ventana>
  );
}
