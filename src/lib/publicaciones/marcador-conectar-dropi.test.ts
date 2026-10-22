import assert from "node:assert/strict";
import test from "node:test";
import { leerFragmentoConectar, marcadorConectarDropi } from "./marcador-conectar-dropi";

test("el favorito lleva el origen de la plataforma y solo acepta https (o localhost)", () => {
  const m = marcadorConectarDropi("https://sistema.ecomfive.io/cualquier/ruta");
  assert.ok(m.startsWith("javascript:"));
  const codigo = decodeURIComponent(m.slice("javascript:".length));
  assert.ok(codigo.includes('var O="https://sistema.ecomfive.io"'));
  assert.ok(codigo.includes("/publicaciones-dropi/conectar#p="));
  assert.ok(codigo.includes("DROPI_token"));
  assert.ok(marcadorConectarDropi("http://localhost:3006").includes("localhost"));
  assert.throws(() => marcadorConectarDropi("http://sistema.ecomfive.io"));
});

test("fragmento de la pantalla de conectar: país de dos letras y una sesión con forma de token", () => {
  assert.deepEqual(leerFragmentoConectar("#p=PA&t=aaa.bbb.ccc"), { pais: "pa", token: "aaa.bbb.ccc" });
  assert.equal(leerFragmentoConectar("#p=pan&t=aaa.bbb.ccc"), null);
  assert.equal(leerFragmentoConectar("#p=pa&t=no-es-token"), null);
  assert.equal(leerFragmentoConectar(""), null);
});
