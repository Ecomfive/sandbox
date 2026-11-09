"use client";

import { useMemo, useState, useTransition } from "react";
import { claseCifra, claseSigno } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { fechaHora, mesCorto, sumarMeses } from "@/lib/af4/fecha";
import { dinero, fraccion, numero, SIN_DATO } from "@/lib/af4/formato";
import type { Proyecto } from "@/lib/finanzas/cargar-capital";
import {
  ETIQUETA_ESTADO_PROYECTO,
  ETIQUETA_PERIODICIDAD,
  evaluar,
  PASOS_SENSIBILIDAD,
  seguimiento,
  sensibilidad,
  type EstadoProyecto,
  type PeriodoFlujo,
  type Periodicidad,
} from "@/lib/finanzas/evaluacion-proyectos";
import { CalendarioIcon, EstadoIcon, GastoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { decidirProyecto, eliminarProyecto, guardarAjustesCapital, guardarProyecto, guardarRealesProyecto } from "../actions";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const botonPrincipal = `inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;
const botonSecundario = `inline-flex h-8 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const TONO_ESTADO: Record<EstadoProyecto, "neutral" | "success" | "destructive"> = { borrador: "neutral", aprobado: "success", rechazado: "destructive" };
const tasaFraccion = (t: number) => t / 100;

export interface FilaProyecto extends Proyecto {
  tasaUsada: number;
  van: number;
  tirAnual: number | null;
  multiplesTir: boolean;
  payback: number | null;
  indice: number | null;
  inversion: number;
}

const unidad = (p: Periodicidad) => (p === "mes" ? "meses" : "años");
const textoPayback = (v: number | null, p: Periodicidad) => (v === null ? "No se recupera" : `${numero(v, 1)} ${unidad(p)}`);
const textoTir = (v: number | null, multiples: boolean) => (v === null ? "Sin TIR" : `${fraccion(v)}${multiples ? " (varias)" : ""}`);

const DEF: DefTabla<FilaProyecto> = {
  clave: "capital-proyectos",
  campos: [
    { id: "nombre", etiqueta: "Proyecto", tipo: "texto", valor: (p) => p.nombre },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (p) => [ETIQUETA_ESTADO_PROYECTO[p.estado]], agrupable: true },
    { id: "conviene", etiqueta: "VAN", tipo: "seleccion", valores: (p) => [p.van > 0 ? "VAN positivo" : "VAN negativo"], agrupable: true },
    { id: "creado", etiqueta: "Creado", tipo: "fecha", valor: (p) => p.creadoEn.slice(0, 10) },
    { id: "van", etiqueta: "VAN", tipo: "numero", valor: (p) => p.van },
  ],
};

const COLUMNAS: ColumnaTabla<FilaProyecto, null>[] = [
  { id: "nombre", label: "Proyecto", ocultable: false, clase: "max-w-xs", render: (p) => <span className="line-clamp-2">{p.nombre}</span> },
  { id: "estado", label: "Estado", ocultable: false, render: (p) => <Badge tone={TONO_ESTADO[p.estado]}>{ETIQUETA_ESTADO_PROYECTO[p.estado]}</Badge> },
  { id: "inversion", label: "Inversión", ocultable: false, clase: num, render: (p) => dinero(p.inversion) },
  { id: "van", label: "VAN", ocultable: false, clase: `${num} font-medium`, render: (p) => <span className={claseSigno(p.van)}>{dinero(p.van)}</span> },
  { id: "tir", label: "TIR anual", ocultable: false, clase: num, render: (p) => textoTir(p.tirAnual, p.multiplesTir) },
  { id: "payback", label: "Payback", ocultable: true, clase: num, render: (p) => textoPayback(p.payback, p.periodicidad) },
  { id: "indice", label: "Índice de rentabilidad", ocultable: true, clase: num, render: (p) => (p.indice === null ? SIN_DATO : numero(p.indice, 2)) },
  { id: "tasa", label: "Tasa", ocultable: true, clase: num, render: (p) => `${numero(p.tasaUsada, 1)} %` },
];

const ICONOS: Record<string, IconoComp> = { nombre: ProductoIcon, estado: EstadoIcon, conviene: GastoIcon, creado: CalendarioIcon, van: GastoIcon };
const NOMBRE: NombreFilas = { singular: "proyecto", plural: "proyectos" };

