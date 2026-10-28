import Link from "next/link";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { fieldClass } from "@/components/ui/field";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { Tooltip } from "@/components/ui/tooltip";
import { irAlInicio, requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { cargarDia, type PersonaDelDia } from "@/lib/rendimiento/datos";
import { MINUTOS_PAUSA, ZONA, diaPanama, duracion, etiquetaHora, rangoDeHoras, type Jornada } from "@/lib/rendimiento/jornada";
import { GraficaHoras } from "./grafica-horas";

export const metadata = { title: "Rendimiento" };

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-PA", { timeZone: ZONA, hour: "numeric", minute: "2-digit" }) : "—");
const otroDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const fechaLarga = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const enlace = (dia: string, persona?: string, h?: number) => `/rendimiento?dia=${dia}${persona ? `&persona=${persona}` : ""}${h !== undefined ? `&hora=${h}` : ""}`;

/**
 * Equipo › Rendimiento (pedido de Alcides, 27 oct 2026; migración 0166): la jornada de cada persona en un día: entrada, salida,
 * tiempo activo, pausas y qué hizo en cada hora (en qué páginas estuvo y qué guardó). Solo lo ven los administradores.
 */
export default async function RendimientoPage({ searchParams }: { searchParams: Promise<{ dia?: string; persona?: string; hora?: string }> }) {
  const usuario = await requireModulo("rendimiento");
  if (!esAdministrador(usuario)) irAlInicio(usuario, "rendimiento");
  const { dia: diaPedido, persona, hora: horaPedida } = await searchParams;
  const horaInicial = typeof horaPedida === "string" && /^\d{1,2}$/.test(horaPedida) && Number(horaPedida) < 24 ? Number(horaPedida) : null;
  const hoy = diaPanama();
  const dia = typeof diaPedido === "string" && DIA.test(diaPedido) && diaPedido <= hoy ? diaPedido : hoy;
  const equipo = await cargarDia(dia);
  const elegida = equipo?.find((p) => p.id === persona) ?? null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Rendimiento" oculto />
      <nav aria-label="Elegir el día" className="flex flex-wrap items-center gap-2">
        <Link href={enlace(otroDia(dia, -1), elegida?.id)} className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
          ← Día anterior
        </Link>
        <form action="/rendimiento" className="flex items-center gap-2">
          {elegida && <input type="hidden" name="persona" value={elegida.id} />}
          <label className="flex items-center gap-2">
            <span className="sr-only">Día</span>
            <input type="date" name="dia" defaultValue={dia} max={hoy} className={`${fieldClass} w-auto`} />
          </label>
          <button type="submit" className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
            Ver
          </button>
        </form>
        {dia < hoy && (
          <Link href={enlace(otroDia(dia, 1), elegida?.id)} className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
            Día siguiente →
          </Link>
        )}
        {dia !== hoy && (
          <Link href={enlace(hoy, elegida?.id)} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            Hoy
          </Link>
        )}
        <span className="ml-auto text-sm text-muted-foreground first-letter:uppercase">{fechaLarga(dia)}</span>
      </nav>

      {!equipo ? (
        <p role="note" className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          Falta correr en Supabase la migración 0166.
        </p>
      ) : (
        <>
          <Equipo equipo={equipo} dia={dia} elegida={elegida?.id ?? null} />
          {elegida && <Detalle key={`${elegida.id}-${dia}-${horaInicial}`} persona={elegida} hora={horaInicial} />}
        </>
      )}
    </Pagina>
  );
}

