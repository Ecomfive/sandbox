// QuickBooks Online desde el servidor (migración 0950). Conexión (tokens cifrados con `QBO_TOKEN_KEY` en `qbo_conexion`),
// renovación automática del access token con el refresh token, lectura por la API v3 (solo GET: nunca se escribe en
// QuickBooks) y la sincronización diaria de la tarea `quickbooks`: plan de cuentas, clases y ubicaciones, ProfitAndLoss por
// mes (y por clase de los últimos meses) y ventas por mes. Sin las variables o sin conexión, la tarea queda apagada.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cifrar, descifrar } from "../seguridad/cifrado-tokens";
import { baseApi, cabeceraBasica, leerConfigQbo, leerRespuestaTokens, necesitaRenovar, URL_REVOCAR, URL_TOKENS, type ConfigQbo, type EntornoQbo, type Tokens } from "./oauth";
import {
  claseDeQbo,
  consultaPaginada,
  cuentaDeQbo,
  filasConsulta,
  filasPyg,
  rangoFechas,
  siguienteInicio,
  sumarVentasPorMes,
  TIPOS_VENTA,
} from "./reportes";

export const SIN_MIGRACION_QBO = "Falta correr la migración 0950 (QuickBooks) en Supabase.";
const VERSION_MENOR = "75";
/** Meses del ProfitAndLoss por mes y de las ventas que se leen cada día (el mes en curso y los 12 anteriores). */
export const MESES_LECTURA = 13;
/** Meses del reporte por clase (uno por llamada). */
export const MESES_POR_CLASE = 3;

export const configQbo = () => leerConfigQbo(process.env);

export interface ConexionQbo {
  realm_id: string;
  entorno: EntornoQbo;
  access_token_cifrado: string;
  refresh_token_cifrado: string;
  access_expira: string;
  refresh_expira: string | null;
  nombre_compania: string | null;
  conectado_en: string;
  ultima_lectura: string | null;
  ultimo_error: string | null;
}

/** La conexión guardada: `null` sin conectar; `{ error }` sin la migración. */
export async function leerConexionQbo(supabase: SupabaseClient): Promise<ConexionQbo | null | { error: string }> {
  const { data, error } = await supabase
    .from("qbo_conexion")
    .select("realm_id, entorno, access_token_cifrado, refresh_token_cifrado, access_expira, refresh_expira, nombre_compania, conectado_en, ultima_lectura, ultimo_error")
    .eq("id", 1)
    .maybeSingle();
  if (error) return { error: SIN_MIGRACION_QBO };
  return (data as ConexionQbo | null) ?? null;
}

