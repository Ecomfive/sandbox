// La conexión con la tienda de Shopify (solo servidor). La app se crea en el Dev Dashboard de Shopify y se instala en la tienda;
// con su id y su secreto se pide un permiso (client credentials) que dura 24 horas y se guarda en memoria hasta poco antes de
// vencer. Variables: SHOPIFY_TIENDA (oferfy o oferfy.myshopify.com), SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET; o, si la tienda
// ya tenía una app personalizada de antes de 2026, SHOPIFY_ADMIN_TOKEN (su token fijo). Ninguna lleva NEXT_PUBLIC_.

import { dominioTienda, textoErrores } from "./shopify";

const VERSION = () => process.env.SHOPIFY_API_VERSION?.trim() || "2026-10";

export const tiendaShopify = () => dominioTienda(process.env.SHOPIFY_TIENDA);

/** Hay tienda y forma de entrar (token fijo, o id y secreto de la app). */
export const shopifyConectado = () =>
  !!tiendaShopify() && (!!process.env.SHOPIFY_ADMIN_TOKEN?.trim() || (!!process.env.SHOPIFY_CLIENT_ID?.trim() && !!process.env.SHOPIFY_CLIENT_SECRET?.trim()));

let permiso: { token: string; vence: number; tienda: string } | null = null;

async function token(tienda: string): Promise<string | { error: string }> {
  const fijo = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (fijo) return fijo;
  if (permiso && permiso.tienda === tienda && permiso.vence > Date.now()) return permiso.token;
  let r: Response;
  try {
    r = await fetch(`https://${tienda}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: process.env.SHOPIFY_CLIENT_ID!.trim(), client_secret: process.env.SHOPIFY_CLIENT_SECRET!.trim() }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return { error: "No se pudo conectar con Shopify." };
  }
  // Un error de OAuth puede llegar como página HTML («400 - Oauth error app_not_installed»), no como JSON.
  const cuerpo = await r.text().catch(() => "");
  let json: { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null = null;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    // No era JSON: el motivo se busca en el texto.
  }
  if (!r.ok || !json?.access_token) {
    const motivo = `${json?.error ?? ""} ${json?.error_description ?? ""} ${cuerpo.slice(0, 500)}`;
    if (/app_not_installed/i.test(motivo)) return { error: "La app de Shopify no está instalada en la tienda: instálala desde el Dev Dashboard." };
    if (/shop_not_permitted/i.test(motivo)) return { error: "La tienda no está en la misma organización que la app de Shopify: hay que instalarla con autorización (ver la guía)." };
    if (r.status === 400 || r.status === 401) return { error: "Shopify rechazó el id o el secreto de la app (o la app no está instalada en la tienda)." };
    return { error: "Shopify no entregó el permiso de acceso." };
  }
  // Se renueva un minuto antes de que venza.
  permiso = { token: json.access_token, vence: Date.now() + Math.max(60, (json.expires_in ?? 86399) - 60) * 1000, tienda };
  return permiso.token;
}

/** Una consulta a la Admin API (GraphQL). Devuelve `data` o el error en palabras de quien usa el sistema. Nunca lanza. */
export async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<{ data: T } | { error: string }> {
  const tienda = tiendaShopify();
  if (!tienda || !shopifyConectado()) return { error: "Falta conectar Shopify." };
  const t = await token(tienda);
  if (typeof t !== "string") return t;
  let r: Response;
  try {
    r = await fetch(`https://${tienda}/admin/api/${VERSION()}/graphql.json`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shopify-access-token": t },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch {
    return { error: "Shopify no respondió. Vuelve a intentar." };
  }
  const json = (await r.json().catch(() => null)) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] | string } | null;
  if (r.status === 401) {
    permiso = null;
    return { error: "Shopify rechazó el acceso: revisa la app y sus permisos." };
  }
  if (r.status === 429) return { error: "Shopify pidió esperar un momento (límite de consultas). Vuelve a intentar." };
  if (!r.ok || !json) return { error: `Shopify respondió con un error (${r.status}).` };
  if (json.errors) {
    const lista = typeof json.errors === "string" ? [{ message: json.errors }] : json.errors;
    if (lista.some((e) => e.extensions?.code === "ACCESS_DENIED" || /access denied/i.test(e.message))) return { error: "A la app de Shopify le falta un permiso (write_products o write_publications)." };
    return { error: `Shopify: ${lista.map((e) => e.message).slice(0, 2).join(" · ")}` };
  }
  return { data: json.data as T };
}

const CAMPOS_PRODUCTO = `id handle status onlineStoreUrl onlineStorePreviewUrl
  media(first: 20) { nodes { id status ... on MediaImage { image { url } } } }`;

