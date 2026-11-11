import assert from "node:assert/strict";
import test from "node:test";
import { cifrar, claveDesdeTexto, descifrar, firmarHmac, firmasIguales } from "./cifrado-tokens";

test("claveDesdeTexto: hex, base64 y frase larga; vacía o corta no sirve", () => {
  assert.equal(claveDesdeTexto("ab".repeat(32))?.length, 32);
  assert.equal(claveDesdeTexto(Buffer.alloc(32, 7).toString("base64"))?.length, 32);
  assert.equal(claveDesdeTexto("una frase de prueba bastante larga para derivar")?.length, 32);
  assert.equal(claveDesdeTexto(""), null);
  assert.equal(claveDesdeTexto("corta"), null);
  assert.equal(claveDesdeTexto(undefined), null);
});

test("cifrar y descifrar: ida y vuelta, IV distinto cada vez", () => {
  const k = claveDesdeTexto("cd".repeat(32))!;
  const a = cifrar("token-de-prueba-123", k);
  const b = cifrar("token-de-prueba-123", k);
  assert.notEqual(a, b);
  assert.ok(!a.includes("token-de-prueba"));
  assert.equal(descifrar(a, k), "token-de-prueba-123");
});

test("descifrar: otra clave o texto alterado devuelven null", () => {
  const k = claveDesdeTexto("cd".repeat(32))!;
  const otra = claveDesdeTexto("ef".repeat(32))!;
  const c = cifrar("secreto", k);
  assert.equal(descifrar(c, otra), null);
  const partes = c.split(".");
  partes[3] = Buffer.from("otra cosa").toString("base64url");
  assert.equal(descifrar(partes.join("."), k), null);
  assert.equal(descifrar("v2.x.y.z", k), null);
  assert.equal(descifrar("basura", k), null);
});

test("firmarHmac: depende del propósito; firmasIguales en tiempo constante", () => {
  const k = claveDesdeTexto("ab".repeat(32))!;
  const f1 = firmarHmac("hola", k, "a");
  assert.equal(f1, firmarHmac("hola", k, "a"));
  assert.notEqual(f1, firmarHmac("hola", k, "b"));
  assert.ok(firmasIguales(f1, f1));
  assert.ok(!firmasIguales(f1, f1.slice(1)));
});
