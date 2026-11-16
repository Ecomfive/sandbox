import assert from "node:assert/strict";
import test from "node:test";
import { casoDeItem, columnasPostventa, consultaHistorial, extrasDeItem, notaSinDatos, consultaPostventa, datosDeComentario, leerPaginaPostventa, montoDeTexto, numeroDeTexto, taparDatos, tiendaDeTexto, tiposDeTexto, type ItemPostventa } from "./postventa";

// Textos como los del tablero «CAMBIOS Y REEMBOLSOS PANAMA» (14 nov 2026), con nombres y cuentas inventados.
const item = (name: string, comentarios: string[], extra: Partial<ItemPostventa> = {}): ItemPostventa => ({
  id: "123",
  name,
  created_at: "2026-10-08T15:00:00Z",
  updated_at: "2026-10-09T15:00:00Z",
  grupo: "Realizados",
  estado: "Hecho",
  valorReembolso: null,
  valorEnvio: null,
  comentarios: comentarios.map((texto, i) => ({ creado: `2026-10-0${8 + i}T15:00:00Z`, texto })),
  ...extra,
});

test("postventa: tienda, número y tipo salen del nombre del caso", () => {
  assert.equal(tiendaDeTexto("KENKU: Realizar Reembolso #25384"), "KENKU");
  assert.equal(tiendaDeTexto("Oferfy: Realizar cambio #146665"), "OFERFY");
  assert.equal(tiendaDeTexto("ClickSI: Envair complemento CS16077"), "CLICKSI");
  assert.equal(tiendaDeTexto("Nuvo; realizar reembolso #42852"), "NUVO");
  assert.equal(tiendaDeTexto("Realizar reembolso #145658"), null);
  assert.equal(numeroDeTexto("KENKU:  Enviar Complemento a pedido #1114"), "#1114");
  assert.equal(numeroDeTexto("ClickSI: Enviar Complemento pedido # CS15309"), "#CS15309");
  assert.equal(numeroDeTexto("ClickSI: Envair complemento CS16077"), "#CS16077");
  assert.equal(numeroDeTexto("NUVO:  Enviar Complemento 43056"), "#43056");
  assert.equal(numeroDeTexto("Oferfy reembolso"), null);
  assert.deepEqual(tiposDeTexto("KENKU Reembolso y retiro #24977"), ["reembolso", "retiro"]);
  assert.deepEqual(tiposDeTexto("Kenku: Realizar Cambio y Retiro"), ["cambio", "retiro"]);
  assert.deepEqual(tiposDeTexto("Nuvo: producto faltante #43812"), ["faltante"]);
  assert.deepEqual(tiposDeTexto("Oferfy: Realizar envio  #141067"), ["envio"]);
  assert.deepEqual(tiposDeTexto("KENKU: Relizar Reembolso #25437"), ["reembolso"]);
});

test("postventa: montos escritos a mano, con lo que queda después del descuento", () => {
  assert.equal(montoDeTexto("$34,99"), 34.99);
  assert.equal(montoDeTexto("58.99$"), 58.99);
  assert.equal(montoDeTexto("62,82 se le descuenta 6.50 por gastos logísticos, quedaría un Total a reembolsar de 56,32"), 56.32);
  assert.equal(montoDeTexto("$31.41 menos 6.5$ de multa por apertura del sello del producto, quedaría en 24,91$"), 24.91);
  assert.equal(montoDeTexto("$34,99 de acá se le descuentan los $6.50 del retiro quedaría en $28.49"), 28.49);
  assert.equal(montoDeTexto("reembolso completo"), null);
});

test("postventa: del comentario solo se guardan los datos del caso, nunca la cuenta ni el nombre", () => {
  const texto = [
    "Pedido #23775 KENKU",
    "Realizar reembolso y retiro",
    "✅Retirar: 1 Pulsera magnética de cobre saludable",
    "✅Realizar reembolso",
    "NOMBRE: Persona Inventada",
    "N CUENTA: 04-01-99-123456-7",
    "TIPO CUENTA: ahorros",
    "BANCO: Banco Inventado",
    "MONTO A REEMBOLSAR $31.41 menos 6.5$ de multa por apertura del sello del",
    "producto, quedaría en 24,91$",
    "✅motivo: cliente dice que no es original",
    "OBSERVACION: autorizado, cuenta 0401991234567",
  ].join("\n");
  const d = datosDeComentario(texto);
  assert.equal(d.retirar, "1 Pulsera magnética de cobre saludable");
  assert.equal(d.motivo, "cliente dice que no es original");
  assert.match(d.reembolso ?? "", /quedaría en 24,91\$/);
  assert.equal(d.observacion, "autorizado, cuenta •••");
  const todo = JSON.stringify(d);
  assert.doesNotMatch(todo, /Persona Inventada|Banco Inventado|123456|ahorros/);
  assert.equal(taparDatos("llamar al +507 6123-4567 o a alguien@correo.com"), "llamar al ••• o a •••");
  // El número de pedido (hasta 6 cifras) queda a la vista.
  assert.equal(taparDatos("Oferfy: Realizar cambio #146665"), "Oferfy: Realizar cambio #146665");
});

