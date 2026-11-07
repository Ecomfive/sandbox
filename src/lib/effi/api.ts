/**
 * Cliente de la API de Effi ERP (`https://effi.com.co/api`, 3 nov 2026). Effi es el ERP de la cuenta ECOMFIVE de Costa Rica
 * (ID Effi 55868; la bodega Effi del inventario). La documentación está dentro de la cuenta, en Integraciones › Documentación API.
 *
 * - Entra con `Authorization: Bearer <EFFI_API_KEY>`: la llave del usuario «Sistema MOM» (perfil «Sistema MOM solo consulta»:
 *   solo «Consultar» en Bodega, Artículos, Artículos (Costos y depreciación), Artículos (Stock global), Órdenes de venta, Guías
 *   de transporte y el catálogo y los convenios de dropshipping). La llave vence a los 360 días y se renueva en Effi
 *   (Administración › Usuarios › Ver más detalles › Renovar API Key); vencida, Effi responde 401. Vive solo en el servidor
 *   (variable de Vercel, nunca `NEXT_PUBLIC_`) y no se escribe en ningún registro.
 * - Respuestas `{ ok, data, paginacion: { pagina, por_pagina, total, total_paginas } }`; error `{ ok: false, mensaje }`.
 * - Hasta 100 por página (1000 en los «detalle_…») y 120 peticiones por minuto por llave (429 con `Retry-After`).
 */

export const EFFI_API = "https://effi.com.co/api";

export type PaginacionEffi = { pagina: number; por_pagina: number; total: number; total_paginas: number };

export type RespuestaEffi<T> = { ok: true; data: T[]; paginacion: PaginacionEffi | null } | { ok: false; error: string; status: number };

/** Qué decirle a una persona según lo que respondió Effi (sin repetir nada de la llave). */
export function mensajeErrorEffi(status: number, mensaje?: string | null): string {
  if (status === 401) return "Effi no aceptó la llave: es inválida, venció (dura 360 días) o el usuario «Sistema MOM» está inactivo. Renuévala en Effi › Administración › Usuarios › Ver más detalles.";
  if (status === 403) return "El perfil del usuario de Effi no tiene permiso de consulta para esto. Revísalo en Effi › Administración › Perfiles de usuario.";
  if (status === 429) return "Effi limitó las consultas (120 por minuto). Prueba de nuevo en un minuto.";
  if (status >= 500) return `Effi no respondió bien (error ${status}). Prueba más tarde.`;
  return mensaje?.trim() || `Effi respondió con el error ${status}.`;
}

export function llaveEffi(): string | null {
  const k = process.env.EFFI_API_KEY?.trim();
  return k ? k : null;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una página de un recurso (`articulo`, `bodega`, `orden_v`…). Reintenta una vez si Effi pide esperar (429). */
export async function consultarEffi<T = Record<string, unknown>>(
  recurso: string,
  params: Record<string, string | number> = {},
): Promise<RespuestaEffi<T>> {
  const llave = llaveEffi();
  if (!llave) return { ok: false, status: 0, error: "Falta la llave de Effi (variable EFFI_API_KEY en Vercel)." };
  const url = new URL(`${EFFI_API}/${recurso}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let intento = 0; intento < 2; intento++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${llave}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    } catch {
      return { ok: false, status: 0, error: "No se pudo llegar a Effi (sin respuesta o tardó más de 20 s)." };
    }
    if (res.status === 429 && intento === 0) {
      const segundos = Math.min(Number(res.headers.get("retry-after")) || 5, 30);
      await espera(segundos * 1000);
      continue;
    }
    const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; data?: T[]; paginacion?: PaginacionEffi; mensaje?: string } | null;
    if (!res.ok || !cuerpo?.ok) return { ok: false, status: res.status, error: mensajeErrorEffi(res.status, cuerpo?.mensaje) };
    return { ok: true, data: cuerpo.data ?? [], paginacion: cuerpo.paginacion ?? null };
  }
  return { ok: false, status: 429, error: mensajeErrorEffi(429) };
}

/** Todas las páginas de un recurso (de 100 en 100, o `porPagina`). */
export async function consultarTodoEffi<T = Record<string, unknown>>(
  recurso: string,
  params: Record<string, string | number> = {},
  porPagina = 100,
): Promise<{ ok: true; data: T[] } | { ok: false; error: string; status: number }> {
  const todo: T[] = [];
  for (let pagina = 1; ; pagina++) {
    const r = await consultarEffi<T>(recurso, { ...params, pagina, por_pagina: porPagina });
    if (!r.ok) return r;
    todo.push(...r.data);
    const total = r.paginacion?.total_paginas ?? 1;
    if (pagina >= total || r.data.length === 0) return { ok: true, data: todo };
  }
}

export type ResumenConexionEffi = {
  articulos: number;
  bodegas: string[];
  /** El perfil deja ver los costos (función 155) y el stock (156): sin ese permiso Effi no manda esos campos. */
  conCostos: boolean;
  conStock: boolean;
  ejemplo: { id: string; nombre: string } | null;
  /** El texto de las tarifas tal como lo manda Effi, para revisar la lectura de precios. */
  tarifas: string | null;
  /** Las ventas: cuántas filas de remisiones de venta de ayer y hoy ve la llave, o por qué no (falta el permiso de reportes). */
  ventas: { total: number | null; error: string | null };
};

/** Prueba la llave con dos consultas livianas: un artículo (y el total) y las bodegas. Solo lee. */
export async function probarConexionEffi(): Promise<{ ok: true; resumen: ResumenConexionEffi } | { ok: false; error: string }> {
  const [articulos, bodegas, ventas] = await Promise.all([
    consultarEffi<Record<string, unknown>>("articulo", { pagina: 1, por_pagina: 1 }),
    consultarEffi<Record<string, unknown>>("bodega", { pagina: 1, por_pagina: 100 }),
    consultarEffi<Record<string, unknown>>("detalle_remision_v", { desde: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), pagina: 1, por_pagina: 1 }),
  ]);
  if (!articulos.ok) return { ok: false, error: articulos.error };
  const a = articulos.data[0];
  return {
    ok: true,
    resumen: {
      articulos: articulos.paginacion?.total ?? articulos.data.length,
      bodegas: bodegas.ok ? bodegas.data.map((b) => String(b.nombre ?? b.descripcion ?? b.id ?? "")).filter(Boolean) : [],
      conCostos: !!a && "p_costo" in a,
      conStock: !!a && "stock_empresa" in a,
      ejemplo: a ? { id: String(a.id ?? ""), nombre: String(a.descripcion ?? "") } : null,
      tarifas: typeof a?.precios_venta === "string" ? a.precios_venta.slice(0, 300) : null,
      ventas: ventas.ok ? { total: ventas.paginacion?.total ?? ventas.data.length, error: null } : { total: null, error: ventas.error },
    },
  };
}
