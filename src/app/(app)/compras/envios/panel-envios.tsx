"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { BotonBarra, CabeceraTarjeta, Indicador, Punto, Segmentado } from "@/components/panel/piezas-panel";
import { Bandera } from "@/components/paises/bandera";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { almacen } from "@/components/tabla/almacen";
import { etiquetaVia, prometidoJunto, textoPrometido, type ResumenesReales } from "@/lib/compras/rutas-envio";
import { normalPais } from "@/lib/paises-mundo";
import { MasIcon } from "@/lib/nav-icons";
import { cambiarActivoRuta } from "./actions";
import { BarraTiempos, hoyPanama, porVia, realJunto } from "./barra-tiempos";
import { CrearRutaPanel } from "./crear-ruta-panel";
import { tarifasVigentes, textoTarifa, type FilaRuta } from "./def-envios";
import { FichaRuta } from "./ficha-ruta";
import { TablaEnvios } from "./tabla-envios";

// El color de cada agente (los de ClickUp para Chin y Avery; los demás, uno fijo por su nombre).
const COLOR_AGENTE: Record<string, string> = { chin: "#30A46C", avery: "#D6409F" };
const PALETA = ["#5f43d1", "#0090FF", "#F76B15", "#12A594", "#8a35c9", "#E5484D"];
export function colorAgente(agente: string | null) {
  if (!agente) return "#8D8D8D";
  const fijo = COLOR_AGENTE[agente.toLowerCase()];
  if (fijo) return fijo;
  let h = 0;
  for (const ch of agente.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

function PastillaAgente({ agente }: { agente: string | null }) {
  const color = colorAgente(agente);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: `${color}66`, backgroundColor: `${color}14`, color }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {agente ?? "Sin agente"}
    </span>
  );
}

const ICONO_VIA: Record<string, string> = { mar: "🚢", aire: "✈️", tierra: "🚚" };
const dias = (n: number | null) => (n === null ? "—" : `${n} d`);
/** El real que manda en una tarjeta: el de los últimos 12 meses o, si no hay, el histórico. */
const realActual = (r: ResumenesReales) => (r.ultimos12.promedio !== null ? r.ultimos12 : r.historico);
const prometidoDe = (r: FilaRuta) => (r.diasMin !== null && r.diasMax !== null ? { min: r.diasMin, max: r.diasMax } : null);

const VISTA = almacen("compras-envios-vista-v1", "local");
type Via = "todas" | "mar" | "aire" | "tierra";

/**
 * Compras › Envíos, como el Dashboard: arriba los indicadores, el tiempo por vía de todos los países y el ranking de agentes
 * (cada uno con su barra «prometido vs. real»), y una tarjeta por país con sus rutas: agente, vía, la barra, lo real de los
 * últimos 12 meses, la tarifa y el interruptor de activa. Cada tarjeta agrega una ruta para su país; «Agregar ruta» de arriba
 * sirve para un país nuevo. Pulsar una ruta abre su ficha. La tabla de siempre queda en «Tabla».
 */
