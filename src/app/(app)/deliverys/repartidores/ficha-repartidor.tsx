"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { ETIQUETA_ESTADO_CIERRE, type FilaCierre } from "@/lib/deliverys/cargar";
import { ETIQUETA_METODO, METODOS_PAGO, TARIFA_PREDETERMINADA, textoSemanaCorto } from "@/lib/deliverys/liquidacion";
import { FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, HistorialIcon, PersonaIcon } from "@/lib/nav-icons";
import { actualizarRepartidor, obtenerRepartidor, type RepartidorFicha } from "../actions";
import { TONO_ESTADO_CIERRE } from "../estado-cierre";
import { dinero2 } from "@/lib/af4/formato";

const claseBoton = `inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50 ${anilloFoco}`;
const TARIFAS = [
  ["entrega", "Entrega"],
  ["compartida", "Entrega compartida"],
  ["cambio", "Cambio, retiro o complemento"],
  ["fuera_ruta", "Fuera de ruta"],
] as const;

interface Form {
  nombre: string;
  documento: string;
  telefono: string;
  alias: string;
  medio_pago: string;
  activo: boolean;
  nota: string;
  tarifas: Record<string, string>;
}

const desde = (r: RepartidorFicha): Form => ({
  nombre: r.nombre,
  documento: r.documento ?? "",
  telefono: r.telefono ?? "",
  alias: r.alias.join(", "),
  medio_pago: r.medio_pago ?? "",
  activo: r.activo,
  nota: r.nota ?? "",
  tarifas: Object.fromEntries(TARIFAS.map(([k]) => [k, r.tarifas?.[k] === undefined ? "" : String(r.tarifas[k])])),
});

