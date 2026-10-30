// «Actualizar Dropi» (pedido de Hernán, 26 oct 2026; migración 0154): qué se trae de Dropi, con qué cuenta y con qué lector de la
// extensión «Ecomfive · Dropi». Un lector corre DENTRO de la pestaña de Dropi (con su sesión, que no sale de ahí), lee y sube
// archivos JSON a direcciones firmadas del sistema; después el servidor procesa cada parte. Primera etapa: Panamá con la cuenta de
// proveedor ECOMFIVE (pedidos, cartera, retiros, stock y ventas). **Costa Rica** (28 oct 2026, pedido de Hernán): lo mismo con la
// cuenta de proveedor de app.dropi.cr; los lectores son los mismos (leen el país del dominio de la pestaña). **México** (30 oct
// 2026, pedido de Hernán): lo mismo con la cuenta de proveedor de app.dropi.mx. La competencia de Panamá y el catálogo de México
// (scraping) no van en el panel: «no lo necesitamos».
// Sin base ni red.

/** Quién ve «Actualizar Dropi» mientras se prueba («que solo me aparezca a mí por ahora», Hernán, 26 oct 2026). */
export const CORREOS_ACTUALIZAR_DROPI = ["hernan@ecomfive.io"];
export const puedeActualizarDropi = (u: { email: string | null | undefined }) => CORREOS_ACTUALIZAR_DROPI.includes(String(u.email ?? "").trim().toLowerCase());

export type CodigoPaisDropi = "pa" | "cr" | "mx";

/** Las cuentas de Dropi: cada país es un dominio distinto (app.dropi.pa, app.dropi.cr, app.dropi.mx), así que las sesiones conviven. */
export const CUENTAS: Record<CodigoPaisDropi, { nombre: string; cuenta: string; tipoUsuario: string | null; tienda: string | null; origen: string }> = {
  pa: { nombre: "Panamá", cuenta: "cuenta de proveedor ECOMFIVE", tipoUsuario: "SUPPLIER", tienda: "ECOMFIVE", origen: "https://app.dropi.pa" },
  // La de proveedor de Costa Rica (el nombre de su tienda no se exige: basta que sea de proveedor).
  cr: { nombre: "Costa Rica", cuenta: "cuenta de proveedor", tipoUsuario: "SUPPLIER", tienda: null, origen: "https://app.dropi.cr" },
  // La de proveedor de México (30 oct 2026), como la de Costa Rica.
  mx: { nombre: "México", cuenta: "cuenta de proveedor", tipoUsuario: "SUPPLIER", tienda: null, origen: "https://app.dropi.mx" },
};

/**
 * «Descubrir proveedores» (Scraping) lee el catálogo de México con una cuenta de **dropshipper** (una de proveedor no ve el catálogo).
 * Es el mismo dominio que la de proveedor, así que en un mismo Chrome está una u otra.
 */
export const CUENTA_CATALOGO_MX = { nombre: "México", cuenta: "cuenta de dropshipper", tipoUsuario: null, tienda: null, origen: "https://app.dropi.mx" };

export type ClaveLector = "proveedor" | "ventas" | "proveedor_cr" | "ventas_cr" | "proveedor_mx" | "ventas_mx" | "catalogo_mx";

/**
 * Los lectores de la extensión (copias de scripts/dropi-diario-navegador.js y scripts/ventas-dropi-navegador.js, que siguen
 * usando las tareas programadas): la función que arranca, la variable de la página donde deja el avance y los archivos que sube.
 * Los de Costa Rica son los mismos archivos corridos en la pestaña de app.dropi.cr.
 */
export const LECTORES: Record<ClaveLector, { pais: CodigoPaisDropi; archivo: string; funcion: string; estado: string; archivos: string[] }> = {
  proveedor: { pais: "pa", archivo: "lectores/dropi-diario.js", funcion: "dropiDiario", estado: "__dropiDiario", archivos: ["pedidos", "cartera", "retiros", "stock"] },
  ventas: { pais: "pa", archivo: "lectores/ventas-dropi.js", funcion: "ventasDropi", estado: "__ventasDropi", archivos: ["resumen", "movimientos"] },
  proveedor_cr: { pais: "cr", archivo: "lectores/dropi-diario.js", funcion: "dropiDiario", estado: "__dropiDiario", archivos: ["pedidos", "cartera", "retiros", "stock"] },
  ventas_cr: { pais: "cr", archivo: "lectores/ventas-dropi.js", funcion: "ventasDropi", estado: "__ventasDropi", archivos: ["resumen", "movimientos"] },
  proveedor_mx: { pais: "mx", archivo: "lectores/dropi-diario.js", funcion: "dropiDiario", estado: "__dropiDiario", archivos: ["pedidos", "cartera", "retiros", "stock"] },
  ventas_mx: { pais: "mx", archivo: "lectores/ventas-dropi.js", funcion: "ventasDropi", estado: "__ventasDropi", archivos: ["resumen", "movimientos"] },
  // «Descubrir proveedores» (Scraping de proveedores): todo el catálogo de México, con la sesión de dropshipper.
  catalogo_mx: { pais: "mx", archivo: "lectores/catalogo.js", funcion: "leerCatalogo", estado: "__catalogo", archivos: ["catalogo"] },
};

