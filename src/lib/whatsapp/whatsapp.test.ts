import assert from "node:assert/strict";
import { test } from "node:test";
import { extraerAviso, resumenMensaje } from "./extraer";
import { claves360, config360, urlDescarga360, variableClave360 } from "./proveedor";
import { errorEnEspanol, leerErrorEnvio, minutosVentana, textoVentana } from "./ventana";

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
  assert.deepEqual(extraerAviso({ object: "instagram", entry: [] }), { mensajes: [], estados: [], ecos: [], revocados: [] });
  assert.deepEqual(extraerAviso(null), { mensajes: [], estados: [], ecos: [], revocados: [] });
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

test("un envío rechazado dice el motivo, venga de Meta, de 360dialog o como texto", () => {
  // Meta: el detalle del error manda sobre el mensaje genérico.
  assert.deepEqual(leerErrorEnvio(400, { error: { code: 131047, message: "Re-engagement message", error_data: { details: "Más de 24 horas" } } }), { codigo: 131047, mensaje: "Más de 24 horas" });
  // 360dialog con su propia forma.
  assert.deepEqual(leerErrorEnvio(400, { meta: { success: false, http_code: 400, developer_message: "Phone number not registered" } }), { codigo: null, mensaje: "Phone number not registered" });
  assert.deepEqual(leerErrorEnvio(400, { errors: [{ code: 1013, title: "User is not valid" }] }), { codigo: 1013, mensaje: "User is not valid" });
  // Un texto suelto o nada.
  assert.equal(leerErrorEnvio(502, "Bad Gateway").mensaje, "Bad Gateway");
  assert.equal(leerErrorEnvio(500, null).mensaje, "código 500");
  assert.equal(errorEnEspanol(null, leerErrorEnvio(500, null).mensaje), "WhatsApp no lo envió: código 500");
});

test("coexistencia: lo que el equipo manda desde el celular llega como eco, con el teléfono del dropshipper", () => {
  const { mensajes, ecos } = extraerAviso({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              messaging_product: "whatsapp",
              metadata: META,
              message_echoes: [{ from: "50760000000", to: "50761112233", id: "wamid.E", timestamp: "1793040060", type: "text", text: { body: "Sí, ya salió hoy." } }],
            },
          },
        ],
      },
    ],
  });
  assert.equal(mensajes.length, 0);
  assert.equal(ecos.length, 1);
  assert.equal(ecos[0].telefono, "+50761112233");
  assert.equal(ecos[0].numeroEmpresa, "+50760000000");
  assert.equal(ecos[0].texto, "Sí, ya salió hoy.");
  assert.equal(ecos[0].waId, "wamid.E");
});

test("360dialog: el aviso del sandbox (sin object ni metadata) se acepta solo por su dirección, con el número por defecto", () => {
  const sandbox = {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ profile: { name: "Hernán" }, wa_id: "50761112233" }],
              messages: [{ from: "50761112233", id: "wamid.S", timestamp: "1793040000", type: "text", text: { body: "hola" } }],
            },
          },
        ],
      },
    ],
  };
  assert.equal(extraerAviso(sandbox).mensajes.length, 0);
  const { mensajes } = extraerAviso(sandbox, "360dialog");
  assert.equal(mensajes.length, 1);
  assert.equal(mensajes[0].phoneNumberId, "360dialog");
  assert.equal(mensajes[0].telefono, "+50761112233");
  assert.equal(mensajes[0].nombre, "Hernán");
});

test("360dialog: quien escribe sin teléfono compartido llega con su id de usuario", () => {
  const { mensajes } = extraerAviso(
    { entry: [{ changes: [{ field: "messages", value: { contacts: [{ profile: { name: "Ana" }, user_id: "PA.123abc" }], messages: [{ from_user_id: "PA.123abc", id: "wamid.B", timestamp: "1793040000", type: "text", text: { body: "hola" } }] } }] }] },
    "360dialog",
  );
  assert.equal(mensajes[0].telefono, "PA.123abc");
  assert.equal(mensajes[0].nombre, "Ana");
});

test("360dialog: los archivos solo se bajan de Meta, cambiados al dominio de 360dialog", () => {
  assert.equal(urlDescarga360("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1&ext=2"), "https://waba-v2.360dialog.io/whatsapp_business/attachments/?mid=1&ext=2");
  assert.equal(urlDescarga360("https://evil.example.com/x"), null);
  assert.equal(urlDescarga360("http://lookaside.fbsbx.com/x"), null);
});

test("un mensaje borrado «para todos» no es un mensaje nuevo: apunta al original, que se conserva", () => {
  const { mensajes, revocados } = extraerAviso(
    aviso({
      metadata: META,
      contacts: [{ wa_id: "50761112233", profile: { name: "Ana" } }],
      messages: [
        { from: "50761112233", id: "wamid.REVOCA", timestamp: "1700000100", type: "revoke", revoke: { original_message_id: "wamid.ORIGINAL" } },
        { from: "50761112233", id: "wamid.NUEVO", timestamp: "1700000200", type: "text", text: { body: "hola" } },
      ],
    }),
  );
  assert.deepEqual(revocados, [{ waIdOriginal: "wamid.ORIGINAL", momento: new Date(1700000100 * 1000).toISOString() }]);
  assert.deepEqual(mensajes.map((m) => m.waId), ["wamid.NUEVO"]);
});

test("un aviso de borrado sin el id del original se ignora", () => {
  const { mensajes, revocados } = extraerAviso(aviso({ metadata: META, messages: [{ from: "50761112233", id: "x", type: "revoke", revoke: {} }] }));
  assert.deepEqual(revocados, []);
  assert.deepEqual(mensajes, []);
});

test("un mensaje que el equipo borra «para todos» desde la app (eco revoke) no es un mensaje nuevo: se marca el original", () => {
  const { ecos, revocados } = extraerAviso({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "smb_message_echoes",
            value: {
              metadata: META,
              message_echoes: [
                { from: "50760000000", to: "50761112233", id: "wamid.R", timestamp: "1793040100", type: "revoke", revoke: { original_message_id: "wamid.MIO" } },
                { from: "50760000000", to: "50761112233", id: "wamid.T", timestamp: "1793040200", type: "text", text: { body: "hola" } },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.deepEqual(revocados, [{ waIdOriginal: "wamid.MIO", momento: new Date(1793040100 * 1000).toISOString() }]);
  assert.deepEqual(ecos.map((e) => e.waId), ["wamid.T"]);
});


test("360dialog con varios números: cada uno usa su propia clave y, si no tiene, la principal", () => {
  const antes = { ...process.env };
  try {
    for (const v of Object.keys(process.env)) if (v.startsWith("D360_")) delete process.env[v];
    assert.equal(config360("+584220350576"), null);
    process.env.D360_API_KEY = "clave-58";
    process.env.D360_API_KEY_50761234567 = "clave-507";
    assert.equal(variableClave360("+507 6123-4567"), "D360_API_KEY_50761234567");
    assert.equal(config360("+50761234567")?.clave, "clave-507");
    assert.equal(config360("+584220350576")?.clave, "clave-58");
    assert.equal(config360()?.clave, "clave-58");
    assert.deepEqual(
      claves360().map((c) => [c.variable, c.config.clave]),
      [
        ["D360_API_KEY", "clave-58"],
        ["D360_API_KEY_50761234567", "clave-507"],
      ],
    );
  } finally {
    for (const v of Object.keys(process.env)) if (v.startsWith("D360_")) delete process.env[v];
    Object.assign(process.env, antes);
  }
});
