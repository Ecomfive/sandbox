import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { GUIAS } from "@/lib/ayuda/contenido";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import {
  CLAVE_GUIA_OPERACION,
  MIGRACIONES_CLAVE,
  SECCION_MANUAL,
  describirPrueba,
  pruebasParaSql,
  diasDesde,
  enlaceManual,
  estadoTarea,
  estadoVariables,
  ultimaPor,
  type EstadoTarea,
} from "@/lib/finanzas/estado-sistema";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { variablesQboFaltantes } from "@/lib/quickbooks/oauth";
import { createServiceClient } from "@/lib/supabase/server";
import { TAREAS_PROGRAMADAS } from "@/lib/tareas/definiciones";
import { nivel, type Metrica } from "@/lib/rendimiento/metricas";

export const metadata = { title: "Estado del sistema" };

export const dynamic = "force-dynamic";

type Tono = "ok" | "aviso" | "error" | "neutro";
const PUNTO: Record<Tono, string> = { ok: "bg-success", aviso: "bg-warning", error: "bg-destructive", neutro: "bg-muted-foreground" };
const TEXTO_TONO: Record<Tono, string> = { ok: "Bien", aviso: "Revisar", error: "Falla", neutro: "Sin dato" };
const TONO_TAREA: Record<EstadoTarea, Tono> = { ok: "ok", corriendo: "neutro", atrasada: "aviso", error: "error", nunca: "aviso" };
const ETIQUETA_TAREA: Record<EstadoTarea, string> = { ok: "Al día", corriendo: "Corriendo", atrasada: "Atrasada", error: "Falló", nunca: "Nunca corrió" };

