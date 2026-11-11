// «Importar» universal: para cada módulo reconocido en un archivo, lo lee con el lector de su importador, pide al
// servidor el resumen (nuevos, se actualizan, se borran) con la misma acción que usa su pantalla y deja lista la carga
// por lotes (`cargas/*`). No repite lógica de ningún importador: solo la junta en una forma común para la pantalla.

import * as XLSX from "xlsx";
import { resumirImportacion } from "@/app/(app)/libro-movimientos/importar/actions";
import { resumirImportacionNomina } from "@/app/(app)/nomina/importar/actions";
import { resumirImportacionDeliverys } from "@/app/(app)/deliverys/importar/actions";
import { cuentaSugerida } from "@/lib/conciliacion/leer-excel";
import { resumirImportacionCartera } from "@/lib/finanzas/cartera-actions";
import { mesesDeMovimiento, separarPorCierre } from "@/lib/finanzas/cierre";
import type { Celda } from "@/lib/finanzas/libro-excel";
import { parseExtracto } from "@/lib/extractos/parse";
import { resumirLeido } from "@/lib/ventas/matriz";
import { cargarBienes, leerBienes } from "./cargas/bienes";
import { cargarCartera, leerArchivoCartera, saldoLeido } from "./cargas/cartera";
import { cortada, type Avance } from "./cargas/comun";
import { cargarConciliacion, esExtracto, leerConciliacion } from "./cargas/conciliacion";
import { cargarCostos, leerCostos } from "./cargas/costos";
import { asignacionInicial, cargarDeliverys, leerDeliverys, NUEVO_REPARTIDOR } from "./cargas/deliverys";
import { abrirLibro, cargarLibro, compararConCargado, leerHojaLibro } from "./cargas/libro";
import type { Comparacion } from "@/lib/finanzas/comparar-libro";
import { cargarNomina, leerArchivoNomina } from "./cargas/nomina";
import { compararBienes, compararCartera, compararConciliacion, compararCostos, compararDeliverys, compararNomina, compararVentas } from "./cargas/comparar";
import { cargarVentas, leerVentas } from "./cargas/ventas";
import { esCsv, FILAS_MUESTRA, type HojaMuestra, type ModuloImportable, type Reconocido } from "./reconocer";

export interface Cifra {
  titulo: string;
  valor: number;
  /** Se marca con un punto ámbar (se borra algo, cae en un mes cerrado, no cuadra). */
  alerta?: boolean;
  /** Es un monto en dólares. */
  usd?: boolean;
}

/** Una hoja de extracto bancario y la cuenta donde se carga ("" = no se carga). */
export interface ExtractoPorCuenta {
  hoja: string;
  lineas: number;
  cuentaId: string;
}

export interface Preparado {
  modulo: ModuloImportable;
  cifras: Cifra[];
  /** Lo que la persona tiene que saber antes de cargar (los nombres de repartidor que se asignan solos). */
  avisos: { titulo: string; lineas: string[] } | null;
  /** Solo conciliación: cada hoja de extracto con su cuenta sugerida. */
  extractos?: ExtractoPorCuenta[];
  /** Compara el archivo con lo ya cargado (qué se agrega, qué cambia y qué ya no viene), antes de cargar. */
  comparar?: () => Promise<{ error: string } | Comparacion>;
  /** Carga al portal; `cuentaDe` (hoja → cuenta) solo lo usa la conciliación. Devuelve lo que pasó, en frases cortas. */
  cargar: (avance: Avance, opciones?: { cuentaDe?: Record<string, string> }) => Promise<{ error: string } | { hecho: string[] }>;
}

export interface Contexto {
  /** Cuentas de banco y billeteras (sin tarjetas) para los extractos de la conciliación. */
  cuentas: { id: string; nombre: string }[];
  /** Meses cerrados («AAAA-MM-01»): lo que cae ahí no se toca. */
  mesesCerrados: string[];
}

/** Las primeras filas de cada hoja: lo que necesita el reconocedor (un CSV entra como una sola hoja). */
export function muestraDelArchivo(datos: ArrayBuffer, archivo: string): HojaMuestra[] {
  if (esCsv(archivo)) {
    const { headers, filas } = parseExtracto(datos);
    return [{ nombre: archivo.replace(/\.(csv|txt)$/i, ""), filas: [headers, ...filas.slice(0, FILAS_MUESTRA - 1)] as Celda[][] }];
  }
  const wb = XLSX.read(datos, { sheetRows: FILAS_MUESTRA, cellDates: true });
  return wb.SheetNames.map((nombre) => ({ nombre, filas: XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: null }) }));
}