export function ListaProyectos({ filas, tasaPortal, escribe }: { filas: FilaProyecto[]; tasaPortal: number; escribe: boolean }) {
  const [abierto, setAbierto] = useState<string | "nuevo" | null>(null);
  const actual = abierto && abierto !== "nuevo" ? (filas.find((f) => f.id === abierto) ?? null) : null;
  return (
    <>
      <TablaDatos
        def={DEF}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(p) => p.id}
        ariaLabel="Proyectos evaluados"
        anchoMinimo="52rem"
        vacio="Todavía no hay proyectos."
        abrirFila={{ etiqueta: (p) => `Abrir ${p.nombre}`, alAbrir: (p) => setAbierto(p.id) }}
        accionPrincipal={escribe ? <BotonAgregar onClick={() => setAbierto("nuevo")} /> : undefined}
      />
      <Ventana abierto={abierto !== null} alCerrar={() => setAbierto(null)} lado="derecha" ancho="lg" titulo={actual ? actual.nombre : "Nuevo proyecto"}>
        {abierto !== null && <FichaProyecto key={abierto} proyecto={actual} tasaPortal={tasaPortal} escribe={escribe} alTerminar={() => setAbierto(null)} />}
      </Ventana>
    </>
  );
}

type Texto = { inversion: string; ingresos: string; costos: string; capitalTrabajo: string };
const vacio = (): Texto => ({ inversion: "", ingresos: "", costos: "", capitalTrabajo: "" });
const aTexto = (p: PeriodoFlujo | null): Texto =>
  p ? { inversion: p.inversion ? String(p.inversion) : "", ingresos: p.ingresos ? String(p.ingresos) : "", costos: p.costos ? String(p.costos) : "", capitalTrabajo: p.capitalTrabajo ? String(p.capitalTrabajo) : "" } : vacio();
const leer = (t: string) => {
  const n = Number(t.replace(/[\s,]/g, ""));
  return t.trim() && Number.isFinite(n) ? n : 0;
};
const aPeriodo = (t: Texto): PeriodoFlujo => ({ inversion: leer(t.inversion), ingresos: leer(t.ingresos), costos: leer(t.costos), capitalTrabajo: leer(t.capitalTrabajo) });
const conDato = (t: Texto) => Object.values(t).some((x) => x.trim() !== "");

const CAMPOS: { k: keyof Texto; etiqueta: string }[] = [
  { k: "inversion", etiqueta: "Inversión" },
  { k: "ingresos", etiqueta: "Ingresos" },
  { k: "costos", etiqueta: "Costos" },
  { k: "capitalTrabajo", etiqueta: "Capital de trabajo" },
];

function etiquetaPeriodo(i: number, periodicidad: Periodicidad, inicio: string | null) {
  if (periodicidad === "mes" && inicio) return mesCorto(sumarMeses(inicio, i));
  return periodicidad === "mes" ? `Mes ${i}` : `Año ${i}`;
}

