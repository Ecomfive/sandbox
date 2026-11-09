import { redirect } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { DEF_ALERTA, type TipoAlerta } from "@/lib/tareas/alertas";
import { TAREAS_PROGRAMADAS, TITULO_TAREA, esClaveTarea } from "@/lib/tareas/definiciones";
import { BotonCorrer, BotonVista } from "./botones";
import { TablaEjecuciones, type FilaEjecucion } from "./tabla-ejecuciones";

export const metadata = { title: "Tareas programadas" };

export const dynamic = "force-dynamic";
// «Correr ahora» espera a la tarea (se corta a los 45 s).
export const maxDuration = 60;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const hora = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const cuando = (iso: string) => fechaHora(iso);

interface Ejecucion {
  id: string;
  tarea: string;
  inicio: string;
  fin: string | null;
  ok: boolean | null;
  resumen: string | null;
  error: string | null;
  disparo: string;
  pendiente: unknown;
}

function estadoDe(e: Ejecucion): FilaEjecucion["estado"] {
  if (!e.fin) return "corriendo";
  if (!e.ok) return "error";
  return e.pendiente ? "pendiente" : "ok";
}

export default async function TareasProgramadasPage() {
  const usuario = await requireModulo("usuarios");
  if (usuario.modulosSoloLectura.includes("usuarios")) redirect("/sin-acceso");
  const supabase = createServiceClient();
  const [ejecuciones, alertas] = await Promise.all([
    supabase.from("fin_tareas_ejecuciones").select("id, tarea, inicio, fin, ok, resumen, error, disparo, pendiente").order("inicio", { ascending: false }).limit(200),
    supabase.from("fin_alertas").select("id, tipo, severidad, mensaje, enlace, creada").is("resuelta_en", null).is("vista_en", null).order("creada", { ascending: false }).limit(200),
  ]);

  if (ejecuciones.error) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Tareas programadas" oculto />
        <EstadoVacioAF4 titulo="Las tareas programadas todavía no están instaladas">Falta correr la migración 0921 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const lista = (ejecuciones.data ?? []) as Ejecucion[];
  const ultima = new Map<string, Ejecucion>();
  for (const e of lista) if (!ultima.has(e.tarea)) ultima.set(e.tarea, e);
  const filas: FilaEjecucion[] = lista.map((e) => ({
    id: e.id,
    tarea: e.tarea,
    titulo: esClaveTarea(e.tarea) ? TITULO_TAREA[e.tarea] : e.tarea,
    cuando: cuando(e.inicio),
    inicio: e.inicio.slice(0, 10),
    duracion: e.fin ? `${entero(Math.max(0, Math.round((Date.parse(e.fin) - Date.parse(e.inicio)) / 1000)))} s` : "—",
    estado: estadoDe(e),
    disparo: e.disparo === "manual" ? "A mano" : "Programada",
    texto: e.error ?? e.resumen ?? "—",
  }));
  const activas = (alertas.data ?? []) as { id: string; tipo: TipoAlerta; severidad: string; mensaje: string; enlace: string | null; creada: string }[];

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Tareas programadas" actualizado={lista[0]?.inicio ?? null} imprimir={false} />

      <MarcoAF4 id="titulo-tareas" titulo="Tareas" detalle="Hora de Panamá" sinRelleno>
        <ul className="m-0 list-none p-0">
          {TAREAS_PROGRAMADAS.map((t) => {
            const u = ultima.get(t.clave);
            const estado = u ? estadoDe(u) : null;
            return (
              <li key={t.clave} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="m-0 flex items-center gap-1.5 text-sm font-medium">
                    {estado && estado !== "ok" && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${estado === "error" ? "bg-destructive" : "bg-warning"}`} />}
                    {t.titulo}
                  </p>
                  <p className="m-0 text-xs text-muted-foreground">
                    {t.diaMes ? `El día ${t.diaMes} de cada mes` : t.dias.length ? `Los ${t.dias.map((d) => DIAS[d]).join(", ")}` : "Todos los días"} a las {t.horas.map((h) => hora(h.hora, h.minuto)).join(" y ")}
                    {u ? ` · última: ${cuando(u.inicio)}` : " · nunca corrió"}
                  </p>
                  {u && <p className="m-0 mt-1 line-clamp-2 text-xs">{u.error ?? u.resumen ?? "—"}</p>}
                </div>
                <BotonCorrer clave={t.clave} titulo={t.titulo} />
              </li>
            );
          })}
        </ul>
      </MarcoAF4>

      {!alertas.error && (
        <MarcoAF4 id="titulo-alertas" titulo="Alertas activas" detalle={entero(activas.length)} sinRelleno>
          {activas.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-3 text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
              No hay alertas activas.
            </p>
          ) : (
            <ul className="m-0 max-h-[28rem] list-none overflow-auto p-0">
              {activas.map((a) => (
                <li key={a.id} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.severidad === "critica" ? "bg-destructive" : a.severidad === "aviso" ? "bg-warning" : "bg-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm">{a.mensaje}</p>
                    <p className="m-0 text-xs text-muted-foreground">
                      {DEF_ALERTA[a.tipo]?.titulo ?? a.tipo} · {cuando(a.creada)}
                    </p>
                  </div>
                  <BotonVista id={a.id} mensaje={a.mensaje} />
                </li>
              ))}
            </ul>
          )}
        </MarcoAF4>
      )}

      <section aria-labelledby="titulo-ejecuciones" className="flex flex-col gap-2">
        <h2 id="titulo-ejecuciones" className="text-xs font-semibold text-foreground">
          Últimas ejecuciones
        </h2>
        <TablaEjecuciones filas={filas} />
      </section>
    </Pagina>
  );
}
