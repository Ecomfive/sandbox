import assert from "node:assert/strict";
import { test } from "node:test";
import { consultarEffi, estructuraDe, mensajeErrorEffi } from "./api";

test("los errores de Effi se explican sin repetir la llave", () => {
  assert.match(mensajeErrorEffi(401), /venció/);
  assert.match(mensajeErrorEffi(403), /Perfiles de usuario/);
  assert.match(mensajeErrorEffi(429), /120 por minuto/);
  assert.match(mensajeErrorEffi(502), /error 502/);
  assert.equal(mensajeErrorEffi(400, "La fecha no es válida"), "La fecha no es válida");
  assert.equal(mensajeErrorEffi(400, "  "), "Effi respondió con el error 400.");
});

test("sin llave no se llama a Effi", async () => {
  const antes = process.env.EFFI_API_KEY;
  delete process.env.EFFI_API_KEY;
  const fetchOriginal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (async () => {
    llamadas++;
    return new Response("{}");
  }) as typeof fetch;
  try {
    const r = await consultarEffi("articulo");
    assert.equal(r.ok, false);
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (antes !== undefined) process.env.EFFI_API_KEY = antes;
  }
});

test("la llave va solo en la cabecera y la página se lee tal cual", async () => {
  const antes = process.env.EFFI_API_KEY;
  process.env.EFFI_API_KEY = "llave-de-prueba";
  const fetchOriginal = globalThis.fetch;
  let url = "";
  let auth = "";
  globalThis.fetch = (async (u: URL, init?: RequestInit) => {
    url = String(u);
    auth = String((init?.headers as Record<string, string>).Authorization);
    return Response.json({ ok: true, data: [{ id: "121" }], paginacion: { pagina: 1, por_pagina: 1, total: 118, total_paginas: 118 } });
  }) as typeof fetch;
  try {
    const r = await consultarEffi("articulo", { pagina: 1, por_pagina: 1 });
    assert.ok(r.ok && r.paginacion?.total === 118);
    assert.equal(url, "https://effi.com.co/api/articulo?pagina=1&por_pagina=1");
    assert.equal(auth, "Bearer llave-de-prueba");
    assert.ok(!url.includes("llave"));
  } finally {
    globalThis.fetch = fetchOriginal;
    if (antes === undefined) delete process.env.EFFI_API_KEY;
    else process.env.EFFI_API_KEY = antes;
  }
});

test("la estructura de un recurso dice los campos, nunca los valores", () => {
  const t = estructuraDe([{ id: 7, cliente: { nombre: "Ana Pérez", telefono: "8888" }, lineas: [{ articulo: 42, cantidad: "2" }], nota: null }, { nota: "hola" }]);
  assert.equal(t, "id: number, cliente.nombre: string, cliente.telefono: string, lineas[].articulo: number, lineas[].cantidad: string, nota: string");
  assert.ok(!t.includes("Ana") && !t.includes("8888") && !t.includes("hola"));
  assert.equal(estructuraDe([]), "");
});
