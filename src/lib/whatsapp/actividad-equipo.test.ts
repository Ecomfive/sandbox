import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESDE_EL_CELULAR, esNotaDelSistema, eventoDeAuditoria, eventoDeMensaje, MAX_LETRAS_EVENTO, ordenarEventos, personasDe } from "./actividad-equipo";

const msg = (extra: Partial<Parameters<typeof eventoDeMensaje>[0]>) => ({ id: "1", direccion: "saliente", tipo: "texto", texto: "Hola", autor: "Ana", momento: "2026-10-29T15:00:00Z", ...extra });

describe("lo que hizo cada persona con sus mensajes", () => {
  it("una respuesta dice quién y qué respondió", () => {
    assert.deepEqual(eventoDeMensaje(msg({})), { id: "m-1", quien: "Ana", momento: "2026-10-29T15:00:00Z", clase: "mensaje", texto: "Respondió: «Hola»" });
  });

  it("recorta lo largo y junta los espacios", () => {
    const e = eventoDeMensaje(msg({ texto: `a   ${"b".repeat(MAX_LETRAS_EVENTO + 50)}` }));
    assert.ok(e && e.texto.endsWith("…»") && e.texto.length < MAX_LETRAS_EVENTO + 30);
  });

  it("un archivo, una plantilla y una nota se distinguen", () => {
    assert.equal(eventoDeMensaje(msg({ tipo: "imagen", texto: null }))?.texto, "Mandó una foto");
    assert.equal(eventoDeMensaje(msg({ tipo: "imagen", texto: "Tu guía" }))?.clase, "archivo");
    assert.equal(eventoDeMensaje(msg({ tipo: "plantilla", texto: "Hola Ana" }))?.texto, "Mandó una plantilla: «Hola Ana»");
    assert.deepEqual(eventoDeMensaje(msg({ direccion: "nota", texto: "Pidió reembolso" }))?.texto, "Dejó una nota privada: «Pidió reembolso»");
  });

  it("lo que se respondió desde el celular del negocio se dice así", () => {
    assert.equal(eventoDeMensaje(msg({ autor: DESDE_EL_CELULAR }))?.texto, "Respondió desde el celular: «Hola»");
  });

  it("no cuenta lo que dijo el dropshipper, lo que no tiene autor ni las notas que escribe el sistema", () => {
    assert.equal(eventoDeMensaje(msg({ direccion: "entrante" })), null);
    assert.equal(eventoDeMensaje(msg({ autor: null })), null);
    assert.equal(eventoDeMensaje(msg({ direccion: "nota", texto: "Ana pasó este chat de Atención a Comercial." })), null);
    assert.equal(eventoDeMensaje(msg({ direccion: "nota", texto: "Ana intervino en este chat." })), null);
  });

  it("reconoce las notas del sistema por su frase", () => {
    assert.ok(esNotaDelSistema("Luis marcó este chat como borrado en la app de WhatsApp Business."));
    assert.ok(esNotaDelSistema("Luis quitó la marca de «borrado en la app de WhatsApp Business»."));
    assert.ok(!esNotaDelSistema("Pasó este chat de nuevo"));
    assert.ok(!esNotaDelSistema(null));
  });
});

describe("lo que quedó en la auditoría", () => {
  const etiquetas = { renombrar_contacto_whatsapp: "Cambió el nombre de un contacto de WhatsApp", tomar_chat_whatsapp: "Tomó el chat" };

  it("usa la etiqueta de la acción y su detalle", () => {
    assert.deepEqual(eventoDeAuditoria({ id: "9", accion: "renombrar_contacto_whatsapp", usuario: "Luis", detalle: "Le puso el nombre «Carla Tienda»", momento: "2026-10-29T16:00:00Z" }, etiquetas), {
      id: "a-9",
      quien: "Luis",
      momento: "2026-10-29T16:00:00Z",
      clase: "cambio",
      texto: "Cambió el nombre de un contacto de WhatsApp: Le puso el nombre «Carla Tienda»",
    });
  });

  it("sin detalle queda solo la etiqueta, y una acción desconocida se muestra tal cual", () => {
    assert.equal(eventoDeAuditoria({ id: "1", accion: "tomar_chat_whatsapp", usuario: "Luis", detalle: null, momento: "x" }, etiquetas).texto, "Tomó el chat");
    assert.equal(eventoDeAuditoria({ id: "1", accion: "otra_cosa", usuario: null, detalle: "  ", momento: "x" }, etiquetas).texto, "otra_cosa");
    assert.equal(eventoDeAuditoria({ id: "1", accion: "otra_cosa", usuario: null, detalle: null, momento: "x" }, etiquetas).quien, "Sistema");
  });
});

describe("orden y personas", () => {
  const e = (id: string, quien: string, momento: string) => ({ id, quien, momento, clase: "mensaje" as const, texto: "" });
  const lista = [e("a", "Ana", "2026-10-29T10:00:00Z"), e("b", "Luis", "2026-10-29T12:00:00Z"), e("c", "Ana", "2026-10-29T11:00:00Z")];

  it("del más nuevo al más viejo", () => {
    assert.deepEqual(ordenarEventos(lista).map((x) => x.id), ["b", "c", "a"]);
  });

  it("cuenta cuánto hizo cada persona, de más a menos", () => {
    assert.deepEqual(personasDe(lista), [
      { nombre: "Ana", total: 2 },
      { nombre: "Luis", total: 1 },
    ]);
  });
});