/** Ficha de un repartidor: sus datos (documento y teléfono completos solo aquí), sus zonas en la hoja, sus tarifas y sus cierres. */
export function FichaRepartidor({
  id,
  puedeEscribir,
  anterior,
  siguiente,
  alCerrar,
}: {
  id: string;
  puedeEscribir: boolean;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<{ repartidor: RepartidorFicha; cierres: FilaCierre[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [version, setVersion] = useState(0);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    let vigente = true;
    obtenerRepartidor(id)
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setError(r.error);
        else {
          setDatos(r);
          setForm(desde(r.repartidor));
        }
      })
      .catch(() => vigente && setError("No se pudo abrir la ficha."));
    return () => {
      vigente = false;
    };
  }, [id, version]);

  const r = datos?.repartidor;
  const sinGuardar = Boolean(r && form && JSON.stringify(form) !== JSON.stringify(desde(r)));
  const cambiar = (c: Partial<Form>) => setForm((a) => (a ? { ...a, ...c } : a));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    empezar(async () => {
      const res = await actualizarRepartidor(id, form).catch(() => ({ error: "No se pudo guardar." }));
      if (res.error) setError(res.error);
      else {
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
        router.refresh();
      }
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={() => {
        if (sinGuardar && !window.confirm("Hay cambios sin guardar. ¿Cerrar igual?")) return;
        alCerrar();
      }}
      lado="derecha"
      ancho="lg"
      navegacion={
        <>
          <BotonNavegar texto="Repartidor anterior" icono={FlechaArribaIcon} alHacerClic={anterior} />
          <BotonNavegar texto="Repartidor siguiente" icono={FlechaAbajoIcon} alHacerClic={siguiente} />
        </>
      }
      titulo={
        <>
          <span className="text-lg font-semibold">{r?.nombre ?? "Repartidor"}</span>
          {r && !r.activo && <Badge tone="warning">Inactivo</Badge>}
        </>
      }
    >
      <div className="flex flex-col divide-y divide-border p-5">
        {error && (
          <p role="alert" className="flex items-center gap-2 pb-4 text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
            {error}
          </p>
        )}
        {!datos && !error && <ProgresoCarga mensaje="Abriendo la ficha…" />}
        {datos && form && (
          <>
            <form onSubmit={guardar} className="flex flex-col divide-y divide-border">
              <fieldset disabled={!puedeEscribir || pendiente} className="contents">
                <Seccion icono={PersonaIcon} titulo="Repartidor">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className={labelClassSm}>Nombre completo</span>
                      <input required maxLength={120} value={form.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} className={fieldClass} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClassSm}>Cédula o pasaporte</span>
                      <input maxLength={40} autoComplete="off" value={form.documento} onChange={(e) => cambiar({ documento: e.target.value })} placeholder="Ej: 8-000-0000" className={fieldClass} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClassSm}>Teléfono</span>
                      <input type="tel" maxLength={40} autoComplete="off" value={form.telefono} onChange={(e) => cambiar({ telefono: e.target.value })} placeholder="Ej: 6000-0000" className={fieldClass} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className={labelClassSm}>Forma de pago</span>
                      <select value={form.medio_pago} onChange={(e) => cambiar({ medio_pago: e.target.value })} className={fieldClass}>
                        <option value="">Sin dato</option>
                        {METODOS_PAGO.map((m) => (
                          <option key={m} value={m}>
                            {ETIQUETA_METODO[m]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm">
                      <input type="checkbox" checked={form.activo} onChange={(e) => cambiar({ activo: e.target.checked })} className="h-4 w-4" />
                      Activo
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className={labelClassSm}>Zonas en la hoja (separadas por coma)</span>
                      <input maxLength={600} value={form.alias} onChange={(e) => cambiar({ alias: e.target.value })} placeholder="Ej: ZONA 5 JUAN, CHORRERA" className={fieldClass} />
                    </label>
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className={labelClassSm}>Nota</span>
                      <textarea rows={2} maxLength={500} value={form.nota} onChange={(e) => cambiar({ nota: e.target.value })} className={fieldClass} />
                    </label>
                  </div>
                </Seccion>
                <Seccion icono={GastoIcon} titulo="Tarifas propias (USD)">
                  <div className="grid grid-cols-2 gap-3">
                    {TARIFAS.map(([k, etiqueta]) => (
                      <label key={k} className="flex flex-col gap-1">
                        <span className={labelClassSm}>{etiqueta}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          max="100"
                          value={form.tarifas[k]}
                          onChange={(e) => cambiar({ tarifas: { ...form.tarifas, [k]: e.target.value } })}
                          placeholder={`Ej: ${TARIFA_PREDETERMINADA[k].toFixed(2)}`}
                          className={`${fieldClass} tabular-nums`}
                        />
                      </label>
                    ))}
                  </div>
                </Seccion>
              </fieldset>
              {puedeEscribir && sinGuardar && (
                <div className="flex gap-2 py-4">
                  <button type="submit" disabled={pendiente} className={`${claseBoton} bg-foreground text-background hover:bg-foreground/85`}>
                    {pendiente ? "Guardando…" : "Guardar cambios"}
                  </button>
                  <button type="button" disabled={pendiente} onClick={() => r && setForm(desde(r))} className={`${claseBoton} border border-border-control bg-card hover:bg-muted`}>
                    Cancelar
                  </button>
                </div>
              )}
            </form>

            <Seccion icono={HistorialIcon} titulo="Cierres">
              {datos.cierres.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no tiene semanas cerradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Semanas cerradas y pagadas</caption>
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-1.5 pr-3 font-medium">Semana</th>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Estado</th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">Entregas</th>
                        <th scope="col" className="py-1.5 text-right font-medium">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.cierres.map((c) => (
                        <tr key={c.id} className="border-t border-border/60">
                          <th scope="row" className="py-1.5 pr-3 text-left font-normal tabular-nums">{textoSemanaCorto(c.semana)}</th>
                          <td className="py-1.5 pr-3">
                            <Badge tone={TONO_ESTADO_CIERRE[c.estado]}>{ETIQUETA_ESTADO_CIERRE[c.estado]}</Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{c.entregas}</td>
                          <td className="py-1.5 text-right tabular-nums">{dinero2(c.neto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>
          </>
        )}
      </div>
    </Ventana>
  );
}

function BotonNavegar({ texto, icono: Icono, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; alHacerClic?: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!alHacerClic}
        onClick={() => alHacerClic?.()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${alHacerClic ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}