test("postventa: «ENVIO:» puede ser el producto o lo que cuesta; «RETIRO: costeado…» es el costo", () => {
  const a = casoDeItem(item("Oferfy: Realizar cambio #145690", ["RETIRAR: 1 Unidad de Growth Vitaminas\nENVIO: 2 Unidades de Hair Growth\nMOTIVO: talla"]));
  assert.equal(a.enviar, "2 Unidades de Hair Growth");
  assert.deepEqual(a.tipos, ["cambio", "retiro"]);
  const b = casoDeItem(item("Oferfy: Realizar cambio #145691", ["ENTREGAR: 1x Turmeric Curcumin\nENVIO: Costeado por la empresa. 3.5$\nRETIRO: costeado por el cliente"]));
  assert.equal(b.enviar, "1x Turmeric Curcumin");
  assert.equal(b.costo_envio, "Costeado por la empresa. 3.5$ · Retiro costeado por el cliente");
  assert.equal(b.retirar, null);
});

test("postventa: el caso completo, con la última nota del equipo y el número del comentario si el nombre no lo trae", () => {
  const c = casoDeItem(
    item("Kenku: Realizar Cambio y Retiro", ["KENKU #23256\n\nRETIRAR: 1 Pulsera\n\nENTREGAR: 1 Pulsera\n\nMotivo: le quedó grande", "ESPERANDO QUE REGRESE LOS PRODUCTOS · tel 6123 4567"], { estado: "En Proceso", grupo: "Cambios/Retiros/Reembolsos/Complementos" }),
  );
  assert.equal(c.tienda_texto, "KENKU");
  assert.equal(c.numero_pedido, "#23256");
  assert.deepEqual(c.tipos, ["cambio", "retiro"]);
  assert.equal(c.retirar, "1 Pulsera");
  assert.equal(c.enviar, "1 Pulsera");
  assert.equal(c.motivo, "le quedó grande");
  assert.equal(c.ultima_nota, "ESPERANDO QUE REGRESE LOS PRODUCTOS · tel •••");
  assert.equal(c.notas, 2);
  assert.equal(c.estado, "En Proceso");
  const r = casoDeItem(item("KENKU REEMBOLSO #21650", ["SOLICITUD DE REEMBOLSO\nREEMBOLSAR: $7.09\nMotivo: pagó de más"], { valorReembolso: "" }));
  assert.equal(r.reembolso, 7.09);
  assert.equal(r.ultima_nota, null);
});