/**
 * Con qué nombre queda en Storage un archivo que sube un lector: los de Panamá como siempre («pedidos») y los de otro país con su
 * código pegado («pedidoscr»), para que una actualización de los dos países no pise un archivo con el otro.
 */
export const archivoSubido = (lector: ClaveLector, archivo: string) => (LECTORES[lector].pais === "pa" ? archivo : `${archivo}${LECTORES[lector].pais}`);

export type TipoParte = "pedidos" | "cartera" | "retiros" | "stock" | "ventas";
export type ClaveParte = TipoParte | "pedidos_cr" | "cartera_cr" | "retiros_cr" | "stock_cr" | "ventas_cr" | "pedidos_mx" | "cartera_mx" | "retiros_mx" | "stock_mx" | "ventas_mx";

export interface Parte {
  clave: ClaveParte;
  /** Qué es (lo mismo en cada país): decide cómo se guarda. */
  tipo: TipoParte;
  etiqueta: string;
  pais: CodigoPaisDropi;
  /** Dónde se ve en el sistema. */
  donde: string;
  ruta: string;
  lector: ClaveLector;
}

export const PARTES: Parte[] = [
  { clave: "pedidos", tipo: "pedidos", etiqueta: "Pedidos y estados (30 días)", pais: "pa", donde: "Pedidos Dropi · CRM", ruta: "/pedidos-dropi", lector: "proveedor" },
  { clave: "cartera", tipo: "cartera", etiqueta: "Cartera (7 días)", pais: "pa", donde: "Pedidos Dropi (cartera)", ruta: "/pedidos-dropi", lector: "proveedor" },
  { clave: "retiros", tipo: "retiros", etiqueta: "Retiros y saldo", pais: "pa", donde: "Conciliación de Retiros", ruta: "/retiros", lector: "proveedor" },
  { clave: "stock", tipo: "stock", etiqueta: "Stock por bodega", pais: "pa", donde: "Gestión de IDs Dropi", ruta: "/publicaciones-dropi", lector: "proveedor" },
  { clave: "ventas", tipo: "ventas", etiqueta: "Ventas (historial de existencias)", pais: "pa", donde: "Ventas Dropi · Reponer", ruta: "/ventas-dropi", lector: "ventas" },
  { clave: "pedidos_cr", tipo: "pedidos", etiqueta: "Pedidos y estados (30 días)", pais: "cr", donde: "Pedidos Dropi · CRM", ruta: "/pedidos-dropi", lector: "proveedor_cr" },
  { clave: "cartera_cr", tipo: "cartera", etiqueta: "Cartera (7 días)", pais: "cr", donde: "Pedidos Dropi (cartera)", ruta: "/pedidos-dropi", lector: "proveedor_cr" },
  { clave: "retiros_cr", tipo: "retiros", etiqueta: "Retiros y saldo", pais: "cr", donde: "Conciliación de Retiros", ruta: "/retiros", lector: "proveedor_cr" },
  { clave: "stock_cr", tipo: "stock", etiqueta: "Stock por bodega", pais: "cr", donde: "Gestión de IDs Dropi", ruta: "/publicaciones-dropi", lector: "proveedor_cr" },
  { clave: "ventas_cr", tipo: "ventas", etiqueta: "Ventas (historial de existencias)", pais: "cr", donde: "Ventas Dropi · Reponer", ruta: "/ventas-dropi", lector: "ventas_cr" },
  { clave: "pedidos_mx", tipo: "pedidos", etiqueta: "Pedidos y estados (30 días)", pais: "mx", donde: "Pedidos Dropi · CRM", ruta: "/pedidos-dropi", lector: "proveedor_mx" },
  { clave: "cartera_mx", tipo: "cartera", etiqueta: "Cartera (7 días)", pais: "mx", donde: "Pedidos Dropi (cartera)", ruta: "/pedidos-dropi", lector: "proveedor_mx" },
  { clave: "retiros_mx", tipo: "retiros", etiqueta: "Retiros y saldo", pais: "mx", donde: "Conciliación de Retiros", ruta: "/retiros", lector: "proveedor_mx" },
  { clave: "stock_mx", tipo: "stock", etiqueta: "Stock por bodega", pais: "mx", donde: "Gestión de IDs Dropi", ruta: "/publicaciones-dropi", lector: "proveedor_mx" },
  { clave: "ventas_mx", tipo: "ventas", etiqueta: "Ventas (historial de existencias)", pais: "mx", donde: "Ventas Dropi · Reponer", ruta: "/ventas-dropi", lector: "ventas_mx" },
];