function Equipo({ equipo, dia, elegida }: { equipo: PersonaDelDia[]; dia: string; elegida: string | null }) {
  const con = equipo.filter((p) => p.jornada.entrada);
  const total = con.reduce((t, p) => t + p.jornada.minutosActivos, 0);
  return (
    <section aria-labelledby="titulo-equipo" className="flex flex-col gap-4">
      <h2 id="titulo-equipo" className="text-base font-semibold">
        El equipo
      </h2>
      <KpiGrid compacta>
        <KpiCard compacta titulo="Personas que trabajaron" valor={`${con.length} de ${equipo.length}`} />
        <KpiCard compacta titulo="Tiempo activo del equipo" valor={duracion(total)} />
        <KpiCard compacta titulo="Acciones guardadas" valor={con.reduce((t, p) => t + p.jornada.acciones, 0).toLocaleString("es-PA")} />
      </KpiGrid>
      <ContenedorTabla ariaLabel="Jornada de cada persona">
        <table className="tabla-datos w-full text-sm">
          <thead>
            <tr className={claseFilaEncabezado}>
              {["Persona", "Horas", "Entrada", "Salida", "Tiempo activo", "Pausas", "Acciones", "Más tiempo en"].map((t) => (
                <th key={t} scope="col" className={claseEncabezadoColumna}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipo.map((p) => {
              const j = p.jornada;
              const activa = p.id === elegida;
              return (
                <tr key={p.id} className={`border-b border-border last:border-0 ${activa ? "bg-accent" : ""} ${j.entrada ? "" : "text-muted-foreground"}`}>
                  <td className={claseCeldaColumna}>
                    <Link href={enlace(dia, p.id)} aria-current={activa ? "true" : undefined} className="font-medium text-foreground underline-offset-2 hover:underline">
                      {p.nombre}
                    </Link>
                  </td>
                  <td className={claseCeldaColumna}>
                    <TiraHoras persona={p} dia={dia} />
                  </td>
                  <td className={`${claseCeldaColumna} tabular-nums`}>{hora(j.entrada)}</td>
                  <td className={`${claseCeldaColumna} tabular-nums`}>{hora(j.salida)}</td>
                  <td className={`${claseCeldaColumna} tabular-nums`}>{j.entrada ? duracion(j.minutosActivos) : "Sin actividad"}</td>
                  <td className={`${claseCeldaColumna} tabular-nums`}>{j.pausas.length ? `${j.pausas.length} · ${duracion(j.pausas.reduce((t, x) => t + x.minutos, 0))}` : "—"}</td>
                  <td className={`${claseCeldaColumna} tabular-nums`}>{j.acciones || "—"}</td>
                  <td className={claseCeldaColumna}>{j.principal ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ContenedorTabla>
    </section>
  );
}

/** Una barrita por hora (los minutos activos) en la fila de cada persona; pulsar una abre su día en esa hora. */
function TiraHoras({ persona, dia }: { persona: PersonaDelDia; dia: string }) {
  const horas = new Map(persona.jornada.horas.map((h) => [h.hora, h]));
  return (
    <span className="flex h-7 items-end gap-px">
      {rangoDeHoras(persona.jornada.horas).map((h) => {
        const x = horas.get(h);
        const minutos = x?.minutos ?? 0;
        const etiqueta = `${persona.nombre}, ${etiquetaHora(h)}: ${minutos} min${x?.acciones.length ? `, ${x.acciones.length} acciones` : ""}`;
        return (
          <span key={h} className="flex h-full [&>span]:h-full">
          <Tooltip texto={etiqueta}>
            <Link href={enlace(dia, persona.id, h)} aria-label={etiqueta} className="flex h-full w-2 items-end rounded-sm hover:bg-muted">
              <span
                aria-hidden="true"
                className={`block w-full rounded-t-[2px] ${minutos ? "bg-primario/70" : x?.acciones.length ? "bg-primario/30" : "bg-border"}`}
                style={{ height: minutos ? `${Math.max(12, (Math.min(60, minutos) / 60) * 100)}%` : x?.acciones.length ? "20%" : "2px" }}
              />
            </Link>
          </Tooltip>
          </span>
        );
      })}
    </span>
  );
}

function Detalle({ persona, hora: horaInicial }: { persona: PersonaDelDia; hora: number | null }) {
  const j: Jornada = persona.jornada;
  return (
    <section aria-labelledby="titulo-persona" className="flex flex-col gap-4">
      <h2 id="titulo-persona" className="text-base font-semibold">
        {persona.nombre}, hora por hora
      </h2>
      {!j.entrada ? (
        <p className="text-sm text-muted-foreground">Sin actividad en el sistema este día.</p>
      ) : (
        <>
          <KpiGrid compacta>
            <KpiCard compacta titulo="Entrada" valor={hora(j.entrada)} />
            <KpiCard compacta titulo="Salida" valor={hora(j.salida)} />
            <KpiCard compacta titulo="Tiempo activo" valor={duracion(j.minutosActivos)} />
            <KpiCard
              compacta
              titulo={`Pausas de más de ${MINUTOS_PAUSA} min`}
              valor={j.pausas.length ? duracion(j.pausas.reduce((t, x) => t + x.minutos, 0)) : "Ninguna"}
              subtexto={j.pausas.length ? j.pausas.map((p) => `${hora(p.desde)}–${hora(p.hasta)}`).join(" · ") : undefined}
            />
            <KpiCard compacta titulo="Acciones guardadas" valor={j.acciones.toLocaleString("es-PA")} />
          </KpiGrid>
          <GraficaHoras horas={j.horas} inicial={horaInicial} />
        </>
      )}
    </section>
  );
}
