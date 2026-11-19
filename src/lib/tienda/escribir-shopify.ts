// Escribir en Shopify desde el sistema (19 nov 2026, etapa 1: etiquetas del pedido). Busca el pedido por su número («#1734»), le agrega o quita
// etiquetas con `tagsAdd`/`tagsRemove` (solo tocan las etiquetas nombradas: no pisa las que otra persona o una app pusieron mientras tanto) y devuelve
// cómo quedaron en Shopify. Necesita que la tienda haya aprobado `write_orders` en su app; si no, lanza el error en palabras del equipo. Solo servidor.

import { accesoDeApp, olvidarAcceso, puedeEscribirPedidos, type AppTienda } from "./shopify-app";

const VERSION_API = "2026-07";

type Respuesta<T> = { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };

async function graphql<T>(app: AppTienda, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetch(`https://${app.dominio}/admin/api/${VERSION_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token, Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  const cuerpo = (await r.json().catch(() => ({}))) as Respuesta<T>;
  const denegado = r.status === 403 || (cuerpo.errors ?? []).some((e) => e.extensions?.code === "ACCESS_DENIED");
  if (denegado) throw new Error(`Shopify no deja cambiar pedidos de ${app.tienda}: falta aprobar el permiso write_orders de la app en la tienda.`);
  if (!r.ok || cuerpo.errors?.length || !cuerpo.data) throw new Error(`Shopify no respondió bien (${cuerpo.errors?.[0]?.message ?? `HTTP ${r.status}`}).`);
  return cuerpo.data;
}

/** El token con permiso de escritura: si el guardado no lo trae (se aprobó después), pide uno nuevo una vez. */
async function tokenConEscritura(app: AppTienda): Promise<string> {
  let acceso = await accesoDeApp(app);
  if (puedeEscribirPedidos(acceso.scope)) return acceso.token;
  olvidarAcceso(app);
  acceso = await accesoDeApp(app);
  if (puedeEscribirPedidos(acceso.scope)) return acceso.token;
  throw new Error(`La app de Shopify de ${app.tienda} todavía no tiene permiso para cambiar pedidos (write_orders). Hay que agregarlo en el Dev Dashboard y aprobarlo en la tienda.`);
}

const sinNumeral = (n: string) => n.replace(/^#/, "").trim();

/** El pedido en Shopify por su número, o lanza si no está. */
async function buscarPedido(app: AppTienda, token: string, numero: string): Promise<{ id: string; tags: string[] }> {
  const n = sinNumeral(numero);
  if (!n || n.length > 40) throw new Error("El pedido no tiene número de Shopify.");
  for (const q of [`name:${n}`, `name:#${n}`]) {
    const d = await graphql<{ orders: { nodes: { id: string; name: string; tags: string[] }[] } }>(
      app,
      token,
      "query($q: String!) { orders(first: 5, query: $q) { nodes { id name tags } } }",
      { q },
    );
    const p = d.orders.nodes.find((x) => sinNumeral(x.name) === n);
    if (p) return { id: p.id, tags: p.tags };
  }
  throw new Error(`No se encontró el pedido #${n} en Shopify de ${app.tienda}.`);
}

/**
 * Agrega y quita etiquetas de un pedido en Shopify. Lanza el error en palabras si no se pudo cambiar nada (sin permiso, pedido que no está): en ese caso
 * no cambió nada. Si una parte entró y la otra no (se agregó pero no se pudo quitar), devuelve cómo quedó allá y el error, para guardar lo que sí cambió.
 */
export async function cambiarEtiquetasEnShopify(app: AppTienda, numero: string, agregar: string[], quitar: string[]): Promise<{ etiquetas: string[]; error: string | null }> {
  const token = await tokenConEscritura(app);
  const pedido = await buscarPedido(app, token, numero);
  let tags = pedido.tags;
  let cambio = false;
  type Mut = { node: { tags?: string[] } | null; userErrors: { message: string }[] };
  for (const [nombre, lista] of [
    ["tagsAdd", agregar],
    ["tagsRemove", quitar],
  ] as const) {
    if (!lista.length) continue;
    try {
      const d = await graphql<Record<string, Mut>>(
        app,
        token,
        `mutation($id: ID!, $tags: [String!]!) { ${nombre}(id: $id, tags: $tags) { node { ... on Order { tags } } userErrors { message } } }`,
        { id: pedido.id, tags: lista },
      );
      const r = d[nombre];
      if (r?.userErrors?.length) throw new Error(`Shopify no aceptó el cambio: ${r.userErrors[0].message}`);
      if (r?.node?.tags) tags = r.node.tags;
      cambio = true;
    } catch (e) {
      if (!cambio) throw e;
      return { etiquetas: tags, error: e instanceof Error ? e.message : "Shopify no aceptó una parte del cambio." };
    }
  }
  return { etiquetas: tags, error: null };
}
