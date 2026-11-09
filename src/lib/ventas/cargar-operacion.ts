// Lo que suma Ventas por tienda › Pipeline a cada orden y a la operación: riesgo del cliente, contactos, duplicadas,
// sugerencia de envío, cobertura, mensajeros, incidencias, aprobaciones y los indicadores de 30 días. Solo servidor.
// El teléfono del cliente nunca sale de aquí: solo su validez y si hay historial.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrdenPipeline } from "./cargar-pipeline";
import {
  antiguedadSaldos, detectarDuplicadas, estancadas, falloPorZona, leerUmbrales, normalizarTelefono, puntajeRiesgo, riesgoCliente, sugerirEnvio,
  type Cobertura, type CargaMensajero, type Edad, type HistorialCliente, type PaisOp, type PuntajeRiesgo, type ResultadoContacto, type Riesgo, type Sugerencia, type Umbrales,
} from "./operacion";

export interface ExtraOrden {
  telefonoValido: boolean;
  telefonoMotivo: string | null;
  riesgo: Riesgo;
  /** Mejora 63: puntaje de 0 a 100 con sus motivos. */
  puntaje: PuntajeRiesgo;
  historial: HistorialCliente;
  duplicadaDe: string | null;
  contactos: number;
  fallidos: number;
  ultimoContacto: { resultado: ResultadoContacto; canal: string; por: string | null; en: string } | null;
  noContactable: boolean;
  notas: number;
  asignadaA: string | null;
  congelada: boolean;
  congeladaMotivo: string | null;
  prometidaPara: string | null;
  conCambios: boolean;
  zona: string;
  sugerencia: Sugerencia | null;
  diasEnFase: number;
  estancada: boolean;
}

export interface FilaKpi {
  clave: string;
  creadas: number;
  confirmadas: number;
  despachadas: number;
  entregadas: number;
  devueltas: number;
  canceladas: number;
  fallidas: number;
  cicloHoras: number | null;
  ventas: number;
  margen: number;
}