/** Los períodos como filas de campos (una tabla de entrada); `bloqueado` = solo lectura. */
function EditorFlujos({ valores, cambiar, periodicidad, inicio, bloqueado, prefijo }: { valores: Texto[]; cambiar: (v: Texto[]) => void; periodicidad: Periodicidad; inicio: string | null; bloqueado: boolean; prefijo: string }) {
  return (
    <DesplazableX ariaLabel={`Flujos ${prefijo} por período`} primeraFija={false}>
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className={claseFilaEncabezado}>
            <th scope="col" className={claseEncabezadoColumna}>
              Período
            </th>
            {CAMPOS.map((c) => (
              <th key={c.k} scope="col" className={`${claseEncabezadoColumna} text-right`}>
                {c.etiqueta}
              </th>
            ))}
            <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
              Flujo neto
            </th>
          </tr>
        </thead>
        <tbody>
          {valores.map((v, i) => {
            const neto = (() => {
              const p = aPeriodo(v);
              return p.ingresos - p.costos - p.inversion - p.capitalTrabajo;
            })();
            return (
              <tr key={i} className="border-t border-border">
                <th scope="row" className={`${claseCeldaColumna} whitespace-nowrap font-normal text-muted-foreground`}>
                  {etiquetaPeriodo(i, periodicidad, inicio)}
                </th>
                {CAMPOS.map((c) => (
                  <td key={c.k} className={claseCeldaColumna}>
                    <input
                      inputMode="decimal"
                      value={v[c.k]}
                      disabled={bloqueado}
                      aria-label={`${c.etiqueta} ${prefijo} de ${etiquetaPeriodo(i, periodicidad, inicio)}`}
                      onChange={(e) => cambiar(valores.map((x, j) => (j === i ? { ...x, [c.k]: e.target.value } : x)))}
                      className={`${fieldClassSm} w-24 text-right ${claseCifra}`}
                      placeholder="0"
                    />
                  </td>
                ))}
                <td className={`${claseCeldaColumna} ${num} ${conDato(v) ? claseSigno(neto) : "text-muted-foreground"}`}>{conDato(v) ? dinero(neto) : SIN_DATO}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DesplazableX>
  );
}

function Indicador({ titulo, valor, tono }: { titulo: string; valor: string; tono?: "destructive" | "success" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tono && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tono === "success" ? "bg-success" : "bg-destructive"}`} />}
        {titulo}
      </span>
      <span className={`text-base font-semibold ${claseCifra}`}>{valor}</span>
    </div>
  );
}

function FichaProyecto({ proyecto, tasaPortal, escribe, alTerminar }: { proyecto: FilaProyecto | null; tasaPortal: number; escribe: boolean; alTerminar: () => void }) {
  const editable = escribe && (!proyecto || proyecto.estado === "borrador");
  const [nombre, setNombre] = useState(proyecto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(proyecto?.descripcion ?? "");
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(proyecto?.periodicidad ?? "mes");
  const [tasa, setTasa] = useState(proyecto?.tasa === null || proyecto?.tasa === undefined ? "" : String(proyecto.tasa));
  const [inicio, setInicio] = useState(proyecto?.inicio?.slice(0, 7) ?? "");
  const [flujos, setFlujos] = useState<Texto[]>(proyecto ? proyecto.flujos.map(aTexto) : Array.from({ length: 13 }, vacio));
  const [reales, setReales] = useState<Texto[]>(() => {
    const n = proyecto?.flujos.length ?? 0;
    return Array.from({ length: n }, (_, i) => aTexto(proyecto?.reales[i] ?? null));
  });
  const [motivo, setMotivo] = useState("");
  const [eliminar, setEliminar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();

  const tasaUsada = tasa.trim() && Number.isFinite(Number(tasa.replace(",", "."))) ? Number(tasa.replace(",", ".")) : tasaPortal;
  const periodos = useMemo(() => flujos.map(aPeriodo), [flujos]);
  const ev = useMemo(() => evaluar(periodos, tasaFraccion(tasaUsada), periodicidad), [periodos, tasaUsada, periodicidad]);
  const sens = useMemo(() => sensibilidad(periodos, tasaFraccion(tasaUsada), periodicidad), [periodos, tasaUsada, periodicidad]);
  const seg = useMemo(
    () => (proyecto?.estado === "aprobado" ? seguimiento(proyecto.flujos, reales.map((r) => (conDato(r) ? aPeriodo(r) : null)), tasaFraccion(tasaUsada), periodicidad) : null),
    [proyecto, reales, tasaUsada, periodicidad],
  );
  const inicioMes = inicio ? `${inicio}-01` : null;

  const correr = (f: () => Promise<{ error?: string }>, ok: string, cerrar = false) => {
    setError(null);
    empezar(async () => {
      const r = await f().catch(() => ({ error: "Se cortó la conexión." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(ok);
        if (cerrar) alTerminar();
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {proyecto && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={TONO_ESTADO[proyecto.estado]}>{ETIQUETA_ESTADO_PROYECTO[proyecto.estado]}</Badge>
          {proyecto.decididoEn && (
            <span className="text-muted-foreground">
              {proyecto.decididoPor ?? "—"} · {fechaHora(proyecto.decididoEn)}
              {proyecto.motivo ? ` · ${proyecto.motivo}` : ""}
            </span>
          )}
        </div>
      )}
      <fieldset disabled={!editable} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Proyecto *</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} data-enfocar className={fieldClassSm} placeholder="Ej: Bodega propia en Panamá" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Descripción</span>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className={fieldClassSm} placeholder="Ej: Qué se compra y de dónde sale el retorno" />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Períodos</span>
            <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value === "anio" ? "anio" : "mes")} className={`${fieldClassSm} w-32`}>
              <option value="mes">{ETIQUETA_PERIODICIDAD.mes}</option>
              <option value="anio">{ETIQUETA_PERIODICIDAD.anio}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Tasa de descuento anual (%)</span>
            <input inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} className={`${fieldClassSm} w-32 text-right ${claseCifra}`} placeholder={numero(tasaPortal, 1)} />
          </label>
          {periodicidad === "mes" && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Mes de la inversión</span>
              <input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className={`${fieldClassSm} w-40`} />
            </label>
          )}
        </div>
        <EditorFlujos valores={flujos} cambiar={setFlujos} periodicidad={periodicidad} inicio={inicioMes} bloqueado={!editable} prefijo="prometidos" />
        {editable && (
          <div className="flex gap-2">
            <button type="button" className={botonSecundario} onClick={() => setFlujos([...flujos, vacio()])} disabled={flujos.length >= 60}>
              Agregar período
            </button>
            <button type="button" className={botonSecundario} onClick={() => setFlujos(flujos.slice(0, -1))} disabled={flujos.length <= 2}>
              Quitar el último
            </button>
          </div>
        )}
      </fieldset>

      <section aria-labelledby="resultado-proyecto" className="flex flex-col gap-3">
        <h3 id="resultado-proyecto" className="text-sm font-semibold">
          Evaluación a {numero(tasaUsada, 1)} % anual
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Indicador titulo="VAN" valor={dinero(ev.van)} tono={ev.van > 0 ? "success" : "destructive"} />
          <Indicador titulo="TIR anual" valor={textoTir(ev.tirAnual, ev.tir.motivo === "multiples")} />
          <Indicador titulo="Índice de rentabilidad" valor={ev.indice === null ? SIN_DATO : numero(ev.indice, 2)} />
          <Indicador titulo="Payback simple" valor={textoPayback(ev.payback, periodicidad)} />
          <Indicador titulo="Payback descontado" valor={textoPayback(ev.paybackDescontado, periodicidad)} />
          <Indicador titulo="Inversión" valor={dinero(ev.inversionTotal)} />
        </div>
        {ev.tir.motivo === "multiples" && (
          <p className="flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            Los flujos cambian de signo más de una vez: hay {ev.tir.todas.length} TIR ({ev.tir.todas.map((t) => fraccion((1 + t) ** (periodicidad === "mes" ? 12 : 1) - 1)).join(", ")}). Decide por el VAN.
          </p>
        )}
        {ev.tir.motivo === "sin_cambio_de_signo" && (
          <p className="flex items-center gap-1.5 text-xs">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            Sin TIR: los flujos no cambian de signo.
          </p>
        )}
        <DesplazableX ariaLabel="Sensibilidad del VAN">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="mb-1 text-left text-xs text-muted-foreground">VAN (TIR anual) con ingresos (filas) y costos (columnas) movidos</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                <th scope="col" className={claseEncabezadoColumna}>
                  Ingresos \ Costos
                </th>
                {PASOS_SENSIBILIDAD.map((c) => (
                  <th key={c} scope="col" className={`${claseEncabezadoColumna} text-right`}>
                    {c === 0 ? "Base" : fraccion(c, { conSigno: true, decimales: 0 })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sens.map((fila, i) => (
                <tr key={i} className="border-t border-border">
                  <th scope="row" className={`${claseCeldaColumna} text-left font-normal text-muted-foreground`}>
                    {PASOS_SENSIBILIDAD[i] === 0 ? "Base" : fraccion(PASOS_SENSIBILIDAD[i], { conSigno: true, decimales: 0 })}
                  </th>
                  {fila.map((c, j) => (
                    <td key={j} className={`${claseCeldaColumna} ${num} ${claseSigno(c.van)} ${c.ingresos === 0 && c.costos === 0 ? "font-semibold" : ""}`}>
                      {dinero(c.van)}
                      <span className="block text-xs text-muted-foreground">{c.tirAnual === null ? SIN_DATO : fraccion(c.tirAnual)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </DesplazableX>
      </section>

      {proyecto?.estado === "aprobado" && (
        <section aria-labelledby="seguimiento-proyecto" className="flex flex-col gap-3">
          <h3 id="seguimiento-proyecto" className="text-sm font-semibold">
            Real contra prometido
          </h3>
          {seg && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Indicador titulo={`Prometido (${seg.periodos} períodos)`} valor={dinero(seg.prometido)} />
              <Indicador titulo="Real" valor={dinero(seg.real)} />
              <Indicador titulo="Diferencia" valor={dinero(seg.diferencia)} tono={seg.diferencia >= 0 ? "success" : "destructive"} />
              <Indicador titulo="VAN revisado" valor={dinero(seg.vanRevisado)} tono={seg.vanRevisado > 0 ? "success" : "destructive"} />
            </div>
          )}
          <EditorFlujos valores={reales} cambiar={setReales} periodicidad={periodicidad} inicio={inicioMes} bloqueado={!escribe} prefijo="reales" />
          {escribe && (
            <div>
              <button
                type="button"
                disabled={pendiente}
                className={botonPrincipal}
                onClick={() => correr(() => guardarRealesProyecto(proyecto.id, reales.map((r) => (conDato(r) ? aPeriodo(r) : null))), "Flujos reales guardados")}
              >
                Guardar flujos reales
              </button>
            </div>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {error}
        </p>
      )}
      {escribe && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          {editable && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendiente || !nombre.trim()}
                className={botonPrincipal}
                onClick={() =>
                  correr(
                    () =>
                      guardarProyecto(proyecto?.id ?? null, {
                        nombre,
                        descripcion,
                        periodicidad,
                        tasa: tasa.trim() || null,
                        inicio: periodicidad === "mes" && inicio ? `${inicio}-01` : null,
                        flujos: periodos,
                      }),
                    proyecto ? "Proyecto guardado" : "Proyecto agregado",
                    !proyecto,
                  )
                }
              >
                {proyecto ? "Guardar cambios" : "Agregar proyecto"}
              </button>
            </div>
          )}
          {proyecto && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-60 flex-1 flex-col gap-1">
                <span className={labelClassSm}>Motivo de la decisión</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={fieldClassSm} placeholder="Ej: Retorno sobre la tasa del comité" />
              </label>
              {proyecto.estado !== "aprobado" && (
                <button type="button" disabled={pendiente} className={botonPrincipal} onClick={() => correr(() => decidirProyecto(proyecto.id, "aprobado", motivo), "Proyecto aprobado", true)}>
                  Aprobar
                </button>
              )}
              {proyecto.estado !== "rechazado" && (
                <button type="button" disabled={pendiente} className={botonSecundario} onClick={() => correr(() => decidirProyecto(proyecto.id, "rechazado", motivo), "Proyecto rechazado", true)}>
                  Rechazar
                </button>
              )}
              {proyecto.estado !== "borrador" && (
                <button type="button" disabled={pendiente} className={botonSecundario} onClick={() => correr(() => decidirProyecto(proyecto.id, "borrador", null), "Proyecto en borrador", true)}>
                  Volver a borrador
                </button>
              )}
              {proyecto.estado !== "aprobado" &&
                (eliminar ? (
                  <>
                    <button type="button" disabled={pendiente} className={botonSecundario} onClick={() => correr(() => eliminarProyecto(proyecto.id), "Proyecto eliminado", true)}>
                      Confirmar eliminar
                    </button>
                    <button type="button" className={botonSecundario} onClick={() => setEliminar(false)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button type="button" className={botonSecundario} onClick={() => setEliminar(true)}>
                    Eliminar
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** El WACC del portal (vacío = el costo financiero mezclado del comité). */
export function AjusteWacc({ wacc, sugerido }: { wacc: number | null; sugerido: number }) {
  const inicial = wacc === null ? "" : String(wacc);
  const [valor, setValor] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await guardarAjustesCapital({ wacc: valor }).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else mostrarToast("WACC guardado");
        });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>WACC anual (%)</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`${fieldClassSm} w-28 text-right ${claseCifra}`} placeholder={numero(sugerido, 1)} />
      </label>
      {valor.trim() !== inicial && (
        <button type="submit" disabled={pendiente} className={botonPrincipal}>
          Guardar
        </button>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {error}
        </p>
      )}
    </form>
  );
}
