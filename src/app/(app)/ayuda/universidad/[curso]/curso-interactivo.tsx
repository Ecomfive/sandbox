"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import type { CursoAlumno } from "@/lib/ayuda/cursos";
import { completarCurso } from "../../actions";

/**
 * El curso paso a paso: cada lección en su tarjeta con Anterior / Siguiente y, al final, el examen. La nota la pone el
 * servidor; aquí solo se ve qué preguntas se acertaron y si se aprobó. Se puede repetir.
 */
export function CursoInteractivo({ curso, aprobarDesde, completadoEn, mejorNota }: { curso: CursoAlumno; aprobarDesde: number; completadoEn: string | null; mejorNota: number | null }) {
  const total = curso.lecciones.length;
  const [paso, setPaso] = useState(0); // 0..total-1 lecciones, total = examen
  const [respuestas, setRespuestas] = useState<(number | null)[]>(() => curso.examen.map(() => null));
  const [resultado, setResultado] = useState<{ aprobado: boolean; puntaje: number; aciertos: boolean[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const enExamen = paso === total;

  function enviar() {
    setError(null);
    startTransition(async () => {
      const r = await completarCurso(curso.id, respuestas.map((x) => x ?? -1));
      if ("error" in r) setError(r.error);
      else setResultado(r);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {completadoEn && (
        <p className="m-0 rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="font-medium text-success">✓ Completado el {formatearFecha(completadoEn)}</span>
          {mejorNota !== null && <span className="text-muted-foreground"> · mejor nota {mejorNota} %. Puedes repasarlo cuando quieras.</span>}
        </p>
      )}

      <ol aria-label="Pasos del curso" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {[...curso.lecciones.map((l) => l.titulo), "Examen"].map((t, i) => (
          <li key={t}>
            <button
              type="button"
              onClick={() => setPaso(i)}
              aria-current={i === paso ? "step" : undefined}
              className={`rounded-full border px-3 py-1 text-xs ${anilloFoco} ${i === paso ? "border-primario bg-primario text-white" : i < paso ? "border-primario/40 bg-primario-suave text-primario" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
            >
              {i < total ? `${i + 1}. ${t}` : t}
            </button>
          </li>
        ))}
      </ol>

      {!enExamen ? (
        <article className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">
            {paso + 1}. {curso.lecciones[paso].titulo}
          </h2>
          {curso.lecciones[paso].parrafos.map((p) => (
            <p key={p} className="m-0 text-[15px] leading-relaxed">
              {p}
            </p>
          ))}
          <div className="mt-2 flex justify-between gap-2">
            <BotonBarra onClick={() => setPaso((x) => x - 1)} disabled={paso === 0}>
              Anterior
            </BotonBarra>
            <BotonBarra principal onClick={() => setPaso((x) => x + 1)}>
              {paso === total - 1 ? "Ir al examen" : "Siguiente"}
            </BotonBarra>
          </div>
        </article>
      ) : (
        <section aria-labelledby="examen" className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-5">
          <h2 id="examen" className="text-lg font-semibold">
            Examen <span className="text-sm font-normal text-muted-foreground">· se aprueba con {aprobarDesde} %</span>
          </h2>
          {curso.examen.map((p, i) => {
            const acierto = resultado?.aciertos[i];
            return (
              <fieldset key={p.pregunta} className="flex flex-col gap-1.5" disabled={pendiente}>
                <legend className="mb-1 text-sm font-medium">
                  {i + 1}. {p.pregunta}
                  {acierto !== undefined && <span className={`ml-2 text-xs ${acierto ? "text-success" : "text-destructive"}`}>{acierto ? "✓ Correcta" : "✗ Revisa esta"}</span>}
                </legend>
                {p.opciones.map((o, j) => (
                  <label key={o} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={`pregunta-${i}`}
                      checked={respuestas[i] === j}
                      onChange={() => {
                        setRespuestas((r) => r.map((x, k) => (k === i ? j : x)));
                        setResultado(null);
                      }}
                      className="mt-0.5"
                    />
                    {o}
                  </label>
                ))}
              </fieldset>
            );
          })}
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          {resultado && (
            <p role="status" className={`m-0 rounded-lg px-3 py-2 text-sm font-medium ${resultado.aprobado ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
              {resultado.aprobado ? `¡Aprobado con ${resultado.puntaje} %! El curso quedó completado.` : `Sacaste ${resultado.puntaje} %. Repasa las lecciones y vuelve a intentarlo.`}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <BotonBarra onClick={() => setPaso(total - 1)}>Volver a las lecciones</BotonBarra>
            {resultado?.aprobado ? (
              <Link href="/ayuda/universidad" className={`inline-flex h-[34px] items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`}>
                Ver mis cursos
              </Link>
            ) : (
              <BotonBarra principal onClick={enviar} disabled={pendiente || respuestas.some((x) => x === null)}>
                {pendiente ? "Revisando…" : "Enviar respuestas"}
              </BotonBarra>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