export interface DatosOperacion {
  extra: Record<string, ExtraOrden>;
  umbrales: Umbrales;
  cobertura: (Cobertura & { id: string; pais: string; nombreMensajero: string | null })[];
  config: Record<string, { capacidad: number | null; limiteEfectivo: number | null; comision: number | null }>;
  carga: Record<string, { enRuta: number; tasaEntrega: number | null; efectivo: number }>;
  edades: { clave: string; nombre: string; edad: Edad }[];
  incidencias: { id: string; ordenId: string; numero: string; tipo: string; descripcion: string | null; costo: number; creada: string }[];
  aprobaciones: { id: string; accion: string; detalle: string | null; monto: number | null; por: string; numero: string | null; en: string }[];
  remesas: { id: string; fecha: string; total: number; quien: string; referencia: string | null; anulada: boolean; motivo: string | null }[];
  devueltasPorRecibir: { id: string; numero: string; tienda: string; productos: string }[];
  cierres: string[];
  kpis: { general: FilaKpi; porTienda: FilaKpi[]; porMensajero: FilaKpi[]; motivos: { motivo: string; n: number }[]; cancelaciones: { motivo: string; n: number }[]; porDia: { dia: string; creadas: number; entregadas: number }[] };
  proyeccion: { enRuta: number; esperado: number; total: number };
  ajustes: Record<string, { bodegaId: string | null; pasarelaPct: number; pasarelaFijo: number; itbmsTasa: number; pausada: boolean }>;
  bodegas: { id: string; nombre: string }[];
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const trozos = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const vacioHist = (): HistorialCliente => ({ entregadas: 0, devueltas: 0, canceladas: 0, fallidas: 0 });
const fila = (clave: string): FilaKpi => ({ clave, creadas: 0, confirmadas: 0, despachadas: 0, entregadas: 0, devueltas: 0, canceladas: 0, fallidas: 0, cicloHoras: null, ventas: 0, margen: 0 });

export async function cargarOperacion(
  supabase: SupabaseClient,
  ordenes: OrdenPipeline[],
  saldos: { ordenId: string; pendiente: number; dias: number; repartidorId: string | null; transportista: string | null }[],
  mensajeros: { id: string; nombre: string }[],
  unidades: { id: string; nombre: string; pais?: string }[],
  hoy: string,
): Promise<DatosOperacion | { error: string }> {
  const ids = ordenes.map((o) => o.id);
  const unidadIds = unidades.map((u) => u.id);
  const nombreMensajero = new Map(mensajeros.map((m) => [m.id, m.nombre]));
  const paisDe = new Map(ordenes.map((o) => [o.id, (o.pais as PaisOp) || "PA"]));

  const [cfgU, cob, cfgM, cierres, apro, inc, rem] = await Promise.all([
    supabase.from("ven_config").select("valor").eq("clave", "umbrales").maybeSingle(),
    supabase.from("ven_cobertura").select("id, pais, zona, repartidor_id, transportista, tarifa, prioridad").order("pais").order("zona"),
    supabase.from("ven_mensajero_config").select("repartidor_id, capacidad_diaria, limite_efectivo, comision_entrega"),
    supabase.from("ven_cierres").select("periodo"),
    supabase.from("ven_aprobaciones").select("id, accion, referencia, detalle, monto, solicitada_por, creado_en").eq("estado", "pendiente").order("creado_en"),
    supabase.from("ven_incidencias").select("id, orden_id, tipo, descripcion, costo, creado_en, ven_ordenes(numero, unidad_id)").eq("estado", "abierta").order("creado_en", { ascending: false }).limit(200),
    supabase.from("ven_cod_remesas").select("id, fecha, total, usuario, referencia, anulada_en, anulada_motivo").order("creado_en", { ascending: false }).limit(60),
  ]);
  if (cfgU.error && /ven_config/.test(cfgU.error.message)) return { error: "Falta correr la migración 0957 en Supabase." };
  const umbrales = leerUmbrales(cfgU.data?.valor);

  // Teléfonos de las órdenes abiertas: se normalizan aquí y solo viaja la validez.
  const cli = new Map<string, { telefono: string | null; corregimiento: string | null; clave: string | null }>();
  for (const parte of trozos(ids, 200)) {
    const { data } = await supabase.from("ven_ordenes_clientes").select("orden_id, telefono, corregimiento, telefono_clave").in("orden_id", parte);
    for (const c of (data ?? []) as { orden_id: string; telefono: string | null; corregimiento: string | null; telefono_clave: string | null }[]) cli.set(c.orden_id, { telefono: c.telefono, corregimiento: c.corregimiento, clave: c.telefono_clave });
  }
  const norm = new Map<string, ReturnType<typeof normalizarTelefono>>();
  const porGuardar: { orden_id: string; telefono_clave: string }[] = [];
  for (const o of ordenes) {
    const c = cli.get(o.id);
    const n = normalizarTelefono(paisDe.get(o.id) ?? "PA", c?.telefono);
    norm.set(o.id, n);
    if (c && n.valido && c.clave !== n.clave) porGuardar.push({ orden_id: o.id, telefono_clave: n.clave });
  }
  for (const parte of trozos(porGuardar, 100)) await Promise.all(parte.map((p) => supabase.from("ven_ordenes_clientes").update({ telefono_clave: p.telefono_clave }).eq("orden_id", p.orden_id)));

  // Historial por teléfono y lista negra/blanca.
  const claves = [...new Set([...norm.values()].filter((n) => n.valido).map((n) => n.clave))];
  const historial = new Map<string, HistorialCliente>();
  const lista = new Map<string, "negra" | "blanca">();
  for (const parte of trozos(claves, 150)) {
    const [{ data: hs }, { data: ls }] = await Promise.all([
      supabase.from("ven_ordenes_clientes").select("telefono_clave, ven_ordenes(fase, id)").in("telefono_clave", parte),
      supabase.from("ven_clientes_lista").select("telefono_clave, tipo").in("telefono_clave", parte),
    ]);
    for (const h of (hs ?? []) as unknown as { telefono_clave: string; ven_ordenes: { fase: string | null; id: string } | null }[]) {
      const f = h.ven_ordenes?.fase;
      if (!f) continue;
      const x = historial.get(h.telefono_clave) ?? vacioHist();
      if (f === "entregada") x.entregadas++;
      else if (f === "devuelta") x.devueltas++;
      else if (f === "cancelada") x.canceladas++;
      else if (f === "fallida") x.fallidas++;
      historial.set(h.telefono_clave, x);
    }
    for (const l of (ls ?? []) as { telefono_clave: string; tipo: "negra" | "blanca" }[]) lista.set(l.telefono_clave, l.tipo);
  }

  // Contactos, notas y estado propio de cada orden.
  const contactos = new Map<string, { resultado: ResultadoContacto; canal: string; por: string | null; creado_en: string }[]>();
  const notas = new Map<string, number>();
  const propias = new Map<string, Record<string, unknown>>();
  for (const parte of trozos(ids, 200)) {
    const [c, n, p] = await Promise.all([
      supabase.from("ven_orden_contactos").select("orden_id, canal, resultado, por, creado_en").in("orden_id", parte).order("creado_en", { ascending: false }),
      supabase.from("ven_orden_notas").select("orden_id").in("orden_id", parte),
      supabase.from("ven_ordenes").select("id, asignada_a, congelada, congelada_motivo, prometida_para, confirmada_con_cambios, confirmada_en, despachada_en, actualizado_en, creado_en").in("id", parte),
    ]);
    for (const x of (c.data ?? []) as { orden_id: string; canal: string; resultado: ResultadoContacto; por: string | null; creado_en: string }[]) {
      const l = contactos.get(x.orden_id) ?? [];
      l.push(x);
      contactos.set(x.orden_id, l);
    }
    for (const x of (n.data ?? []) as { orden_id: string }[]) notas.set(x.orden_id, (notas.get(x.orden_id) ?? 0) + 1);
    for (const x of (p.data ?? []) as { id: string }[]) propias.set(x.id, x as Record<string, unknown>);
  }

  const dups = new Map(
    detectarDuplicadas(ordenes.filter((o) => o.fase === "por_confirmar").map((o) => ({ id: o.id, telefonoClave: norm.get(o.id)?.valido ? norm.get(o.id)!.clave : "", productos: o.productos, creadoMs: Date.now() - o.horas * 3_600_000 }))).map((d) => [d.duplicada, d.original]),
  );

  // Carga de mensajeros: en ruta, tasa de entrega de 30 días y efectivo en mano.
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: hist30, error: e30 } = unidadIds.length
    ? await supabase
        .from("ven_ordenes")
        .select("id, unidad_id, fase, total, creado_en, confirmada_en, despachada_en, entregada_en, repartidor_id, motivo_fallo_codigo, motivo_cancelacion, costo_envio, comision_pasarela, comision_mensajero, fecha, ven_orden_lineas(costo_excel, cantidad)")
        .in("unidad_id", unidadIds)
        .gte("fecha", hace30)
        .not("fase", "is", null)
        .limit(6000)
    : { data: [], error: null };
  if (e30) return { error: /fase|motivo_fallo_codigo/.test(e30.message) ? "Falta correr la migración 0957 en Supabase." : e30.message };
  type H = { id: string; unidad_id: string; fase: string; total: number | string; creado_en: string; confirmada_en: string | null; despachada_en: string | null; entregada_en: string | null; repartidor_id: string | null; motivo_fallo_codigo: string | null; motivo_cancelacion: string | null; costo_envio: number | string; comision_pasarela: number | string; comision_mensajero: number | string; fecha: string; ven_orden_lineas: { costo_excel: number | string | null; cantidad: number | string }[] | null };
  const rows = (hist30 ?? []) as unknown as H[];

