// Reglas puras de la operación de Shopify (confirmar, asignar, entregar, remesar). Sin base de datos: prueba en
// `operacion.test.ts`. Los umbrales viven en `ven_config` y se pasan como parámetro.

export type PaisOp = "PA" | "CR" | "MX";

export interface Umbrales {
  horasConfirmarAlerta: number;
  horasConfirmarVencida: number;
  horasReconfirmar: number;
  diasEstancada: number;
  maxIntentosContacto: number;
  maxIntentosEntrega: number;
  diasAlertaRemesa: number;
  montoAprobacion: number;
}

export const UMBRALES_BASE: Umbrales = {
  horasConfirmarAlerta: 4,
  horasConfirmarVencida: 24,
  horasReconfirmar: 48,
  diasEstancada: 3,
  maxIntentosContacto: 3,
  maxIntentosEntrega: 3,
  diasAlertaRemesa: 7,
  montoAprobacion: 150,
};

/** Lee el jsonb de `ven_config` (llaves en snake_case); lo que falte o no sea número usa la base. */
export function leerUmbrales(raw: unknown): Umbrales {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (k: string, base: number) => (typeof o[k] === "number" && Number.isFinite(o[k] as number) && (o[k] as number) > 0 ? (o[k] as number) : base);
  return {
    horasConfirmarAlerta: n("horas_confirmar_alerta", UMBRALES_BASE.horasConfirmarAlerta),
    horasConfirmarVencida: n("horas_confirmar_vencida", UMBRALES_BASE.horasConfirmarVencida),
    horasReconfirmar: n("horas_reconfirmar", UMBRALES_BASE.horasReconfirmar),
    diasEstancada: n("dias_estancada", UMBRALES_BASE.diasEstancada),
    maxIntentosContacto: n("max_intentos_contacto", UMBRALES_BASE.maxIntentosContacto),
    maxIntentosEntrega: n("max_intentos_entrega", UMBRALES_BASE.maxIntentosEntrega),
    diasAlertaRemesa: n("dias_alerta_remesa", UMBRALES_BASE.diasAlertaRemesa),
    montoAprobacion: n("monto_aprobacion", UMBRALES_BASE.montoAprobacion),
  };
}

// ---------- Confirmación ----------

export type Semaforo = "verde" | "ambar" | "rojo";
export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = { verde: "A tiempo", ambar: "Por vencer", rojo: "Vencida" };

/** Verde hasta 1 h, ámbar hasta el umbral de alerta… rojo al pasar la vencida (ver `Umbrales`). */
export function semaforoConfirmacion(horas: number, u: Umbrales = UMBRALES_BASE): Semaforo {
  if (horas >= u.horasConfirmarVencida) return "rojo";
  if (horas >= u.horasConfirmarAlerta) return "ambar";
  return "verde";
}

/** Primero las más viejas (las vencidas arriba). */
export const ordenarPorAntiguedad = <T extends { horas: number }>(xs: T[]): T[] => [...xs].sort((a, b) => b.horas - a.horas);

export const RESULTADOS_CONTACTO = ["confirmo", "no_contesta", "cambio_datos", "cancela", "ocupado", "numero_malo"] as const;
export type ResultadoContacto = (typeof RESULTADOS_CONTACTO)[number];
export const ETIQUETA_RESULTADO: Record<ResultadoContacto, string> = {
  confirmo: "Confirmó",
  no_contesta: "No contesta",
  cambio_datos: "Cambió datos",
  cancela: "Cancela",
  ocupado: "Ocupado",
  numero_malo: "Número malo",
};

/** Intentos fallidos (no contestó, ocupado) que ya se hicieron; al llegar al máximo la orden queda «no contactable». */
export function intentosFallidos(resultados: ResultadoContacto[]): number {
  return resultados.filter((r) => r === "no_contesta" || r === "ocupado").length;
}
export const noContactable = (resultados: ResultadoContacto[], u: Umbrales = UMBRALES_BASE) =>
  resultados.includes("numero_malo") || intentosFallidos(resultados) >= u.maxIntentosContacto;

