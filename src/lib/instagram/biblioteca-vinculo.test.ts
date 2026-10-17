import assert from "node:assert/strict";
import test from "node:test";
import { coincidencias, mismaPagina, resumirAnuncios, validarAnuncios, type AnuncioBiblioteca } from "./biblioteca-lectura";

const COPY = "✨ Hay joyas bonitas… y hay joyas que cuentan tu historia. Un collar que habla de lo que más ama.";
const anuncio = (id: string, extra: Partial<AnuncioBiblioteca> = {}): AnuncioBiblioteca => ({ id, activo: true, desde: "2026-10-10", pagina: "Nena Gosling", copy: COPY, destino: "https://nena.com/producto", cantidad: 1, ...extra });

test("resumirAnuncios suma, separa activos, toma la fecha más antigua y ordena los destinos", () => {
  const r = resumirAnuncios([
    anuncio("100000000000001"),
    anuncio("100000000000002", { cantidad: 2, destino: "https://otra.com/p" }),
    anuncio("100000000000003", { activo: false, desde: "2026-09-01", destino: "https://nena.com/producto" }),
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.activos, 3);
  assert.equal(r.inactivos, 1);
  assert.equal(r.desde, "2026-09-01");
  assert.equal(r.pagina, "Nena Gosling");
  assert.deepEqual(r.destinos, [
    { url: "https://nena.com/producto", n: 2 },
    { url: "https://otra.com/p", n: 2 },
  ]);
  assert.equal(r.ids.length, 3);
});

test("el nombre de la cuenta en Instagram no es el de la página en la Biblioteca: no coincide, hasta que se vincula a mano", () => {
  const lectura = [anuncio("100000000000001", { pagina: "Joyería Luna" })];
  assert.equal(coincidencias({ copy: COPY, nombrePagina: "NENA GOSLING regalos personalizados" }, lectura), null);
  // Con el nombre que la Biblioteca tenía al vincular (`paginasAlternas`) la reconoce sola.
  const r = coincidencias({ copy: COPY, nombrePagina: "NENA GOSLING regalos personalizados", paginasAlternas: ["Joyería Luna"] }, lectura);
  assert.ok(r && "ok" in r);
  assert.equal(r.ok.total, 1);
});

test("el usuario de Instagram sin espacios reconoce la página de la Biblioteca (IG-0026: nenagosling → Nenagoslingshop)", () => {
  assert.equal(mismaPagina("nenagosling", "Nenagoslingshop"), true);
  assert.equal(mismaPagina("NENA GOSLING regalos personalizados", "Nenagoslingshop"), false);
  assert.equal(mismaPagina("mundo digital", "MundoDigital PA"), true);
  // Un nombre muy corto no se busca dentro de otro sin espacios.
  assert.equal(mismaPagina("tia", "Cristiana Shop"), false);
  const lectura = [anuncio("100000000000001", { pagina: "Nenagoslingshop" })];
  const r = coincidencias({ copy: COPY, nombrePagina: "NENA GOSLING regalos personalizados", paginasAlternas: ["nenagosling"] }, lectura);
  assert.ok(r && "ok" in r);
});

test("validarAnuncios descarta lo que no es un anuncio y recorta lo demás", () => {
  const buenos = validarAnuncios([
    { id: "100000000000001", activo: true, desde: "2026-10-10", pagina: "  Nena Gosling  ", copy: "x".repeat(900), destino: "https://nena.com/p?a=1", cantidad: 2 },
    { id: "100000000000002", activo: false, desde: "no es fecha", pagina: "", copy: 5, destino: "javascript:alert(1)", cantidad: 9999 },
    { id: "abc", activo: true },
    { id: "100000000000003" },
    null,
    "texto",
  ]);
  assert.equal(buenos.length, 2);
  assert.equal(buenos[0].pagina, "Nena Gosling");
  assert.equal(buenos[0].copy.length, 300);
  assert.equal(buenos[0].destino, "https://nena.com/p?a=1");
  assert.equal(buenos[0].cantidad, 2);
  assert.equal(buenos[1].desde, null);
  assert.equal(buenos[1].pagina, null);
  assert.equal(buenos[1].copy, "");
  assert.equal(buenos[1].destino, null);
  assert.equal(buenos[1].cantidad, 500);
  assert.deepEqual(validarAnuncios("no es una lista"), []);
  assert.deepEqual(validarAnuncios(undefined), []);
  assert.equal(validarAnuncios(Array.from({ length: 300 }, (_, i) => ({ id: String(100000000000000 + i), activo: true }))).length, 100);
});
