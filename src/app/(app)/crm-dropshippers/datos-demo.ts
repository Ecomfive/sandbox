import type { FilaCaso, FilaDropshipper, ResumenCrm } from "./def-crm";

/**
 * MODO DEMO del CRM de dropshippers. Mientras sea `true`, las páginas muestran los datos inventados de este archivo
 * (nombres, cifras y casos ficticios) y no leen ni escriben nada en la base: sirve para enseñar cómo queda el módulo.
 *
 * Para pasar a datos reales:
 *   1. Correr la migración 0062 en Supabase.
 *   2. Cambiar `MODO_DEMO` a `false`: las páginas leen de `datos-crm.ts`.
 *   3. Borrar este archivo y sus importaciones (`grep -r datos-demo src`).
 */
export const MODO_DEMO = true;

const DIA_MS = 86_400_000;

/** Fecha ISO (solo día) de hace `dias` días, para que los ejemplos siempre se vean recientes. */
function hace(dias: number): string {
  return new Date(Date.now() - dias * DIA_MS).toISOString().slice(0, 10);
}

const SERIE = [52, 61, 58, 77, 84, 97];
/** Pedidos de los últimos seis meses a partir de los del mes: misma forma de curva, escalada. */
const serie = (pedidosMes: number) => SERIE.map((m) => Math.round((m * pedidosMes) / 97));

function ds(d: Omit<FilaDropshipper, "pedidosPorMes" | "email" | "paises" | "paisOrigen"> & { paises?: string[]; paisOrigen?: string }): FilaDropshipper {
  return { ...d, email: null, paises: d.paises ?? ["CR"], paisOrigen: d.paisOrigen ?? "CR", pedidosPorMes: serie(d.pedidosMes) };
}

export const DROPSHIPPERS_DEMO: FilaDropshipper[] = [
  ds({ id: "demo-1", codigo: "DS-0007", nombre: "Valeria Quesada", tienda: "Tienda Valu", ciudad: "San José", telefono: "+506 8812 0007", estado: "activo", nivel: "vip", responsable: "Andrea", ingreso: "2025-03-12", pedidosMes: 148, ventasMes: 4_820_000, ultimoPedido: hace(0), casosAbiertos: 1, etiquetas: ["mayorista"], notas: "Pide combos de belleza cada lunes." }),
  ds({ id: "demo-2", codigo: "DS-0031", paises: ["CR", "PA"], paisOrigen: "CO", nombre: "Diego Salazar", tienda: "DS Gadgets CR", ciudad: "Heredia", telefono: "+506 8730 0031", estado: "activo", nivel: "vip", responsable: "Andrea", ingreso: "2025-06-03", pedidosMes: 132, ventasMes: 4_105_000, ultimoPedido: hace(1), casosAbiertos: 0, etiquetas: ["tecnología"], notas: "Prefiere contacto por WhatsApp." }),
  ds({ id: "demo-3", codigo: "DS-0112", paisOrigen: "MX", nombre: "Camila Rojas", tienda: "Camii Store", ciudad: "Alajuela", telefono: "+506 8645 0112", estado: "activo", nivel: "regular", responsable: "Mateo", ingreso: "2025-08-21", pedidosMes: 97, ventasMes: 2_960_000, ultimoPedido: hace(0), casosAbiertos: 2, etiquetas: ["hogar"], notas: null }),
  ds({ id: "demo-4", codigo: "DS-0045", nombre: "Esteban Mora", tienda: "EM Importados", ciudad: "Cartago", telefono: "+506 8590 0045", estado: "activo", nivel: "regular", responsable: "Mateo", ingreso: "2025-09-09", pedidosMes: 84, ventasMes: 2_410_000, ultimoPedido: hace(2), casosAbiertos: 0, etiquetas: [], notas: null }),
  ds({ id: "demo-5", codigo: "DS-0158", nombre: "Natalia Brenes", tienda: "Naty Shop", ciudad: "Limón", telefono: "+506 8421 0158", estado: "activo", nivel: "regular", responsable: "Andrea", ingreso: "2025-11-14", pedidosMes: 71, ventasMes: 1_985_000, ultimoPedido: hace(3), casosAbiertos: 1, etiquetas: ["mascotas"], notas: "Reclamó dos devoluciones en septiembre." }),
  ds({ id: "demo-6", codigo: "DS-0203", nombre: "Andrés Villalobos", tienda: "AV Market", ciudad: "Puntarenas", telefono: "+506 8377 0203", estado: "activo", nivel: "nuevo", responsable: "Mateo", ingreso: "2026-08-02", pedidosMes: 46, ventasMes: 1_190_000, ultimoPedido: hace(1), casosAbiertos: 0, etiquetas: ["nuevo"], notas: null }),
  ds({ id: "demo-7", codigo: "DS-0264", paises: ["CR", "PA"], nombre: "Priscilla Chacón", tienda: "Pri Boutique", ciudad: "San José", telefono: "+506 8209 0264", estado: "activo", nivel: "nuevo", responsable: "Andrea", ingreso: "2026-08-18", pedidosMes: 33, ventasMes: 870_000, ultimoPedido: hace(4), casosAbiertos: 1, etiquetas: ["moda", "nuevo"], notas: null }),
  ds({ id: "demo-8", codigo: "DS-0089", nombre: "Jorge Arce", tienda: "JA Ventas", ciudad: "Heredia", telefono: "+506 8118 0089", estado: "activo", nivel: "regular", responsable: "Mateo", ingreso: "2026-01-30", pedidosMes: 12, ventasMes: 340_000, ultimoPedido: hace(32), casosAbiertos: 0, etiquetas: [], notas: "Bajó el volumen desde agosto." }),
  ds({ id: "demo-9", codigo: "DS-0291", nombre: "Lucía Fonseca", tienda: "Lu Home", ciudad: "Guanacaste", telefono: "+506 8099 0291", estado: "prospecto", nivel: "nuevo", responsable: "Andrea", ingreso: "2026-09-26", pedidosMes: 0, ventasMes: 0, ultimoPedido: null, casosAbiertos: 0, etiquetas: ["llegó por Instagram"], notas: "Pidió catálogo y condiciones." }),
  ds({ id: "demo-10", codigo: "DS-0299", nombre: "Mauricio Pérez", tienda: "MP Online", ciudad: "Alajuela", telefono: "+506 8044 0299", estado: "prospecto", nivel: "nuevo", responsable: "Mateo", ingreso: "2026-09-29", pedidosMes: 0, ventasMes: 0, ultimoPedido: null, casosAbiertos: 0, etiquetas: [], notas: null }),
  ds({ id: "demo-11", codigo: "DS-0016", nombre: "Rebeca Jiménez", tienda: "Rebe Tech", ciudad: "San José", telefono: "+506 8003 0016", estado: "inactivo", nivel: "regular", responsable: "Andrea", ingreso: "2025-04-11", pedidosMes: 0, ventasMes: 0, ultimoPedido: hace(74), casosAbiertos: 0, etiquetas: ["cerró tienda"], notas: "Pausó la operación en julio." }),
];

