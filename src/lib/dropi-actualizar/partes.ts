// «Actualizar Dropi» (pedido de Hernán, 26 oct 2026; migración 0154): qué se trae de Dropi, con qué cuenta y con qué lector de la
// extensión «Ecomfive · Dropi». Un lector corre DENTRO de la pestaña de Dropi (con su sesión, que no sale de ahí), lee y sube
// archivos JSON a direcciones firmadas del sistema; después el servidor procesa cada parte. Primera etapa: Panamá con la cuenta de
// proveedor ECOMFIVE (pedidos, cartera, retiros, stock y ventas). Después: la competencia de Panamá y los proveedores de México.
// Sin base ni red.

/** Quién ve «Actualizar Dropi» mientras se prueba («que solo me aparezca a mí por ahora», Hernán, 26 oct 2026). */
export const CORREOS_ACTUALIZAR_DROPI = ["hernan@ecomfive.io", "aandrade@ecomfive.io"];
export const puedeActualizarDropi = (u: { email: string | null | undefined }) => CORREOS_ACTUALIZAR_DROPI.includes(String(u.email ?? "").trim().toLowerCase());

export type CodigoPaisDropi = "pa" | "mx";

/** Las cuentas de Dropi: cada país es un dominio distinto (app.dropi.pa, app.dropi.mx), así que las dos sesiones conviven. */
export const CUENTAS: Record<CodigoPaisDropi, { nombre: string; cuenta: string; tipoUsuario: string | null; tienda: string | null; origen: string }> = {
  pa: { nombre: "Panamá", cuenta: "cuenta de proveedor ECOMFIVE", tipoUsuario: "SUPPLIER", tienda: "ECOMFIVE", origen: "https://app.dropi.pa" },
  // Cualquier cuenta que no sea de proveedor (una de proveedor no ve el catálogo).
  mx: { nombre: "México", cuenta: "cuenta de dropshipper", tipoUsuario: null, tienda: null, origen: "https://app.dropi.mx" },
};

export type ClaveLector = "proveedor" | "ventas" | "catalogo_mx";

/**
 * Los lectores de la extensión (copias de scripts/dropi-diario-navegador.js y scripts/ventas-dropi-navegador.js, que siguen
 * usando las tareas programadas): la función que arranca, la variable de la página donde deja el avance y los archivos que sube.
 */
export const LECTORES: Record<ClaveLector, { pais: CodigoPaisDropi; archivo: string; funcion: string; estado: string; archivos: string[] }> = {
  proveedor: { pais: "pa", archivo: "lectores/dropi-diario.js", funcion: "dropiDiario", estado: "__dropiDiario", archivos: ["pedidos", "cartera", "retiros", "stock"] },
  ventas: { pais: "pa", archivo: "lectores/ventas-dropi.js", funcion: "ventasDropi", estado: "__ventasDropi", archivos: ["resumen", "movimientos"] },
  // «Descubrir proveedores» (Scraping de proveedores): todo el catálogo de México, con la sesión de dropshipper.
  catalogo_mx: { pais: "mx", archivo: "lectores/catalogo.js", funcion: "leerCatalogo", estado: "__catalogo", archivos: ["catalogo"] },
};

export type ClaveParte = "pedidos" | "cartera" | "retiros" | "stock" | "ventas";

export interface Parte {
  clave: ClaveParte;
  etiqueta: string;
  pais: CodigoPaisDropi;
  /** Dónde se ve en el sistema. */
  donde: string;
  ruta: string;
  lector: ClaveLector;
}

export const PARTES: Parte[] = [
  { clave: "pedidos", etiqueta: "Pedidos y estados (30 días)", pais: "pa", donde: "Pedidos Dropi · CRM", ruta: "/pedidos-dropi", lector: "proveedor" },
  { clave: "cartera", etiqueta: "Cartera (7 días)", pais: "pa", donde: "Pedidos Dropi (cartera)", ruta: "/pedidos-dropi", lector: "proveedor" },
  { clave: "retiros", etiqueta: "Retiros y saldo", pais: "pa", donde: "Conciliación de Retiros", ruta: "/retiros", lector: "proveedor" },
  { clave: "stock", etiqueta: "Stock por bodega", pais: "pa", donde: "Gestión de IDs Dropi", ruta: "/publicaciones-dropi", lector: "proveedor" },
  { clave: "ventas", etiqueta: "Ventas (historial de existencias)", pais: "pa", donde: "Ventas Dropi · Reponer", ruta: "/ventas-dropi", lector: "ventas" },
];

export const esParte = (x: unknown): x is ClaveParte => typeof x === "string" && PARTES.some((p) => p.clave === x);

/** Los grupos que se pueden elegir en «Elegir qué actualizar»: cada lector lee varias partes de una vez. */
export const GRUPOS: { lector: ClaveLector; etiqueta: string; detalle: string }[] = [
  { lector: "proveedor", etiqueta: "Pedidos, cartera, retiros y stock", detalle: "Panamá · 2 a 5 minutos" },
  { lector: "ventas", etiqueta: "Ventas", detalle: "Panamá · 3 a 6 minutos" },
];

/** Los lectores que hacen falta para esas partes, en orden. */
export const lectoresDe = (partes: ClaveParte[]): ClaveLector[] => (["proveedor", "ventas"] as ClaveLector[]).filter((l) => PARTES.some((p) => p.lector === l && partes.includes(p.clave)));

/** Si la sesión que ve la extensión en la pestaña de un país es la que hace falta. */
export function sesionValida(pais: CodigoPaisDropi, s: { hay: boolean; tipoUsuario: string | null; tienda: string | null; vence: string | null } | null, ahora = Date.now()): "ok" | "sin_sesion" | "otra_cuenta" | "vencida" {
  if (!s || !s.hay) return "sin_sesion";
  const c = CUENTAS[pais];
  if (c.tipoUsuario ? s.tipoUsuario !== c.tipoUsuario : s.tipoUsuario === "SUPPLIER") return "otra_cuenta";
  if (c.tienda && s.tienda !== c.tienda) return "otra_cuenta";
  if (s.vence && new Date(s.vence).getTime() <= ahora + 60_000) return "vencida";
  return "ok";
}
