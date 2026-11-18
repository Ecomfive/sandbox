import assert from "node:assert/strict";
import { test } from "node:test";
import { SIN_RESTRICCIONES, restriccionesDe } from "../../app/(app)/compras/permisos-compras";
import { eventoCompraParaRol, eventoCrmVisible, eventoDeTiendaVisible, eventoSinMontos, eventoVisible, veTodosLosChats } from "../auditoria-visible";
import { resolverAfinado } from "../permisos/afinado";
import { CATALOGO_COMPRAS, CATALOGO_CRM } from "../permisos/catalogo";

const sinPais = () => undefined;

test("un evento solo se ve con el módulo de su entidad", () => {
  const u = { modulos: ["notificaciones", "retiros"], paisesPermitidos: null };
  assert.equal(eventoVisible({ accion: "crear_retiro", entidad: "retiros", entidad_id: "1" }, u, sinPais), true);
  assert.equal(eventoVisible({ accion: "crear_usuario", entidad: "perfiles", entidad_id: "1" }, u, sinPais), false);
  assert.equal(eventoVisible({ accion: "editar_campo_compra", entidad: "wms_compras", entidad_id: "1" }, u, sinPais), false);
});

test("una entidad desconocida solo la ve quien tiene Usuarios y roles", () => {
  assert.equal(eventoVisible({ accion: "x", entidad: "tabla_nueva", entidad_id: null }, { modulos: ["notificaciones"], paisesPermitidos: null }, sinPais), false);
  assert.equal(eventoVisible({ accion: "x", entidad: "tabla_nueva", entidad_id: null }, { modulos: ["notificaciones", "usuarios"], paisesPermitidos: null }, sinPais), true);
});

test("las acciones del CRM Comercial piden crm-comercial", () => {
  const ev = { accion: "crear_seguimiento_dropshipper", entidad: "dropshippers", entidad_id: "1" };
  assert.equal(eventoVisible(ev, { modulos: ["crm-dropshippers"], paisesPermitidos: null }, sinPais), false);
  assert.equal(eventoVisible(ev, { modulos: ["crm-dropshippers", "crm-comercial"], paisesPermitidos: null }, sinPais), true);
  assert.equal(eventoVisible({ accion: "registrar_interaccion", entidad: "dropshippers", entidad_id: "1" }, { modulos: ["crm-dropshippers"], paisesPermitidos: null }, sinPais), true);
});

test("una compra de un país no permitido no se ve (ni una de país desconocido)", () => {
  const u = { modulos: ["compras"], paisesPermitidos: ["CR"] };
  const ev = { accion: "editar_campo_compra", entidad: "wms_compras", entidad_id: "c1" };
  assert.equal(eventoVisible(ev, u, () => "CR"), true);
  assert.equal(eventoVisible(ev, u, () => "PA"), false);
  assert.equal(eventoVisible(ev, u, () => undefined), false);
  assert.equal(eventoVisible(ev, u, () => null), false);
  assert.equal(eventoVisible(ev, { modulos: ["compras"], paisesPermitidos: ["importacion"] }, () => null), true);
});

test("la orden de compra o el movimiento de un producto se filtran por el país de su detalle", () => {
  const paises = [{ codigo: "PA", nombre: "Panamá" }, { codigo: "CR", nombre: "Costa Rica" }];
  const u = { modulos: ["producto"], paisesPermitidos: ["CR"] };
  const mov = (detalle: string) => ({ accion: "movimiento_inventario", entidad: "skus_maestros", entidad_id: "1", detalle });
  assert.equal(eventoVisible(mov("entrada 5 de X · Costa Rica"), u, sinPais, paises), true);
  assert.equal(eventoVisible(mov("entrada 5 de X · Panamá"), u, sinPais, paises), false);
  assert.equal(eventoVisible(mov("entrada 5 de X"), u, sinPais, paises), false);
  // Texto libre con otro país antes del marcador real: manda el último.
  assert.equal(eventoVisible(mov("entrada 5 de X (traslado · Costa Rica) · Panamá"), u, sinPais, paises), false);
  assert.equal(eventoVisible(mov("entrada 5 de X (devolución · Panamá) · Costa Rica"), u, sinPais, paises), true);
  assert.equal(eventoVisible(mov("entrada 5 de X (a · Costa Rica)"), u, sinPais, paises), false);
  assert.equal(eventoVisible({ accion: "crear_compra", entidad: "skus_maestros", entidad_id: "1", detalle: "OC-0001 · X · Panamá (al pasar a Activo)" }, u, sinPais, paises), false);
  assert.equal(eventoVisible({ accion: "cambiar_clase", entidad: "skus_maestros", entidad_id: "1", detalle: "x" }, u, sinPais, paises), true);
  assert.equal(eventoVisible(mov("entrada 5 de X"), { modulos: ["producto"], paisesPermitidos: null }, sinPais, paises), true);
});