async function pedirTokens(cfg: ConfigQbo, cuerpo: Record<string, string>): Promise<Tokens> {
  const r = await fetch(URL_TOKENS, {
    method: "POST",
    headers: { Authorization: cabeceraBasica(cfg), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(cuerpo).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) {
    const motivo = json && typeof json === "object" && typeof (json as Record<string, unknown>).error === "string" ? (json as Record<string, string>).error : `HTTP ${r.status}`;
    throw new Error(`Intuit rechazó el pedido de tokens (${motivo}).`);
  }
  const t = leerRespuestaTokens(json, Date.now());
  if (!t) throw new Error("Intuit respondió sin tokens.");
  return t;
}

/** Cambia el código del retorno por los tokens. */
export const intercambiarCodigo = (cfg: ConfigQbo, codigo: string) => pedirTokens(cfg, { grant_type: "authorization_code", code: codigo, redirect_uri: cfg.redirectUri });

/** Guarda (o reemplaza) la conexión con los tokens cifrados. */
export async function guardarConexionQbo(supabase: SupabaseClient, cfg: ConfigQbo, realmId: string, t: Tokens, usuarioId: string | null): Promise<{ error?: string }> {
  const { error } = await supabase.from("qbo_conexion").upsert(
    {
      id: 1,
      realm_id: realmId,
      entorno: cfg.entorno,
      access_token_cifrado: cifrar(t.accessToken, cfg.clave),
      refresh_token_cifrado: cifrar(t.refreshToken, cfg.clave),
      access_expira: t.accessExpira,
      refresh_expira: t.refreshExpira,
      conectado_por: usuarioId,
      conectado_en: new Date().toISOString(),
      ultimo_error: null,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  return error ? { error: /qbo_conexion/.test(error.message) ? SIN_MIGRACION_QBO : error.message } : {};
}

/** Revoca el refresh token en Intuit (si se puede) y borra la conexión; lo ya leído queda guardado. */
export async function desconectarQbo(supabase: SupabaseClient, cfg: ConfigQbo | null): Promise<{ error?: string }> {
  const c = await leerConexionQbo(supabase);
  if (c && "error" in c) return c;
  if (c && cfg) {
    const refresh = descifrar(c.refresh_token_cifrado, cfg.clave);
    if (refresh) {
      await fetch(URL_REVOCAR, {
        method: "POST",
        headers: { Authorization: cabeceraBasica(cfg), Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ token: refresh }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
    }
  }
  const { error } = await supabase.from("qbo_conexion").delete().eq("id", 1);
  return error ? { error: error.message } : {};
}

interface Sesion {
  token: string;
  realmId: string;
  entorno: EntornoQbo;
}

/** Un access token vigente: lo descifra y, si está por vencer, lo renueva y guarda los tokens nuevos. */
async function sesionQbo(supabase: SupabaseClient, cfg: ConfigQbo, forzar = false): Promise<Sesion> {
  const c = await leerConexionQbo(supabase);
  if (!c) throw new Error("QuickBooks no está conectado.");
  if ("error" in c) throw new Error(c.error);
  if (c.entorno !== cfg.entorno) throw new Error(`La conexión es de ${c.entorno} y QBO_ENTORNO dice ${cfg.entorno}: vuelve a conectar.`);
  if (!forzar && !necesitaRenovar(c.access_expira, Date.now())) {
    const token = descifrar(c.access_token_cifrado, cfg.clave);
    if (token) return { token, realmId: c.realm_id, entorno: c.entorno };
  }
  const refresh = descifrar(c.refresh_token_cifrado, cfg.clave);
  if (!refresh) throw new Error("No se pueden leer los tokens guardados (cambió QBO_TOKEN_KEY): vuelve a conectar QuickBooks.");
  const t = await pedirTokens(cfg, { grant_type: "refresh_token", refresh_token: refresh });
  const { error } = await supabase
    .from("qbo_conexion")
    .update({
      access_token_cifrado: cifrar(t.accessToken, cfg.clave),
      refresh_token_cifrado: cifrar(t.refreshToken, cfg.clave),
      access_expira: t.accessExpira,
      refresh_expira: t.refreshExpira ?? c.refresh_expira,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  return { token: t.accessToken, realmId: c.realm_id, entorno: c.entorno };
}

/** Un GET a la API v3 (con un reintento renovando el token si responde 401). */
async function qboGet(supabase: SupabaseClient, cfg: ConfigQbo, s: Sesion, ruta: string, params: Record<string, string>): Promise<{ sesion: Sesion; json: unknown }> {
  const pedir = (ses: Sesion) =>
    fetch(`${baseApi(ses.entorno)}/v3/company/${ses.realmId}/${ruta}?${new URLSearchParams({ ...params, minorversion: VERSION_MENOR }).toString()}`, {
      headers: { Authorization: `Bearer ${ses.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(25_000),
    });
  let ses = s;
  let r = await pedir(ses);
  if (r.status === 401) {
    ses = await sesionQbo(supabase, cfg, true);
    r = await pedir(ses);
  }
  if (r.status === 429) throw new Error("QuickBooks limitó las consultas (429): sigue en la próxima ejecución.");
  if (!r.ok) throw new Error(`QuickBooks respondió ${r.status} en ${ruta}.`);
  return { sesion: ses, json: await r.json() };
}

/** Todas las filas de una consulta, paginadas. */
async function consultarTodo(supabase: SupabaseClient, cfg: ConfigQbo, s: Sesion, entidad: string, donde: string, limite: number): Promise<{ sesion: Sesion; filas: Record<string, unknown>[] }> {
  let ses = s;
  const filas: Record<string, unknown>[] = [];
  let inicio: number | null = 1;
  while (inicio !== null) {
    if (Date.now() > limite) throw new Error("Se acabó el tiempo de la ejecución: sigue en la próxima.");
    const r: { sesion: Sesion; json: unknown } = await qboGet(supabase, cfg, ses, "query", { query: consultaPaginada(entidad, donde, inicio) });
    ses = r.sesion;
    const pagina = filasConsulta(r.json, entidad);
    filas.push(...pagina);
    inicio = siguienteInicio(inicio, pagina.length);
  }
  return { sesion: ses, filas };
}

const mesesHasta = (mesActual: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const [a, m] = mesActual.split("-").map(Number);
    return new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 10);
  }).reverse();

async function upsertEnTandas(supabase: SupabaseClient, tabla: string, filas: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from(tabla).upsert(filas.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

/** La tarea diaria: lee y guarda todo. Deja la última lectura (o el error) en la conexión. */
export async function sincronizarQuickbooks(supabase: SupabaseClient, hoy: string, limite: number): Promise<{ resumen: string }> {
  const cfg = configQbo();
  if (!cfg) return { resumen: "Apagada: faltan las variables QBO_* en el servidor." };
  const c = await leerConexionQbo(supabase);
  if (c && "error" in c) throw new Error(c.error);
  if (!c) return { resumen: "Apagada: QuickBooks no está conectado (Cierre de mes › QuickBooks)." };
  const ahora = new Date().toISOString();
  try {
    let s = await sesionQbo(supabase, cfg);
    // 1. Plan de cuentas
    const cuentas = await consultarTodo(supabase, cfg, s, "Account", "", limite);
    s = cuentas.sesion;
    const filasCuentas = cuentas.filas.map(cuentaDeQbo).filter((x) => x !== null);
    await upsertEnTandas(
      supabase,
      "qbo_cuentas",
      filasCuentas.map((x) => ({ id: x.id, nombre: x.nombre, nombre_completo: x.nombreCompleto, tipo: x.tipo, subtipo: x.subtipo, clasificacion: x.clasificacion, activa: x.activa, leido_en: ahora })),
      "id",
    );
    // 2. Clases y ubicaciones (tienda / país)
    let clases = 0;
    for (const [entidad, clase] of [["Class", "class"], ["Department", "department"]] as const) {
      const r = await consultarTodo(supabase, cfg, s, entidad, "", limite);
      s = r.sesion;
      const filas = r.filas.map(claseDeQbo).filter((x) => x !== null).map((x) => ({ clase, id: x.id, nombre: x.nombre, activa: x.activa, leido_en: ahora }));
      clases += filas.length;
      await upsertEnTandas(supabase, "qbo_clases", filas, "clase,id");
    }
    // 3. ProfitAndLoss por mes (reemplaza los meses leídos)
    const meses = mesesHasta(`${hoy.slice(0, 7)}-01`, MESES_LECTURA);
    const { desde, hasta } = rangoFechas(meses);
    const pyg = await qboGet(supabase, cfg, s, "reports/ProfitAndLoss", { start_date: desde, end_date: hasta, summarize_column_by: "Month", accounting_method: "Accrual" });
    s = pyg.sesion;
    const filasMes = filasPyg(pyg.json, "mes").filter((f) => meses.includes(f.columna));
    const borrar = await supabase.from("qbo_pyg_mensual").delete().eq("clase_id", "").gte("periodo", desde).lte("periodo", hasta);
    if (borrar.error) throw new Error(`qbo_pyg_mensual: ${borrar.error.message}`);
    await upsertEnTandas(
      supabase,
      "qbo_pyg_mensual",
      agruparPyg(filasMes.map((f) => ({ periodo: f.columna, clase_id: "", cuenta_id: f.cuentaId, cuenta_nombre: f.cuentaNombre, grupo: f.grupo, monto: f.monto, leido_en: ahora }))),
      "periodo,clase_id,cuenta_id",
    );
    // 4. Por clase, los últimos meses (si la compañía usa clases)
    let porClase = 0;
    if (clases > 0) {
      for (const m of meses.slice(-MESES_POR_CLASE)) {
        if (Date.now() > limite) break;
        const r = rangoFechas([m]);
        const rep = await qboGet(supabase, cfg, s, "reports/ProfitAndLoss", { start_date: r.desde, end_date: r.hasta, summarize_column_by: "Classes", accounting_method: "Accrual" });
        s = rep.sesion;
        const filas = filasPyg(rep.json, "clase").filter((f) => f.columna !== "");
        await supabase.from("qbo_pyg_mensual").delete().eq("periodo", m).neq("clase_id", "");
        await upsertEnTandas(
          supabase,
          "qbo_pyg_mensual",
          agruparPyg(filas.map((f) => ({ periodo: m, clase_id: f.columna.slice(0, 40), cuenta_id: f.cuentaId, cuenta_nombre: f.cuentaNombre, grupo: f.grupo, monto: f.monto, leido_en: ahora }))),
          "periodo,clase_id,cuenta_id",
        );
        porClase += filas.length;
      }
    }
    // 5. Ventas por mes (documentos)
    const ventas: Record<string, unknown>[] = [];
    for (const tipo of TIPOS_VENTA) {
      const r = await consultarTodo(supabase, cfg, s, tipo, `TxnDate >= '${desde}' and TxnDate <= '${hasta}'`, limite);
      s = r.sesion;
      const porMes = sumarVentasPorMes(r.filas);
      for (const m of meses) ventas.push({ periodo: m, tipo, documentos: porMes.get(m)?.documentos ?? 0, total: porMes.get(m)?.total ?? 0, leido_en: ahora });
    }
    await upsertEnTandas(supabase, "qbo_ventas_mensual", ventas, "periodo,tipo");
    await supabase.from("qbo_conexion").update({ ultima_lectura: ahora, ultimo_error: null }).eq("id", 1);
    return { resumen: `${filasCuentas.length} cuentas, ${clases} clases y ubicaciones, ${filasMes.length} importes de ${meses.length} meses${porClase ? `, ${porClase} por clase` : ""} y las ventas por mes.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falló la lectura de QuickBooks.";
    await supabase.from("qbo_conexion").update({ ultimo_error: msg.slice(0, 1000) }).eq("id", 1);
    throw new Error(msg);
  }
}

/** Una cuenta puede salir dos veces en el reporte (sin id, mismo nombre): se suman. */
function agruparPyg<T extends { periodo: string; clase_id: string; cuenta_id: string; monto: number }>(filas: T[]): T[] {
  const m = new Map<string, T>();
  for (const f of filas) {
    const k = `${f.periodo}|${f.clase_id}|${f.cuenta_id}`;
    const x = m.get(k);
    if (x) x.monto = Math.round((x.monto + f.monto) * 100) / 100;
    else m.set(k, { ...f });
  }
  return [...m.values()];
}