  const carga: DatosOperacion["carga"] = {};
  const efectivo = new Map<string, number>();
  for (const s of saldos) if (s.repartidorId) efectivo.set(s.repartidorId, (efectivo.get(s.repartidorId) ?? 0) + s.pendiente);
  const entregas = new Map<string, { ok: number; mal: number }>();
  for (const r of rows) {
    if (!r.repartidor_id) continue;
    const e = entregas.get(r.repartidor_id) ?? { ok: 0, mal: 0 };
    if (r.fase === "entregada") e.ok++;
    else if (r.fase === "devuelta" || r.fase === "fallida") e.mal++;
    entregas.set(r.repartidor_id, e);
  }
  for (const m of mensajeros) {
    const e = entregas.get(m.id);
    carga[m.id] = { enRuta: ordenes.filter((o) => o.repartidorId === m.id && o.fase === "despachada").length, tasaEntrega: e && e.ok + e.mal > 0 ? e.ok / (e.ok + e.mal) : null, efectivo: Math.round((efectivo.get(m.id) ?? 0) * 100) / 100 };
  }
  const config: DatosOperacion["config"] = {};
  for (const c of (cfgM.data ?? []) as { repartidor_id: string; capacidad_diaria: number | null; limite_efectivo: number | string | null; comision_entrega: number | string | null }[])
    config[c.repartidor_id] = { capacidad: c.capacidad_diaria, limiteEfectivo: c.limite_efectivo === null ? null : num(c.limite_efectivo), comision: c.comision_entrega === null ? null : num(c.comision_entrega) };