/** Hora local del país (0–23) dentro del horario permitido para llamar. */
export function dentroDeHorario(horaLocal: number, desde = 8, hasta = 20): boolean {
  return horaLocal >= desde && horaLocal < hasta;
}

/** Hora local de un país a partir de una fecha UTC (PA UTC−5, CR y MX centro UTC−6). */
export function horaLocalPais(pais: PaisOp, ahora: Date = new Date()): number {
  const desfase = pais === "PA" ? -5 : -6;
  return (ahora.getUTCHours() + desfase + 24) % 24;
}

// ---------- Teléfono ----------

export interface TelefonoNormalizado {
  clave: string;
  valido: boolean;
  tipo: "movil" | "fijo" | "desconocido";
  motivo?: string;
}

const PREFIJO: Record<PaisOp, string> = { PA: "507", CR: "506", MX: "52" };

/**
 * Deja solo los dígitos del país (sin prefijo ni ceros) y dice si tiene el largo del país:
 * PA 7 u 8 dígitos (móvil empieza en 6), CR 8 (móvil 5–8), MX 10.
 */
export function normalizarTelefono(pais: PaisOp, bruto: string | null | undefined): TelefonoNormalizado {
  let d = (bruto ?? "").replace(/\D/g, "");
  if (!d) return { clave: "", valido: false, tipo: "desconocido", motivo: "Sin teléfono" };
  const pre = PREFIJO[pais];
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith(pre) && d.length > (pais === "MX" ? 10 : 8)) d = d.slice(pre.length);
  if (pais === "MX" && d.length === 12 && d.startsWith("52")) d = d.slice(2);
  if (pais === "MX") {
    return d.length === 10 ? { clave: d, valido: true, tipo: "desconocido" } : { clave: d, valido: false, tipo: "desconocido", motivo: "Debe tener 10 dígitos" };
  }
  if (pais === "CR") {
    if (d.length !== 8) return { clave: d, valido: false, tipo: "desconocido", motivo: "Debe tener 8 dígitos" };
    return { clave: d, valido: true, tipo: /^[5-8]/.test(d) ? "movil" : "fijo" };
  }
  if (d.length !== 8 && d.length !== 7) return { clave: d, valido: false, tipo: "desconocido", motivo: "Debe tener 7 u 8 dígitos" };
  return { clave: d, valido: true, tipo: d.length === 8 && d.startsWith("6") ? "movil" : "fijo" };
}

// ---------- Riesgo del cliente y duplicadas ----------

export interface HistorialCliente {
  entregadas: number;
  devueltas: number;
  canceladas: number;
  fallidas: number;
}
export type Riesgo = "ninguno" | "medio" | "alto" | "lista_negra" | "lista_blanca";
export const ETIQUETA_RIESGO: Record<Riesgo, string> = {
  ninguno: "Sin riesgo",
  medio: "Riesgo medio",
  alto: "Riesgo alto",
  lista_negra: "Lista negra",
  lista_blanca: "Cliente de confianza",
};

export function riesgoCliente(h: HistorialCliente, lista?: "negra" | "blanca" | null): Riesgo {
  if (lista === "negra") return "lista_negra";
  if (lista === "blanca") return "lista_blanca";
  const malas = h.devueltas + h.canceladas + h.fallidas;
  if (malas >= 2 && malas > h.entregadas) return "alto";
  if (malas >= 1 && malas >= h.entregadas) return "medio";
  return "ninguno";
}

export interface OrdenDup {
  id: string;
  telefonoClave: string;
  productos: string;
  creadoMs: number;
}