export const esParte = (x: unknown): x is ClaveParte => typeof x === "string" && PARTES.some((p) => p.clave === x);
export const parte = (clave: ClaveParte): Parte => PARTES.find((p) => p.clave === clave)!;

/** Los grupos que se pueden elegir en «Elegir qué actualizar»: cada lector lee varias partes de una vez. */
export const GRUPOS: { lector: ClaveLector; etiqueta: string; detalle: string }[] = [
  { lector: "proveedor", etiqueta: "Pedidos, cartera, retiros y stock", detalle: "Panamá · 2 a 5 minutos" },
  { lector: "ventas", etiqueta: "Ventas", detalle: "Panamá · 3 a 6 minutos" },
  { lector: "proveedor_cr", etiqueta: "Pedidos, cartera, retiros y stock", detalle: "Costa Rica · la primera vez tarda más" },
  { lector: "ventas_cr", etiqueta: "Ventas", detalle: "Costa Rica" },
  { lector: "proveedor_mx", etiqueta: "Pedidos, cartera, retiros y stock", detalle: "México" },
  { lector: "ventas_mx", etiqueta: "Ventas", detalle: "México" },
];

/** Los lectores de cada país, en el orden en que corren. */
export const LECTORES_PAIS: Record<CodigoPaisDropi, ClaveLector[]> = { pa: ["proveedor", "ventas"], cr: ["proveedor_cr", "ventas_cr"], mx: ["proveedor_mx", "ventas_mx"] };

/** Los lectores que hacen falta para esas partes, en orden (Panamá primero). */
export const lectoresDe = (partes: ClaveParte[]): ClaveLector[] =>
  [...LECTORES_PAIS.pa, ...LECTORES_PAIS.cr, ...LECTORES_PAIS.mx].filter((l) => PARTES.some((p) => p.lector === l && partes.includes(p.clave)));

/**
 * Desde cuándo traer los pedidos y la cartera de un país en su primera lectura y con «Traer historial». Costa Rica: desde el 1 de abril de
 * 2026 (29 oct 2026, Hernán: todo lo que hay en Dropi desde que se empezó; la primera venta fue el 17 de abril). Antes era el 1 de
 * septiembre. México: desde el 1 de julio de 2024 (30 oct 2026, Hernán: «en la primera corrida quiero todo el historial»; su primera venta
 * en el historial de existencias de Dropi es del 4 de julio de 2024). Después, cada actualización trae los días de siempre (30 de pedidos, 7
 * de cartera); los retiros y las ventas siempre llegan completos.
 */
export const PRIMERA_LECTURA_DESDE: Partial<Record<CodigoPaisDropi, string>> = { cr: "2026-04-01", mx: "2024-07-01" };

/** Hasta cuántos días atrás se le puede pedir a un lector (la extensión acepta lo mismo): México trae desde julio de 2024. */
export const MAX_DIAS_LECTURA = 1000;

/** Cuántos días pedirle al lector la primera vez de un país (`null` = los de siempre). */
export function diasPrimeraLectura(pais: CodigoPaisDropi, hoy = new Date()): { pedidos: number; cartera: number } | null {
  const desde = PRIMERA_LECTURA_DESDE[pais];
  if (!desde) return null;
  const dias = Math.ceil((hoy.getTime() - Date.parse(`${desde}T00:00:00Z`)) / 86400000);
  return dias > 30 ? { pedidos: Math.min(dias, MAX_DIAS_LECTURA), cartera: Math.min(dias, MAX_DIAS_LECTURA) } : null;
}

type SesionVista = { hay: boolean; tipoUsuario: string | null; tienda: string | null; vence: string | null };
type EstadoSesion = "ok" | "sin_sesion" | "otra_cuenta" | "vencida";

/** Si la sesión que ve la extensión en la pestaña de un país es la que hace falta (la de proveedor de «Actualizar datos»). */
export function sesionValida(pais: CodigoPaisDropi, s: SesionVista | null, ahora = Date.now()): EstadoSesion {
  return sesionDeCuenta(CUENTAS[pais], s, ahora);
}

/** La sesión de dropshipper de México que pide «Descubrir proveedores» (`CUENTA_CATALOGO_MX`). */
export const sesionCatalogoMx = (s: SesionVista | null, ahora = Date.now()): EstadoSesion => sesionDeCuenta(CUENTA_CATALOGO_MX, s, ahora);

function sesionDeCuenta(c: { tipoUsuario: string | null; tienda: string | null }, s: SesionVista | null, ahora: number): EstadoSesion {
  if (!s || !s.hay) return "sin_sesion";
  if (c.tipoUsuario ? s.tipoUsuario !== c.tipoUsuario : s.tipoUsuario === "SUPPLIER") return "otra_cuenta";
  if (c.tienda && s.tienda !== c.tienda) return "otra_cuenta";
  if (s.vence && new Date(s.vence).getTime() <= ahora + 60_000) return "vencida";
  return "ok";
}
