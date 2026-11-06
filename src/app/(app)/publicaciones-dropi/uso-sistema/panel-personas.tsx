"use client";

import { Fragment, useMemo, useState } from "react";
import { Segmentado, claseThLista, claseTdLista } from "@/components/panel/piezas-panel";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { ChatIcon, EquipoIcon, TiendaIcon, VentasIcon } from "@/lib/nav-icons";
import { porcentajeSistema, type AltaPublicacion } from "@/lib/publicaciones/origen";
import { PLATAFORMAS_EXTERNAS, type PlataformaExterna } from "@/lib/rendimiento/uso-externo";
import { duracion } from "@/lib/rendimiento/jornada";
import { FRENTES_USO, pct, restarDias, resumirPersonas, type DatosUsoPersonas, type FilaPersonaUso, type FrenteUso } from "@/lib/rendimiento/uso-personas";
import { CifraUso, FilaProporcion, TarjetaUso } from "./graficas-uso";

const PERIODOS = [
  { valor: "7", etiqueta: "7 días" },
  { valor: "15", etiqueta: "15 días" },
  { valor: "30", etiqueta: "30 días" },
] as const;

type Periodo = (typeof PERIODOS)[number]["valor"];

const etiquetaFrente = (f: FrenteUso) => FRENTES_USO.find((x) => x.id === f)?.etiqueta ?? f;

const ultimaVez = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" }) : "Nunca";

const etiquetaPlataforma = (p: PlataformaExterna) => PLATAFORMAS_EXTERNAS.find((x) => x.id === p)?.etiqueta ?? p;

/** Una sola tinta por lado, sistema o afuera: más oscura cuanto más tiempo. El número va siempre escrito. */
function fondoCelda(p: number, serie: "sistema" | "dropi"): { background?: string; color?: string } {
  const tinta = `var(--serie-${serie})`;
  if (p >= 60) return { background: `color-mix(in srgb, ${tinta} 85%, var(--card))`, color: "#fff" };
  if (p >= 30) return { background: `color-mix(in srgb, ${tinta} 40%, var(--card))` };
  if (p >= 10) return { background: `color-mix(in srgb, ${tinta} 20%, var(--card))` };
  return { background: `color-mix(in srgb, ${tinta} 8%, var(--card))` };
}

function Celda({ minutos, total, serie, titulo }: { minutos: number; total: number; serie: "sistema" | "dropi"; titulo: string }) {
  const p = pct(minutos, total);
  return (
    <td className="border-b border-border/45 p-0.5 text-center text-[13px] tabular-nums" title={titulo}>
      {minutos > 0 ? (
        <span className="block rounded-md px-1 py-2" style={fondoCelda(p, serie)}>
          {p === 0 ? "<1" : p} %
        </span>
      ) : (
        <span className="block py-2 text-muted-foreground/50">·</span>
      )}
    </td>
  );
}