test("una landing, publicación o ficha WMS de otro país no se ve (auditoría del 27 oct 2026)", () => {
  const u = { modulos: ["generador-landings", "publicaciones-dropi", "wms-productos"], paisesPermitidos: ["PA"] };
  for (const entidad of ["landings", "dropi_publicaciones", "wms_productos"]) {
    const ev = { accion: "x", entidad, entidad_id: "1" };
    assert.equal(eventoVisible(ev, u, () => "PA"), true, entidad);
    assert.equal(eventoVisible(ev, u, () => "CR"), false, entidad);
    assert.equal(eventoVisible(ev, u, sinPais), false, entidad);
  }
});

test("sin montos: se quitan del detalle y de antes/después; un cambio solo de montos no se muestra", () => {
  assert.equal(eventoSinMontos({ detalle: "x", antes: { "Monto Total": "$100.00" }, despues: { "Monto Total": "$250.00" } }), null);
  const mixto = eventoSinMontos({ detalle: "OC-12 · Cotización: 10 u. · $25.00", antes: { Etapa: "Cotizar", "Monto Total": "$1" }, despues: { Etapa: "Producción", "Monto Total": "$2" } });
  assert.deepEqual(mixto, { detalle: "OC-12 · Cotización: 10 u.", antes: { Etapa: "Cotizar" }, despues: { Etapa: "Producción" } });
  assert.deepEqual(eventoSinMontos({ detalle: "Anulada por precio $5", antes: null, despues: null }), { detalle: "Anulada por precio $…", antes: null, despues: null });
});

const ocultando = (clave: string) => restriccionesDe(resolverAfinado(CATALOGO_COMPRAS, [{ modulo: "compras", tipo: "campo", clave, valor: "oculto" }]));

test("una compra en la bitácora: sin los datos de un campo oculto, aunque el monto vaya sin «$» (auditoría, 18 nov 2026)", () => {
  const monto = { accion: "editar_campo_compra", detalle: null, antes: { "Monto Total": "1270" }, despues: { "Monto Total": "1100" } };
  assert.equal(eventoCompraParaRol(monto, ocultando("monto")), null);
  assert.equal(eventoCompraParaRol(monto, SIN_RESTRICCIONES), monto);
  assert.deepEqual(eventoCompraParaRol(monto, ocultando("proveedor")), monto);
  assert.equal(eventoCompraParaRol({ accion: "editar_campo_compra", detalle: "En lote (3 compras)", antes: { Proveedor: "A" }, despues: { Proveedor: "B" } }, ocultando("proveedor")), null);
  const pago = {
    accion: "registrar_pago_llegada",
    detalle: "Segundo pago registrado (1.200,00 el 2026-11-10); la compra pasó a Completado",
    antes: { Etapa: "07 - En Bodega", "Pagado a Proveedor": "800" },
    despues: { Etapa: "08 - Completado", "Pagado a Proveedor": "2000" },
  };
  assert.deepEqual(eventoCompraParaRol(pago, ocultando("pago2")), { accion: "registrar_pago_llegada", detalle: "Segundo pago registrado; la compra pasó a Completado", antes: { Etapa: "07 - En Bodega" }, despues: { Etapa: "08 - Completado" } });
  assert.equal(eventoCompraParaRol({ accion: "editar_campo_compra", detalle: "Shen Zhen (proveedor) cambió en el Registro de pagos X · Pagado: $1 → $2", antes: null, despues: null }, ocultando("monto")), null);
  assert.equal(eventoCompraParaRol({ accion: "renombrar_tienda", detalle: "A → B (3 compras)", antes: null, despues: null }, ocultando("tienda")), null);
});

test("con tiendas limitadas, lo de finanzas solo se ve si es de una tienda suya (auditoría, 18 nov 2026)", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const tienda = (u: string | null | undefined) => () => u;
  const mov = { entidad: "fin_movimientos", entidad_id: "m1" };
  assert.equal(eventoDeTiendaVisible(mov, null, tienda(B)), true);
  assert.equal(eventoDeTiendaVisible(mov, [A], tienda(A)), true);
  assert.equal(eventoDeTiendaVisible(mov, [A], tienda(B)), false);
  assert.equal(eventoDeTiendaVisible(mov, [A], tienda(null)), false);
  assert.equal(eventoDeTiendaVisible(mov, [A], tienda(undefined)), false);
  assert.equal(eventoDeTiendaVisible({ entidad: "fin_comentarios", entidad_id: "c1" }, [A], tienda(undefined)), false);
  assert.equal(eventoDeTiendaVisible({ entidad: "wms_compras", entidad_id: "c1" }, [A], tienda(undefined)), true);
});

