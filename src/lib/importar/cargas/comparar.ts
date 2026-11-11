// «Comparar con lo cargado» de cada importador (salvo el libro, que tiene el suyo en `cargas/libro.ts`): lleva lo leído del
// archivo a la forma común, pide al servidor lo guardado con el mismo alcance que usa la carga y lo compara con
// `compararLibro`. Corre en el navegador antes de cargar.

import { compararLibro, type Comparacion, type FilaComparable } from "@/lib/finanzas/comparar-libro";
import type { LecturaCartera } from "@/lib/finanzas/cxc-cxp-excel";
import type { LecturaDeliverys } from "@/lib/deliverys/excel";
import type { HojaLeida } from "@/lib/conciliacion/leer-excel";
import type { LecturaNomina } from "@/lib/nomina/excel";
import type { OrdenVenta } from "@/lib/ventas/matriz";
import { leerCargadoParaComparar } from "../comparar-actions";
import { MAX_CLAVES_COMPARAR, cobroConciliacion, comparable, docCartera, enTandas, igualarTiendaVacia, lineaNomina, type ModuloComparable } from "../comparar";
import type { LecturaBienes } from "./bienes";
import type { LecturaCostos } from "./costos";
import { cortada } from "./comun";

type Resultado = Promise<{ error: string } | Comparacion>;

/** Lee lo guardado: con alcance de archivo u hojas de una vez; por huellas, en tandas. */
async function base(modulo: ModuloComparable, archivo: string, archivoFilas: FilaComparable[], opciones: { hojas?: string[]; porClaves?: boolean }): Promise<{ error: string } | FilaComparable[]> {
  if (!opciones.porClaves) {
    const r = await leerCargadoParaComparar(modulo, archivo, { hojas: opciones.hojas }).catch(cortada);
    return "error" in r ? r : r.filas;
  }
  const filas: FilaComparable[] = [];
  for (const tanda of enTandas(archivoFilas.map((f) => f.clave), MAX_CLAVES_COMPARAR)) {
    const r = await leerCargadoParaComparar(modulo, archivo, { claves: tanda }).catch(cortada);
    if ("error" in r) return r;
    filas.push(...r.filas);
  }
  return filas;
}

async function comparar(modulo: ModuloComparable, archivo: string, filas: FilaComparable[], opciones: { hojas?: string[]; porClaves?: boolean } = {}): Resultado {
  const b = await base(modulo, archivo, filas, opciones);
  if ("error" in b) return b;
  return compararLibro(modulo === "nomina" ? igualarTiendaVacia(filas, b) : filas, b);
}

export const compararCartera = (modulo: "cuentas-por-cobrar" | "cuentas-por-pagar", archivo: string, l: LecturaCartera & { hojas: string[] }): Resultado =>
  comparar(
    modulo,
    archivo,
    l.documentos.map((d) => comparable(d.origen_clave, d.fecha ?? "", docCartera(d.documento, d.contraparte), d.unidad ?? "", d.monto)),
    { hojas: l.hojas },
  );

export const compararBienes = (l: LecturaBienes): Resultado =>
  comparar("bienes-de-uso", l.archivo, l.bienes.map((b) => comparable(b.origen_clave, b.fecha_alta, b.descripcion, "", b.importe)));

export const compararCostos = (l: LecturaCostos): Resultado =>
  comparar(
    "costos-mercancia",
    l.archivo,
    l.porHoja.flatMap((h) => h.lotes.map((x) => comparable(x.origen_clave, x.fecha_llegada ?? "", x.producto, x.linea, x.costo_total))),
    { hojas: l.porHoja.map((h) => h.hoja) },
  );

export const compararNomina = (archivo: string, l: LecturaNomina): Resultado =>
  comparar("nomina", archivo, l.lineas.map((x) => comparable(x.origen_clave, x.periodo, lineaNomina(x.nombre, x.tramo), x.unidad ?? "", x.neto)));

export const compararVentas = (archivo: string, ordenes: OrdenVenta[]): Resultado =>
  comparar("ventas-tiendas", archivo, ordenes.map((o) => comparable(o.origen_clave, o.fecha, `Orden ${o.numero}`, o.tienda, o.total)), { porClaves: true });

const montoEntrega = (e: LecturaDeliverys["entregas"][number]) => (e.categoria === null ? 0 : Math.round(e.cantidad * e.tarifa * 100) / 100);

/** Deliverys: la tienda de la hoja se escribe distinta a la del catálogo; se compara sin ella. */
export async function compararDeliverys(archivo: string, l: LecturaDeliverys): Resultado {
  const filas = l.entregas.map((e) => comparable(e.origen_clave, e.fecha, e.etiqueta, "", montoEntrega(e)));
  const b = await base("deliverys", archivo, filas, {});
  if ("error" in b) return b;
  return compararLibro(filas, b.map((x) => ({ ...x, tienda: "" })));
}

/** Conciliación: los cobros y las órdenes (las líneas de extracto llevan la cuenta en su huella: se ven al cargar). */
export const compararConciliacion = (archivo: string, hojas: HojaLeida[]): Resultado =>
  comparar(
    "conciliacion-bancaria",
    archivo,
    [
      ...hojas.flatMap((h) => h.cobros.map((c) => comparable(c.huella, c.fecha, cobroConciliacion(c.referencia ?? c.lote ?? c.orden ?? ""), c.tienda ?? "", c.monto_bruto))),
      ...hojas.flatMap((h) => h.ordenes.map((o) => comparable(o.huella, o.fecha ?? "", `Orden ${o.numero}`, o.tienda ?? "", o.monto))),
    ],
    { porClaves: true },
  );