test("postventa: la consulta trae lo actualizado o lo creado hace poco; la primera vez, desde abril", () => {
  assert.match(consultaPostventa(null, "2026-11-14"), /__creation_log__", compare_value: \["EXACT", "2026-04-01"\]/);
  const q = consultaPostventa("2026-11-13T20:00:00Z", "2026-11-14");
  assert.match(q, /operator: or/);
  assert.match(q, /"2026-11-12"/);
  assert.match(q, /"2026-09-15"/);
  assert.match(q, /updates\(limit: 25\) \{ id created_at text_body creator \{ name \} \}/);
});

test("postventa: las otras columnas del tablero (0972) y las notas sin datos personales", () => {
  const cols = columnasPostventa([
    { id: "status", titulo: "Estado", tipo: "status" },
    { id: "person", titulo: "Responsable", tipo: "people" },
    { id: "date", titulo: "Fecha", tipo: "date" },
    { id: "texto8", titulo: "Seguimiento", tipo: "text" },
    { id: "texto_largo", titulo: "Cuenta Reembolso", tipo: "long_text" },
    { id: "archivo", titulo: "Adjunto", tipo: "file" },
    { id: "estado_152", titulo: "Notificar al cliente", tipo: "status" },
    { id: "fecha", titulo: "Fecha Notificación", tipo: "date" },
  ]);
  assert.equal(cols.responsable, "person");
  assert.equal(cols.fecha, "date");
  assert.equal(cols.fechaNotificacion, "fecha");
  assert.equal(cols.notificar, "estado_152");
  assert.equal(cols.cuenta, "texto_largo");
  const p = leerPaginaPostventa(
    { data: { boards: [{ items_page: { cursor: null, items: [{ id: "7", name: "Nuvo: cambio #44510", group: { title: "Realizados" }, column_values: [{ id: "person", text: "Despacho" }, { id: "date", text: "2026-11-14" }, { id: "estado_152", text: "Notificar" }, { id: "archivo", text: "https://oferfly.monday.com/protected_static/1/a.jpg, http://otro.com/b" }], updates: [{ id: 55, creator: { name: "Asesora" }, created_at: "2026-11-14T10:00:00Z", text_body: "Hola" }] }] } }] } },
    cols,
  );
  const x = extrasDeItem(p.items[0]);
  assert.equal(x.responsable_texto, "Despacho");
  assert.equal(x.fecha, "2026-11-14");
  assert.equal(x.notificar, "Notificar");
  assert.deepEqual(x.adjuntos, ["https://oferfly.monday.com/protected_static/1/a.jpg"]);
  assert.equal(p.items[0].comentarios[0].id, "55");
  assert.equal(p.items[0].comentarios[0].autor, "Asesora");
  assert.equal(notaSinDatos("REEMBOLSAR: 26.49$\nNombre: Fulano Pérez\nBanco General\nN° cuenta: 04-69-98-134265-5\nMotivo: no funciona"), "REEMBOLSAR: 26.49$\nMotivo: no funciona");
});

test("postventa: lee la página de Monday y reconoce las columnas por su título", () => {
  const cols = columnasPostventa([
    { id: "status", titulo: "Estado", tipo: "status" },
    { id: "dropdown_x", titulo: "Estado", tipo: "dropdown" },
    { id: "n_meros0", titulo: "Valor Reembolso", tipo: "numbers" },
    { id: "monto_devoluci_n", titulo: "Valor de envío", tipo: "numbers" },
  ]);
  assert.deepEqual(cols, { estado: "status", reembolso: "n_meros0", envio: "monto_devoluci_n" });
  const p = leerPaginaPostventa(
    {
      data: {
        boards: [
          {
            items_page: {
              cursor: "abc",
              items: [{ id: "9", name: "KENKU: cambio #1114", created_at: "2026-10-22T10:00:00Z", updated_at: "2026-10-22T11:00:00Z", group: { title: "Realizados" }, column_values: [{ id: "status", text: "Hecho" }, { id: "n_meros0", text: "12.5" }], updates: [{ created_at: "2026-10-22T10:00:00Z", text_body: "MOTIVO: x" }, { created_at: "x", text_body: "  " }] }],
            },
          },
        ],
      },
    },
    cols,
  );
  assert.equal(p.cursor, "abc");
  assert.equal(p.items[0].estado, "Hecho");
  assert.equal(p.items[0].valorReembolso, "12.5");
  assert.equal(p.items[0].comentarios.length, 1);
  assert.equal(casoDeItem(p.items[0]).reembolso, 12.5);
});

test("postventa: el historial se pide hacia atrás desde el caso más viejo", () => {
  const q = consultaHistorial("2026-04-01");
  assert.match(q, /compare_value: \["EXACT", "2026-04-01"\], operator: lower_than_or_equal/);
  assert.match(q, /direction: desc/);
});

test("postventa: las notas con datos de pago se quedan solo con el formato de la solicitud", () => {
  const nota = ["Pedido #17222 KENKU", "", "✅Retirar: 1 Lemme Burn", "", "Lucero Sanjur", "", "Ahorro", "", "0400123456789", "Banismo", "A nombre de Lina Vargas", "✅motivo: dice que no es el original", "Monto a reembolsar: 26.91"].join("\n");
  const limpia = notaSinDatos(nota);
  assert.doesNotMatch(limpia, /Lucero|Sanjur|Ahorro|Banismo|Lina|Vargas|0400/);
  assert.match(limpia, /Retirar: 1 Lemme Burn/);
  assert.match(limpia, /motivo: dice que no es el original/);
  assert.match(limpia, /Monto a reembolsar: 26.91/);
  assert.equal(notaSinDatos("JESSIKA DEL CARMEN QUEZADA de DE LA HOZ\nNO SE RETIRA EL PRODUCTO"), "NO SE RETIRA EL PRODUCTO");
  assert.equal(notaSinDatos("Jilma jaen\nESPERANDO QUE REGRESE EL PRODUCTO"), "ESPERANDO QUE REGRESE EL PRODUCTO");
  assert.equal(notaSinDatos("Cliente: VERONICA VEGA\nREEMBOLSAR: $46.99"), "REEMBOLSAR: $46.99");
});

test("postventa: una línea con banco se queda solo con Motivo, Monto, Retirar o Enviar", () => {
  assert.equal(notaSinDatos("✅Realizar reembolso: Fulano Pérez Banco General Cuenta de Ahorros ••• Motivo: no le funcionan. Monto a reembolsar: $18.49"), "Motivo: no le funcionan. Monto a reembolsar: $18.49");
  assert.equal(notaSinDatos("✅Retirar 2 Aspiradoras. ✅Realizar reembolso: Fulano Cuenta de ahorros"), "Retirar 2 Aspiradoras.");
  assert.equal(notaSinDatos("✅ Realizar reembolso. Fulana castro vallejo Banco general Cuenta de Ahorros 0400123456789"), "");
  assert.equal(notaSinDatos("Motivo: no enciende, no pasa corriente."), "Motivo: no enciende, no pasa corriente.");
});