/** Pares de órdenes del mismo teléfono con los mismos productos creadas con menos de 24 h de diferencia. */
export function detectarDuplicadas(ordenes: OrdenDup[], ventanaHoras = 24): { original: string; duplicada: string }[] {
  const out: { original: string; duplicada: string }[] = [];
  const porTel = new Map<string, OrdenDup[]>();
  for (const o of ordenes) {
    if (!o.telefonoClave) continue;
    const l = porTel.get(o.telefonoClave) ?? [];
    l.push(o);
    porTel.set(o.telefonoClave, l);
  }
  for (const l of porTel.values()) {
    l.sort((a, b) => a.creadoMs - b.creadoMs);
    for (let i = 1; i < l.length; i++)
      for (let j = 0; j < i; j++)
        if (l[i].productos === l[j].productos && l[i].creadoMs - l[j].creadoMs <= ventanaHoras * 3_600_000) {
          out.push({ original: l[j].id, duplicada: l[i].id });
          break;
        }
  }
  return out;
}

/** Reparte órdenes entre personas dejando a cada una casi la misma cantidad (la que menos tiene recibe la siguiente). */
export function repartirEntrePersonas(ordenIds: string[], personas: { nombre: string; ya: number }[]): Map<string, string> {
  const carga = personas.map((p) => ({ ...p }));
  const out = new Map<string, string>();
  if (!carga.length) return out;
  for (const id of ordenIds) {
    carga.sort((a, b) => a.ya - b.ya || a.nombre.localeCompare(b.nombre));
    out.set(id, carga[0].nombre);
    carga[0].ya += 1;
  }
  return out;
}

// ---------- Cobertura y sugerencia de envío ----------

