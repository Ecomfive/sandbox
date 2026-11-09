"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaHora } from "@/lib/af4/fecha";
import { dinero, entero, numero, porcentaje, SIN_DATO } from "@/lib/af4/formato";
import {
  CATEGORIAS_RIESGO,
  DEF_INDICADORES,
  ETIQUETA_CATEGORIA,
  ETIQUETA_NIVEL,
  INDICADORES_RIESGO,
  TONO_NIVEL,
  type NivelRiesgo,
  type RiesgoEvaluado,
  type UnidadIndicador,
} from "@/lib/finanzas/riesgos";
import { EstadoIcon, PersonaIcon, AlertaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { desactivarRiesgo, evaluarRiesgosAhora, guardarRiesgo } from "./actions";

export interface CambioHistorial {
  id: string;
  riesgoId: string;
  antes: NivelRiesgo | null;
  despues: NivelRiesgo;
  probabilidad: number;
  impacto: number;
  valor: number | null;
  origen: "auto" | "manual";
  fecha: string;
}

const num = `text-right whitespace-nowrap ${claseCifra}`;
const botonPrincipal = `inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;
const botonSecundario = `inline-flex h-8 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

export function valorIndicador(u: UnidadIndicador, v: number | null): string {
  if (v === null) return SIN_DATO;
  if (u === "porcentaje") return porcentaje(v);
  if (u === "semanas") return `${numero(v, 1)} sem`;
  if (u === "dinero") return dinero(v);
  return entero(v);
}

export function InsigniaNivel({ nivel }: { nivel: NivelRiesgo }) {
  const tono = TONO_NIVEL[nivel];
  return <Badge tone={tono === "neutral" ? "info" : tono}>{ETIQUETA_NIVEL[nivel]}</Badge>;
}

const DEF: DefTabla<RiesgoEvaluado> = {
  clave: "capital-riesgos",
  campos: [
    { id: "nombre", etiqueta: "Riesgo", tipo: "texto", valor: (r) => `${r.nombre} ${r.dueno ?? ""}` },
    { id: "nivel", etiqueta: "Nivel", tipo: "seleccion", valores: (r) => [ETIQUETA_NIVEL[r.nivel]], agrupable: true },
    { id: "categoria", etiqueta: "Categoría", tipo: "seleccion", valores: (r) => [ETIQUETA_CATEGORIA[r.categoria]], agrupable: true },
    { id: "dueno", etiqueta: "Dueño", tipo: "seleccion", valores: (r) => [r.dueno ?? "Sin dueño"], agrupable: true },
    { id: "fuente", etiqueta: "Probabilidad", tipo: "seleccion", valores: (r) => [r.fuente === "indicador" ? "Por indicador" : "Manual"], agrupable: true },
    { id: "puntaje", etiqueta: "Puntaje", tipo: "numero", valor: (r) => r.puntaje },
  ],
};

const COLUMNAS: ColumnaTabla<RiesgoEvaluado, null>[] = [
  {
    id: "nombre",
    label: "Riesgo",
    ocultable: false,
    clase: "max-w-xs",
    render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        {r.cambio === "sube" && <span aria-label="Subió desde la última evaluación" role="img" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
        <span className="line-clamp-2">{r.nombre}</span>
      </span>
    ),
  },
  { id: "nivel", label: "Nivel", ocultable: false, render: (r) => <InsigniaNivel nivel={r.nivel} /> },
  { id: "pi", label: "P × I", ocultable: false, clase: num, render: (r) => `${r.probabilidad} × ${r.impacto} = ${r.puntaje}` },
  {
    id: "indicador",
    label: "Indicador vivo",
    ocultable: true,
    clase: "max-w-xs",
    render: (r) =>
      r.indicador ? (
        <span className="line-clamp-2">
          <span className={claseCifra}>{valorIndicador(DEF_INDICADORES[r.indicador].unidad, r.valor)}</span>{" "}
          <span className="text-muted-foreground">{r.valor === null ? (r.notaIndicador ?? "Sin dato") : DEF_INDICADORES[r.indicador].etiqueta}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Manual</span>
      ),
  },
  { id: "categoria", label: "Categoría", ocultable: true, render: (r) => ETIQUETA_CATEGORIA[r.categoria] },
  { id: "dueno", label: "Dueño", ocultable: true, render: (r) => r.dueno ?? SIN_DATO },
  { id: "mitigacion", label: "Mitigación", ocultable: true, oculta: true, clase: "max-w-md", render: (r) => <span className="line-clamp-2">{r.mitigacion ?? SIN_DATO}</span> },
];

const ICONOS: Record<string, IconoComp> = { nombre: AlertaIcon, nivel: EstadoIcon, categoria: EstadoIcon, dueno: PersonaIcon, fuente: EstadoIcon, puntaje: EstadoIcon };
const NOMBRE: NombreFilas = { singular: "riesgo", plural: "riesgos" };

export function TablaRiesgos({ riesgos, historial, escribe }: { riesgos: RiesgoEvaluado[]; historial: CambioHistorial[]; escribe: boolean }) {
  const [abierto, setAbierto] = useState<string | "nuevo" | null>(null);
  const actual = abierto && abierto !== "nuevo" ? (riesgos.find((r) => r.id === abierto) ?? null) : null;
  return (
    <>
      <TablaDatos
        def={DEF}
        filas={riesgos}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(r) => r.id}
        ariaLabel="Matriz de riesgos financieros"
        anchoMinimo="56rem"
        vacio="No hay riesgos en la matriz."
        abrirFila={{ etiqueta: (r) => `Abrir ${r.nombre}`, alAbrir: (r) => setAbierto(r.id) }}
        accionPrincipal={escribe ? <BotonAgregar onClick={() => setAbierto("nuevo")} /> : undefined}
      />
      <Ventana
        abierto={abierto !== null}
        alCerrar={() => setAbierto(null)}
        lado="derecha"
        ancho="lg"
        titulo={actual ? actual.nombre : "Nuevo riesgo"}
      >
        {abierto !== null && (
          <FichaRiesgo
            key={abierto}
            riesgo={actual}
            historial={actual ? historial.filter((h) => h.riesgoId === actual.id) : []}
            escribe={escribe}
            alTerminar={() => setAbierto(null)}
          />
        )}
      </Ventana>
    </>
  );
}

