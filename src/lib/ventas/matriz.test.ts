import assert from "node:assert/strict";
import test from "node:test";
import {
  complementos,
  estadoDeEntrega,
  leerGuias,
  leerMapeoProductos,
  leerMatriz,
  leerMonday,
  metodoDePago,
  resumirLeido,
  transportistaDe,
  unidadDeTienda,
} from "./matriz";
import type { Celda } from "../finanzas/libro-excel";

// Datos inventados: ningún nombre, teléfono ni dirección es real.
const T = [
  null, "TIENDA", "FECHA", "N° Orden", "NOMBRES Y APELLIDOS", "TOTAL VENTA", "CANTIDAD", "NOMBRE PRODUCTO", "CORREGIMIENTO", "DIRECCION",
  "TELEFONO", "ESTADO PEDIDO SHOPIFY", "ETIQUETAS", "NOTAS", "FORMA DE PAGO", "VERIFICADO", "COURIER", "MONTO ENVIO", "FECHA  DE ENVIO",
  "COSTO PRODUCTO", "MOTIVOS DE CANCELACIONES", "MONTO ENVIO SE", "EXITOSA/FALLIDA", "MES", "MONTO DE CAMBIO", "FORMA DE PAGO DEL CAMBIO",
  "DEVUELTOS SE", "CAMBIO/RECUPERADO SE", "FECHA- DEVOLUCION", "MONTO PAGADO AL DELIVERY", "DELIVERY", "NO USAR", "FACTURADO CON ITBMS", "N° FACTURA",
];
// Serie de Excel: 46113 = 2026-04-01.
const fila = (o: Partial<Record<string, Celda>>): Celda[] => {
  const f: Celda[] = new Array(T.length).fill(null);
  const set = (titulo: string, v: Celda) => (f[T.indexOf(titulo)] = v);
  set("TIENDA", "OFERFY");
  set("FECHA", 46113);
  set("CANTIDAD", 1);
  for (const [k, v] of Object.entries(o)) set(k, v);
  return f;
};