export const normalizarZona = (z: string | null | undefined) =>
  (z ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export interface Cobertura {
  zona: string;
  repartidorId: string | null;
  transportista: string | null;
  tarifa: number | null;
  prioridad: number;
}
export interface CargaMensajero {
  repartidorId: string;
  ordenesHoy: number;
  capacidad: number | null;
  /** Entregadas / (entregadas + fallidas + devueltas) de los últimos 30 días, 0–1; null si no tiene historial. */
  tasaEntrega: number | null;
  efectivoEnMano: number;
  limiteEfectivo: number | null;
}
export interface Sugerencia {
  repartidorId: string | null;
  transportista: string | null;
  motivo: string;
  tarifa: number | null;
}

/** Quién cubre la zona, sin pasarse de su capacidad ni de su límite de efectivo; entre varios, mejor tasa y menos carga. */
export function sugerirEnvio(zona: string, cobertura: Cobertura[], carga: CargaMensajero[]): Sugerencia | null {
  const z = normalizarZona(zona);
  if (!z) return null;
  const candidatos = cobertura.filter((c) => {
    const cz = normalizarZona(c.zona);
    return cz === z || z.includes(cz) || cz.includes(z);
  });
  if (!candidatos.length) return null;
  const mapa = new Map(carga.map((c) => [c.repartidorId, c]));
  const puntuados = candidatos
    .map((c) => {
      const k = c.repartidorId ? mapa.get(c.repartidorId) : undefined;
      const lleno = !!k && k.capacidad !== null && k.ordenesHoy >= k.capacidad;
      const sinEfectivo = !!k && k.limiteEfectivo !== null && k.efectivoEnMano >= k.limiteEfectivo;
      return { c, k, lleno, sinEfectivo, puntos: (c.prioridad || 1) * 100 - (k?.ordenesHoy ?? 0) + (k?.tasaEntrega ?? 0.5) * 50 };
    })
    .filter((x) => !x.lleno && !x.sinEfectivo)
    .sort((a, b) => b.puntos - a.puntos);
  const mejor = puntuados[0];
  if (!mejor) return null;
  const partes = [`cubre ${mejor.c.zona}`];
  if (mejor.k?.tasaEntrega !== null && mejor.k?.tasaEntrega !== undefined) partes.push(`entrega ${Math.round(mejor.k.tasaEntrega * 100)} %`);
  if (mejor.k) partes.push(`${mejor.k.ordenesHoy} hoy`);
  return { repartidorId: mejor.c.repartidorId, transportista: mejor.c.transportista, tarifa: mejor.c.tarifa, motivo: partes.join(" · ") };
}

/** Ordena las paradas del día por zona (y luego por número) para armar la ruta. */
export function ordenarRuta<T extends { zona: string; numero: string }>(paradas: T[]): T[] {
  return [...paradas].sort((a, b) => normalizarZona(a.zona).localeCompare(normalizarZona(b.zona)) || a.numero.localeCompare(b.numero, "es", { numeric: true }));
}

// ---------- Entrega ----------

export const MOTIVOS_FALLO = [
  { codigo: "no_contesta", etiqueta: "No contesta" },
  { codigo: "direccion_erronea", etiqueta: "Dirección errónea" },
  { codigo: "rechazo", etiqueta: "Rechazó el pedido" },
  { codigo: "sin_efectivo", etiqueta: "No tenía efectivo" },
  { codigo: "no_estaba", etiqueta: "No estaba en casa" },
  { codigo: "zona_riesgosa", etiqueta: "Zona de difícil acceso" },
  { codigo: "otro", etiqueta: "Otro" },
] as const;
export const etiquetaMotivoFallo = (codigo: string | null | undefined) => MOTIVOS_FALLO.find((m) => m.codigo === codigo)?.etiqueta ?? codigo ?? "";

/** Al fallar por tercera vez (o el máximo configurado) la orden pasa a devolución en vez de reprogramarse. */
export const debePasarADevolucion = (intentos: number, u: Umbrales = UMBRALES_BASE) => intentos >= u.maxIntentosEntrega;

/** Código de 4 dígitos que se le da al cliente para recibir (determinista por orden y día, no adivinable sin la llave). */
export function codigoEntrega(semilla: string): string {
  let h = 2166136261;
  for (const ch of semilla) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return String(h % 10000).padStart(4, "0");
}

export interface Estancada {
  id: string;
  fase: string;
  dias: number;
}
/** Órdenes que llevan más de N días en la misma fase (las confirmadas sin despachar también cuentan para reconfirmar). */
export function estancadas(ordenes: { id: string; fase: string; diasEnFase: number }[], u: Umbrales = UMBRALES_BASE): Estancada[] {
  return ordenes
    .filter((o) => o.diasEnFase >= u.diasEstancada && ["confirmada", "despachada", "fallida"].includes(o.fase))
    .map((o) => ({ id: o.id, fase: o.fase, dias: o.diasEnFase }))
    .sort((a, b) => b.dias - a.dias);
}
export const necesitaReconfirmar = (horasConfirmada: number, u: Umbrales = UMBRALES_BASE) => horasConfirmada >= u.horasReconfirmar;

/** Entrega prometida en riesgo: la fecha prometida es hoy o ya pasó y la orden sigue sin entregarse. */
export function entregaEnRiesgo(prometida: string | null, hoy: string, fase: string): boolean {
  return !!prometida && prometida <= hoy && ["confirmada", "despachada", "fallida"].includes(fase);
}

// ---------- Plata ----------

export interface Edad {
  d0_3: number;
  d4_7: number;
  d8_14: number;
  d15_mas: number;
  total: number;
}
export function antiguedadSaldos(saldos: { pendiente: number; dias: number }[]): Edad {
  const e: Edad = { d0_3: 0, d4_7: 0, d8_14: 0, d15_mas: 0, total: 0 };
  for (const s of saldos) {
    const m = Math.max(0, s.pendiente);
    e.total += m;
    if (s.dias <= 3) e.d0_3 += m;
    else if (s.dias <= 7) e.d4_7 += m;
    else if (s.dias <= 14) e.d8_14 += m;
    else e.d15_mas += m;
  }
  for (const k of Object.keys(e) as (keyof Edad)[]) e[k] = Math.round(e[k] * 100) / 100;
  return e;
}

/** El mensajero se pasó de su límite de efectivo: no se le asignan más contra entrega. */
export const excedeLimiteEfectivo = (enMano: number, limite: number | null) => limite !== null && enMano >= limite;

export interface DiferenciaCobro {
  esperado: number;
  cobrado: number;
  diferencia: number;
  tipo: "exacto" | "faltante" | "sobrante";
}
export function diferenciaCobro(esperado: number, cobrado: number): DiferenciaCobro {
  const d = Math.round((cobrado - esperado) * 100) / 100;
  return { esperado, cobrado, diferencia: d, tipo: d === 0 ? "exacto" : d < 0 ? "faltante" : "sobrante" };
}

export interface EntradaMargen {
  total: number;
  costoMercancia: number;
  envioCobrado: number;
  costoEnvio: number;
  comisionPasarela: number;
  comisionMensajero: number;
  itbms?: number;
}
export interface Margen {
  neto: number;
  margenPct: number | null;
  margenEnvio: number;
}
/** Margen vivo de una orden: precio − costo − envío real − pasarela − mensajero (− ITBMS si se pasa). */
export function margenOrden(e: EntradaMargen): Margen {
  const neto = e.total - (e.itbms ?? 0) - e.costoMercancia - e.costoEnvio - e.comisionPasarela - e.comisionMensajero;
  const base = e.total - (e.itbms ?? 0);
  return {
    neto: Math.round(neto * 100) / 100,
    margenPct: base > 0 ? Math.round((neto / base) * 1000) / 10 : null,
    margenEnvio: Math.round((e.envioCobrado - e.costoEnvio) * 100) / 100,
  };
}

/** Comisión de pasarela como porcentaje + fijo (p. ej. 2.9 % + 0.30). */
export const comisionPasarela = (total: number, pct: number, fijo: number) => Math.round((total * pct) / 100 * 100) / 100 + (total > 0 ? fijo : 0);

/** ITBMS incluido en un precio (Panamá 7 %): el impuesto dentro del total. */
export const itbmsIncluido = (total: number, tasa = 0.07) => Math.round((total - total / (1 + tasa)) * 100) / 100;

/** Una acción de monto alto o que pasa del umbral pide que otra persona la apruebe. */
export const pideAprobacion = (monto: number, u: Umbrales = UMBRALES_BASE) => monto >= u.montoAprobacion;

/** El mes (primer día) de una fecha 'YYYY-MM-DD'. */
export const periodoDe = (fecha: string) => `${fecha.slice(0, 7)}-01`;
export const mesCerrado = (fecha: string, cerrados: string[]) => cerrados.includes(periodoDe(fecha));

/** Proyección de caja: lo que se espera cobrar de lo entregado y de lo que está en ruta, con la tasa histórica de entrega. */
export function proyeccionCaja(enRuta: { cod: number }[], pendientesRemesa: number, tasaEntrega: number): { enRuta: number; esperado: number; total: number } {
  const ruta = enRuta.reduce((s, o) => s + o.cod, 0);
  const esperado = Math.round(ruta * Math.min(Math.max(tasaEntrega, 0), 1) * 100) / 100;
  return { enRuta: Math.round(ruta * 100) / 100, esperado, total: Math.round((esperado + pendientesRemesa) * 100) / 100 };
}

/** Tasa de devolución esperada → provisión sobre lo vendido (ingreso diferido hasta entregar). */
export const provisionDevoluciones = (vendido: number, tasaDevolucion: number) => Math.round(vendido * Math.min(Math.max(tasaDevolucion, 0), 1) * 100) / 100;

// ---------- Puntaje de riesgo con más señales (mejora 63) ----------

export interface SenalesRiesgo {
  riesgo: Riesgo;
  historial: HistorialCliente;
  telefonoValido: boolean;
  noContactable: boolean;
  duplicada: boolean;
  /** Efectivo a cobrar al entregar (0 si ya está pagada). */
  cod: number;
  /** Hora de Panamá (0–23) en que se creó la orden. */
  hora: number | null;
  /** Fallidas + devueltas ÷ cerradas de su zona en 30 días; null si la zona tiene menos de 5 cerradas. */
  falloZona: number | null;
}

export interface PuntajeRiesgo {
  valor: number;
  nivel: "bajo" | "medio" | "alto";
  motivos: string[];
}

/** Monto contra entrega desde el que una primera compra se mira con más cuidado. */
export const COD_ALTO_PRIMERA = 80;

/**
 * De 0 a 100, sumando lo que en la operación suele terminar en una orden fallida o devuelta. La lista blanca manda (0) y la
 * negra también (100). ≥ 60 alto, ≥ 30 medio. Cada punto dice su motivo, para que quien confirma sepa qué mirar.
 */
export function puntajeRiesgo(s: SenalesRiesgo): PuntajeRiesgo {
  if (s.riesgo === "lista_blanca") return { valor: 0, nivel: "bajo", motivos: ["Cliente de confianza"] };
  if (s.riesgo === "lista_negra") return { valor: 100, nivel: "alto", motivos: ["Está en la lista negra"] };
  let v = 0;
  const motivos: string[] = [];
  const sumar = (n: number, m: string) => {
    v += n;
    motivos.push(m);
  };
  if (s.riesgo === "alto") sumar(40, "Más órdenes fallidas o devueltas que entregadas");
  else if (s.riesgo === "medio") sumar(20, "Ya tuvo una orden fallida, devuelta o cancelada");
  if (!s.telefonoValido) sumar(20, "Teléfono inválido");
  if (s.noContactable) sumar(25, "No contesta o el número no sirve");
  if (s.duplicada) sumar(15, "Parece una orden repetida");
  if (s.cod >= COD_ALTO_PRIMERA && s.historial.entregadas === 0) sumar(15, `Primera compra con ${Math.round(s.cod)} US$ contra entrega`);
  if (s.hora !== null && s.hora >= 0 && s.hora < 5) sumar(5, "Pedida de madrugada");
  if (s.falloZona !== null && s.falloZona >= 0.4) sumar(15, `Su zona falla el ${Math.round(s.falloZona * 100)} % de las entregas`);
  const valor = Math.min(100, v);
  return { valor, nivel: valor >= 60 ? "alto" : valor >= 30 ? "medio" : "bajo", motivos };
}

/** Tasa de fallo por zona (minúsculas, sin espacios de más): solo zonas con al menos `minimo` órdenes cerradas. */
export function falloPorZona(cerradas: { zona: string | null; fallo: boolean }[], minimo = 5): Map<string, number> {
  const t = new Map<string, { n: number; f: number }>();
  for (const c of cerradas) {
    const z = (c.zona ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!z) continue;
    const x = t.get(z) ?? { n: 0, f: 0 };
    x.n++;
    if (c.fallo) x.f++;
    t.set(z, x);
  }
  const r = new Map<string, number>();
  for (const [z, x] of t) if (x.n >= minimo) r.set(z, x.f / x.n);
  return r;
}

// ---------- Etiquetas y franja horaria (mejora 54) ----------

export const FRANJAS = [
  { valor: "manana", etiqueta: "Mañana (8–12)" },
  { valor: "tarde", etiqueta: "Tarde (12–17)" },
  { valor: "noche", etiqueta: "Noche (17–20)" },
] as const;
export type Franja = (typeof FRANJAS)[number]["valor"];
export const esFranja = (v: unknown): v is Franja => FRANJAS.some((f) => f.valor === v);
export const etiquetaFranja = (v: string | null) => FRANJAS.find((f) => f.valor === v)?.etiqueta ?? "Cualquier hora";

/** Etiquetas limpias: sin vacías ni repetidas (sin importar mayúsculas), hasta 8 de 24 caracteres. */
export function limpiarEtiquetasOrden(v: unknown): string[] {
  const lista = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const vistas = new Set<string>();
  const r: string[] = [];
  for (const x of lista) {
    const t = String(x ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    r.push(t);
    if (r.length === 8) break;
  }
  return r;
}