function Fila({ tono, titulo, detalle, accion }: { tono: Tono; titulo: ReactNode; detalle?: ReactNode; accion?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[tono]}`} />
      <span className="sr-only">{TEXTO_TONO[tono]}: </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-medium">{titulo}</p>
        {detalle && <p className="m-0 text-xs text-muted-foreground">{detalle}</p>}
      </div>
      {accion}
    </li>
  );
}

/**
 * Si cada migración se corrió (true / false / null = no se puede saber). Con la 0954 lo dice el catálogo de Postgres
 * (`fin_estado_migraciones`); sin ella, una lectura de su tabla, vista o columna.
 */
async function estadoMigraciones(supabase: ReturnType<typeof createServiceClient>): Promise<{ ok: (boolean | null)[] }> {
  const r = await supabase.rpc("fin_estado_migraciones", { p_pruebas: pruebasParaSql() });
  if (!r.error && Array.isArray(r.data)) {
    const porMigracion = new Map((r.data as { migracion: string; ok: boolean }[]).map((f) => [f.migracion, f.ok === true]));
    return { ok: MIGRACIONES_CLAVE.map((m) => porMigracion.get(m.migracion) ?? null) };
  }
  const ok = await Promise.all(
    MIGRACIONES_CLAVE.map(async ({ prueba }) => {
      if (prueba.tipo === "tabla" || prueba.tipo === "vista") return !(await supabase.from(prueba.nombre).select("*", { count: "exact", head: true })).error;
      if (prueba.tipo === "columna") return !(await supabase.from(prueba.nombre).select(prueba.columna).limit(1)).error;
      return null;
    }),
  );
  return { ok };
}

export default async function EstadoSistemaPage() {
  const usuario = await requireModulo("panel-financiero");
  const administra = usuario.modulos.includes("usuarios") && !usuario.modulosSoloLectura.includes("usuarios");
  if (!administra && !veTodaLaEmpresa(await cargarTiendasPermitidas())) redirect("/sin-acceso");

  const supabase = createServiceClient();
  const ahora = new Date();
  const guia = GUIAS.find((g) => g.clave === CLAVE_GUIA_OPERACION);
  const manual = (k: keyof typeof SECCION_MANUAL) => enlaceManual(guia?.secciones ?? [], SECCION_MANUAL[k]);
  const queHacer = (k: keyof typeof SECCION_MANUAL) => (
    <Link href={manual(k)} className={`shrink-0 text-xs font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
      Qué hacer
    </Link>
  );

  const [ejecuciones, importaciones, shopify, dropi, respaldo, qbo, monday, migraciones] = await Promise.all([
    supabase.from("fin_tareas_ejecuciones").select("tarea, inicio, fin, ok, resumen, error").order("inicio", { ascending: false }).limit(300),
    supabase.from("fin_importaciones").select("modulo, archivo, estado, creado_en, usuario_nombre").order("creado_en", { ascending: false }).limit(300),
    supabase.from("fin_shopify_estado").select("tienda, ordenes, actualizado_en").order("tienda"),
    supabase.from("fin_dropi_mensual").select("actualizado_en").order("actualizado_en", { ascending: false }).limit(1),
    supabase.from("fin_respaldos").select("ruta, tablas, creado_en").order("creado_en", { ascending: false }).limit(1),
    supabase.from("qbo_conexion").select("realm_id, entorno, conectado_en, ultima_lectura, ultimo_error").eq("id", 1).maybeSingle(),
    supabase.from("mon_config").select("tablero_id, tablero_nombre, items, ultima_lectura, ultimo_error").eq("id", 1).maybeSingle(),
    estadoMigraciones(supabase),
  ]);

  type Ejec = { tarea: string; inicio: string; fin: string | null; ok: boolean | null; resumen: string | null; error: string | null };
  const ultimas = ultimaPor((ejecuciones.data ?? []) as Ejec[], (e) => e.tarea);
  const tareas = TAREAS_PROGRAMADAS.map((t) => ({ t, u: ultimas.get(t.clave) ?? null, estado: estadoTarea(t, ultimas.get(t.clave) ?? null, ahora) }));
  type Imp = { modulo: string; archivo: string; estado: string; creado_en: string; usuario_nombre: string | null };
  const imps = [...ultimaPor((importaciones.data ?? []) as Imp[], (i) => i.modulo).values()];
  const variables = estadoVariables(process.env);
  const faltanMigraciones = MIGRACIONES_CLAVE.filter((_, i) => migraciones.ok[i] === false);
  const ultimoRespaldo = (respaldo.data?.[0] as { ruta: string; tablas: Record<string, number>; creado_en: string } | undefined) ?? null;
  const diasRespaldo = diasDesde(ultimoRespaldo?.creado_en, ahora);
  const ultimoDropi = (dropi.data?.[0] as { actualizado_en: string } | undefined)?.actualizado_en ?? null;
  const tiendasShopify = (shopify.data ?? []) as { tienda: string; ordenes: number; actualizado_en: string }[];
  const qboFaltan = variablesQboFaltantes(process.env);
  const conexionQbo = qbo.data as { realm_id: string; entorno: string; conectado_en: string; ultima_lectura: string | null; ultimo_error: string | null } | null;
  const cfgMonday = monday.data as { tablero_id: string | null; tablero_nombre: string | null; items: number; ultima_lectura: string | null; ultimo_error: string | null } | null;
  const tokenMonday = variables.find((v) => v.nombre === "MONDAY_API_TOKEN")?.configurada ?? false;
  const estadoQbo: { tono: Tono; detalle: string } = qbo.error
    ? { tono: "neutro", detalle: "Falta la migración 0950" }
    : qboFaltan.length
      ? { tono: "neutro", detalle: `Apagada: faltan ${qboFaltan.join(", ")}` }
      : !conexionQbo
        ? { tono: "aviso", detalle: "Sin conectar (Cierre de mes › QuickBooks)" }
        : conexionQbo.ultimo_error
          ? { tono: "error", detalle: `Error: ${conexionQbo.ultimo_error.slice(0, 160)}` }
          : !conexionQbo.ultima_lectura || (diasDesde(conexionQbo.ultima_lectura, ahora) ?? 0) > 2
            ? { tono: "aviso", detalle: conexionQbo.ultima_lectura ? `Última lectura ${fechaHora(conexionQbo.ultima_lectura)}` : `Conectada (${conexionQbo.entorno}), sin lecturas` }
            : { tono: "ok", detalle: `Conectada (${conexionQbo.entorno}) · última lectura ${fechaHora(conexionQbo.ultima_lectura)}` };
  const estadoMonday: { tono: Tono; detalle: string } = monday.error
    ? { tono: "neutro", detalle: "Falta la migración 0951" }
    : !tokenMonday
      ? { tono: "neutro", detalle: "Apagada: falta MONDAY_API_TOKEN" }
      : !cfgMonday?.tablero_id
        ? { tono: "aviso", detalle: "Falta elegir el tablero (Deliverys › Monday)" }
        : cfgMonday.ultimo_error
          ? { tono: "error", detalle: `Error: ${cfgMonday.ultimo_error.slice(0, 160)}` }
          : !cfgMonday.ultima_lectura || (diasDesde(cfgMonday.ultima_lectura, ahora) ?? 0) > 2
            ? { tono: "aviso", detalle: cfgMonday.ultima_lectura ? `Última lectura ${fechaHora(cfgMonday.ultima_lectura)}` : "Tablero elegido, sin lecturas" }
            : { tono: "ok", detalle: `${cfgMonday.tablero_nombre ?? `Tablero ${cfgMonday.tablero_id}`} · ${entero(cfgMonday.items)} ítems · última lectura ${fechaHora(cfgMonday.ultima_lectura)}` };

  // Mejora 32: las páginas más lentas de los últimos 7 días (p75 de LCP), con TTFB e INP.
  const met = await supabase.rpc("app_metricas_resumen", { p_dias: 7 });
  type FilaMet = { ruta: string; metrica: Metrica; n: number; p50: number; p75: number; p95: number };
  const porRuta = new Map<string, Partial<Record<Metrica, FilaMet>>>();
  for (const f of (met.error ? [] : (met.data ?? [])) as FilaMet[]) porRuta.set(f.ruta, { ...(porRuta.get(f.ruta) ?? {}), [f.metrica]: { ...f, p75: Number(f.p75), n: Number(f.n) } });
  const lentas = [...porRuta.entries()]
    .filter(([, m]) => m.LCP && m.LCP.n >= 3)
    .sort((a, b) => (b[1].LCP?.p75 ?? 0) - (a[1].LCP?.p75 ?? 0))
    .slice(0, 12);
  const tonoMet: Record<"bueno" | "mejorar" | "malo", Tono> = { bueno: "ok", mejorar: "aviso", malo: "error" };
  const seg = (ms: number | undefined) => (ms === undefined ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

  const conProblema = tareas.filter((x) => x.estado === "error" || x.estado === "atrasada").length;
  const obligatoriasFaltan = variables.filter((v) => v.obligatoria && !v.configurada).length;

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Estado del sistema"
        actualizado={ahora.toISOString()}
        imprimir={false}
        acciones={
          <Link href={`/ayuda/guias/${CLAVE_GUIA_OPERACION}`} className={`text-sm font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
            Manual de operación
          </Link>
        }
      />

      <FilaKpiAF4>
        <KpiAF4 titulo="Tareas con problemas" tono={conProblema ? "destructive" : "success"} valor={entero(conProblema)} subtexto={`de ${TAREAS_PROGRAMADAS.length}`} />
        <KpiAF4 titulo="Migraciones sin correr" tono={faltanMigraciones.length ? "warning" : "success"} valor={entero(faltanMigraciones.length)} subtexto={`de ${MIGRACIONES_CLAVE.length} revisadas`} />
        <KpiAF4 titulo="Variables obligatorias que faltan" tono={obligatoriasFaltan ? "destructive" : "success"} valor={entero(obligatoriasFaltan)} />
        <KpiAF4 titulo="Último respaldo" tono={diasRespaldo === null || diasRespaldo > 8 ? "warning" : "success"} valor={diasRespaldo === null ? "—" : diasRespaldo === 0 ? "Hoy" : `Hace ${entero(diasRespaldo)} d`} />
      </FilaKpiAF4>

      <MarcoAF4 id="estado-tareas" titulo="Tareas programadas" detalle="Última ejecución" sinRelleno accion={administra ? <Link href="/panel-financiero/tareas" className={`text-xs font-medium underline-offset-2 hover:underline ${anilloFoco}`}>Correr a mano</Link> : undefined}>
        {ejecuciones.error ? (
          <ul className="m-0 list-none p-0">
            <Fila tono="error" titulo="Falta la migración 0921" detalle="Sin registro de ejecuciones" accion={queHacer("tareas")} />
          </ul>
        ) : (
          <ul className="m-0 list-none p-0">
            {tareas.map(({ t, u, estado }) => (
              <Fila
                key={t.clave}
                tono={TONO_TAREA[estado]}
                titulo={`${t.titulo} · ${ETIQUETA_TAREA[estado]}`}
                detalle={u ? `${fechaHora(u.inicio)} · ${(u.error ?? u.resumen ?? "—").slice(0, 160)}` : "Sin ejecuciones registradas"}
                accion={estado === "ok" || estado === "corriendo" ? undefined : queHacer("tareas")}
              />
            ))}
          </ul>
        )}
      </MarcoAF4>

      <MarcoAF4 id="estado-cargas" titulo="Cargas de datos" sinRelleno>
        <ul className="m-0 list-none p-0">
          {importaciones.error ? (
            <Fila tono="aviso" titulo="Historial de importaciones" detalle="Falta la migración 0925" accion={queHacer("importar")} />
          ) : imps.length === 0 ? (
            <Fila tono="neutro" titulo="Importaciones de Excel" detalle="Ninguna registrada" />
          ) : (
            imps.map((i) => (
              <Fila
                key={i.modulo}
                tono={i.estado === "fallida" ? "error" : i.estado === "en_curso" ? "aviso" : "ok"}
                titulo={`Última importación · ${i.modulo}`}
                detalle={`${fechaHora(i.creado_en)} · ${i.archivo} · ${i.estado.replace("_", " ")}${i.usuario_nombre ? ` · ${i.usuario_nombre}` : ""}`}
                accion={i.estado === "fallida" || i.estado === "en_curso" ? queHacer("importar") : undefined}
              />
            ))
          )}
          {shopify.error ? (
            <Fila tono="neutro" titulo="Shopify" detalle="Falta la migración 0937" />
          ) : tiendasShopify.length === 0 ? (
            <Fila tono={variables.find((v) => v.nombre === "SHOPIFY_TIENDAS")?.configurada ? "aviso" : "neutro"} titulo="Shopify" detalle="Sin lecturas registradas" accion={queHacer("conexiones")} />
          ) : (
            tiendasShopify.map((s) => {
              const d = diasDesde(s.actualizado_en, ahora);
              return (
                <Fila key={s.tienda} tono={d !== null && d > 2 ? "aviso" : "ok"} titulo={`Shopify · ${s.tienda}`} detalle={`${fechaHora(s.actualizado_en)} · ${entero(s.ordenes)} órdenes leídas`} accion={d !== null && d > 2 ? queHacer("conexiones") : undefined} />
              );
            })
          )}
          {dropi.error ? (
            <Fila tono="neutro" titulo="Dropi al portal" detalle="Falta la migración 0938" />
          ) : (
            <Fila
              tono={!ultimoDropi ? "aviso" : (diasDesde(ultimoDropi, ahora) ?? 0) > 2 ? "aviso" : "ok"}
              titulo="Dropi al portal"
              detalle={ultimoDropi ? fechaHora(ultimoDropi) : "Sin lecturas registradas"}
              accion={!ultimoDropi || (diasDesde(ultimoDropi, ahora) ?? 0) > 2 ? queHacer("conexiones") : undefined}
            />
          )}
          <Fila
            tono={estadoQbo.tono}
            titulo={<Link href="/cierre-mes/quickbooks" className={`underline-offset-2 hover:underline ${anilloFoco}`}>QuickBooks Online</Link>}
            detalle={estadoQbo.detalle}
            accion={estadoQbo.tono === "ok" ? undefined : queHacer("quickbooks")}
          />
          <Fila
            tono={estadoMonday.tono}
            titulo={<Link href="/deliverys/monday" className={`underline-offset-2 hover:underline ${anilloFoco}`}>Monday.com</Link>}
            detalle={estadoMonday.detalle}
            accion={estadoMonday.tono === "ok" ? undefined : queHacer("monday")}
          />
          {respaldo.error ? (
            <Fila tono="aviso" titulo="Respaldo" detalle="Falta la migración 0937" accion={queHacer("respaldos")} />
          ) : (
            <Fila
              tono={diasRespaldo === null || diasRespaldo > 8 ? "aviso" : "ok"}
              titulo="Último respaldo"
              detalle={ultimoRespaldo ? `${fechaHora(ultimoRespaldo.creado_en)} · ${entero(Object.values(ultimoRespaldo.tablas ?? {}).filter((n) => n >= 0).length)} tablas` : "Nunca se respaldó"}
              accion={diasRespaldo === null || diasRespaldo > 8 ? queHacer("respaldos") : administra ? <Link href="/panel-financiero/respaldos" className={`text-xs font-medium underline-offset-2 hover:underline ${anilloFoco}`}>Respaldos</Link> : undefined}
            />
          )}
        </ul>
      </MarcoAF4>

      <MarcoAF4 id="estado-variables" titulo="Variables de entorno" detalle="Configurada sí o no" sinRelleno>
        <ul className="m-0 list-none p-0">
          {variables.map((v) => (
            <Fila
              key={v.nombre}
              tono={v.configurada ? "ok" : v.obligatoria ? "error" : "neutro"}
              titulo={
                <>
                  <code className="text-[13px]">{v.nombre}</code> · {v.configurada ? "Sí" : "No"}
                </>
              }
              detalle={`${v.para}${v.obligatoria ? " · obligatoria" : ""}`}
              accion={v.configurada ? undefined : queHacer(v.seccion)}
            />
          ))}
        </ul>
      </MarcoAF4>

      <MarcoAF4 id="estado-carga" titulo="Tiempo de carga" detalle="Últimos 7 días · lo que tarda en verse cada página (p75)" sinRelleno>
        {met.error ? (
          <p className="m-0 px-4 py-3 text-sm text-muted-foreground">Falta correr la migración 0969 en Supabase.</p>
        ) : !lentas.length ? (
          <p className="m-0 px-4 py-3 text-sm text-muted-foreground">Todavía no hay mediciones: se juntan a medida que el equipo usa el sistema.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {lentas.map(([ruta, m]) => (
              <Fila
                key={ruta}
                tono={tonoMet[nivel("LCP", m.LCP!.p75)]}
                titulo={ruta}
                detalle={`Se ve en ${seg(m.LCP!.p75)} · servidor ${seg(m.TTFB?.p75)} · responde al clic en ${seg(m.INP?.p75)} · ${entero(m.LCP!.n)} cargas`}
              />
            ))}
          </ul>
        )}
      </MarcoAF4>

      <MarcoAF4 id="estado-migraciones" titulo="Migraciones" detalle={`${MIGRACIONES_CLAVE[0].migracion}–${MIGRACIONES_CLAVE[MIGRACIONES_CLAVE.length - 1].migracion}`} sinRelleno>
        <ul className="m-0 list-none p-0">
          {MIGRACIONES_CLAVE.map((m, i) => {
            const ok = migraciones.ok[i];
            return (
              <Fila
                key={m.migracion}
                tono={ok === false ? "aviso" : ok === null ? "neutro" : "ok"}
                titulo={`${m.migracion} · ${m.que}`}
                detalle={ok === false ? `Falta ${describirPrueba(m.prueba)}` : ok === null ? `Sin comprobar (falta la migración 0954) · ${describirPrueba(m.prueba)}` : describirPrueba(m.prueba)}
                accion={ok === false ? queHacer("migraciones") : undefined}
              />
            );
          })}
        </ul>
      </MarcoAF4>
    </Pagina>
  );
}
