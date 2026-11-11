"use client";

import { useMemo, useState } from "react";
import { BotonCrear } from "@/components/ui/boton-crear";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { claseCifra } from "@/components/af4/estilos-af4";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { CopiarIcon } from "@/lib/nav-icons";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { prepararPegado, type FilaPegada } from "@/lib/finanzas/movimiento-manual";
import { guardarPegado, terminarPegado } from "./movimiento-actions";

/** El mismo tamaño de lote que acepta el servidor (`TAMANO_LOTE`). */
const LOTE = 400;
/** Cuántas filas se dibujan en la vista previa (las que tienen error o aviso van primero). */
const VISIBLES = 200;

const PUNTO: Record<FilaPegada["estado"], string> = { ok: "bg-success", aviso: "bg-warning", error: "bg-destructive" };
const ESTADO: Record<FilaPegada["estado"], string> = { ok: "Lista", aviso: "Con aviso", error: "Con error" };
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

/**
 * «Pegar desde Excel»: Majo copia filas de su libro (con la fila de títulos de la hoja) y las pega aquí. Se leen con la
 * misma lógica que la importación, se ven fila por fila con sus errores y avisos, y se guardan las que están bien
 * (origen «pegado»: no se borra nada y pegar dos veces lo mismo no lo duplica).
 */