export function PanelEnvios({ rutas, agentes, tipos, puedeEscribir }: { rutas: FilaRuta[]; agentes: string[]; tipos: string[]; puedeEscribir: boolean }) {
  const vistaGuardada = useSyncExternalStore(VISTA.suscribir, VISTA.leer, () => "");
  const vista = vistaGuardada === "tabla" ? "tabla" : "tarjetas";
  const [via, setVia] = useState<Via>("todas");
  const [agente, setAgente] = useState("");
  const [soloActivas, setSoloActivas] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const hoy = hoyPanama();

  const filtradas = useMemo(
    () =>
      rutas.filter(
        (r) =>
          (via === "todas" || r.via === via) &&
          (!agente || (r.agente ?? "") === agente) &&
          (!soloActivas || r.activo) &&
          (!buscar.trim() || normalPais(r.paisNombre).includes(normalPais(buscar))),
      ),
    [rutas, via, agente, soloActivas, buscar],
  );
  const activas = filtradas.filter((r) => r.activo);

  // Una tarjeta por país: los que tienen envíos medidos primero, luego por nombre.
  const paises = useMemo(() => {
    const m = new Map<string, FilaRuta[]>();
    for (const r of filtradas) m.set(r.paisCodigo, [...(m.get(r.paisCodigo) ?? []), r]);
    return [...m.values()].sort((a, b) => {
      const na = a.reduce((s, r) => s + r.real.historico.n, 0);
      const nb = b.reduce((s, r) => s + r.real.historico.n, 0);
      return nb - na || a[0].paisNombre.localeCompare(b[0].paisNombre, "es");
    });
  }, [filtradas]);

  // Los agentes, de mejor a peor cumplimiento (lo real de 12 meses contra lo prometido, en sus rutas con las dos cosas).
  const ranking = useMemo(() => {
    const m = new Map<string, FilaRuta[]>();
    for (const r of activas) if (r.agente) m.set(r.agente, [...(m.get(r.agente) ?? []), r]);
    return [...m.entries()]
      .map(([nombre, filas]) => {
        const medidas = filas.filter((r) => r.real.historico.n > 0 && r.diasMax !== null);
        const cumplen = medidas.filter((r) => !r.incumple).length;
        return { nombre, filas, paises: new Set(filas.map((r) => r.paisCodigo)).size, medidas: medidas.length, cumplimiento: medidas.length ? Math.round((cumplen / medidas.length) * 100) : null };
      })
      .sort((a, b) => (b.cumplimiento ?? -1) - (a.cumplimiento ?? -1) || b.filas.length - a.filas.length);
  }, [activas]);

  const mar = realJunto(activas.filter((r) => r.via === "mar"), hoy);
  const aire = realJunto(activas.filter((r) => r.via === "aire"), hoy);
  const promMar = prometidoJunto(activas.filter((r) => r.via === "mar"));
  const promAire = prometidoJunto(activas.filter((r) => r.via === "aire"));
  const incumplen = activas.filter((r) => r.incumple).length;
  const agentesUsados = [...new Set(rutas.map((r) => r.agente).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado<Via>
          etiqueta="Vía"
          valor={via}
          alCambiar={setVia}
          opciones={[
            { valor: "todas", etiqueta: "Todas las vías" },
            { valor: "mar", etiqueta: "🚢 Marítimo" },
            { valor: "aire", etiqueta: "✈️ Aéreo" },
            { valor: "tierra", etiqueta: "🚚 Terrestre" },
          ]}
        />
        <select aria-label="Agente" value={agente} onChange={(e) => setAgente(e.target.value)} className={`h-[34px] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`}>
          <option value="">Todos los agentes</option>
          {agentesUsados.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <input
          type="search"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar país…"
          aria-label="Buscar país"
          className={`h-[34px] w-40 rounded-lg border border-border-control bg-card px-2.5 text-[13px] ${anilloFoco}`}
        />
        <BotonBarra activo={soloActivas} onClick={() => setSoloActivas((v) => !v)}>
          Solo activas
        </BotonBarra>
        <div className="ml-auto flex items-center gap-2">
          <Segmentado
            etiqueta="Vista"
            valor={vista}
            alCambiar={(v) => VISTA.guardar(v)}
            opciones={[
              { valor: "tarjetas", etiqueta: "Tarjetas" },
              { valor: "tabla", etiqueta: "Tabla" },
            ]}
          />
          {puedeEscribir && (
            <CrearRutaPanel
              agentes={agentes}
              boton={(abrir) => (
                <BotonBarra principal onClick={abrir} aria-haspopup="dialog">
                  <MasIcon className="h-3.5 w-3.5" />
                  Agregar ruta
                </BotonBarra>
              )}
            />
          )}
        </div>
      </div>

      <section aria-label="Indicadores" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap">
          <Indicador titulo="Países" valor={String(new Set(activas.map((r) => r.paisCodigo)).size)} detalle={`${new Set(filtradas.map((r) => r.paisCodigo)).size} con rutas`} />
          <Indicador titulo="Rutas activas" valor={String(activas.length)} detalle={`de ${filtradas.length} rutas`} />
          <Indicador titulo="Agentes" valor={String(ranking.length)} detalle={ranking.map((a) => a.nombre).join(" · ") || "—"} />
          <Indicador
            titulo="🚢 Marítimo"
            punto={promMar && realActual(mar).promedio !== null ? (realActual(mar).promedio! > promMar.max ? "peligro" : "exito") : undefined}
            valor={dias(realActual(mar).promedio)}
            detalle={`prometido ${promMar ? textoPrometido(promMar.min, promMar.max) : "—"} · ${realActual(mar).n} envíos`}
          />
          <Indicador
            titulo="✈️ Aéreo"
            punto={promAire && realActual(aire).promedio !== null ? (realActual(aire).promedio! > promAire.max ? "peligro" : "exito") : undefined}
            valor={dias(realActual(aire).promedio)}
            detalle={`prometido ${promAire ? textoPrometido(promAire.min, promAire.max) : "—"} · ${realActual(aire).n} envíos`}
          />
          <Indicador titulo="Tardan más de lo prometido" punto={incumplen ? "peligro" : "exito"} valor={String(incumplen)} detalle={incumplen === 1 ? "ruta activa" : "rutas activas"} />
        </div>
      </section>

      {vista === "tabla" ? (
        <TablaEnvios rutas={filtradas} agentes={agentes} tipos={tipos} puedeEscribir={puedeEscribir} sinResumen />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section aria-labelledby="e-vias" className="min-w-0 rounded-[10px] border border-border bg-card">
              <CabeceraTarjeta id="e-vias" titulo="Prometido vs. real · todos los países" />
              <div className="flex flex-col gap-5 p-4">
                {porVia(activas).map(({ via: v, filas }) => (
                  <div key={v} className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium">
                      {ICONO_VIA[v]} {etiquetaVia(v)}
                    </span>
                    <BarraTiempos prometido={prometidoJunto(filas)} real={realJunto(filas, hoy)} />
                  </div>
                ))}
                {activas.length === 0 && <p className="m-0 text-sm text-muted-foreground">No hay rutas activas con estos filtros.</p>}
              </div>
            </section>
            <section aria-labelledby="e-agentes" className="min-w-0 rounded-[10px] border border-border bg-card">
              <CabeceraTarjeta id="e-agentes" titulo="Agentes" />
              <ul className="m-0 flex list-none flex-col gap-3 p-4">
                {ranking.map((a) => (
                  <li key={a.nombre}>
                    <button
                      type="button"
                      aria-pressed={agente === a.nombre}
                      onClick={() => setAgente((x) => (x === a.nombre ? "" : a.nombre))}
                      className={`flex w-full flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted aria-[pressed=true]:bg-primario-suave ${anilloFoco}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <PastillaAgente agente={a.nombre} />
                        <span className="text-xs text-muted-foreground">
                          {a.paises} {a.paises === 1 ? "país" : "países"} · {a.filas.length} {a.filas.length === 1 ? "ruta" : "rutas"}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 rounded-full bg-muted">
                          <span className="barra-neon block h-1.5 rounded-full" style={{ width: `${a.cumplimiento ?? 0}%` }} />
                        </span>
                        <b className="w-24 text-right text-xs font-medium tabular-nums">{a.cumplimiento === null ? "sin medir" : `${a.cumplimiento} % cumple`}</b>
                      </span>
                    </button>
                  </li>
                ))}
                {ranking.length === 0 && <li className="text-sm text-muted-foreground">Sin agentes.</li>}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 min-[1400px]:grid-cols-3">
            {paises.map((filas) => (
              <TarjetaPais key={filas[0].paisCodigo} filas={filas} hoy={hoy} agentes={agentes} puedeEscribir={puedeEscribir} alAbrir={setAbierta} />
            ))}
            {paises.length === 0 && <p className="m-0 text-sm text-muted-foreground">No hay rutas con estos filtros.</p>}
          </div>
        </>
      )}

      <FichaRuta ruta={rutas.find((r) => r.id === abierta)} agentes={agentes} tipos={tipos} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />
    </div>
  );
}

/** La tarjeta de un país: cuánto tarda cada vía (todos sus agentes juntos) y una fila por ruta. */
function TarjetaPais({ filas, hoy, agentes, puedeEscribir, alAbrir }: { filas: FilaRuta[]; hoy: string; agentes: string[]; puedeEscribir: boolean; alAbrir: (id: string) => void }) {
  const pais = filas[0];
  const ordenadas = [...filas].sort((a, b) => Number(b.activo) - Number(a.activo) || a.via.localeCompare(b.via) || (a.agente ?? "").localeCompare(b.agente ?? ""));
  const tituloId = `pais-${pais.paisCodigo}`;
  return (
    <section aria-labelledby={tituloId} className="flex min-w-0 flex-col rounded-[10px] border border-border bg-card">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={tituloId} className="m-0 flex items-center gap-2 text-[15px] font-semibold">
            <Bandera codigo={pais.paisCodigo} className="!h-4 !w-6" />
            {pais.paisNombre}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {porVia(filas.filter((r) => r.activo)).map(({ via, filas: deVia }) => {
              const real = realActual(realJunto(deVia, hoy));
              const prom = prometidoJunto(deVia);
              const tarde = prom && real.promedio !== null && real.promedio > prom.max;
              return (
                <span key={via} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
                  {ICONO_VIA[via]}
                  <b className={`font-semibold tabular-nums ${tarde ? "text-destructive" : ""}`}>{dias(real.promedio)}</b>
                  <span className="text-muted-foreground">real</span>
                </span>
              );
            })}
          </div>
        </div>
        {puedeEscribir && (
          <CrearRutaPanel
            agentes={agentes}
            paisInicial={pais.paisCodigo}
            boton={(abrir) => (
              <button
                type="button"
                onClick={abrir}
                aria-haspopup="dialog"
                aria-label={`Agregar una ruta a ${pais.paisNombre}`}
                className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
              >
                <MasIcon className="h-3 w-3" />
                Ruta
              </button>
            )}
          />
        )}
      </header>
      <ul className="m-0 flex list-none flex-col p-1.5">
        {ordenadas.map((r) => (
          <FilaRutaTarjeta key={r.id} ruta={r} puedeEscribir={puedeEscribir} alAbrir={() => alAbrir(r.id)} />
        ))}
      </ul>
    </section>
  );
}

function FilaRutaTarjeta({ ruta, puedeEscribir, alAbrir }: { ruta: FilaRuta; puedeEscribir: boolean; alAbrir: () => void }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const real = realActual(ruta.real);
  const tarifa = tarifasVigentes(ruta.tarifas)[0];
  const etiqueta = `${ruta.agente ?? "Sin agente"} · ${etiquetaVia(ruta.via)}`;
  return (
    <li className={`flex items-center gap-2 rounded-lg px-1 ${ruta.activo ? "" : "opacity-55"}`}>
      <button type="button" onClick={alAbrir} aria-label={`Abrir la ruta ${etiqueta} a ${ruta.paisNombre}`} className={`flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg px-2 py-2 text-left hover:bg-muted ${anilloFoco}`}>
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <PastillaAgente agente={ruta.agente} />
            <span className="truncate text-[13px]">
              {ICONO_VIA[ruta.via]} {etiquetaVia(ruta.via)}
              <span className="text-muted-foreground">{[ruta.modalidad, ruta.courier].filter(Boolean).length ? ` · ${[ruta.modalidad, ruta.courier].filter(Boolean).join(" ")}` : ""}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-baseline gap-1.5 text-right">
            {ruta.incumple && <Punto tono="peligro" />}
            <b className={`text-[15px] font-semibold tabular-nums ${ruta.incumple ? "text-destructive" : ""}`}>{dias(real.promedio)}</b>
            <span className="text-xs text-muted-foreground">/ {textoPrometido(ruta.diasMin, ruta.diasMax).replace(" días", " d")}</span>
          </span>
        </span>
        <BarraTiempos compacta prometido={prometidoDe(ruta)} real={ruta.real} />
        <span className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{real.n ? `${real.n} envío${real.n === 1 ? "" : "s"}${ruta.real.ultimos2.promedio !== null ? ` · últimos 2 meses ${ruta.real.ultimos2.promedio} d` : ""}` : "sin envíos medidos"}</span>
          {tarifa && <span className="tabular-nums">{textoTarifa(tarifa)}</span>}
        </span>
      </button>
      {puedeEscribir && (
        <button
          type="button"
          role="switch"
          aria-checked={ruta.activo}
          aria-label={`Ruta ${etiqueta} activa`}
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              const r = await cambiarActivoRuta(ruta.id, !ruta.activo).catch(() => ({ error: "No se pudo cambiar." }));
              if (r.error) mostrarToast(r.error, "destructive");
              else mostrarToast(ruta.activo ? "Ruta desactivada" : "Ruta activada");
            })
          }
          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${anilloFoco} ${ruta.activo ? "border-primario bg-primario" : "border-border-control bg-muted"}`}
        >
          <span aria-hidden="true" className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${ruta.activo ? "left-[1.1rem] bg-background" : "left-0.5 bg-muted-foreground"}`} />
        </button>
      )}
    </li>
  );
}
