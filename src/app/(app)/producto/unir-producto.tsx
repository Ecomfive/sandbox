"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { AlertaIcon } from "@/lib/nav-icons";
import type { CandidatoUnir, ProductoUnido, ResumenUnion } from "@/lib/wms/unir-productos";
import { ETIQUETA_CLASE, numeroProducto, TONO_CLASE } from "./def-producto";
import { buscarParaUnir, simularUnion, unirProductos, type OpcionesUnion } from "./unir-actions";

function Miniatura({ foto }: { foto: string | null }) {
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
  ) : (
    <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border" />
  );
}

/**
 * Un producto de la unión, con lo que le pasa: se queda o se elimina. El rol va escrito, no solo en color. En el que se elimina, «Que se quede este»
 * (23 nov 2026: el más viejo no siempre es el bueno; Lentes Smart era más viejo que el TR90 y era el que sobraba).
 */
function FilaResultado({ rol, p, alQuedarse, bloqueado }: { rol: "queda" | "elimina"; p: ProductoUnido; alQuedarse?: () => void; bloqueado?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <Miniatura foto={p.foto} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${rol === "queda" ? "bg-success" : "bg-destructive"}`} />
          {rol === "queda" ? "Se queda" : "Se elimina"}
        </p>
        <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">
          {numeroProducto(p.numero)} · {p.codigo}
        </p>
        <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{p.nombre}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={TONO_CLASE[p.clase] ?? "neutral"}>{ETIQUETA_CLASE[p.clase] ?? p.clase}</Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{formatearFecha(p.creado)}</span>
        {alQuedarse && (
          <button type="button" onClick={alQuedarse} disabled={bloqueado} className={`inline-flex min-h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Que se quede este
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Unir el producto abierto con su duplicado (28 oct 2026, solo administradores): se busca el otro, se ve qué se movería (la base lo
 * simula sin cambiar nada) y solo entonces se puede unir. De entrada se queda el más viejo y recibe todo lo del otro; «Que se quede este» lo cambia
 * (23 nov 2026). Con variantes, cada variante del que se va se une con su pareja (propuesta por graduación o nombre, se puede cambiar) o pasa como nueva. Si la base se niega (variantes, otro tipo o lotes que chocan, por ejemplo), dice por qué. Desde la migración 0260 el stock, los
 * movimientos, lotes y cajas del sobrante pasan al que queda.
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
  // Lo elegido para la unión: cuál se queda y las parejas de variantes. `vigente` = el resumen corresponde a lo elegido (si la última revisión
  // falló, el resumen anterior sigue a la vista pero no se puede unir).
  const [opciones, setOpciones] = useState<OpcionesUnion>({});
  const [vigente, setVigente] = useState(false);
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

  function revisar(c: CandidatoUnir, o: OpcionesUnion) {
    const turno = ++turnoSimulacion.current;
    setOpciones(o);
    setVigente(false);
    setErrorUnion(null);
    setCalculando(true);
    simularUnion(producto.id, c.id, o)
      .catch(() => ({ error: "No se pudo revisar la unión." }))
      .then((r) => {
        if (turno !== turnoSimulacion.current) return;
        setCalculando(false);
        if ("error" in r) setErrorUnion(r.error);
        else {
          setResumen(r);
          setVigente(true);
          // Lo que la base va a hacer: el que queda y las parejas que de verdad se usan.
          setOpciones({ conservar: r.conservar.id, pares: r.variantes ? Object.fromEntries(r.variantes.va.map((v) => [v.id, v.pareja])) : null });
        }
      });
  }

  function elegir(c: CandidatoUnir) {
    setElegido(c);
    setResumen(null);
    revisar(c, {});
  }

  /** El otro se queda: las parejas se vuelven a proponer (las variantes cambian de lado). */
  function quedarseCon(id: string) {
    if (elegido) revisar(elegido, { conservar: id, pares: null });
  }

  function cambiarPareja(varianteId: string, pareja: string | null) {
    if (elegido) revisar(elegido, { conservar: opciones.conservar ?? null, pares: { ...(opciones.pares ?? {}), [varianteId]: pareja } });
  }

  function cambiar() {
    turnoSimulacion.current++;
    setElegido(null);
    setResumen(null);
    setOpciones({});
    setVigente(false);
    setErrorUnion(null);
    setCalculando(false);
  }

  function unir() {
    if (!elegido || !resumen || !vigente || uniendo) return;
    setErrorUnion(null);
    startUnir(async () => {
      const r = await unirProductos(producto.id, elegido.id, opciones).catch(() => ({ error: "No se pudo unir. Inténtalo de nuevo." }));
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
                <FilaResultado rol="elimina" p={resumen.eliminar} alQuedarse={() => quedarseCon(resumen.eliminar.id)} bloqueado={uniendo || calculando} />
                {resumen.variantes && resumen.variantes.va.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <h4 className="m-0 text-xs font-medium text-muted-foreground">Variantes de {resumen.eliminar.codigo}: con cuál de {resumen.conservar.codigo} se une cada una</h4>
                    <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0">
                      {resumen.variantes.va.map((v) => (
                        <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                          <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
                            {v.codigo}
                            {v.nombre && v.nombre !== v.codigo ? <span className="text-xs text-muted-foreground"> · {v.nombre}</span> : null}
                          </span>
                          <select
                            aria-label={`Pareja de ${v.codigo}`}
                            value={v.pareja ?? ""}
                            disabled={uniendo || calculando}
                            onChange={(e) => cambiarPareja(v.id, e.target.value || null)}
                            className={`min-h-8 max-w-[16rem] rounded-md border border-border-control bg-card px-2 text-xs ${anilloFoco}`}
                          >
                            <option value="">Pasar como variante nueva</option>
                            {resumen.variantes!.queda.map((q) => (
                              <option key={q.id} value={q.id}>
                                Unir con {q.codigo}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
            disabled={!resumen || !vigente || calculando || uniendo}
            className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
          >
            {uniendo ? "Uniendo…" : "Unir productos"}
          </button>
        </div>
      </div>
    </Ventana>
  );
}
