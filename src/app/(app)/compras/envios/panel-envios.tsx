"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { BotonBarra, BotonDescargar, CabeceraTarjeta, Indicador, TableroIndicadores, Pastilla, Segmentado } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { almacen } from "@/components/tabla/almacen";
import { estadoRuta, realQueManda } from "@/lib/compras/estado-ruta";
import { etiquetaVia, prometidoJunto, textoPrometido } from "@/lib/compras/rutas-envio";
import { normalPais } from "@/lib/paises-mundo";
import { MasIcon } from "@/lib/nav-icons";
import { hoyPanama, realJunto } from "./barra-tiempos";
import { CrearRutaPanel } from "./crear-ruta-panel";
import { DEF_ENVIOS, medidaRuta, plazoCorto, type FilaRuta } from "./def-envios";
import { FichaRuta } from "./ficha-ruta";
import { TrianguloIcon, VistoIcon } from "./iconos-envios";
import { ListaRutas, type Agrupar } from "./lista-rutas";

const AGRUPAR = almacen("compras-envios-agrupar-v1", "local");
type Via = "todas" | "mar" | "aire" | "tierra";

const dias = (n: number | null) => (n === null ? "—" : `${n} d`);
const tituloRuta = (r: FilaRuta) => `${r.paisNombre} · ${r.agente ?? "Sin agente"} · ${etiquetaVia(r.via)}`;

/**
 * Compras › Envíos: arriba los filtros y los indicadores, a la izquierda una sola lista de rutas (agrupada por país, agente o vía,
 * siempre con las mismas columnas: plazo prometido, real, estado y una barra que los compara) y a la derecha lo que hay que atender:
 * las rutas fuera de plazo, las que no tienen plazo definido y el cumplimiento de cada agente. Pulsar una ruta abre su ficha.
 */
