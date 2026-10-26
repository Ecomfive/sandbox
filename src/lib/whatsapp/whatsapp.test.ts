import assert from "node:assert/strict";
import { test } from "node:test";
import { extraerAviso, resumenMensaje } from "./extraer";
import { errorEnEspanol, minutosVentana, textoVentana } from "./ventana";

const aviso = (value: unknown) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value }] }] });
const META = { display_phone_number: "50760000000", phone_number_id: "1234567890" };

test("un texto que llega: número de la empresa, quién escribe con su nombre de perfil, id y hora", () => {
  const { mensajes, estados } = extraerAviso(
    aviso({
      messaging_product: "whatsapp",
      metadata: META,
      contacts: [{ profile: { name: "Andrea" }, wa_id: "50761112233" }],
      messages: [{ from: "50761112233", id: "wamid.A", timestamp: "1793040000", type: "text", text: { body: "¿El pedido 48213 ya tiene guía?" } }],
    }),
  );
  assert.equal(estados.length, 0);
  assert.deepEqual(mensajes, [
    {
      phoneNumberId: "1234567890",
      numeroEmpresa: "+50760000000",
      telefono: "+50761112233",
      nombre: "Andrea",
      waId: "wamid.A",
      tipo: "texto",
      texto: "¿El pedido 48213 ya tiene guía?",
      mediaId: null,
      mediaMime: null,
      mediaNombre: null,
      momento: new Date(1793040000 * 1000).toISOString(),
    },
  ]);
});

test("fotos, documentos, botones y ubicaciones: el pie o el texto, y el archivo para descargarlo después", () => {
  const { mensajes } = extraerAviso(
    aviso({
      metadata: META,
      messages: [
        { from: "50761112233", id: "wamid.F", timestamp: "1", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "Llegó así" } },
        { from: "50761112233", id: "wamid.D", timestamp: "2", type: "document", document: { id: "MEDIA2", mime_type: "application/pdf", filename: "guia.pdf" } },
        { from: "50761112233", id: "wamid.B", timestamp: "3", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "si", title: "Sí, confirmo" } } },
        { from: "50761112233", id: "wamid.U", timestamp: "4", type: "location", location: { latitude: 8.98, longitude: -79.52, name: "Bodega" } },
        { from: "50761112233", id: "wamid.X", timestamp: "5", type: "unsupported" },
      ],
    }),
  );
  assert.deepEqual(
    mensajes.map((m) => [m.tipo, m.texto, m.mediaId, m.mediaNombre]),
    [
      ["imagen", "Llegó así", "MEDIA1", null],
      ["documento", null, "MEDIA2", "guia.pdf"],
      ["texto", "Sí, confirmo", null, null],
      ["ubicacion", "Bodega · 8.98, -79.52", null, null],
      ["otro", null, null, null],
    ],
  );
  assert.equal(resumenMensaje("imagen", "Llegó así"), "Foto: Llegó así");
  assert.equal(resumenMensaje("documento", null), "Documento");
  assert.equal(resumenMensaje("texto", "  hola\n\n mundo "), "hola mundo");
});

test("estados de lo que mandó el equipo: en español, y el motivo si falló", () => {
  const { mensajes, estados } = extraerAviso(
    aviso({
      metadata: META,
      statuses: [
        { id: "wamid.S1", status: "delivered", timestamp: "10", recipient_id: "50761112233" },
        { id: "wamid.S2", status: "failed", timestamp: "11", errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours" } }] },
        { id: "wamid.S3", status: "algo-raro", timestamp: "12" },
      ],
    }),
  );
  assert.equal(mensajes.length, 0);
  assert.deepEqual(
    estados.map((e) => [e.waId, e.estado, e.error]),
    [
      ["wamid.S1", "entregado", null],
      ["wamid.S2", "fallido", "131047: More than 24 hours"],
    ],
  );
});

test("lo que no es de WhatsApp o viene incompleto se ignora sin romper", () => {
  assert.deepEqual(extraerAviso({ object: "instagram", entry: [] }), { mensajes: [], estados: [] });
  assert.deepEqual(extraerAviso(null), { mensajes: [], estados: [] });
  assert.deepEqual(extraerAviso(aviso({ metadata: {}, messages: [{ from: "1", id: "x", type: "text", text: { body: "hola" } }] })).mensajes, []);
  assert.deepEqual(extraerAviso(aviso({ metadata: META, messages: [{ id: "sin-remitente", type: "text" }] })).mensajes, []);
});

test("la ventana de 24 h: cuánto queda desde el último mensaje del dropshipper", () => {
  const ahora = new Date("2026-10-26T20:00:00Z");
  assert.equal(minutosVentana(null, ahora), 0);
  assert.equal(minutosVentana("2026-10-26T19:00:00Z", ahora), 23 * 60);
  assert.equal(textoVentana("2026-10-26T19:00:00Z", ahora), "quedan 23 h");
  assert.equal(textoVentana("2026-10-25T20:30:00Z", ahora), "quedan 30 min");
  assert.equal(textoVentana("2026-10-25T19:59:00Z", ahora), null);
  assert.match(errorEnEspanol(131047, "x"), /24 h/);
  assert.equal(errorEnEspanol(null, "Algo"), "WhatsApp no lo envió: Algo");
});