function FichaRiesgo({ riesgo, historial, escribe, alTerminar }: { riesgo: RiesgoEvaluado | null; historial: CambioHistorial[]; escribe: boolean; alTerminar: () => void }) {
  const [indicador, setIndicador] = useState<string>(riesgo?.indicador ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const [quitar, setQuitar] = useState(false);
  const { mostrarToast } = useToast();
  const def = indicador ? DEF_INDICADORES[indicador as keyof typeof DEF_INDICADORES] : null;
  const umbrales = riesgo?.umbrales ?? null;
  return (
    <div className="flex flex-col gap-5">
      {riesgo && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <InsigniaNivel nivel={riesgo.nivel} />
          <span className={claseCifra}>
            Probabilidad {riesgo.probabilidad} ({riesgo.fuente === "indicador" ? "por indicador" : "manual"}) × impacto {riesgo.impacto} = {riesgo.puntaje}
          </span>
          {riesgo.indicador && (
            <span className="text-muted-foreground">
              {DEF_INDICADORES[riesgo.indicador].etiqueta}: <span className={`text-foreground ${claseCifra}`}>{valorIndicador(DEF_INDICADORES[riesgo.indicador].unidad, riesgo.valor)}</span>
              {riesgo.valor === null && riesgo.notaIndicador ? ` · ${riesgo.notaIndicador}` : ""}
            </span>
          )}
        </div>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!escribe) return;
          const fd = new FormData(e.currentTarget);
          const datos = Object.fromEntries(fd.entries());
          setError(null);
          empezar(async () => {
            const r = await guardarRiesgo(riesgo?.id ?? null, datos).catch(() => ({ error: "Se cortó la conexión." }));
            if (r.error) setError(r.error);
            else {
              mostrarToast(riesgo ? "Riesgo guardado" : "Riesgo agregado");
              alTerminar();
            }
          });
        }}
      >
        <fieldset disabled={!escribe} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Riesgo *</span>
            <input name="nombre" required defaultValue={riesgo?.nombre ?? ""} data-enfocar className={fieldClassSm} placeholder="Ej: Dependencia de un proveedor" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Categoría</span>
              <select name="categoria" defaultValue={riesgo?.categoria ?? "otro"} className={fieldClassSm}>
                {CATEGORIAS_RIESGO.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Probabilidad manual (1–5)</span>
              <select name="probabilidad" defaultValue={String(riesgo?.probabilidadManual ?? 3)} className={fieldClassSm}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Impacto (1–5)</span>
              <select name="impacto" defaultValue={String(riesgo?.impacto ?? 3)} className={fieldClassSm}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Dueño</span>
            <input name="dueno" defaultValue={riesgo?.dueno ?? ""} className={fieldClassSm} placeholder="Ej: Gerencia financiera" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Descripción</span>
            <textarea name="descripcion" rows={2} defaultValue={riesgo?.descripcion ?? ""} className={fieldClassSm} placeholder="Ej: Qué puede pasar y qué golpea" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Plan de mitigación</span>
            <textarea name="mitigacion" rows={3} defaultValue={riesgo?.mitigacion ?? ""} className={fieldClassSm} placeholder="Ej: Homologar un segundo proveedor" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Indicador vivo</span>
            <select name="indicador" value={indicador} onChange={(e) => setIndicador(e.target.value)} className={fieldClassSm}>
              <option value="">Ninguno (probabilidad manual)</option>
              {INDICADORES_RIESGO.map((k) => (
                <option key={k} value={k}>
                  {DEF_INDICADORES[k].etiqueta}
                </option>
              ))}
            </select>
          </label>
          {def && (
            <fieldset className="flex flex-col gap-1">
              <legend className={labelClassSm}>
                Umbrales que suben la probabilidad a 2, 3, 4 y 5 ({def.sentido === "mayor_peor" ? "de menor a mayor" : "de mayor a menor"}) · {def.fuente}
              </legend>
              <div className="flex flex-wrap gap-2">
                {[0, 1, 2, 3].map((k) => (
                  <input
                    key={`${indicador}-${k}`}
                    name={`umbral${k + 1}`}
                    inputMode="decimal"
                    aria-label={`Umbral para probabilidad ${k + 2}`}
                    defaultValue={riesgo?.indicador === indicador && umbrales ? String(umbrales[k]) : ""}
                    placeholder={String(def.umbrales[k])}
                    className={`${fieldClassSm} w-24 text-right ${claseCifra}`}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
            {error}
          </p>
        )}
        {escribe && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pendiente} className={botonPrincipal}>
              {riesgo ? "Guardar cambios" : "Agregar riesgo"}
            </button>
            {riesgo &&
              (quitar ? (
                <>
                  <button
                    type="button"
                    disabled={pendiente}
                    className={botonSecundario}
                    onClick={() =>
                      empezar(async () => {
                        const r = await desactivarRiesgo(riesgo.id).catch(() => ({ error: "Se cortó la conexión." }));
                        if (r.error) setError(r.error);
                        else {
                          mostrarToast("Riesgo quitado de la matriz");
                          alTerminar();
                        }
                      })
                    }
                  >
                    Confirmar quitar
                  </button>
                  <button type="button" className={botonSecundario} onClick={() => setQuitar(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" className={botonSecundario} onClick={() => setQuitar(true)}>
                  Quitar de la matriz
                </button>
              ))}
          </div>
        )}
      </form>
      {riesgo && (
        <section aria-labelledby="historial-riesgo" className="flex flex-col gap-2">
          <h3 id="historial-riesgo" className="text-sm font-semibold">
            Cambios de nivel
          </h3>
          {historial.length ? (
            <ol className="flex flex-col gap-1.5 text-sm">
              {historial.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2">
                  <span className={`text-muted-foreground ${claseCifra}`}>{fechaHora(h.fecha)}</span>
                  {h.antes ? <InsigniaNivel nivel={h.antes} /> : <span className="text-muted-foreground">Inicio</span>}
                  <span aria-hidden="true">→</span>
                  <InsigniaNivel nivel={h.despues} />
                  <span className={`text-muted-foreground ${claseCifra}`}>
                    {h.probabilidad} × {h.impacto}
                    {h.valor !== null && riesgo.indicador ? ` · ${valorIndicador(DEF_INDICADORES[riesgo.indicador].unidad, h.valor)}` : ""} · {h.origen === "auto" ? "automático" : "manual"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Sin cambios guardados todavía.</p>
          )}
        </section>
      )}
    </div>
  );
}

/** «Evaluar ahora»: lo mismo que la tarea diaria (historial y alertas). */
export function BotonEvaluar() {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <button
      type="button"
      disabled={pendiente}
      className={botonSecundario}
      onClick={() =>
        empezar(async () => {
          const r = await evaluarRiesgosAhora().catch(() => ({ error: "Se cortó la conexión." }) as { error?: string; cambios?: number });
          mostrarToast(r.error ? r.error : `Matriz evaluada: ${r.cambios ?? 0} cambios de nivel`, r.error ? "destructive" : undefined);
        })
      }
    >
      {pendiente ? "Evaluando…" : "Evaluar ahora"}
    </button>
  );
}
