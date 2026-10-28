"use client";

import { useRouter } from "next/navigation";
import { BotonBarra, MarcoTabla, Pastilla, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";

/** Lo que devuelve `whatsapp_kpis` (migración 0164). Los minutos llegan como número o null; los conteos, como número. */
export interface KpisWhatsapp {
  numeros: {
    id: string;
    nombre: string;
    numero: string;
    area: string;
    conversaciones: number;
    recibidos: number;
    enviados: number;
    consultas: number;
    sin_responder: number;
    en_15_min: number;
    mediana_min: number | null;
    promedio_min: number | null;
  }[];
  /** Por área del chat (migración 0168; con un solo número es el desglose que importa). */
  areas?: { area: string; conversaciones: number; consultas: number; sin_responder: number; en_15_min: number; mediana_min: number | null }[];
  personas: { persona: string; enviados: number; respondidas: number; mediana_min: number | null; en_15_min: number }[];
  dias: { dia: string; consultas: number; sin_responder: number; mediana_min: number | null }[];
}

const AREA: Record<string, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };

/** «8 min», «1 h 20 min», «2 d 3 h». */
function duracion(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return "—";
  const m = Math.round(Number(minutos));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const h = Math.round(m / 60);
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}

const porcentaje = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)} %` : "—");

/** La mediana de todas las consultas, aproximada con la de cada número pesada por sus consultas respondidas. */
function medianaGeneral(numeros: KpisWhatsapp["numeros"]): number | null {
  const con = numeros.filter((n) => n.mediana_min !== null && n.consultas - n.sin_responder > 0);
  const peso = con.reduce((s, n) => s + (n.consultas - n.sin_responder), 0);
  return peso ? con.reduce((s, n) => s + Number(n.mediana_min) * (n.consultas - n.sin_responder), 0) / peso : null;
}

/** CRM › KPIs de atención: indicadores generales, por número, por persona y por día. */
export function VistaKpis({ datos, dias, periodos }: { datos: KpisWhatsapp; dias: number; periodos: number[] }) {
  const router = useRouter();
  const numeros = datos?.numeros ?? [];
  const personas = datos?.personas ?? [];
  const porDia = datos?.dias ?? [];
  const consultas = numeros.reduce((s, n) => s + Number(n.consultas), 0);
  const sinResponder = numeros.reduce((s, n) => s + Number(n.sin_responder), 0);
  const en15 = numeros.reduce((s, n) => s + Number(n.en_15_min), 0);
  const conversaciones = numeros.reduce((s, n) => s + Number(n.conversaciones), 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodo">
        {periodos.map((p) => (
          <BotonBarra key={p} activo={p === dias} onClick={() => router.push(`/crm-dropshippers/kpis?dias=${p}`)}>
            Últimos {p} días
          </BotonBarra>
        ))}
      </div>

      <KpiGroup titulo={`Últimos ${dias} días`}>
        <KpiGrid>
          <KpiCard titulo="Tiempo de respuesta (mediana)" valor={duracion(medianaGeneral(numeros))} subtexto="Desde que el dropshipper escribe hasta la primera respuesta" tono="info" />
          <KpiCard titulo="Respondidas en 15 min" valor={porcentaje(en15, consultas)} subtexto={`${en15} de ${consultas} consultas`} tono="success" />
          <KpiCard titulo="Sin responder" valor={sinResponder} subtexto="Consultas que todavía no tienen respuesta" tono={sinResponder ? "destructive" : "neutral"} />
          <KpiCard titulo="Conversaciones" valor={conversaciones} subtexto={`${consultas} consultas`} />
        </KpiGrid>
      </KpiGroup>

      {(datos?.areas ?? []).length > 0 && (
        <MarcoTabla ariaLabel="KPIs por área">
          <table className="w-full min-w-[40rem] border-collapse">
            <thead>
              <tr>
                {["Área", "Conversaciones", "Consultas", "Sin responder", "Tiempo de respuesta (mediana)", "En 15 min"].map((t) => (
                  <th key={t} scope="col" className={claseTh}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(datos.areas ?? []).map((a) => (
                <tr key={a.area} className="hover:bg-muted">
                  <td className={`${claseTd} font-medium`}>{AREA[a.area] ?? a.area}</td>
                  <td className={`${claseTd} tabular-nums`}>{a.conversaciones}</td>
                  <td className={`${claseTd} tabular-nums`}>{a.consultas}</td>
                  <td className={claseTd}>{a.sin_responder ? <Pastilla tono="peligro">{a.sin_responder}</Pastilla> : "0"}</td>
                  <td className={`${claseTd} tabular-nums`}>{duracion(a.mediana_min)}</td>
                  <td className={`${claseTd} tabular-nums`}>{porcentaje(a.en_15_min, a.consultas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MarcoTabla>
      )}

      <MarcoTabla ariaLabel="KPIs por número">
        <table className="w-full min-w-[56rem] border-collapse">
          <thead>
            <tr>
              {["Número", "Área", "Conversaciones", "Recibidos", "Enviados", "Consultas", "Sin responder", "Mediana", "Promedio", "En 15 min"].map((t) => (
                <th key={t} scope="col" className={claseTh}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numeros.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Todavía no hay números de WhatsApp conectados.
                </td>
              </tr>
            ) : (
              numeros.map((n) => (
                <tr key={n.id} className="hover:bg-muted">
                  <td className={claseTd}>
                    <span className="block font-medium">{n.nombre}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">{n.numero}</span>
                  </td>
                  <td className={claseTd}>{AREA[n.area] ?? n.area}</td>
                  <td className={`${claseTd} tabular-nums`}>{n.conversaciones}</td>
                  <td className={`${claseTd} tabular-nums`}>{n.recibidos}</td>
                  <td className={`${claseTd} tabular-nums`}>{n.enviados}</td>
                  <td className={`${claseTd} tabular-nums`}>{n.consultas}</td>
                  <td className={claseTd}>{n.sin_responder ? <Pastilla tono="peligro">{n.sin_responder}</Pastilla> : "0"}</td>
                  <td className={`${claseTd} tabular-nums`}>{duracion(n.mediana_min)}</td>
                  <td className={`${claseTd} tabular-nums`}>{duracion(n.promedio_min)}</td>
                  <td className={`${claseTd} tabular-nums`}>{porcentaje(n.en_15_min, n.consultas)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </MarcoTabla>

      <MarcoTabla ariaLabel="KPIs por persona">
        <table className="w-full min-w-[40rem] border-collapse">
          <thead>
            <tr>
              {["Persona", "Mensajes enviados", "Consultas respondidas", "Tiempo de respuesta (mediana)", "En 15 min"].map((t) => (
                <th key={t} scope="col" className={claseTh}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {personas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nadie ha respondido en este periodo.
                </td>
              </tr>
            ) : (
              personas.map((p) => (
                <tr key={p.persona} className="hover:bg-muted">
                  <td className={`${claseTd} font-medium`}>{p.persona}</td>
                  <td className={`${claseTd} tabular-nums`}>{p.enviados}</td>
                  <td className={`${claseTd} tabular-nums`}>{p.respondidas}</td>
                  <td className={`${claseTd} tabular-nums`}>{duracion(p.mediana_min)}</td>
                  <td className={`${claseTd} tabular-nums`}>{porcentaje(p.en_15_min, p.respondidas)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </MarcoTabla>

      <MarcoTabla ariaLabel="KPIs por día">
        <table className="w-full min-w-[32rem] border-collapse">
          <thead>
            <tr>
              {["Día", "Consultas", "Sin responder", "Tiempo de respuesta (mediana)"].map((t) => (
                <th key={t} scope="col" className={claseTh}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porDia.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Sin consultas en este periodo.
                </td>
              </tr>
            ) : (
              [...porDia].reverse().map((d) => (
                <tr key={d.dia} className="hover:bg-muted">
                  <td className={`${claseTd} tabular-nums`}>{new Date(`${d.dia}T12:00:00`).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className={`${claseTd} tabular-nums`}>{d.consultas}</td>
                  <td className={`${claseTd} tabular-nums`}>{d.sin_responder}</td>
                  <td className={`${claseTd} tabular-nums`}>{duracion(d.mediana_min)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </MarcoTabla>
    </>
  );
}
