import assert from "node:assert/strict";
import test from "node:test";
import { colaTelefono, conLoNuestro, pendientesPorPedido, esErrorDeVentana, mensajesDeIcomfly, quienDe, rellenarPlantilla, telefonoParaIcomfly, variablesDePlantilla, ventana24 } from "./chat-tienda";

test("de quién es cada mensaje", () => {
  assert.equal(quienDe({ direction: "inbound", sender_type: "contact" }), "cliente");
  assert.equal(quienDe({ direction: "outbound", sender_type: "bot" }), "bot");
  assert.equal(quienDe({ direction: "outbound", sender_type: "agent" }), "equipo");
  assert.equal(quienDe({ direction: "outbound", sender_type: "user" }), "equipo");
});

test("los mensajes de iComfly, del más viejo al más nuevo, con lo que anota el sistema", () => {
  const datos = {
    contacto: { phone_number: "•••1958" },
    mensajes: [
      { id: 30, conversation_id: 7, content: "¿Me lo confirmas?", message_type: "template", sender_type: "bot", direction: "outbound", status: "read", created_at: {} },
      { id: 28, conversation_id: 7, content: "Hola", message_type: "text", sender_type: "contact", direction: "inbound", status: null, created_at: {} },
      { id: "x", content: "sin id" },
    ],
  };
  const m = mensajesDeIcomfly(datos);
  assert.deepEqual(m.map((x) => [x.id, x.de, x.tipo]), [[28, "cliente", "text"], [30, "bot", "template"]]);
  const con = conLoNuestro(m, new Map([[30, { vistoEn: "2026-11-13T15:00:00Z", autor: null }]]));
  assert.equal(con[1].vistoEn, "2026-11-13T15:00:00Z");
  assert.equal(con[0].vistoEn, null);
  assert.deepEqual(mensajesDeIcomfly(null), []);
});

test("el teléfono como lo pide iComfly", () => {
  assert.equal(telefonoParaIcomfly("6848-1958", "PA"), "50768481958");
  assert.equal(telefonoParaIcomfly("+507 6848 1958", "PA"), "50768481958");
  assert.equal(telefonoParaIcomfly("50768481958", "PA"), "50768481958");
  assert.equal(telefonoParaIcomfly("8569 3612", "CR"), "50685693612");
  assert.equal(telefonoParaIcomfly("+57 300 123 4567", "PA"), "573001234567");
  assert.equal(telefonoParaIcomfly("123", "PA"), null);
  assert.equal(telefonoParaIcomfly(null, "PA"), null);
});

test("la ventana de 24 horas", () => {
  const ahora = Date.parse("2026-11-13T15:00:00Z");
  const m = (de: "cliente" | "bot", vistoEn: string | null) => ({ id: 1, conversacionId: 1, de, tipo: "text", texto: "", estado: null, mediaUrl: null, mediaTipo: null, transcripcion: null, vistoEn, autor: null });
  assert.equal(ventana24([m("cliente", "2026-11-13T10:00:00Z"), m("bot", null)], ahora), "abierta");
  assert.equal(ventana24([m("cliente", "2026-11-11T10:00:00Z")], ahora), "cerrada");
  assert.equal(ventana24([m("cliente", null)], ahora), "sin_saber");
  assert.equal(ventana24([m("bot", null)], ahora), "cerrada");
  assert.equal(esErrorDeVentana("Message failed: outside the 24h window"), true);
  assert.equal(esErrorDeVentana("Teléfono no válido"), false);
});

test("plantillas: sus variables y cómo se ven rellenas", () => {
  assert.deepEqual(variablesDePlantilla("Hola {{1}}, tu pedido {{2}} va con {{ 3 }} y {{1}}"), [1, 2, 3]);
  assert.equal(rellenarPlantilla("Hola {{1}}, tu pedido {{2}}", ["Ana"]), "Hola Ana, tu pedido {{2}}");
});

test("el numerito de WhatsApp va con el pedido del cliente correcto", () => {
  assert.equal(colaTelefono("•••••••5732"), "5732");
  assert.equal(colaTelefono("6848-1958"), "1958");
  assert.equal(colaTelefono(null), null);
  const filas = [
    { id: "a", cliente: "Tilsia Castillo", colaTel: "5732" },
    { id: "b", cliente: "Tilsia Castillo", colaTel: "5732" },
    { id: "c", cliente: "Ana Pérez", colaTel: "1111" },
    { id: "d", cliente: "Luis Gómez", colaTel: "1111" },
    { id: "e", cliente: "Rosa Díaz", colaTel: "2222" },
    { id: "f", cliente: "Sin chat", colaTel: "9999" },
  ];
  const r = pendientesPorPedido(filas, [
    { cola: "5732", nombre: "🙂", cuenta: 3 },
    { cola: "1111", nombre: "Ana", cuenta: 2 },
    { cola: "2222", nombre: "Rosa -", cuenta: 0 },
    { cola: "3333", nombre: "Nadie", cuenta: 5 },
  ]);
  // «🙂» no coincide con el nombre: aunque solo Tilsia termine en 5732, no lleva numerito.
  assert.deepEqual(r, { c: 2 });
  assert.deepEqual(pendientesPorPedido(filas, [{ cola: "5732", nombre: "Tilsia", cuenta: 3 }]), { a: 3, b: 3 });
  assert.deepEqual(pendientesPorPedido(filas, [{ cola: "1111", nombre: "🙂", cuenta: 4 }]), {});
});