  const cobertura = ((cob.data ?? []) as { id: string; pais: string; zona: string; repartidor_id: string | null; transportista: string | null; tarifa: number | string | null; prioridad: number }[]).map((c) => ({
    id: c.id, pais: c.pais, zona: c.zona, repartidorId: c.repartidor_id, transportista: c.transportista, tarifa: c.tarifa === null ? null : num(c.tarifa), prioridad: c.prioridad, nombreMensajero: c.repartidor_id ? nombreMensajero.get(c.repartidor_id) ?? null : null,
  }));
  const cargaSug: CargaMensajero[] = mensajeros.map((m) => ({ repartidorId: m.id, ordenesHoy: carga[m.id]?.enRuta ?? 0, capacidad: config[m.id]?.capacidad ?? null, tasaEntrega: carga[m.id]?.tasaEntrega ?? null, efectivoEnMano: carga[m.id]?.efectivo ?? 0, limiteEfectivo: config[m.id]?.limiteEfectivo ?? null }));

  // Tasa de fallo de cada zona en 30 días (mejora 63): la zona de las órdenes cerradas.
  const cerradas = rows.filter((r) => r.fase === "entregada" || r.fase === "fallida" || r.fase === "devuelta");
  const zonaDe = new Map<string, string | null>();
  for (const parte of trozos(cerradas.map((r) => r.id), 300)) {
    const { data } = await supabase.from("ven_ordenes_clientes").select("orden_id, corregimiento").in("orden_id", parte);
    for (const z of (data ?? []) as { orden_id: string; corregimiento: string | null }[]) zonaDe.set(z.orden_id, z.corregimiento);
  }
  const fallaZona = falloPorZona(cerradas.map((r) => ({ zona: zonaDe.get(r.id) ?? null, fallo: r.fase !== "entregada" })));
  const horaPanama = (iso: unknown) => {
    const t = Date.parse(String(iso ?? ""));
    return Number.isNaN(t) ? null : new Date(t - 5 * 3_600_000).getUTCHours();
  };