test("agrupa las líneas por orden, toma el total de la línea principal y deja los datos de la persona aparte", () => {
  const filas: Celda[][] = [
    T,
    ["---", "-", "-", "-", "-", 0, 0, "-"],
    fila({ "N° Orden": "#100", "NOMBRES Y APELLIDOS": "Persona Inventada", "TOTAL VENTA": "DUPLICADO", "NOMBRE PRODUCTO": "Envío Express Prioritario", "FORMA DE PAGO": "ENVIO PRIORITARIO", TELEFONO: 60000001 }),
    fila({ "N° Orden": "#100", "NOMBRES Y APELLIDOS": "Persona Inventada", "TOTAL VENTA": 37.98, CANTIDAD: 2, "NOMBRE PRODUCTO": "Crema Inventada™ 2x1", "FORMA DE PAGO": "YAPPY", COURIER: "DEIMIBEL ZONA 5", "MONTO ENVIO": 5, "FECHA  DE ENVIO": 46114, "COSTO PRODUCTO": 3.1, TELEFONO: 60000001, "FACTURADO CON ITBMS": "FACTURADO", "N° FACTURA": "F-1" }),
    fila({ "N° Orden": "#101", "TOTAL VENTA": 0, "NOMBRE PRODUCTO": "Crema Inventada™ 2x1", "FORMA DE PAGO": "CANCELADO", COURIER: "CANCELADO", "MOTIVOS DE CANCELACIONES": "RECHAZADO" }),
    fila({ "N° Orden": "#102", "TOTAL VENTA": 29.99, "NOMBRE PRODUCTO": "Gel Inventado", "FORMA DE PAGO": "INFORME 173", COURIER: "SERVIENTREGA", "MONTO ENVIO SE": 6.27, "EXITOSA/FALLIDA": "Fallido, Exitoso", "MOTIVOS DE CANCELACIONES": "1.52" }),
    fila({ "N° Orden": "#103", "TOTAL VENTA": 0, "NOMBRE PRODUCTO": "Gel Inventado", "FORMA DE PAGO": "NO GESTIONADO ", COURIER: "NO GESTIONADO " }),
    fila({ "N° Orden": "#104", TIENDA: "KENKU", "TOTAL VENTA": 0, "NOMBRE PRODUCTO": "Gel Inventado", COURIER: "SERVIENTREGA", "EXITOSA/FALLIDA": "Fallido", "DEVUELTOS SE": "D-08/04/2026" }),
    fila({ "N° Orden": "#105", "TOTAL VENTA": 24.99, "NOMBRE PRODUCTO": "Gel Inventado", COURIER: "SERVIENTREGA", "FECHA  DE ENVIO": 46116 }),
    fila({ "N° Orden": null, "TOTAL VENTA": 10, "NOMBRE PRODUCTO": "Sin número" }),
  ];
  const { ordenes, descartadas, lineas } = leerMatriz(filas);
  assert.equal(ordenes.length, 6);
  assert.equal(lineas, 7);
  assert.deepEqual(descartadas, [{ fila: 10, motivo: "sin número de orden" }]);

  const o100 = ordenes.find((o) => o.numero === "#100")!;
  assert.equal(o100.tienda, "OFERFY PAN");
  assert.equal(o100.fecha, "2026-04-01");
  assert.equal(o100.periodo, "2026-04-01");
  assert.equal(o100.total, 37.98);
  assert.equal(o100.estado_entrega, "entregada");
  assert.equal(o100.metodo_pago, "yappy");
  assert.equal(o100.transportista, "DEIMIBEL ZONA 5");
  assert.equal(o100.costo_envio, 5);
  assert.equal(o100.fecha_envio, "2026-04-02");
  assert.equal(o100.facturado, true);
  assert.equal(o100.lineas.length, 2);
  assert.equal(o100.lineas[0].es_servicio, true);
  assert.equal(o100.lineas[1].cantidad, 2);
  assert.equal(o100.lineas[1].costo_excel, 3.1);
  assert.equal(o100.lineas[1].producto_clave, "CREMA INVENTADA 2X1");
  assert.equal(o100.cliente.nombre, "Persona Inventada");
  assert.equal(o100.cliente.telefono, "60000001");
  assert.match(o100.origen_clave, /^[0-9a-f]{24}$/);

  const porNumero = Object.fromEntries(ordenes.map((o) => [o.numero, o]));
  assert.equal(porNumero["#101"].estado_entrega, "cancelada");
  assert.equal(porNumero["#101"].motivo_cancelacion, "RECHAZADO");
  assert.equal(porNumero["#102"].estado_entrega, "entregada");
  assert.equal(porNumero["#102"].metodo_pago, "servientrega");
  assert.equal(porNumero["#102"].informe_servientrega, "173");
  assert.equal(porNumero["#102"].costo_envio, 6.27);
  assert.equal(porNumero["#102"].motivo_cancelacion, null, "un número en esa columna es un costo, no un motivo");
  assert.equal(porNumero["#103"].estado_entrega, "no_gestionada");
  assert.equal(porNumero["#104"].tienda, "KENKU");
  assert.equal(porNumero["#104"].estado_entrega, "devuelta");
  assert.equal(porNumero["#104"].fecha_devolucion, "2026-04-08");
  assert.equal(porNumero["#105"].estado_entrega, "en_transito", "con monto pero sin cobro todavía no es entregada");

  // La misma orden leída dos veces da la misma huella; si cambia algo, cambia la huella del contenido.
  const otra = leerMatriz(filas).ordenes.find((o) => o.numero === "#100")!;
  assert.equal(otra.origen_clave, o100.origen_clave);
  assert.equal(otra.huella_contenido, o100.huella_contenido);
  const cambiada = filas.map((f) => [...f]);
  cambiada[3][T.indexOf("FORMA DE PAGO")] = "EFECTIVO";
  const o2 = leerMatriz(cambiada).ordenes.find((o) => o.numero === "#100")!;
  assert.equal(o2.origen_clave, o100.origen_clave);
  assert.notEqual(o2.huella_contenido, o100.huella_contenido);

  const resumen = resumirLeido(ordenes);
  const abril = resumen.find((r) => r.tienda === "OFERFY PAN")!;
  assert.deepEqual(abril, { tienda: "OFERFY PAN", periodo: "2026-04-01", ordenes: 5, entregadas: 2, ventas: 67.97 });
});