export const CASOS_DEMO: FilaCaso[] = [
  { id: "demo-c1", codigo: "CAS-0120", titulo: "Pedido llegó incompleto", dropshipperId: "demo-3", dropshipper: "Camila Rojas", tipo: "problema", prioridad: "alta", estado: "abierto", numeroPedido: "#48213", responsable: "Mateo", canal: "whatsapp", horasAbierto: 27 },
  { id: "demo-c2", codigo: "CAS-0121", titulo: "Devolución sin reembolso", dropshipperId: "demo-5", dropshipper: "Natalia Brenes", tipo: "devolucion", prioridad: "alta", estado: "abierto", numeroPedido: "#48102", responsable: null, canal: "whatsapp", horasAbierto: 31 },
  { id: "demo-c3", codigo: "CAS-0122", titulo: "Consulta de comisiones", dropshipperId: "demo-7", dropshipper: "Priscilla Chacón", tipo: "pago", prioridad: "normal", estado: "en_curso", numeroPedido: null, responsable: "Andrea", canal: "whatsapp", horasAbierto: 6 },
  { id: "demo-c4", codigo: "CAS-0123", titulo: "Cambio de dirección de envío", dropshipperId: "demo-1", dropshipper: "Valeria Quesada", tipo: "pedido", prioridad: "normal", estado: "en_curso", numeroPedido: "#48377", responsable: "Andrea", canal: "correo", horasAbierto: 3 },
  { id: "demo-c5", codigo: "CAS-0124", titulo: "Pedido urgente para el lunes", dropshipperId: "demo-3", dropshipper: "Camila Rojas", tipo: "pedido", prioridad: "normal", estado: "abierto", numeroPedido: null, responsable: null, canal: "whatsapp", horasAbierto: 26 },
  { id: "demo-c6", codigo: "CAS-0119", titulo: "Duda con el plazo de entrega", dropshipperId: "demo-2", dropshipper: "Diego Salazar", tipo: "pedido", prioridad: "baja", estado: "resuelto", numeroPedido: "#48090", responsable: "Andrea", canal: "whatsapp", horasAbierto: 52 },
];

export function resumenDemo(mes: string): ResumenCrm {
  return {
    activos: 214,
    activosDeltaMes: 9,
    totalDropshippers: 300,
    pedidosMes: 1846,
    pedidosDeltaPct: 12.4,
    ventasMes: 38_200_000,
    ventasDeltaPct: 8.1,
    casosAbiertos: 17,
    casosSinResponder: 5,
    primeraRespuestaMin: 38,
    primeraRespuestaDeltaMin: -6,
    sinPedir30: 41,
    mes,
  };
}