export function PanelEnvios({ rutas, agentes, tipos, puedeEscribir }: { rutas: FilaRuta[]; agentes: string[]; tipos: string[]; puedeEscribir: boolean }) {
  const guardado = useSyncExternalStore(AGRUPAR.suscribir, AGRUPAR.leer, () => "");
  const agrupar: Agrupar = guardado === "agente" || guardado === "via" ? guardado : "pais";
  const [via, setVia] = useState<Via>("todas");
  const [agente, setAgente] = useState("");
  const [soloActivas, setSoloActivas] = useState(false);
  const [soloTarde, setSoloTarde] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const hoy = hoyPanama();

  // Lo que dejan ver los filtros de la barra; los indicadores y las prioridades se calculan sobre esto (sin «Fuera de plazo», que solo
  // recorta la lista) y el cumplimiento de los agentes sin el filtro de agente, para poder cambiar de uno a otro.
  const sinAgente = useMemo(
    () => rutas.filter((r) => (via === "todas" || r.via === via) && (!soloActivas || r.activo) && (!buscar.trim() || normalPais(r.paisNombre).includes(normalPais(buscar)))),
    [rutas, via, soloActivas, buscar],
  );
  const filtradas = useMemo(() => sinAgente.filter((r) => !agente || (r.agente ?? "") === agente), [sinAgente, agente]);
  const activas = filtradas.filter((r) => r.activo);
  const lista = soloTarde ? filtradas.filter((r) => medidaRuta(r).estado === "tarde") : filtradas;

  const medidas = activas.filter((r) => ["tarde", "ok"].includes(medidaRuta(r).estado));
  const tardes = activas.filter((r) => medidaRuta(r).estado === "tarde").sort((a, b) => (medidaRuta(b).delta ?? 0) - (medidaRuta(a).delta ?? 0));
  const sinPlazo = activas.filter((r) => r.diasMax === null);

  // El cumplimiento de cada agente: de sus rutas con plazo y envíos, cuántas están dentro del plazo.
  const ranking = useMemo(() => {
    const m = new Map<string, FilaRuta[]>();
    for (const r of sinAgente.filter((x) => x.activo && x.agente)) m.set(r.agente!, [...(m.get(r.agente!) ?? []), r]);
    return [...m.entries()]
      .map(([nombre, filas]) => {
        const med = filas.filter((r) => ["tarde", "ok"].includes(medidaRuta(r).estado));
        const cumplen = med.filter((r) => medidaRuta(r).estado === "ok").length;
        return { nombre, filas, paises: new Set(filas.map((r) => r.paisCodigo)).size, medidas: med.length, cumplen, pct: med.length ? Math.round((cumplen / med.length) * 100) : null };
      })
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.filas.length - a.filas.length);
  }, [sinAgente]);

  const agentesUsados = [...new Set(rutas.map((r) => r.agente).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado<Via>
          etiqueta="Vía"
          valor={via}
          alCambiar={setVia}
          opciones={[
            { valor: "todas", etiqueta: "Todas las vías" },
            { valor: "mar", etiqueta: "Marítimo" },
            { valor: "aire", etiqueta: "Aéreo" },
            { valor: "tierra", etiqueta: "Terrestre" },
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Agrupar por
          </span>
          <Segmentado<Agrupar>
            etiqueta="Agrupar por"
            valor={agrupar}
            alCambiar={(v) => AGRUPAR.guardar(v)}
            opciones={[
              { valor: "pais", etiqueta: "País" },
              { valor: "agente", etiqueta: "Agente" },
              { valor: "via", etiqueta: "Vía" },
            ]}
          />
          <BotonDescargar def={DEF_ENVIOS} filas={lista} />
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

      <Indicadores activas={activas} medidas={medidas.length} tardes={tardes.length} cumplen={medidas.length - tardes.length} soloTarde={soloTarde} alAlternarTarde={() => setSoloTarde((v) => !v)} hoy={hoy} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[999_1_44rem]">
          <ListaRutas rutas={lista} modo={agrupar} abierta={abierta} alAbrir={setAbierta} totalRutas={rutas.length} />
        </div>

        <aside aria-label="Prioridades" className="flex min-w-0 flex-[1_1_19rem] flex-col gap-4">
          <section aria-labelledby="e-atender" className="rounded-[10px] border border-border bg-card">
            <CabeceraTarjeta id="e-atender" titulo="Para atender">
              <span className="text-xs text-muted-foreground tabular-nums">{tardes.length}</span>
            </CabeceraTarjeta>
            {tardes.length === 0 ? (
              <p className="m-0 flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
                <VistoIcon className="text-success" />
                Todo lo medido está en plazo.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {tardes.map((r) => {
                  const { real, delta } = medidaRuta(r);
                  return (
                    <li key={r.id} className="border-t border-border first:border-t-0">
                      <ItemPrioridad titulo={tituloRuta(r)} detalle={`${real} d real · plazo ${plazoCorto(r)}`} alPulsar={() => setAbierta(r.id)} marca={<Pastilla tono="peligro">+{delta} d</Pastilla>} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="e-sin-plazo" className="rounded-[10px] border border-border bg-card">
            <CabeceraTarjeta id="e-sin-plazo" titulo="Falta definir el plazo">
              <span className="text-xs text-muted-foreground tabular-nums">{sinPlazo.length}</span>
            </CabeceraTarjeta>
            {sinPlazo.length === 0 ? (
              <p className="m-0 flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
                <VistoIcon className="text-success" />
                Todas las rutas dicen cuánto prometen.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {sinPlazo.map((r) => {
                  const { real, envios } = medidaRuta(r);
                  return (
                    <li key={r.id} className="border-t border-border first:border-t-0">
                      <ItemPrioridad
                        titulo={tituloRuta(r)}
                        detalle={`${real !== null ? `${real} d real · ` : ""}${envios} ${envios === 1 ? "envío medido" : "envíos medidos"}`}
                        alPulsar={() => setAbierta(r.id)}
                        marca={<Pastilla tono="aviso">Sin plazo</Pastilla>}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="e-agentes" className="rounded-[10px] border border-border bg-card">
            <CabeceraTarjeta id="e-agentes" titulo="Agentes" />
            <ul className="m-0 list-none p-0">
              {ranking.map((a) => (
                <li key={a.nombre} className="border-t border-border first:border-t-0">
                  <button
                    type="button"
                    aria-pressed={agente === a.nombre}
                    onClick={() => setAgente((x) => (x === a.nombre ? "" : a.nombre))}
                    className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-muted aria-[pressed=true]:bg-primario-suave ${anilloFoco} focus-visible:-outline-offset-2`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="font-semibold">{a.nombre}</b>
                      <span className="text-xs text-muted-foreground">
                        {a.paises} {a.paises === 1 ? "país" : "países"} · {a.filas.length} {a.filas.length === 1 ? "ruta" : "rutas"}
                      </span>
                    </span>
                    <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-border">
                      <span className="block h-full rounded-full bg-success" style={{ width: `${a.pct ?? 0}%` }} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.pct === null ? "Sin envíos medidos todavía" : `${a.cumplen} de ${a.medidas} ${a.medidas === 1 ? "ruta medida cumple" : "rutas medidas cumplen"} el plazo (${a.pct} %)`}
                    </span>
                  </button>
                </li>
              ))}
              {ranking.length === 0 && <li className="px-4 py-3.5 text-sm text-muted-foreground">Sin agentes.</li>}
            </ul>
          </section>
        </aside>
      </div>

      <FichaRuta ruta={rutas.find((r) => r.id === abierta)} agentes={agentes} tipos={tipos} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />
    </div>
  );
}

/** Una fila del panel de prioridades: la ruta, su dato y una marca a la derecha; pulsarla abre su ficha. */
function ItemPrioridad({ titulo, detalle, marca, alPulsar }: { titulo: string; detalle: string; marca: ReactNode; alPulsar: () => void }) {
  return (
    <button type="button" onClick={alPulsar} className={`flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted ${anilloFoco} focus-visible:-outline-offset-2`}>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{titulo}</span>
        <span className="text-xs text-muted-foreground">{detalle}</span>
      </span>
      {marca}
    </button>
  );
}

/** Los indicadores en una sola barra; «Fuera de plazo» es un botón que recorta la lista a esas rutas. */
function Indicadores({ activas, medidas, tardes, cumplen, soloTarde, alAlternarTarde, hoy }: { activas: FilaRuta[]; medidas: number; tardes: number; cumplen: number; soloTarde: boolean; alAlternarTarde: () => void; hoy: string }) {
  const agentes = new Set(activas.map((r) => r.agente).filter(Boolean)).size;
  const paises = new Set(activas.map((r) => r.paisCodigo)).size;
  const vistaVia = (v: "mar" | "aire") => {
    const filas = activas.filter((r) => r.via === v);
    const real = realQueManda(realJunto(filas, hoy));
    const prom = prometidoJunto(filas);
    const { estado, delta } = estadoRuta(prom?.max ?? null, real.promedio);
    return { real, prom, estado, delta };
  };
  const mar = vistaVia("mar");
  const aire = vistaVia("aire");
  const detalleVia = (v: ReturnType<typeof vistaVia>) => (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {v.estado === "tarde" && (
        <Pastilla tono="peligro">
          <TrianguloIcon />+{v.delta} d
        </Pastilla>
      )}
      {v.estado === "ok" && (
        <Pastilla tono="exito">
          <VistoIcon />
          En plazo
        </Pastilla>
      )}
      <span>
        plazo {v.prom ? textoPrometido(v.prom.min, v.prom.max).replace(" días", " d") : "—"} · {v.real.n} {v.real.n === 1 ? "envío" : "envíos"}
      </span>
    </span>
  );
  return (
    <TableroIndicadores etiqueta="Indicadores">
      <Indicador titulo="Rutas activas" valor={String(activas.length)} detalle={`${paises} ${paises === 1 ? "país" : "países"} · ${agentes} ${agentes === 1 ? "agente" : "agentes"}`} />
      <Indicador titulo="Marítimo · real 12 meses" valor={dias(mar.real.promedio)} detalle={detalleVia(mar)} />
      <Indicador titulo="Aéreo · real 12 meses" valor={dias(aire.real.promedio)} detalle={detalleVia(aire)} />
      <Indicador titulo="Cumplen el plazo" valor={`${cumplen} de ${medidas}`} detalle="rutas con plazo y envíos medidos" />
      <Indicador
        titulo="Fuera de plazo"
        punto={tardes ? "peligro" : "exito"}
        valor={String(tardes)}
        detalle={soloTarde ? "Mostrando solo estas · pulsa para ver todas" : tardes ? "Pulsa para ver solo estas" : "Todo en plazo"}
        alPulsar={alAlternarTarde}
        activo={soloTarde}
      />
    </TableroIndicadores>
  );
}