test("el CRM en la bitácora: solo chats de sus áreas y de su alcance; lo de Dirección, solo Dirección (auditoría, 18 nov 2026)", () => {
  const atencion = { id: "u1", modulos: ["crm-dropshippers", "notificaciones"], modulosSoloLectura: [] };
  const comercial = { id: "u2", modulos: ["crm-dropshippers", "crm-comercial"], modulosSoloLectura: [] };
  const direccion = { id: "u3", modulos: ["crm-dropshippers", "crm-comercial", "crm-direccion"], modulosSoloLectura: [] };
  const chats: Record<string, { area: "direccion" | "comercial" | "atencion"; asignadaA: string | null }> = {
    d: { area: "direccion", asignadaA: null },
    c: { area: "comercial", asignadaA: null },
    a: { area: "atencion", asignadaA: "otra" },
    l: { area: "atencion", asignadaA: null },
  };
  const chatDe = (id: string) => chats[id];
  const ev = (id: string | null) => ({ accion: "renombrar_contacto_whatsapp", entidad: "whatsapp_conversaciones", entidad_id: id });
  assert.equal(eventoCrmVisible(ev("d"), atencion, chatDe), false);
  assert.equal(eventoCrmVisible(ev("c"), atencion, chatDe), false);
  assert.equal(eventoCrmVisible(ev("a"), atencion, chatDe), true);
  assert.equal(eventoCrmVisible(ev("c"), comercial, chatDe), true);
  assert.equal(eventoCrmVisible(ev("d"), comercial, chatDe), false);
  assert.equal(eventoCrmVisible(ev("d"), direccion, chatDe), true);
  // Quien ve todos los chats no depende de la consulta (si falla, igual los ve); los demás, sin saber el chat, no.
  assert.equal(eventoCrmVisible(ev("x"), direccion, chatDe), true);
  assert.equal(eventoCrmVisible(ev("x"), comercial, chatDe), false);
  assert.equal(veTodosLosChats(direccion), true);
  assert.equal(veTodosLosChats(comercial), false);
  assert.equal(eventoCrmVisible(ev(null), comercial, chatDe), false);
  assert.equal(eventoCrmVisible(ev(null), direccion, chatDe), true);
  // «Los suyos y los libres»: el chat que lleva otra persona no.
  const suyos = { ...atencion, afinado: { "crm-dropshippers": resolverAfinado(CATALOGO_CRM, [{ modulo: "crm-dropshippers", tipo: "alcance", clave: "alcance", valor: "mias-y-libres" }]) } };
  assert.equal(eventoCrmVisible(ev("a"), suyos, chatDe), false);
  assert.equal(eventoCrmVisible(ev("l"), suyos, chatDe), true);
  const alerta = { accion: "crm_alerta_atendida", entidad: "dropshippers", entidad_id: "ds1" };
  assert.equal(eventoCrmVisible(alerta, comercial, chatDe), false);
  assert.equal(eventoCrmVisible(alerta, direccion, chatDe), true);
  assert.equal(eventoCrmVisible({ accion: "crear_tarea_crm", entidad: "dropshippers", entidad_id: "ds1" }, comercial, chatDe), false);
  assert.equal(eventoCrmVisible({ accion: "crear_dropshipper", entidad: "dropshippers", entidad_id: "ds1" }, atencion, chatDe), true);
});

test("sin ver lo pagado (o un pago), tampoco el Registro de pagos ni cuánto se pagó en una llegada (auditoría, 18 nov 2026)", () => {
  const registro = { accion: "editar_campo_compra", detalle: "Shen Zhen (proveedor) cambió en el Registro de pagos X · Pagado: $1 → $2", antes: null, despues: null };
  for (const clave of ["pagado", "pago1", "pago2"]) assert.equal(eventoCompraParaRol(registro, ocultando(clave)), null, clave);
  assert.deepEqual(eventoCompraParaRol(registro, ocultando("proveedor")), registro);
  const pago = { accion: "registrar_pago_llegada", detalle: "Segundo pago registrado (1.200,00 el 2026-11-10); la compra pasó a Completado", antes: { Etapa: "07 - En Bodega" }, despues: { Etapa: "08 - Completado" } };
  assert.equal(eventoCompraParaRol(pago, ocultando("pagado"))?.detalle, "Segundo pago registrado; la compra pasó a Completado");
});
