"use client";

import { useState, useTransition } from "react";
import { Bandera } from "@/components/paises/bandera";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { etiquetaVia, textoPrometido, UNIDADES_TARIFA, type ResumenReal } from "@/lib/compras/rutas-envio";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, CerrarIcon, CheckIcon, ComprasIcon, EstadoIcon, GastoIcon, PapeleraIcon } from "@/lib/nav-icons";
import { actualizarRuta, agregarTarifa, cambiarActivoRuta, eliminarRuta, eliminarTarifa } from "./actions";
import { BarraTiempos } from "./barra-tiempos";
import { CamposRuta } from "./campos-ruta";
import { tarifasVigentes, textoTarifa, type FilaRuta } from "./def-envios";

/**
 * La ficha de una ruta de envío (panel a la derecha). **La ficha ya es el formulario**: al cambiar un dato aparecen «Guardar
 * cambios» y «Cancelar». Junto a ellos, activar o desactivar el canal y eliminar la ruta. Debajo, lo que de verdad tardó y sus
 * tarifas: la que rige de cada tipo de producto y el historial; una tarifa nueva no borra la anterior.
 */
export function FichaRuta({ ruta, agentes, tipos, puedeEscribir, alCerrar }: { ruta: FilaRuta | undefined; agentes: string[]; tipos: string[]; puedeEscribir: boolean; alCerrar: () => void }) {
  if (!ruta) return null;
  const clave = [ruta.id, ruta.agente, ruta.paisCodigo, ruta.via, ruta.modalidad, ruta.courier, ruta.diasMin, ruta.diasMax, ruta.nota, ruta.url].join("|");
  return <Contenido key={clave} ruta={ruta} agentes={agentes} tipos={tipos} puedeEscribir={puedeEscribir} alCerrar={alCerrar} />;
}