function DetallePersona({ f }: { f: FilaPersonaUso }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 self-start text-[13px]">
        <dt className="text-muted-foreground">Última vez</dt>
        <dd className="m-0">{ultimaVez(f.ultimaVez)}</dd>
        <dt className="text-muted-foreground">Días que entró</dt>
        <dd className="m-0 tabular-nums">{f.dias}</dd>
        <dt className="text-muted-foreground">Cambios guardados</dt>
        <dd className="m-0 tabular-nums">{f.cambios.toLocaleString("es-PA")}</dd>
        <dt className="text-muted-foreground">WhatsApp desde el CRM</dt>
        <dd className="m-0 tabular-nums">{f.mensajes.toLocaleString("es-PA")}</dd>
        <dt className="text-muted-foreground" title="Minutos activos en el sistema entre su primera y su última actividad de cada día.">
          Activo del día en el sistema
        </dt>
        <dd className="m-0 tabular-nums">{f.pctDia === null ? "—" : `${f.pctDia} %`}</dd>
      </dl>
      {f.paginas.length > 0 && (
        <ul className="m-0 grid list-none gap-x-6 gap-y-1 p-0 text-[13px] sm:grid-cols-2">
          {f.paginas.slice(0, 12).map((p) => (
            <li key={p.pagina} className="flex justify-between gap-3">
              <span className="min-w-0 truncate" title={etiquetaFrente(p.frente)}>
                {p.pagina}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{duracion(p.minutos)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaPersona({ f, abierta, alPulsar }: { f: FilaPersonaUso; abierta: boolean; alPulsar: () => void }) {
  const total = f.minutos + f.minutosExterno;
  return (
    <Fragment>
      <tr className="hover:bg-muted/50">
        <th scope="row" className={`${claseTdLista} text-left font-normal`}>
          <button type="button" aria-expanded={abierta} onClick={alPulsar} className="flex items-center gap-2.5 rounded text-left">
            <AvatarPersona nombre={f.nombre} email={f.email} avatarUrl={f.avatar} tamano="sm" />
            <span className="min-w-0">
              <span className="block font-medium">{f.nombre}</span>
              <span className="block text-xs text-muted-foreground">{f.rol ?? "Sin rol"}</span>
            </span>
          </button>
        </th>
        <td className={`${claseTdLista} tabular-nums`}>{total ? duracion(total) : <span className="text-muted-foreground">No entró</span>}</td>
        <td className={`${claseTdLista} text-right tabular-nums`}>{f.pctSistema !== null ? `${f.pctSistema} %` : <span className="text-muted-foreground">Sin medir</span>}</td>
        {FRENTES_USO.map((x) => {
          const m = f.porFrente[x.id] ?? 0;
          return <Celda key={x.id} minutos={m} total={total} serie="sistema" titulo={m ? `${f.nombre} · ${x.etiqueta}: ${duracion(m)}` : `${f.nombre} no entró a ${x.etiqueta}`} />;
        })}
        {PLATAFORMAS_EXTERNAS.map((x) => {
          const m = f.porPlataforma[x.id] ?? 0;
          if (!f.midiendo)
            return (
              <td key={x.id} className="border-b border-border/45 p-0.5 text-center text-[13px] text-muted-foreground" title={`${f.nombre} no tiene la extensión: ${x.etiqueta} sin medir`}>
                —
              </td>
            );
          return <Celda key={x.id} minutos={m} total={total} serie="dropi" titulo={m ? `${f.nombre} · ${x.etiqueta}: ${duracion(m)}` : `${f.nombre} no entró a ${x.etiqueta}`} />;
        })}
      </tr>
      {abierta && (
        <tr>
          <td colSpan={3 + FRENTES_USO.length + PLATAFORMAS_EXTERNAS.length} className="border-b border-border/45 bg-muted/30 px-4 py-3">
            <DetallePersona f={f} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** Quién usa el sistema, en qué parte y en cuál no; y de lo que hace falta mudar, lo que sí se puede contar afuera. */
export function PanelPersonas({ datos, hoy, altas }: { datos: DatosUsoPersonas; hoy: string; altas: AltaPublicacion[] }) {
  const [periodo, setPeriodo] = useState<Periodo>("7");
  const [abierta, setAbierta] = useState<string | null>(null);
  const desde = restarDias(hoy, Number(periodo) - 1);
  const r = useMemo(() => resumirPersonas(datos, desde), [datos, desde]);

  const noEntraron = r.filas.filter((f) => f.minutos === 0);
  const sinExtension = r.filas.filter((f) => !f.midiendo);
  const masUsado = [...r.porFrente].filter((f) => f.frente !== "general").sort((a, b) => b.minutos - a.minutos)[0];
  const wa = r.whatsapp.reduce((t, w) => ({ crm: t.crm + w.crm, celular: t.celular + w.celular }), { crm: 0, celular: 0 });
  const conteoWa = { sistema: wa.crm, dropi: wa.celular };
  const delPeriodo = altas.filter((a) => a.fecha >= desde);
  const conteoPub = { sistema: delPeriodo.filter((a) => a.origen === "sistema").length, dropi: delPeriodo.filter((a) => a.origen === "dropi").length };
  const pctWa = porcentajeSistema(conteoWa);
  const pctPub = porcentajeSistema(conteoPub);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">Quién usa el sistema, en qué parte y en cuál no. Lo que falta aquí es lo que hay que traer de las otras plataformas para poder mudarnos.</p>
        <Segmentado etiqueta="Periodo" opciones={[...PERIODOS]} valor={periodo} alCambiar={setPeriodo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CifraUso
          titulo="Personas que lo usaron"
          valor={`${r.usaron} de ${r.filas.length}`}
          detalle={noEntraron.length ? `No entraron: ${noEntraron.map((f) => f.nombre.split(" ")[0]).join(", ")}` : "Entró todo el equipo"}
          icono={EquipoIcon}
          color={noEntraron.length ? "ambar" : "verde"}
        />
        <CifraUso
          titulo="Tiempo activo"
          valor={duracion(r.minutos).split(" ").slice(0, 2).join(" ")}
          detalle={masUsado?.minutos ? `Lo más usado: ${etiquetaFrente(masUsado.frente)}, ${pct(masUsado.minutos, r.minutos)} %` : "Sin actividad"}
          icono={VentasIcon}
          color="azul"
        />
        <CifraUso titulo="WhatsApp desde el CRM" valor={pctWa === null ? "—" : `${pctWa} %`} detalle={`${wa.crm.toLocaleString("es-PA")} en el CRM · ${wa.celular.toLocaleString("es-PA")} en el celular`} icono={ChatIcon} color="azul" />
        <CifraUso titulo="Publicaciones creadas aquí" valor={pctPub === null ? "—" : `${pctPub} %`} detalle={`${conteoPub.sistema} en el sistema · ${conteoPub.dropi} en Dropi`} icono={TiendaIcon} color="azul" />
      </div>

      <TarjetaUso titulo="Quién trabaja dónde" detalle="Cada porcentaje es la parte de su tiempo que esa persona pasó ahí. Morado: dentro del sistema. Rosado: en otra plataforma. Un punto: no entró. Una raya: sin medir, porque no tiene la extensión. Clic en el nombre para ver sus páginas.">
        <div className="-mx-5 -mb-5 overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className={claseThLista}>
                  Persona
                </th>
                <th scope="col" className={claseThLista}>
                  Tiempo activo
                </th>
                <th scope="col" className={`${claseThLista} text-right`} title="Su tiempo en el sistema, de todo el tiempo medido: sistema más Dropi, Effi, Drop y Shopify.">
                  En el sistema
                </th>
                {[...FRENTES_USO, ...PLATAFORMAS_EXTERNAS].map((x) => (
                  <th key={x.id} scope="col" className="w-20 border-b border-border px-1 py-2 text-center align-bottom text-xs font-medium text-muted-foreground">
                    {x.etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.filas.map((f) => (
                <FilaPersona key={f.id} f={f} abierta={abierta === f.id} alPulsar={() => setAbierta(abierta === f.id ? null : f.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </TarjetaUso>

      <TarjetaUso titulo="Afuera del sistema" detalle="Lo que se sigue haciendo en otras plataformas">
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          {r.whatsapp.map((w) => (
            <FilaProporcion key={w.numero} etiqueta={`WhatsApp · ${w.numero}`} conteo={{ sistema: w.crm, dropi: w.celular }} textoSistema="en el CRM" textoFuera="en el celular" />
          ))}
          <FilaProporcion etiqueta="Publicaciones nuevas" conteo={conteoPub} />
        </div>
        <div className="border-t border-border pt-3">
          <h3 className="m-0 text-sm font-semibold tracking-tight">Lo que falta traer al sistema</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">El tiempo en cada sección de las otras plataformas, de lo que más se usa a lo que menos.</p>
          {r.secciones.length > 0 ? (
            <ul className="m-0 mt-3 grid list-none gap-x-8 gap-y-1.5 p-0 text-[13px] md:grid-cols-2">
              {r.secciones.slice(0, 16).map((s) => (
                <li key={`${s.plataforma}|${s.seccion}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate" title={s.personas.join(", ")}>
                    {etiquetaPlataforma(s.plataforma)}
                    {s.seccion ? ` › ${s.seccion}` : ""}
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {duracion(s.minutos)} · {s.personas.length} {s.personas.length === 1 ? "persona" : "personas"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted-foreground">Todavía no hay tiempo medido en estos días.</p>
          )}
        </div>
        <p className="m-0 border-t border-border pt-3 text-xs text-muted-foreground">
          {sinExtension.length ? `Sin la extensión «Ecomfive · Uso»: ${sinExtension.map((f) => f.nombre.split(" ")[0]).join(", ")}. ` : "Todo el equipo tiene la extensión «Ecomfive · Uso». "}
          <a href="/extensiones/ecomfive-uso.zip" className="underline underline-offset-2">
            Descargar la extensión
          </a>
          . Solo cuenta minutos y sección; no lee las páginas.
        </p>
      </TarjetaUso>
    </div>
  );
}