export function PegarExcel({ tiendas, tipos, cuentas }: { tiendas: Opcion[]; tipos: Opcion[]; cuentas: Opcion[] }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState<{ hechos: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mostrarToast } = useToast();

  const catalogos = useMemo(
    () => ({ tiendas: tiendas.map((t) => t.nombre).concat("SIN ASIGNAR"), tipos: tipos.map((t) => t.nombre), cuentas: cuentas.map((c) => c.nombre) }),
    [tiendas, tipos, cuentas],
  );
  const lectura = useMemo(() => (texto.trim() ? prepararPegado(texto, catalogos) : null), [texto, catalogos]);
  const filas = lectura?.filas ?? [];
  const aGuardar = filas.filter((f) => f.mov);
  const conteo = { ok: 0, aviso: 0, error: 0 };
  for (const f of filas) conteo[f.estado]++;
  const ordenadas = [...filas].sort((a, b) => (a.estado === b.estado ? a.fila - b.fila : a.estado === "error" ? -1 : b.estado === "error" ? 1 : a.estado === "aviso" ? -1 : 1));

  function abrir() {
    setTexto("");
    setError(null);
    setAbierto(true);
  }

  async function guardar() {
    if (!aGuardar.length || guardando) return;
    setError(null);
    let guardados = 0;
    let rechazados = 0;
    setGuardando({ hechos: 0 });
    for (let i = 0; i < aGuardar.length; i += LOTE) {
      const r = await guardarPegado(aGuardar.slice(i, i + LOTE).map((f) => f.mov)).catch(() => ({ error: "No se pudo guardar." }));
      if ("error" in r) {
        setError(`Se guardaron ${guardados} de ${aGuardar.length} y falló un lote: ${r.error}. Puedes volver a intentarlo: lo ya guardado no se duplica.`);
        setGuardando(null);
        return;
      }
      guardados += r.guardados + r.conservados;
      rechazados += r.rechazados;
      setGuardando({ hechos: Math.min(i + LOTE, aGuardar.length) });
    }
    const meses = [...new Set(aGuardar.map((f) => f.mov!.periodo.slice(0, 7)))].sort();
    await terminarPegado({ guardados, meses }).catch(() => undefined);
    setGuardando(null);
    setAbierto(false);
    mostrarToast(rechazados ? `${entero(guardados)} movimientos guardados, ${entero(rechazados)} rechazados` : `${entero(guardados)} movimientos guardados`);
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={abrir}
        className={`inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco} !rounded-md`}
      >
        <CopiarIcon className="h-4 w-4" />
        Pegar desde Excel
      </button>

      <Ventana abierto={abierto} alCerrar={() => !guardando && setAbierto(false)} lado="derecha" ancho="lg" titulo={<span className="text-lg font-semibold">Pegar filas desde Excel</span>}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
          aria-busy={!!guardando}
          className="flex flex-1 flex-col"
        >
          <div className="flex flex-1 flex-col gap-4 p-5">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Filas copiadas del libro, con la fila de títulos</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={6}
                data-enfocar
                disabled={!!guardando}
                spellCheck={false}
                placeholder={"MES\tFECHA INCLUSIÓN\tTIENDA\tTIPO\t…\tUSD\n10-2026\t03/10/2026\tNUVO PAN\tSISTEMAS\t…\t120.00"}
                className={`${fieldClass} w-full resize-y font-mono text-xs`}
              />
            </label>

            {lectura?.error && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                {lectura.error}
              </p>
            )}

            {filas.length > 0 && (
              <section aria-labelledby="titulo-vista-previa" className="rounded-xl border border-border bg-card">
                <h3 id="titulo-vista-previa" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  {(["ok", "aviso", "error"] as const).map((e) => (
                    <span key={e} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO[e]}`} />
                      {entero(conteo[e])} {ESTADO[e].toLowerCase()}
                    </span>
                  ))}
                  <span className={`ml-auto ${claseCifra}`}>{usd(aGuardar.reduce((a, f) => a + f.mov!.monto, 0))}</span>
                </h3>
                {lectura?.sinTitulos && (
                  <p className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                    Sin fila de títulos: se tomó el orden de columnas de la hoja del libro.
                  </p>
                )}
                <div className="max-h-[50vh] overflow-auto">
                  <table className="w-full text-xs">
                    <caption className="sr-only">Vista previa de las filas pegadas</caption>
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-left text-muted-foreground">
                        <th scope="col" className="px-3 py-1.5 font-medium">Fila</th>
                        <th scope="col" className="px-3 py-1.5 font-medium">Mes</th>
                        <th scope="col" className="px-3 py-1.5 font-medium">Tienda</th>
                        <th scope="col" className="px-3 py-1.5 font-medium">Tipo</th>
                        <th scope="col" className="px-3 py-1.5 font-medium">Descripción</th>
                        <th scope="col" className="px-3 py-1.5 text-right font-medium">USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenadas.slice(0, VISIBLES).map((f) => (
                        <tr key={f.fila} className="border-t border-border/60 align-top">
                          <th scope="row" className="px-3 py-1.5 text-left font-normal whitespace-nowrap">
                            <span className="flex items-center gap-1.5">
                              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO[f.estado]}`} />
                              {f.fila}
                              <span className="sr-only"> ({ESTADO[f.estado]})</span>
                            </span>
                          </th>
                          <td className="px-3 py-1.5 whitespace-nowrap">{f.resumen.mes || "—"}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{f.resumen.tienda || "—"}</td>
                          <td className="px-3 py-1.5">{f.resumen.tipo || "—"}</td>
                          <td className="px-3 py-1.5">
                            <span className="line-clamp-2">{f.resumen.descripcion || "—"}</span>
                            {f.mensajes.length > 0 && <span className="mt-0.5 block text-muted-foreground">{f.mensajes.join(" · ")}</span>}
                          </td>
                          <td className={`px-3 py-1.5 text-right whitespace-nowrap ${claseCifra}`}>{f.mov ? usd(f.mov.monto) : f.resumen.monto || SIN_DATO}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ordenadas.length > VISIBLES && (
                    <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                      Se ven {VISIBLES} de {ordenadas.length} filas.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>

          <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-card p-4" aria-live="polite">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {guardando && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className="h-full bg-foreground transition-[width]" style={{ width: `${(100 * guardando.hechos) / Math.max(aGuardar.length, 1)}%` }} />
              </div>
            )}
            <BotonCrear
              puede={aGuardar.length > 0}
              enviando={!!guardando}
              etiqueta={aGuardar.length ? `Guardar ${aGuardar.length} movimiento${aGuardar.length === 1 ? "" : "s"}` : "Guardar movimientos"}
              etiquetaEnviando={`Guardando ${guardando?.hechos ?? 0} de ${aGuardar.length}...`}
              alPulsarSinCompletar={() => undefined}
            />
          </div>
        </form>
      </Ventana>
    </>
  );
}
