import assert from "node:assert/strict";
import test from "node:test";
import { coincidencias, interpretarTarjeta, usuarioDeEnlacePagina, validarAnuncios, validarLectura } from "./biblioteca-lectura";

const COPY = "Hay joyas bonitas y hay joyas que cuentan tu historia. Crea un Cofre de Tesoros único con los dijes que representan a las personas.";
const tarjeta = (p: string | null) => ({
  x: ["​", "Activo", "Identificador de la biblioteca: 1728301844787382", "En circulación desde el 5 ago 2026", "Ver detalles del anuncio", "Nenagoslingshop", "Publicidad", COPY, "NENAGOSLING.COM", "Más información"].join("\n"),
  l: null,
  p,
});

test("el usuario de la página del anunciante sale del enlace de su nombre en la tarjeta", () => {
  assert.equal(usuarioDeEnlacePagina("https://www.facebook.com/nenagoslingshop/"), "nenagoslingshop");
  assert.equal(usuarioDeEnlacePagina("https://www.facebook.com/Oferta.VE"), "Oferta.VE");
  // Solo un número, un perfil, otro sitio o nada: sin usuario.
  for (const e of ["https://www.facebook.com/100064860875397/", "https://www.facebook.com/profile.php?id=1", "https://evil.com/nenagoslingshop/", "https://www.facebook.com/", null, undefined, ""]) assert.equal(usuarioDeEnlacePagina(e), null, String(e));
});

test("la tarjeta trae el usuario del anunciante y el resumen toma el más repetido", () => {
  const a = interpretarTarjeta(tarjeta("https://www.facebook.com/nenagoslingshop/"));
  assert.equal(a?.usuario, "nenagoslingshop");
  assert.equal(interpretarTarjeta(tarjeta(null))?.usuario, null);
  const r = coincidencias({ copy: COPY, nombrePagina: "Nenagoslingshop" }, [a as NonNullable<typeof a>]);
  assert.ok(r && "ok" in r);
  assert.equal(r.ok.usuario, "nenagoslingshop");
});

test("la lectura valida el enlace de la página y los anuncios devueltos validan el usuario", () => {
  const v = validarLectura({ v: 1, u: "https://www.facebook.com/ads/library/?q=x", r: "", t: [{ x: "a", l: null, p: "https://www.facebook.com/nenagoslingshop/" }, { x: "b", l: null, p: 5 }] });
  assert.ok("lectura" in v);
  if ("lectura" in v) {
    assert.equal(v.lectura.t[0].p, "https://www.facebook.com/nenagoslingshop/");
    assert.equal(v.lectura.t[1].p, null);
  }
  const buenos = validarAnuncios([
    { id: "100000000000001", activo: true, usuario: "nenagoslingshop" },
    { id: "100000000000002", activo: true, usuario: "<script>" },
  ]);
  assert.equal(buenos[0].usuario, "nenagoslingshop");
  assert.equal(buenos[1].usuario, null);
});