  const extra: Record<string, ExtraOrden> = {};
  const estancadasIds = new Set(estancadas(ordenes.map((o) => {
    const p = propias.get(o.id);
    const desde = Date.parse(String((o.fase === "despachada" ? p?.despachada_en : o.fase === "confirmada" ? p?.confirmada_en : p?.actualizado_en) ?? p?.actualizado_en ?? "")) || Date.now();
    return { id: o.id, fase: o.fase, diasEnFase: Math.floor((Date.now() - desde) / 86_400_000) };
  }), umbrales).map((x) => x.id));
  for (const o of ordenes) {
    const n = norm.get(o.id)!;
    const p = propias.get(o.id) ?? {};
    const cs = contactos.get(o.id) ?? [];
    const res = cs.map((c) => c.resultado);
    const zona = cli.get(o.id)?.corregimiento ?? "";
    const desde = Date.parse(String((o.fase === "despachada" ? p.despachada_en : o.fase === "confirmada" ? p.confirmada_en : p.actualizado_en) ?? p.actualizado_en ?? "")) || Date.now();
    const hist = n.valido ? historial.get(n.clave) ?? vacioHist() : vacioHist();
    const riesgo = riesgoCliente(hist, n.valido ? lista.get(n.clave) ?? null : null);
    const noContactable = res.includes("numero_malo") || res.filter((r) => r === "no_contesta" || r === "ocupado").length >= umbrales.maxIntentosContacto;
    extra[o.id] = {
      telefonoValido: n.valido,
      telefonoMotivo: n.motivo ?? null,
      riesgo,
      puntaje: puntajeRiesgo({
        riesgo,
        historial: hist,
        telefonoValido: n.valido,
        noContactable,
        duplicada: dups.has(o.id),
        cod: o.codEsperado ?? 0,
        hora: horaPanama(p.creado_en),
        falloZona: fallaZona.get(zona.trim().toLowerCase().replace(/\s+/g, " ")) ?? null,
      }),
      historial: hist,
      duplicadaDe: dups.get(o.id) ?? null,
      contactos: cs.length,
      fallidos: res.filter((r) => r === "no_contesta" || r === "ocupado").length,
      ultimoContacto: cs[0] ? { resultado: cs[0].resultado, canal: cs[0].canal, por: cs[0].por, en: cs[0].creado_en } : null,
      noContactable: res.includes("numero_malo") || res.filter((r) => r === "no_contesta" || r === "ocupado").length >= umbrales.maxIntentosContacto,
      notas: notas.get(o.id) ?? 0,
      asignadaA: (p.asignada_a as string | null) ?? null,
      congelada: Boolean(p.congelada),
      congeladaMotivo: (p.congelada_motivo as string | null) ?? null,
      prometidaPara: (p.prometida_para as string | null) ?? null,
      conCambios: Boolean(p.confirmada_con_cambios),
      zona,
      sugerencia: o.fase === "confirmada" || o.fase === "por_confirmar" ? sugerirEnvio(zona, cobertura.filter((c) => c.pais === o.pais), cargaSug) : null,
      diasEnFase: Math.floor((Date.now() - desde) / 86_400_000),
      estancada: estancadasIds.has(o.id),
    };
  }

