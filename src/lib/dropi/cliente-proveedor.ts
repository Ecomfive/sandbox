// Las llamadas a Dropi con la sesión del proveedor (ver src/lib/dropi/sesion.ts). Solo las que hacen falta: comprobar la sesión y
// cambiar el nombre de un producto. El cuerpo del guardado lo arma `armarGuardadoProducto` (src/lib/publicaciones/dropi-guardado.ts,
// con prueba) igual que la pantalla de Dropi, y después de guardar se vuelve a leer el producto para confirmar el cambio.

import { armarGuardadoProducto, faltaEnDropi } from "@/lib/publicaciones/dropi-guardado";

type Obj = Record<string, unknown>;

/** La API de Dropi del país (Panamá: api.dropi.pa). */
const apiDe = (codigoPais: string) => `https://api.dropi.${codigoPais.toLowerCase()}/api`;

/** Una llamada a Dropi: `{ ok, status, datos }`; `status` 401 = la sesión venció o se cerró. */
async function pedir(token: string, codigoPais: string, ruta: string, init: { method?: string; body?: Obj } = {}): Promise<{ ok: boolean; status: number; datos: Obj | null }> {
  try {
    const r = await fetch(`${apiDe(codigoPais)}${ruta}`, {
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}`, "x-authorization": `Bearer ${token}` },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const datos = (await r.json().catch(() => null)) as Obj | null;
    return { ok: r.ok && datos?.isSuccess !== false, status: r.status, datos };
  } catch (e) {
    return { ok: false, status: 0, datos: { message: e instanceof Error ? e.message : String(e) } };
  }
}

const motivo = (r: { status: number; datos: Obj | null }) =>
  r.status === 401 ? "La sesión de Dropi venció: vuelve a pulsar «Conectar Dropi»." : r.status === 0 ? `Dropi no respondió (${String(r.datos?.message ?? "")}).` : `Dropi respondió ${r.status}${r.datos?.message ? `: ${String(r.datos.message)}` : ""}.`;

/** Comprueba la sesión: el usuario de Dropi, que sea de proveedor, y sus bodegas. */
export async function usuarioDropi(token: string, codigoPais: string, usuarioId: number): Promise<{ nombre: string; bodegas: Obj[] } | { error: string; vencida?: boolean }> {
  const r = await pedir(token, codigoPais, `/users/${usuarioId}`);
  if (!r.ok) return { error: motivo(r), vencida: r.status === 401 };
  const u = (r.datos?.objects ?? null) as Obj | null;
  if (!u) return { error: "Dropi no devolvió el usuario." };
  if (u.type_user !== "SUPPLIER") return { error: "Esa sesión no es de proveedor: conecta con la cuenta de ECOMFIVE." };
  return { nombre: String(u.name ?? u.email ?? usuarioId), bodegas: Array.isArray(u.warehouses) ? (u.warehouses as Obj[]) : [] };
}

/**
 * Cambia en Dropi el nombre de un producto y, si viene, el nombre de la guía de envío; lo demás se manda tal como está. Lee el
 * producto, guarda y lo vuelve a leer: solo es `ok` si Dropi ya muestra el cambio.
 */
export async function cambiarNombreEnDropi(
  token: string,
  codigoPais: string,
  usuarioId: number,
  productoId: number,
  cambio: { nombre: string; nombreGuia: string | null },
): Promise<{ ok: true } | { ok: false; error: string; vencida?: boolean }> {
  const usuario = await usuarioDropi(token, codigoPais, usuarioId);
  if ("error" in usuario) return { ok: false, error: usuario.error, vencida: usuario.vencida };
  const antes = await pedir(token, codigoPais, `/products/${productoId}`);
  if (!antes.ok) return { ok: false, error: motivo(antes), vencida: antes.status === 401 };
  const producto = (antes.datos?.objects ?? null) as Obj | null;
  if (!producto || Number(producto.id) !== productoId) return { ok: false, error: "Dropi no devolvió el producto." };
  if (Number(producto.user_id) !== usuarioId) return { ok: false, error: "Ese producto no es de este proveedor en Dropi." };
  const armado = armarGuardadoProducto(producto, usuario.bodegas, cambio);
  if ("error" in armado) return { ok: false, error: armado.error };
  const guardado = await pedir(token, codigoPais, `/products/${productoId}`, { method: "PUT", body: armado.cuerpo });
  if (!guardado.ok) return { ok: false, error: motivo(guardado), vencida: guardado.status === 401 };
  const despues = await pedir(token, codigoPais, `/products/${productoId}`);
  const ahora = (despues.datos?.objects ?? null) as Obj | null;
  if (!despues.ok || !ahora) return { ok: false, error: "Se guardó, pero no se pudo comprobar en Dropi." };
  const falta = faltaEnDropi(ahora, cambio);
  return falta ? { ok: false, error: falta } : { ok: true };
}