test("estado de entrega y método de pago", () => {
  const base = { total: 30, formaPago: null, courier: null, verificado: null, estadoShopify: "PENDING", resultado: null, fechaEnvio: null, fechaDevolucion: null };
  assert.equal(estadoDeEntrega({ ...base, formaPago: "EFECTIVO" }), "entregada");
  assert.equal(estadoDeEntrega({ ...base, formaPago: "GESTIONADO POR CLICKSI" }), "entregada");
  assert.equal(estadoDeEntrega({ ...base, total: 0, formaPago: "EFECTIVO" }), "pendiente", "sin monto no se cuenta como entregada");
  assert.equal(estadoDeEntrega({ ...base, resultado: "Exitoso" }), "entregada");
  assert.equal(estadoDeEntrega({ ...base, resultado: "Exitoso, Fallido" }), "devuelta");
  assert.equal(estadoDeEntrega({ ...base, formaPago: "REEMBOLSO" }), "devuelta");
  assert.equal(estadoDeEntrega({ ...base, estadoShopify: "VOIDED" }), "cancelada");
  assert.equal(estadoDeEntrega({ ...base, courier: "JULY CALLE" }), "en_transito");
  assert.equal(estadoDeEntrega({ ...base }), "pendiente");
  assert.equal(metodoDePago("STRIPE"), "tarjeta");
  assert.equal(metodoDePago("MIPOS."), "tarjeta");
  assert.equal(metodoDePago("INFROME 177"), "servientrega");
  assert.equal(metodoDePago("DEPOSITO SERVIENTREGA"), "servientrega");
  assert.equal(metodoDePago("PREVIO PAGO"), "previo_pago");
  assert.equal(metodoDePago("CANCELADO"), null);
  assert.equal(metodoDePago(null), null);
  assert.equal(transportistaDe("ANDRÉS ÁLVAREZ"), "ANDRES ALVAREZ");
  assert.equal(transportistaDe("ANDRES ALVARES"), "ANDRES ALVAREZ");
  assert.equal(transportistaDe("CANCELADO"), null);
  assert.equal(transportistaDe("SERVIENTREGA"), "SERVIENTREGA");
  assert.equal(unidadDeTienda("OFERFY"), "OFERFY PAN");
  assert.equal(unidadDeTienda("CALZADOS_O"), "CALZADOS O.");
  assert.equal(unidadDeTienda("Nueva Tienda"), "NUEVA TIENDA");
});

test("guías de Servientrega, Monday y mapeo de productos", () => {
  const guias = leerGuias([
    ["INFORME 1", "Guia", "Nombre Cliente", "Destinatario", "CPL", "Servicio", "Valor Recaudar", "Consignacion", "Metodo de Pago", "Monto Depositado", "Fecha Emision", "Fecha de Entrega", "Numero factura"],
    ["INFORME 1", 7000000001, "OFERFY", "PERSONA INVENTADA", "CPL X", "RECAUDO", "29,99", "C1", "EFECTIVO", null, null, null, "#105"],
    [],
  ]);
  assert.equal(guias.get("OFERFY PAN|#105"), "7000000001");

  const monday = leerMonday([
    [46113, "Name-Tienda", "Name", "Subelementos", "Tienda", "Ultima actualizacion", "Delivery", "Estado", "Edo. Pago", "Forma de Pago", "$ Por cobra", "$ Cobrado", "Comprobante", "Comentario", "Coste Envío"],
    [46113, "OFERFY-#105", 105, null, "OFERFY", "x", "JULY CALLE", "ENTREGADO", "PAGADO", "EFECTIVO", 24.99, 24.99, null, null, 3.5],
  ]);
  assert.deepEqual(monday.get("OFERFY PAN|#105"), { formaPago: "EFECTIVO", delivery: "JULY CALLE", estado: "ENTREGADO", pagado: true, costoEnvio: 3.5 });

  // Con Monday, la orden #105 (sin cobro en la Matriz) pasa a entregada y toma la guía.
  const filas: Celda[][] = [T, fila({ "N° Orden": "#105", "TOTAL VENTA": 24.99, "NOMBRE PRODUCTO": "Gel Inventado" })];
  const [o] = leerMatriz(filas, complementos(guias, monday)).ordenes;
  assert.equal(o.estado_entrega, "entregada");
  assert.equal(o.metodo_pago, "efectivo");
  assert.equal(o.transportista, "JULY CALLE");
  assert.equal(o.costo_envio, 3.5);
  assert.equal(o.guia, "7000000001");

  const mapeo = leerMapeoProductos([
    ["FECHA DE LLEGADA", "MES LLEGADA", "PROVEEDOR", "NOMBRE HOMOLOGADO", "PRODUCTO", "CODIGO", "PRODUCTO MATRIZ NUVO", "PRODUCTO MATRIZ OFERFY"],
    [null, null, null, null, "Gel base - PA-001", null, "Gel Inventado", "Gel Inventado™ Oferta"],
    [null, null, null, "Crema homologada", "Crema v2", null, null, "Crema Inventada™ 2x1"],
  ]);
  assert.deepEqual(
    mapeo.map((m) => [m.producto_clave, m.costo_clave]),
    [
      ["GEL INVENTADO", "GEL BASE PA 001"],
      ["GEL INVENTADO OFERTA", "GEL BASE PA 001"],
      ["CREMA INVENTADA 2X1", "CREMA HOMOLOGADA"],
    ],
  );
});

test("sin fila de títulos no lee nada", () => {
  const r = leerMatriz([["hola"], [1, 2, 3]]);
  assert.equal(r.ordenes.length, 0);
  assert.equal(r.descartadas[0].motivo, "no encontré la fila de títulos");
});
