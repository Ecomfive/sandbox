// Tienda global de Finanzas (como el país de la barra de arriba): reglas puras, sin cookies ni base, para poder
// probarlas. La cookie y la consulta viven en `tienda-actual.ts`; la acción que la cambia, en `tienda-actions.ts`.
//
// Cómo se combinan la tienda de la dirección y la global: si la dirección trae la tienda (`?ver=` o `?tienda=`), manda
// esa y la página la recuerda como global; si no la trae, la página arranca con la global. Por eso la opción «Todas» de
// los selectores de las páginas va explícita (`?tienda=todas`): sin ella, la página volvería a la global.

export const TIENDA_COOKIE = "tienda_actual";
export const TODAS_TIENDAS = "todas";

type Params = { [k: string]: string | string[] | undefined };

/** El valor que trae la dirección para esa clave (el primero si viene repetida), o null si no lo trae. */
export function valorExplicito(params: Params, clave: string): string | null {
  const v = params[clave];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s !== "" ? s : null;
}

/** Los parámetros de la página con la tienda global puesta si la dirección no trae una (`null` = todas). */
export function conTiendaGlobal<P extends Params>(params: P, clave: string, global: string | null): P & Params {
  return valorExplicito(params, clave) !== null ? params : { ...params, [clave]: global ?? TODAS_TIENDAS };
}

/** ¿Es un valor que se puede guardar como tienda global? «todas» o un id con forma de UUID (el servidor revisa que exista). */
export const valorTiendaValido = (v: unknown): v is string =>
  v === TODAS_TIENDAS || (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));

/** Una dirección con la tienda puesta explícita, también «todas» (los armadores de enlaces la quitan por ser el valor por defecto). */
export function conTiendaExplicita(href: string, clave: string, valor: string): string {
  const [ruta, q = ""] = href.split("?");
  const p = new URLSearchParams(q);
  p.set(clave, valor);
  return `${ruta}?${p.toString()}`;
}

/**
 * Las páginas de Finanzas que usan la tienda global y con qué parámetro la leen. La barra de arriba solo muestra el
 * selector de tienda en estas.
 */
export const RUTAS_CON_TIENDA: { ruta: RegExp; clave: string }[] = [
  { ruta: /^\/estado-resultados$/, clave: "ver" },
  { ruta: /^\/rentabilidad(\/palancas)?$/, clave: "tienda" },
  { ruta: /^\/ventas-tiendas(\/ordenes)?$/, clave: "tienda" },
  { ruta: /^\/presupuesto\/[0-9a-f-]{36}$/i, clave: "ver" },
];

/** El parámetro con que una ruta lee la tienda, o null si la ruta no usa la tienda global. */
export function claveDeRuta(ruta: string): string | null {
  return RUTAS_CON_TIENDA.find((r) => r.ruta.test(ruta))?.clave ?? null;
}