export interface ProductoShopify {
  id: string;
  handle: string;
  status: string;
  onlineStoreUrl: string | null;
  onlineStorePreviewUrl: string | null;
  media: { nodes: { id: string; status: string; image?: { url: string } | null }[] };
}

/** Crea (sin `id`) o actualiza el producto con `productSet`. */
export async function guardarProducto(input: Record<string, unknown>, id: string | null): Promise<{ producto: ProductoShopify } | { error: string }> {
  const r = await shopifyGraphql<{ productSet: { product: ProductoShopify | null; userErrors: { field: string[] | null; message: string }[] } }>(
    `mutation Guardar($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
      productSet(input: $input, identifier: $identifier, synchronous: true) { product { ${CAMPOS_PRODUCTO} } userErrors { field message } }
    }`,
    { input, identifier: id ? { id } : null },
  );
  if ("error" in r) return r;
  const errores = textoErrores(r.data.productSet.userErrors);
  if (errores || !r.data.productSet.product) return { error: `Shopify no guardó el producto: ${errores ?? "sin detalle"}` };
  return { producto: r.data.productSet.product };
}

/** El producto, para ver si sus fotos ya se procesaron. */
export async function leerProducto(id: string): Promise<{ producto: ProductoShopify | null } | { error: string }> {
  const r = await shopifyGraphql<{ product: ProductoShopify | null }>(`query Leer($id: ID!) { product(id: $id) { ${CAMPOS_PRODUCTO} } }`, { id });
  return "error" in r ? r : { producto: r.data.product };
}

/** Espera (hasta ~40 s) a que Shopify termine de procesar las fotos del producto, para tener sus direcciones. */
export async function esperarFotos(id: string): Promise<ProductoShopify | { error: string }> {
  let ultimo: ProductoShopify | null = null;
  for (let i = 0; i < 14; i++) {
    const r = await leerProducto(id);
    if ("error" in r) return r;
    ultimo = r.producto;
    if (!ultimo) return { error: "El producto ya no existe en Shopify." };
    const fotos = ultimo.media.nodes;
    if (fotos.some((m) => m.status === "FAILED")) return { error: "Shopify no pudo procesar una de las imágenes." };
    if (fotos.every((m) => m.status === "READY" && m.image?.url)) return ultimo;
    await new Promise((res) => setTimeout(res, 3000));
  }
  return ultimo ?? { error: "Shopify tardó demasiado en procesar las imágenes. Vuelve a intentar." };
}

/** Cambia el estado del producto (ACTIVE / DRAFT) y, al activarlo, lo publica en la tienda online. */
export async function publicarProducto(id: string): Promise<{ producto: ProductoShopify } | { error: string }> {
  const pubs = await shopifyGraphql<{ publications: { nodes: { id: string; catalog: { title: string } | null }[] } }>(`{ publications(first: 25) { nodes { id catalog { title } } } }`);
  if ("error" in pubs) return pubs;
  const tienda = pubs.data.publications.nodes.find((p) => /online store|tienda online/i.test(p.catalog?.title ?? ""));
  if (!tienda) return { error: "No se encontró el canal «Tienda online» en Shopify." };
  const act = await shopifyGraphql<{ productUpdate: { product: ProductoShopify | null; userErrors: { field: string[] | null; message: string }[] } }>(
    `mutation Activar($p: ProductUpdateInput!) { productUpdate(product: $p) { product { ${CAMPOS_PRODUCTO} } userErrors { field message } } }`,
    { p: { id, status: "ACTIVE" } },
  );
  if ("error" in act) return act;
  const e1 = textoErrores(act.data.productUpdate.userErrors);
  if (e1) return { error: `Shopify no activó el producto: ${e1}` };
  const pub = await shopifyGraphql<{ publishablePublish: { userErrors: { field: string[] | null; message: string }[] } }>(
    `mutation Publicar($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
    { id, input: [{ publicationId: tienda.id }] },
  );
  if ("error" in pub) return pub;
  const e2 = textoErrores(pub.data.publishablePublish.userErrors);
  if (e2) return { error: `Shopify no publicó el producto en la tienda online: ${e2}` };
  const final = await leerProducto(id);
  if ("error" in final || !final.producto) return { producto: act.data.productUpdate.product! };
  return { producto: final.producto };
}

/** La dirección del producto en el admin de Shopify. */
export function urlAdmin(id: string): string {
  const tienda = tiendaShopify() ?? "";
  return `https://admin.shopify.com/store/${tienda.replace(".myshopify.com", "")}/products/${id.split("/").pop()}`;
}