  // Indicadores de 30 días.
  const nombreU = new Map(unidades.map((u) => [u.id, u.nombre]));
  const acum = (f: FilaKpi, r: H) => {
    f.creadas++;
    if (r.confirmada_en) f.confirmadas++;
    if (r.despachada_en) f.despachadas++;
    if (r.fase === "entregada") f.entregadas++;
    if (r.fase === "devuelta") f.devueltas++;
    if (r.fase === "cancelada") f.canceladas++;
    if (r.fase === "fallida") f.fallidas++;
    if (r.fase === "entregada") {
      f.ventas += num(r.total);
      const costo = (r.ven_orden_lineas ?? []).reduce((a, l) => a + num(l.costo_excel) * num(l.cantidad), 0);
      f.margen += num(r.total) - costo - num(r.costo_envio) - num(r.comision_pasarela) - num(r.comision_mensajero);
    }
  };
  const ciclo = new Map<string, number[]>();
  const general = fila("Todas");
  const porTiendaM = new Map<string, FilaKpi>();
  const porMensajeroM = new Map<string, FilaKpi>();
  const motivos = new Map<string, number>();
  const cancel = new Map<string, number>();
  const porDiaM = new Map<string, { creadas: number; entregadas: number }>();
  for (const r of rows) {
    acum(general, r);
    const t = porTiendaM.get(r.unidad_id) ?? fila(nombreU.get(r.unidad_id) ?? "—");
    acum(t, r);
    porTiendaM.set(r.unidad_id, t);
    if (r.repartidor_id) {
      const m = porMensajeroM.get(r.repartidor_id) ?? fila(nombreMensajero.get(r.repartidor_id) ?? "—");
      acum(m, r);
      porMensajeroM.set(r.repartidor_id, m);
    }
    if (r.motivo_fallo_codigo) motivos.set(r.motivo_fallo_codigo, (motivos.get(r.motivo_fallo_codigo) ?? 0) + 1);
    if (r.fase === "cancelada" && r.motivo_cancelacion) cancel.set(r.motivo_cancelacion.slice(0, 60), (cancel.get(r.motivo_cancelacion.slice(0, 60)) ?? 0) + 1);
    const d = porDiaM.get(r.fecha) ?? { creadas: 0, entregadas: 0 };
    d.creadas++;
    if (r.fase === "entregada") d.entregadas++;
    porDiaM.set(r.fecha, d);
    if (r.entregada_en) {
      const h = (Date.parse(r.entregada_en) - Date.parse(r.creado_en)) / 3_600_000;
      if (h >= 0) {
        for (const k of ["Todas", r.unidad_id, r.repartidor_id ?? ""]) {
          const l = ciclo.get(k) ?? [];
          l.push(h);
          ciclo.set(k, l);
        }
      }
    }
  }
  const media = (xs?: number[]) => (xs?.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  general.cicloHoras = media(ciclo.get("Todas"));
  const redondear = (f: FilaKpi) => ({ ...f, ventas: Math.round(f.ventas * 100) / 100, margen: Math.round(f.margen * 100) / 100 });
  const porTienda = [...porTiendaM].map(([id, f]) => redondear({ ...f, cicloHoras: media(ciclo.get(id)) })).sort((a, b) => b.ventas - a.ventas);
  const porMensajero = [...porMensajeroM].map(([id, f]) => redondear({ ...f, cicloHoras: media(ciclo.get(id)) })).sort((a, b) => b.entregadas - a.entregadas);

  // Edades de saldo por mensajero y proyección de caja.
  const edadesM = new Map<string, { nombre: string; saldos: { pendiente: number; dias: number }[] }>();
  for (const s of saldos) {
    const k = s.repartidorId ?? `t:${s.transportista ?? ""}`;
    const e = edadesM.get(k) ?? { nombre: s.repartidorId ? nombreMensajero.get(s.repartidorId) ?? "—" : s.transportista ?? "—", saldos: [] };
    e.saldos.push({ pendiente: s.pendiente, dias: s.dias });
    edadesM.set(k, e);
  }
  const edades = [...edadesM].map(([clave, e]) => ({ clave, nombre: e.nombre, edad: antiguedadSaldos(e.saldos) })).sort((a, b) => b.edad.total - a.edad.total);
  const enRutaCod = ordenes.filter((o) => o.fase === "despachada" && (o.codEsperado ?? 0) > 0).map((o) => ({ cod: o.codEsperado ?? 0 }));
  const tasa = general.entregadas + general.devueltas + general.fallidas > 0 ? general.entregadas / (general.entregadas + general.devueltas + general.fallidas) : 0.8;
  const pend = saldos.reduce((a, s) => a + s.pendiente, 0);
  const esperado = Math.round(enRutaCod.reduce((a, o) => a + o.cod, 0) * tasa * 100) / 100;

  const numeroDe = new Map(ordenes.map((o) => [o.id, o.numero]));
  const { data: dev } = await supabase.from("ven_devoluciones_recepcion").select("orden_id");
  const recibidas = new Set(((dev ?? []) as { orden_id: string }[]).map((d) => d.orden_id));
  const { data: devueltas } = unidadIds.length ? await supabase.from("ven_ordenes").select("id, numero, unidad_id, ven_orden_lineas(producto, cantidad)").in("unidad_id", unidadIds).eq("fase", "devuelta").order("fecha", { ascending: false }).limit(200) : { data: [] };
  const devueltasPorRecibir = ((devueltas ?? []) as unknown as { id: string; numero: string; unidad_id: string; ven_orden_lineas: { producto: string; cantidad: number | string }[] | null }[])
    .filter((d) => !recibidas.has(d.id))
    .map((d) => ({ id: d.id, numero: d.numero, tienda: nombreU.get(d.unidad_id) ?? "—", productos: (d.ven_orden_lineas ?? []).map((l) => `${num(l.cantidad)}× ${l.producto}`).join(" · ") }));

  const { data: aj } = await supabase.from("ven_tiendas_conexion").select("unidad_id, bodega_id, pasarela_pct, pasarela_fijo, itbms_tasa, pausada");
  const ajustes: DatosOperacion["ajustes"] = {};
  for (const a of (aj ?? []) as Record<string, unknown>[]) ajustes[String(a.unidad_id)] = { bodegaId: (a.bodega_id as string | null) ?? null, pasarelaPct: num(a.pasarela_pct), pasarelaFijo: num(a.pasarela_fijo), itbmsTasa: num(a.itbms_tasa), pausada: Boolean(a.pausada) };
  const { data: bod } = await supabase.from("wms_bodegas").select("id, nombre").eq("activo", true).order("nombre").limit(100);

  return {
    extra,
    umbrales,
    cobertura,
    config,
    carga,
    edades,
    incidencias: ((inc.data ?? []) as unknown as { id: string; orden_id: string; tipo: string; descripcion: string | null; costo: number | string; creado_en: string; ven_ordenes: { numero: string } | null }[]).map((i) => ({ id: i.id, ordenId: i.orden_id, numero: i.ven_ordenes?.numero ?? numeroDe.get(i.orden_id) ?? "—", tipo: i.tipo, descripcion: i.descripcion, costo: num(i.costo), creada: i.creado_en })),
    aprobaciones: ((apro.data ?? []) as { id: string; accion: string; referencia: string; detalle: string | null; monto: number | string | null; solicitada_por: string; creado_en: string }[]).map((a) => ({ id: a.id, accion: a.accion, detalle: a.detalle, monto: a.monto === null ? null : num(a.monto), por: a.solicitada_por, numero: numeroDe.get(a.referencia) ?? null, en: a.creado_en })),
    remesas: ((rem.data ?? []) as { id: string; fecha: string; total: number | string; usuario: string | null; referencia: string | null; anulada_en: string | null; anulada_motivo: string | null }[]).map((r) => ({ id: r.id, fecha: r.fecha, total: num(r.total), quien: r.usuario ?? "—", referencia: r.referencia, anulada: !!r.anulada_en, motivo: r.anulada_motivo })),
    devueltasPorRecibir,
    cierres: ((cierres.data ?? []) as { periodo: string }[]).map((c) => c.periodo),
    kpis: { general: redondear(general), porTienda, porMensajero, motivos: [...motivos].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n), cancelaciones: [...cancel].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 8), porDia: [...porDiaM].map(([dia, v]) => ({ dia, ...v })).sort((a, b) => a.dia.localeCompare(b.dia)) },
    proyeccion: { enRuta: Math.round(enRutaCod.reduce((a, o) => a + o.cod, 0) * 100) / 100, esperado, total: Math.round((esperado + pend) * 100) / 100 },
    ajustes,
    bodegas: ((bod ?? []) as { id: string; nombre: string }[]),
  };
}