const n = (v: number) => v.toLocaleString("es-PA");
/** Las frases del resultado que tienen algo que decir (las que son 0 no se muestran). */
const frases = (xs: [number, string][]) => xs.filter(([v]) => v > 0).map(([v, t]) => `${n(v)} ${t}`);

/** Lee y resume lo que un archivo aporta a un módulo. `{ error }` si no se pudo. */
export async function preparar(r: Reconocido, datos: ArrayBuffer, archivo: string, ctx: Contexto): Promise<Preparado | { error: string }> {
  const cerrados = new Set(ctx.mesesCerrados);
  switch (r.modulo) {
    case "libro-movimientos": {
      const { movimientos, descartadas, base } = leerHojaLibro(abrirLibro(datos), archivo, r.hojas[0]);
      if (!movimientos.length) return { error: "La hoja no trae movimientos." };
      const res = await resumirImportacion(archivo, movimientos.map((m) => m.origen_clave)).catch(cortada);
      if ("error" in res) return res;
      const enCerrado = separarPorCierre(movimientos, cerrados, mesesDeMovimiento).enCerrado.length;
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Movimientos", valor: movimientos.length },
          { titulo: "Nuevos", valor: res.nuevos },
          { titulo: "Se actualizan", valor: res.actualizan },
          { titulo: "Se borran", valor: res.borran, alerta: res.borran > 0 },
          { titulo: "En mes cerrado", valor: enCerrado, alerta: enCerrado > 0 },
          { titulo: "Filas descartadas", valor: descartadas.length },
          { titulo: "Base de reparto", valor: base.length },
        ],
        avisos: null,
        comparar: () => compararConCargado(archivo, movimientos),
        cargar: async (avance) => {
          const x = await cargarLibro(archivo, movimientos, base, avance);
          if ("error" in x) return x;
          return {
            hecho: frases([
              [movimientos.length, "movimientos"],
              [x.borrados, "borrados"],
              [x.sinTipo, "sin tipo (en Por clasificar)"],
              [x.conservados, "corregidos a mano, sin tocar"],
              [x.enMesCerrado, "de meses cerrados, sin tocar"],
              [x.rechazados, "rechazados"],
            ]).concat(x.tiendasNuevas.length ? [`Tiendas nuevas: ${x.tiendasNuevas.join(", ")}`] : []),
          };
        },
      };
    }

    case "bienes-de-uso": {
      const l = leerBienes(datos, archivo);
      if (!l || !l.bienes.length) return { error: "La hoja «Bienes de Uso» no trae bienes." };
      const distintas = l.grilla?.distintas ?? 0;
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Bienes", valor: l.bienes.length },
          { titulo: "Importe", valor: Math.round(l.bienes.reduce((a, b) => a + b.importe, 0)), usd: true },
          { titulo: "No cuadran con la grilla", valor: distintas, alerta: distintas > 0 },
          { titulo: "Filas descartadas", valor: l.descartadas.length },
        ],
        avisos: null,
        comparar: () => compararBienes(l),
        cargar: async (avance) => {
          avance(0, l.bienes.length);
          const x = await cargarBienes(l);
          if ("error" in x) return x;
          avance(l.bienes.length, l.bienes.length);
          return { hecho: frases([[x.guardados, "bienes guardados"], [x.borrados, "borrados"], [x.conservados, "corregidos a mano, sin tocar"], [x.rechazados, "rechazados"]]) };
        },
      };
    }

    case "cuentas-por-cobrar":
    case "cuentas-por-pagar": {
      const clase = r.modulo === "cuentas-por-cobrar" ? "cobrar" : "pagar";
      const l = leerArchivoCartera(datos, clase);
      if (!l.hojas.length || !l.documentos.length) return { error: "Las hojas no traen documentos." };
      const res = await resumirImportacionCartera(clase, l.hojas, l.documentos.map((d) => d.origen_clave)).catch(cortada);
      if ("error" in res) return res;
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Documentos", valor: l.documentos.length },
          { titulo: clase === "cobrar" ? "Saldo por cobrar" : "Saldo por pagar", valor: Math.round(saldoLeido(l)), usd: true },
          { titulo: "Nuevos", valor: res.nuevos },
          { titulo: "Se actualizan", valor: res.actualizan },
          { titulo: "Se borran", valor: res.borran, alerta: res.borran > 0 },
          { titulo: "Se conservan", valor: res.conservan },
          { titulo: "No cuadran con la hoja", valor: l.controles.length, alerta: l.controles.length > 0 },
        ],
        avisos: null,
        comparar: () => compararCartera(r.modulo === "cuentas-por-cobrar" ? "cuentas-por-cobrar" : "cuentas-por-pagar", archivo, l),
        cargar: async (avance) => {
          const x = await cargarCartera(clase, archivo, l, avance);
          if ("error" in x) return x;
          return {
            hecho: frases([[l.documentos.length, "documentos"], [x.borrados, "borrados"], [x.conservados, "conservados"], [x.rechazados, "rechazados"]]).concat(
              x.tiendas.length ? [`Tiendas que no existen: ${x.tiendas.join(", ")}`] : [],
            ),
          };
        },
      };
    }

    case "costos-mercancia": {
      const l = leerCostos(datos, archivo, r.hojas);
      if (!l) return { error: "No encontré hojas «MERCANCIA …»." };
      const lotes = l.porHoja.reduce((a, h) => a + h.lotes.length, 0);
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Lotes", valor: lotes },
          { titulo: "Productos", valor: new Set(l.porHoja.flatMap((h) => h.lotes.map((x) => x.producto_clave))).size },
          { titulo: "Mapeo con Dropi", valor: l.mapeo.length },
          { titulo: "Filas descartadas", valor: l.porHoja.reduce((a, h) => a + h.descartadas, 0) },
        ],
        avisos: null,
        comparar: () => compararCostos(l),
        cargar: async (avance) => {
          const x = await cargarCostos(l, avance);
          if ("error" in x) return x;
          return { hecho: frases([[lotes, "lotes"], [x.borrados, "lotes viejos borrados"], [x.mapeos, "mapeos"], [x.rechazados, "rechazados"]]) };
        },
      };
    }

    case "nomina": {
      const l = leerArchivoNomina(datos);
      if (!l) return { error: "No encontré líneas de nómina." };
      const res = await resumirImportacionNomina(archivo, l.lineas.map((x) => x.origen_clave)).catch(cortada);
      if ("error" in res) return res;
      const enCerrado = l.lineas.filter((x) => cerrados.has(x.periodo)).length;
      const noCuadran = new Set(l.noCuadran.map((x) => `${x.hoja}|${x.fila}`)).size;
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Pagos", valor: l.lineas.length },
          { titulo: "Nuevos", valor: res.nuevas },
          { titulo: "Se actualizan", valor: res.actualizan },
          { titulo: "Se borran", valor: res.borran, alerta: res.borran > 0 },
          { titulo: "En mes cerrado", valor: enCerrado, alerta: enCerrado > 0 },
          { titulo: "Corregidos a mano", valor: res.corregidas },
          { titulo: "No cuadran con la fórmula", valor: noCuadran, alerta: noCuadran > 0 },
        ],
        avisos: null,
        comparar: () => compararNomina(archivo, l),
        cargar: async (avance) => {
          const x = await cargarNomina(archivo, l, avance);
          if ("error" in x) return x;
          return {
            hecho: frases([
              [l.lineas.length, "pagos"],
              [x.borrados, "borrados"],
              [x.personasNuevas, "personas nuevas"],
              [x.conservados, "corregidos a mano, sin tocar"],
              [x.enMesCerrado, "de meses cerrados, sin tocar"],
              [x.rechazadas, "rechazados"],
            ]),
          };
        },
      };
    }

    case "ventas-tiendas": {
      const l = leerVentas(datos, archivo);
      if ("error" in l) return l;
      const meses = new Set(l.ordenes.map((o) => o.periodo)).size;
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Órdenes", valor: l.ordenes.length },
          { titulo: "Meses", valor: meses },
          { titulo: "Ventas entregadas", valor: Math.round(resumirLeido(l.ordenes).reduce((a, x) => a + x.ventas, 0)), usd: true },
          { titulo: "Guías Servientrega", valor: l.guias },
          { titulo: "Filas descartadas", valor: l.descartadas.length },
        ],
        avisos: null,
        comparar: () => compararVentas(archivo, l.ordenes),
        cargar: async (avance) => {
          const x = await cargarVentas(l, l.ordenes, avance);
          if ("error" in x) return x;
          return {
            hecho: frases([[x.nuevas, "órdenes nuevas"], [x.actualizadas, "actualizadas"], [x.sinCambios, "sin cambios"], [x.mapeos, "productos en el mapeo de costo"], [x.rechazadas, "rechazadas"]]).concat(
              x.tiendasNuevas.length ? [`Tiendas nuevas: ${x.tiendasNuevas.join(", ")}`] : [],
            ),
          };
        },
      };
    }

    case "deliverys": {
      const l = leerDeliverys(datos);
      if (!l) return { error: "La hoja de gestión no trae entregas." };
      const res = await resumirImportacionDeliverys(archivo, l.entregas.map((x) => x.origen_clave), l.etiquetas).catch(cortada);
      if ("error" in res) return res;
      const asignacion = asignacionInicial(res);
      const nombre = (id: string) => (id === NUEVO_REPARTIDOR ? "repartidor nuevo" : (res.repartidores.find((x) => x.id === id)?.nombre ?? "—"));
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Líneas", valor: l.entregas.length },
          { titulo: "Nuevas", valor: res.nuevas },
          { titulo: "Se actualizan", valor: res.actualizan },
          { titulo: "Se borran", valor: res.borran, alerta: res.borran > 0 },
          { titulo: "En semana cerrada", valor: res.enCierre, alerta: res.enCierre > 0 },
          { titulo: "No cuadran con la hoja", valor: l.noCuadran.length, alerta: l.noCuadran.length > 0 },
        ],
        avisos: res.sinDueno.length
          ? { titulo: "Nombres sin repartidor", lineas: res.sinDueno.map((x) => `«${x.etiqueta}» → ${nombre(asignacion[x.etiqueta])}`) }
          : null,
        comparar: () => compararDeliverys(archivo, l),
        cargar: async (avance) => {
          const x = await cargarDeliverys(archivo, l, res, asignacion, avance);
          if ("error" in x) return x;
          return {
            hecho: frases([
              [l.entregas.length, "líneas"],
              [x.borradas, "borradas"],
              [x.creados, "repartidores nuevos"],
              [x.conservadas, "de semanas cerradas, sin tocar"],
              [x.sinRepartidor, "sin repartidor"],
              [x.rechazadas, "rechazadas"],
            ]),
          };
        },
      };
    }

    case "conciliacion-bancaria": {
      const hojas = leerConciliacion(datos, archivo, esCsv(archivo) ? undefined : r.hojas);
      if (!hojas.length) return { error: "Las hojas no traen movimientos ni cobros." };
      const extractos = hojas.filter(esExtracto).map((h) => ({ hoja: h.hoja, lineas: h.lineas.length, cuentaId: cuentaSugerida(h.hoja, ctx.cuentas) ?? "" }));
      const cobros = hojas.reduce((a, h) => a + h.cobros.length, 0);
      return {
        modulo: r.modulo,
        cifras: [
          { titulo: "Líneas de extracto", valor: extractos.reduce((a, h) => a + h.lineas, 0) },
          { titulo: "Cobros", valor: cobros },
          { titulo: "Órdenes", valor: hojas.reduce((a, h) => a + h.ordenes.length, 0) },
        ],
        avisos: null,
        extractos,
        comparar: () => compararConciliacion(archivo, hojas),
        cargar: async (avance, opciones) => {
          const cuentaDe = opciones?.cuentaDe ?? Object.fromEntries(extractos.map((e) => [e.hoja, e.cuentaId]));
          const x = await cargarConciliacion(archivo, hojas, cuentaDe, avance);
          if ("error" in x) return x;
          return {
            hecho: frases([[x.nuevas, "líneas nuevas"], [x.auto, "conciliadas solas"], [x.sugeridas, "sugeridas"], [x.pendientes, "pendientes"], [x.rechazados, "rechazadas"]]),
          };
        },
      };
    }
  }
}
