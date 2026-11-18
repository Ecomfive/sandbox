// Acceso al PostgREST falso de la vista previa (auditoría de seguridad, 18 nov 2026).
// Uso: npx tsx --test scripts/preview/acceso.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HOST_ESCUCHA, claveValida, hostPermitido, rechazo } from "./acceso.mjs";
import { crearServidor } from "./postgrest.mjs";

const CLAVE = "a".repeat(64);

test("Host: solo localhost o 127.0.0.1 con el puerto del servidor", () => {
  assert.equal(hostPermitido("localhost:54321", 54321), true);
  assert.equal(hostPermitido("127.0.0.1:54321", 54321), true);
  assert.equal(hostPermitido("LOCALHOST:54321", 54321), true);
  assert.equal(hostPermitido("localhost", 54321), false);
  assert.equal(hostPermitido("localhost:3100", 54321), false);
  assert.equal(hostPermitido("rebind.example:54321", 54321), false);
  assert.equal(hostPermitido("127.0.0.1.nip.io:54321", 54321), false);
  assert.equal(hostPermitido("0.0.0.0:54321", 54321), false);
  assert.equal(hostPermitido("[::1]:54321", 54321), false);
  assert.equal(hostPermitido(undefined, 54321), false);
  assert.equal(hostPermitido("localhost:0", 0), false);
});

test("clave: igual a la de la corrida, nunca vacía ni corta", () => {
  assert.equal(claveValida(CLAVE, CLAVE), true);
  assert.equal(claveValida(CLAVE.slice(1), CLAVE), false);
  assert.equal(claveValida(`${CLAVE}b`, CLAVE), false);
  assert.equal(claveValida("preview", CLAVE), false);
  assert.equal(claveValida("", CLAVE), false);
  assert.equal(claveValida(undefined, CLAVE), false);
  assert.equal(claveValida([CLAVE], CLAVE), false);
  // Una clave esperada corta (o vacía) no deja pasar a nadie.
  assert.equal(claveValida("", ""), false);
  assert.equal(claveValida("corta", "corta"), false);
});

test("rechazo: primero la dirección (403), después la clave (401)", () => {
  assert.equal(rechazo({ host: "evil.example:54321", apikey: CLAVE }, 54321, CLAVE)?.status, 403);
  assert.equal(rechazo({ host: "localhost:54321" }, 54321, CLAVE)?.status, 401);
  assert.equal(rechazo({ host: "localhost:54321", apikey: "preview" }, 54321, CLAVE)?.status, 401);
  assert.equal(rechazo({ host: "127.0.0.1:54321", apikey: CLAVE }, 54321, CLAVE), null);
});

/** Una base falsa sin tablas: alcanza para crear el servidor y para /auth/v1/user. */
const dbVacia = { query: async () => ({ rows: [] }), exec: async () => undefined };

function pedir(puerto: number, ruta: string, cabeceras: Record<string, string>, metodo = "GET", cuerpo?: string) {
  return new Promise<{ status: number; cuerpo: string }>((resolver, fallar) => {
    const req = http.request({ host: HOST_ESCUCHA, port: puerto, path: ruta, method: metodo, headers: cabeceras }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => resolver({ status: res.statusCode ?? 0, cuerpo: t }));
    });
    req.on("error", fallar);
    req.end(cuerpo);
  });
}

test("el servidor no atiende otra dirección ni peticiones sin la clave", async () => {
  await assert.rejects(() => crearServidor(dbVacia, { clave: "corta" }));
  const { servidor } = await crearServidor(dbVacia, { clave: CLAVE });
  await new Promise<void>((r) => servidor.listen(0, HOST_ESCUCHA, r));
  const puerto = (servidor.address() as AddressInfo).port;
  try {
    const propio = `127.0.0.1:${puerto}`;
    // DNS rebinding: la página manda su propio dominio en Host.
    assert.equal((await pedir(puerto, "/auth/v1/user", { host: `rebind.example:${puerto}`, apikey: CLAVE })).status, 403);
    // Pedido a ciegas desde otra página (no-cors): sin la cabecera apikey.
    const ciego = await pedir(puerto, "/rest/v1/x", { host: propio, "content-type": "text/plain" }, "POST", '{"a":1}');
    assert.equal(ciego.status, 401);
    // La clave fija de antes ya no sirve.
    assert.equal((await pedir(puerto, "/auth/v1/user", { host: propio, apikey: "preview" })).status, 401);
    // Con la clave de la corrida responde como siempre.
    const bien = await pedir(puerto, "/auth/v1/user", { host: `localhost:${puerto}`, apikey: CLAVE });
    assert.equal(bien.status, 200);
    assert.equal(JSON.parse(bien.cuerpo).email, "preview@ejemplo.test");
  } finally {
    await new Promise((r) => servidor.close(r));
  }
});