function Contenido({ ruta, agentes, tipos, puedeEscribir, alCerrar }: { ruta: FilaRuta; agentes: string[]; tipos: string[]; puedeEscribir: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [modificado, setModificado] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    if (pendiente) return;
    if (modificado && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    alCerrar();
  }

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    datos.set("id", ruta.id);
    setError(null);
    empezar(async () => {
      const r = await actualizarRuta(datos).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) return setError(r.error);
      setModificado(false);
      mostrarToast("Ruta guardada");
    });
  }

  function alternarActivo() {
    setError(null);
    empezar(async () => {
      const r = await cambiarActivoRuta(ruta.id, !ruta.activo).catch(() => ({ error: "No se pudo cambiar." }));
      if (r.error) setError(r.error);
      else mostrarToast(ruta.activo ? "Ruta desactivada" : "Ruta activada");
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar la ruta ${ruta.agente ?? "sin agente"} · ${ruta.paisNombre} · ${etiquetaVia(ruta.via)} y sus tarifas?`)) return;
    empezar(async () => {
      const r = await eliminarRuta(ruta.id).catch(() => ({ error: "No se pudo eliminar." }));
      if (r.error) return setError(r.error);
      mostrarToast("Ruta eliminada");
      alCerrar();
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <Bandera codigo={ruta.paisCodigo} />
          <span className="text-lg font-semibold">
            {ruta.paisNombre} · {etiquetaVia(ruta.via)}
          </span>
          <Badge tone="neutral">{ruta.agente ?? "Sin agente"}</Badge>
          <Badge tone={ruta.activo ? "success" : "neutral"}>{ruta.activo ? "Activa" : "Inactiva"}</Badge>
        </>
      }
    >
      <form key={vuelta} onSubmit={guardar} onChange={() => setModificado(true)} aria-busy={pendiente} className="flex flex-1 flex-col">
        {puedeEscribir && (
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {modificado && (
                <>
                  <button type="submit" disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
                    <CheckIcon className="h-4 w-4" />
                    {pendiente ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModificado(false);
                      setVuelta((v) => v + 1);
                    }}
                    disabled={pendiente}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <CerrarIcon className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              )}
              <BotonAccion icono={EstadoIcon} tono={ruta.activo ? "alerta" : "exito"} disabled={pendiente} onClick={alternarActivo}>
                {ruta.activo ? "Desactivar" : "Activar"}
              </BotonAccion>
              <BotonAccion icono={PapeleraIcon} tono="peligro" disabled={pendiente} onClick={eliminar}>
                Eliminar
              </BotonAccion>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-5">
          <Seccion icono={ComprasIcon} titulo="Ruta">
            <CamposRuta ruta={ruta} agentes={agentes} />
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Lo que de verdad tarda">
            <BarraTiempos prometido={ruta.diasMin !== null && ruta.diasMax !== null ? { min: ruta.diasMin, max: ruta.diasMax } : null} real={ruta.real} />
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Dato titulo="Prometido" valor={textoPrometido(ruta.diasMin, ruta.diasMax)} />
              <DatoReal titulo="Histórico" r={ruta.real.historico} />
              <DatoReal titulo="Últimos 12 meses" r={ruta.real.ultimos12} alerta={ruta.incumple} />
              <DatoReal titulo="Año actual" r={ruta.real.anioActual} />
              <DatoReal titulo="Últimos 2 meses" r={ruta.real.ultimos2} />
            </dl>
            {!ruta.agente && <p className="m-0 text-xs text-muted-foreground">Sin agente no se puede medir: las compras se cuentan por su agente de envío.</p>}
          </Seccion>
          <Seccion icono={ComprasIcon} titulo="Nota">
            <Campo etiqueta="Nota" id={`ruta-nota-${ruta.id}`}>
              <textarea id={`ruta-nota-${ruta.id}`} name="nota" rows={3} maxLength={2000} defaultValue={ruta.nota ?? ""} className={`${fieldClass} resize-y`} />
            </Campo>
            <Campo etiqueta="Enlace" id={`ruta-url-${ruta.id}`}>
              <input id={`ruta-url-${ruta.id}`} type="url" name="url" defaultValue={ruta.url ?? ""} placeholder="Ej: https://…" className={fieldClass} />
            </Campo>
          </Seccion>
        </fieldset>
      </form>
      <div className="px-5 pb-5">
        <Tarifas ruta={ruta} tipos={tipos} puedeEscribir={puedeEscribir} />
      </div>
    </Ventana>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="m-0 text-sm font-medium tabular-nums">{valor}</dd>
    </div>
  );
}

function DatoReal({ titulo, r, alerta = false }: { titulo: string; r: ResumenReal; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className={`m-0 text-sm font-medium tabular-nums ${alerta ? "text-destructive" : ""}`}>
        {r.promedio === null ? "—" : `${r.promedio} días`}
        {r.n > 0 && (
          <span className="block text-xs font-normal text-muted-foreground">
            {r.n} envío{r.n === 1 ? "" : "s"} · {r.min}–{r.max} d
          </span>
        )}
      </dd>
    </div>
  );
}

/** Las tarifas: la que rige de cada tipo, el historial y el formulario para una nueva (fuera del formulario de la ruta). */
function Tarifas({ ruta, tipos, puedeEscribir }: { ruta: FilaRuta; tipos: string[]; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const [tipo, setTipo] = useState("General");
  const [precio, setPrecio] = useState("");
  const [unidad, setUnidad] = useState(ruta.via === "mar" ? "cbm" : "kg");
  const [desde, setDesde] = useState(hoy);
  const vigentes = new Set(tarifasVigentes(ruta.tarifas).map((t) => t.id));

  function agregar() {
    setError(null);
    empezar(async () => {
      const r = await agregarTarifa(ruta.id, tipo, Number(precio), unidad, desde).catch(() => ({ error: "No se pudo guardar la tarifa." }));
      if (r.error) return setError(r.error);
      setPrecio("");
      mostrarToast("Tarifa agregada");
    });
  }
  function quitar(id: string) {
    if (!confirm("¿Eliminar esta tarifa?")) return;
    empezar(async () => {
      const r = await eliminarTarifa(id).catch(() => ({ error: "No se pudo eliminar." }));
      if (r.error) setError(r.error);
    });
  }

  return (
    <Seccion icono={GastoIcon} titulo="Tarifas">
      {ruta.tarifas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Sin tarifas.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          {ruta.tarifas.map((t) => (
            <li key={t.id} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${vigentes.has(t.id) ? "bg-muted" : "text-muted-foreground"}`}>
              <span>
                <span className="font-medium">{t.tipo}</span> · <span className="tabular-nums">{textoTarifa(t)}</span>
                <span className="text-xs text-muted-foreground"> · desde {formatearFecha(t.vigenteDesde)}{vigentes.has(t.id) ? " · vigente" : ""}</span>
              </span>
              {puedeEscribir && (
                <button type="button" aria-label={`Eliminar la tarifa ${t.tipo} ${textoTarifa(t)}`} disabled={pendiente} onClick={() => quitar(t.id)} className={`rounded p-1 text-muted-foreground hover:text-destructive ${anilloFoco}`}>
                  <PapeleraIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tipo de producto
              <input value={tipo} onChange={(e) => setTipo(e.target.value)} list={`tipos-${ruta.id}`} maxLength={60} className={fieldClass} />
              <datalist id={`tipos-${ruta.id}`}>
                {tipos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Precio (USD)
              <input type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: 750" className={`${fieldClass} tabular-nums`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Unidad
              <select value={unidad} onChange={(e) => setUnidad(e.target.value)} className={fieldClass}>
                {UNIDADES_TARIFA.map((u) => (
                  <option key={u.valor} value={u.valor}>
                    {u.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Rige desde
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={fieldClass} />
            </label>
          </div>
          <button
            type="button"
            disabled={pendiente || precio === "" || !tipo.trim()}
            onClick={agregar}
            className={`w-fit rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-40 ${anilloFoco}`}
          >
            Agregar tarifa
          </button>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </Seccion>
  );
}
