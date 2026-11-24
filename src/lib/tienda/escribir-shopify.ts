// Escribir en Shopify desde el sistema (19 nov 2026, etapa 1: etiquetas del pedido). Busca el pedido por su número («#1734»), le agrega o quita
// etiquetas con `tagsAdd`/`tagsRemove` (solo tocan las etiquetas nombradas: no pisa las que otra persona o una app pusieron mientras tanto) y devuelve
// cómo quedaron en Shopify. Necesita que la tienda haya aprobado `write_orders` en su app; si no, lanza el error en palabras del equipo. Solo servidor.

import { accesoDeApp, olvidarAcceso, puedeEscribirPedidos, puedeManejarEspera, type AppTienda } from "./shopify-app";

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

// ── Manual ATC (24 nov 2026): anular el pedido y levantar la espera al confirmar.

/**
 * Anula el pedido en Shopify (como «Cancelar pedido» en el admin): sin avisar al cliente, sin reembolso (es contra entrega) y devolviendo el stock. Si el
 * pedido ya estaba anulado, no hace nada. El motivo va en la nota interna de la anulación y como etiqueta (la pone quien llama).
 */
export async function anularEnShopify(app: AppTienda, numero: string, motivo: string): Promise<void> {
  const token = await tokenConEscritura(app);
  const pedido = await buscarPedido(app, token, numero);
  const estado = await graphql<{ order: { cancelledAt: string | null } | null }>(app, token, "query($id: ID!) { order(id: $id) { cancelledAt } }", { id: pedido.id });
  if (estado.order?.cancelledAt) return;
  type Res = { orderCancel: { orderCancelUserErrors: { message: string }[] } | null };
  const variables = { id: pedido.id, nota: `Anulado desde el sistema: ${motivo}`.slice(0, 250) };
  // Shopify cambió cómo se dice «sin reembolso» (`refund` → `refundMethod`): se prueba una forma y, si no la reconoce, la otra.
  const formas = [
    `mutation($id: ID!, $nota: String) { orderCancel(orderId: $id, reason: CUSTOMER, refund: false, restock: true, notifyCustomer: false, staffNote: $nota) { orderCancelUserErrors { message } } }`,
    `mutation($id: ID!, $nota: String) { orderCancel(orderId: $id, reason: CUSTOMER, refundMethod: { originalPaymentMethodsRefund: false }, restock: true, notifyCustomer: false, staffNote: $nota) { orderCancelUserErrors { message } } }`,
  ];
  let ultimo: unknown = null;
  for (const forma of formas) {
    try {
      const d = await graphql<Res>(app, token, forma, variables);
      const errores = d.orderCancel?.orderCancelUserErrors ?? [];
      if (errores.length) throw new Error(`Shopify no anuló el pedido: ${errores[0].message}`);
      return;
    } catch (e) {
      ultimo = e;
      if (!(e instanceof Error) || !/refund/i.test(e.message) || /no anuló/.test(e.message)) throw e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Shopify no anuló el pedido.");
}

/**
 * Levanta la espera del pedido (los envíos «En espera» pasan a «No preparado» y despacho ya los puede preparar). Necesita el permiso
 * `write_merchant_managed_fulfillment_orders`; sin él devuelve false y no hace nada (la espera se levanta en Shopify). Sin espera, true.
 */
export async function liberarEsperaEnShopify(app: AppTienda, numero: string): Promise<boolean> {
  const acceso = await accesoDeApp(app);
  if (!puedeManejarEspera(acceso.scope)) return false;
  const pedido = await buscarPedido(app, acceso.token, numero);
  const d = await graphql<{ order: { fulfillmentOrders: { nodes: { id: string; status: string }[] } } | null }>(
    app,
    acceso.token,
    "query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }",
    { id: pedido.id },
  );
  for (const fo of (d.order?.fulfillmentOrders.nodes ?? []).filter((x) => x.status === "ON_HOLD")) {
    const r = await graphql<{ fulfillmentOrderReleaseHold: { userErrors: { message: string }[] } | null }>(
      app,
      acceso.token,
      "mutation($id: ID!) { fulfillmentOrderReleaseHold(id: $id) { userErrors { message } } }",
      { id: fo.id },
    );
    const errores = r.fulfillmentOrderReleaseHold?.userErrors ?? [];
    if (errores.length) throw new Error(`Shopify no levantó la espera: ${errores[0].message}`);
  }
  return true;
}

// ── Manual ATC, el resto del recorrido (24 nov 2026): la guía de la asesora, el «Entregado» de la coordinadora y el «Pagado» de Finanzas.

/** El token con un permiso de escritura dado; si falta, el error dice cuál aprobar. */
async function tokenCon(app: AppTienda, permiso: string, para: string): Promise<string> {
  let acceso = await accesoDeApp(app);
  const tiene = (scope: string) => scope.split(",").map((s) => s.trim()).includes(permiso);
  if (tiene(acceso.scope)) return acceso.token;
  olvidarAcceso(app);
  acceso = await accesoDeApp(app);
  if (tiene(acceso.scope)) return acceso.token;
  throw new Error(`Para ${para} falta aprobar en la app de Shopify de ${app.tienda} el permiso «${permiso}» (Dev Dashboard → nueva versión → aprobar en la tienda).`);
}

/** El envío (fulfillment) del pedido: el último que no se canceló. Sin envío, despacho todavía no lo preparó. */
async function envioDelPedido(app: AppTienda, token: string, numero: string): Promise<{ id: string; displayStatus: string | null }> {
  const pedido = await buscarPedido(app, token, numero);
  const d = await graphql<{ order: { fulfillments: { id: string; status: string; displayStatus: string | null; createdAt: string }[] } | null }>(
    app,
    token,
    "query($id: ID!) { order(id: $id) { fulfillments(first: 10) { id status displayStatus createdAt } } }",
    { id: pedido.id },
  );
  const envios = (d.order?.fulfillments ?? []).filter((f) => f.status !== "CANCELLED" && f.status !== "ERROR").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!envios.length) throw new Error("El pedido todavía no está preparado en Shopify: despacho lo prepara primero y después se carga la guía.");
  return { id: envios[0].id, displayStatus: envios[0].displayStatus };
}

/** Carga la guía y el enlace público en el envío del pedido, con el correo de seguimiento al cliente (el manual lo pide activado). */
export async function cargarGuiaEnShopify(app: AppTienda, numero: string, guia: { numero: string; empresa: string; url: string }): Promise<void> {
  const token = await tokenCon(app, "write_fulfillments", "cargar la guía");
  const envio = await envioDelPedido(app, token, numero);
  const d = await graphql<{ fulfillmentTrackingInfoUpdate: { userErrors: { message: string }[] } | null }>(
    app,
    token,
    "mutation($id: ID!, $info: FulfillmentTrackingInput!) { fulfillmentTrackingInfoUpdate(fulfillmentId: $id, trackingInfoInput: $info, notifyCustomer: true) { userErrors { message } } }",
    { id: envio.id, info: { number: guia.numero, company: guia.empresa, url: guia.url } },
  );
  const errores = d.fulfillmentTrackingInfoUpdate?.userErrors ?? [];
  if (errores.length) throw new Error(`Shopify no aceptó la guía: ${errores[0].message}`);
}

/** «Marcar como entregado» en Shopify (un evento DELIVERED en el envío). Si ya está entregado, no hace nada. */
export async function marcarEntregadoEnShopify(app: AppTienda, numero: string): Promise<void> {
  const token = await tokenCon(app, "write_fulfillments", "marcar el pedido como entregado");
  const envio = await envioDelPedido(app, token, numero);
  if (envio.displayStatus === "DELIVERED") return;
  const d = await graphql<{ fulfillmentEventCreate: { userErrors: { message: string }[] } | null }>(
    app,
    token,
    "mutation($ev: FulfillmentEventInput!) { fulfillmentEventCreate(fulfillmentEvent: $ev) { userErrors { message } } }",
    { ev: { fulfillmentId: envio.id, status: "DELIVERED", happenedAt: new Date().toISOString() } },
  );
  const errores = d.fulfillmentEventCreate?.userErrors ?? [];
  if (errores.length) throw new Error(`Shopify no lo marcó como entregado: ${errores[0].message}`);
}

/** Pasa el pago de «Pendiente» a «Pagado» (Finanzas, con el dinero en el banco). Si ya está pagado, no hace nada. */
export async function marcarPagadoEnShopify(app: AppTienda, numero: string): Promise<void> {
  const token = await tokenConEscritura(app);
  const pedido = await buscarPedido(app, token, numero);
  const e = await graphql<{ order: { displayFinancialStatus: string | null; cancelledAt: string | null } | null }>(app, token, "query($id: ID!) { order(id: $id) { displayFinancialStatus cancelledAt } }", { id: pedido.id });
  if (e.order?.cancelledAt) throw new Error("El pedido está anulado en Shopify: no se marca como pagado.");
  if (e.order?.displayFinancialStatus === "PAID") return;
  const d = await graphql<{ orderMarkAsPaid: { userErrors: { message: string }[] } | null }>(
    app,
    token,
    "mutation($id: ID!) { orderMarkAsPaid(input: { id: $id }) { userErrors { message } } }",
    { id: pedido.id },
  );
  const errores = d.orderMarkAsPaid?.userErrors ?? [];
  if (errores.length) throw new Error(`Shopify no lo marcó como pagado: ${errores[0].message}`);
}
