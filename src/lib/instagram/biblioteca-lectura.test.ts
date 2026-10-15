import assert from "node:assert/strict";
import test from "node:test";
import { coincidencias, destinoDeEnlace, interpretarTarjeta, mismaPagina, mismoCopy, normalizar, totalDeResultados, validarLectura, type TarjetaBruta } from "./biblioteca-lectura";

const COPY = "⚡ Apoya tu bienestar corporal con Perfectx Joint & Bone Therapy Cream, la crema concentrada ideal para complementar tu rutina diaria de cuidado físico.\n\n🧬 Fórmula avanzada con colágeno, vitamina K2 y MSM.";
const ENLACE = "https://l.facebook.com/l.php?u=http%3A%2F%2Fclicksitienda.com%2Fproducts%2Fproducto-2lp-pa001-crema-perfetcx&h=AUAlfgffiQ52&fbclid=abc";

// El texto de una tarjeta como lo devuelve la Biblioteca (probado el 14 oct 2026 con la búsqueda de Perfectx).
function tarjeta(id: string, opciones: { pagina?: string; copy?: string; estado?: string; circulacion?: string; extra?: string; cuerpoFinal?: string[]; enlace?: string | null } = {}): TarjetaBruta {
  const { pagina = "Mundo Digital", copy = COPY, estado = "Activo", circulacion = "En circulación desde el 10 oct 2026", extra = "", cuerpoFinal = ["0:00 / 0:19", "CLICKSITIENDA.COM", "✨ Cuidado articular con Perfectx", "🚚 Paga al recibir.", "Más información"], enlace = ENLACE } = opciones;
  return { x: ["​", estado, `Identificador de la biblioteca: ${id}`, circulacion, "Plataformas", "​", "​", extra, "Abrir menú desplegable", "​", "Ver detalles del anuncio", pagina, "Publicidad", copy, ...cuerpoFinal].join("\n"), l: enlace };
}

test("normalizar quita acentos, emojis y signos", () => {
  assert.equal(normalizar("⚡ ¡Apoya tu Bienestar, ya!"), "apoya tu bienestar ya");
  assert.equal(normalizar(null), "");
});

test("destinoDeEnlace saca la dirección real y quita el rastreo de Facebook", () => {
  assert.equal(destinoDeEnlace(ENLACE), "http://clicksitienda.com/products/producto-2lp-pa001-crema-perfetcx");
  assert.equal(destinoDeEnlace(null), null);
  assert.equal(destinoDeEnlace("https://otro.com/l.php?u=https%3A%2F%2Fa.com"), null);
  assert.equal(destinoDeEnlace("https://l.facebook.com/l.php?u=javascript%3Aalert(1)"), null);
  assert.equal(destinoDeEnlace("https://l.facebook.com/l.php?h=sinu"), null);
});

test("interpretarTarjeta lee el anuncio de la Biblioteca", () => {
  const a = interpretarTarjeta(tarjeta("1428370656108071"));
  assert.ok(a);
  assert.equal(a.id, "1428370656108071");
  assert.equal(a.activo, true);
  assert.equal(a.desde, "2026-10-10");
  assert.equal(a.pagina, "Mundo Digital");
  assert.equal(a.cantidad, 1);
  assert.equal(a.destino, "http://clicksitienda.com/products/producto-2lp-pa001-crema-perfetcx");
  // El copy llega hasta el temporizador del video: no se pega el titular ni el botón.
  assert.equal(a.copy, COPY);
});

test("interpretarTarjeta: un anuncio sin video corta el copy en el dominio del botón", () => {
  const a = interpretarTarjeta(tarjeta("1000000000000001", { cuerpoFinal: ["CLICKSITIENDA.COM", "Titular", "Más información"] }));
  assert.equal(a?.copy, COPY);
});

test("interpretarTarjeta: inactivo y la fecha de un rango", () => {
  const a = interpretarTarjeta(tarjeta("1000000000000002", { estado: "Inactivo", circulacion: "En circulación del 3 sept 2026 al 5 oct 2026" }));
  assert.equal(a?.activo, false);
  assert.equal(a?.desde, "2026-09-03");
});

test("interpretarTarjeta: «N anuncios usan este contenido y texto» cuenta N", () => {
  const a = interpretarTarjeta(tarjeta("1000000000000003", { pagina: "L'Oréal Paris", extra: "Este anuncio tiene varias versiones\n​\n2 anuncios usan este contenido y texto", enlace: null, cuerpoFinal: ["Cuida tu pelo con Elvive", "Learn More"] }));
  assert.equal(a?.cantidad, 2);
  assert.equal(a?.pagina, "L'Oréal Paris");
  assert.equal(a?.destino, null);
});

test("interpretarTarjeta: sin identificador no es un anuncio", () => {
  assert.equal(interpretarTarjeta({ x: "Filtros\nOrdenar por", l: null }), null);
  assert.equal(interpretarTarjeta({ x: "Identificador de la biblioteca: abc", l: null }), null);
});

test("totalDeResultados", () => {
  assert.equal(totalDeResultados("~4 resultados"), 4);
  assert.equal(totalDeResultados("~1.100 resultados"), 1100);
  assert.equal(totalDeResultados("~1 100 results"), 1100);
  assert.equal(totalDeResultados(""), null);
});

test("mismoCopy ignora emojis, acentos y mayúsculas, y tolera un copy recortado", () => {
  assert.equal(mismoCopy(COPY, COPY.toUpperCase()), true);
  assert.equal(mismoCopy("Apoya tu bienestar corporal con Perfectx Joint & Bone Therapy Cream, la crema concentrada", COPY), true);
  assert.equal(mismoCopy("Apoya tu bienestar corporal con otra crema distinta de la anterior para todos", COPY), false);
  // Un copy demasiado corto no basta para decir que es el mismo.
  assert.equal(mismoCopy("Oferta", "Oferta"), false);
  assert.equal(mismoCopy(null, COPY), false);
});

test("mismaPagina acepta un nombre dentro del otro", () => {
  assert.equal(mismaPagina("Mundo Digital", "mundo digital"), true);
  assert.equal(mismaPagina("Mundo Digital", "Mundo Digital PA"), true);
  assert.equal(mismaPagina("Mundo Digital", "Ancient Remedy"), false);
  assert.equal(mismaPagina(null, "Mundo Digital"), false);
});

const cuatro = ["1428370656108071", "2019090338585350", "1402909822022104", "950027891494737"].map((id) => interpretarTarjeta(tarjeta(id)) as NonNullable<ReturnType<typeof interpretarTarjeta>>);

test("coincidencias cuenta los anuncios de la misma página con el mismo copy", () => {
  const r = coincidencias({ copy: COPY, nombrePagina: "Mundo Digital" }, cuatro);
  assert.ok(r && "ok" in r);
  assert.equal(r.ok.total, 4);
  assert.equal(r.ok.activos, 4);
  assert.equal(r.ok.inactivos, 0);
  assert.equal(r.ok.desde, "2026-10-10");
  assert.deepEqual(r.ok.destinos, [{ url: "http://clicksitienda.com/products/producto-2lp-pa001-crema-perfetcx", n: 4 }]);
  assert.equal(r.ok.ids.length, 4);
});

test("coincidencias: otra página con el mismo copy no cuenta", () => {
  const otra = interpretarTarjeta(tarjeta("1000000000000009", { pagina: "Ancient Remedy" })) as NonNullable<ReturnType<typeof interpretarTarjeta>>;
  const r = coincidencias({ copy: COPY, nombrePagina: "Mundo Digital" }, [...cuatro, otra]);
  assert.ok(r && "ok" in r);
  assert.equal(r.ok.total, 4);
  assert.equal(coincidencias({ copy: COPY, nombrePagina: "Tienda Que No Está" }, cuatro), null);
});

test("coincidencias: una tarjeta agrupada suma todos sus anuncios y los inactivos aparte", () => {
  const agrupada = interpretarTarjeta(tarjeta("1000000000000005", { extra: "2 anuncios usan este contenido y texto" })) as NonNullable<ReturnType<typeof interpretarTarjeta>>;
  const inactivo = interpretarTarjeta(tarjeta("1000000000000006", { estado: "Inactivo", circulacion: "En circulación del 1 oct 2026 al 5 oct 2026" })) as NonNullable<ReturnType<typeof interpretarTarjeta>>;
  const r = coincidencias({ copy: COPY, nombrePagina: "Mundo Digital" }, [agrupada, inactivo]);
  assert.ok(r && "ok" in r);
  assert.equal(r.ok.total, 3);
  assert.equal(r.ok.activos, 2);
  assert.equal(r.ok.inactivos, 1);
  assert.equal(r.ok.desde, "2026-10-01");
});

test("coincidencias sin nombre de página: una sola página se toma; varias no se adivinan", () => {
  const sola = coincidencias({ copy: COPY, nombrePagina: null }, cuatro);
  assert.ok(sola && "ok" in sola);
  assert.equal(sola.ok.pagina, "Mundo Digital");
  const otra = interpretarTarjeta(tarjeta("1000000000000009", { pagina: "Ancient Remedy" })) as NonNullable<ReturnType<typeof interpretarTarjeta>>;
  const varias = coincidencias({ copy: COPY, nombrePagina: null }, [...cuatro, otra]);
  assert.ok(varias && "motivo" in varias);
});

test("coincidencias: sin copy o sin anuncios iguales no hay nada que anotar", () => {
  assert.equal(coincidencias({ copy: null, nombrePagina: "Mundo Digital" }, cuatro), null);
  assert.equal(coincidencias({ copy: "Un copy totalmente distinto que nadie ha usado jamás", nombrePagina: "Mundo Digital" }, cuatro), null);
});

test("validarLectura acepta solo lecturas de la Biblioteca de anuncios", () => {
  const buena = { v: 1, u: "https://www.facebook.com/ads/library/?q=x", r: "~4 resultados", t: [{ x: "texto", l: null }] };
  assert.ok("lectura" in validarLectura(buena));
  for (const mala of [null, 5, {}, { ...buena, v: 2 }, { ...buena, u: "https://evil.com/ads/library" }, { ...buena, u: "https://www.facebook.com/otra" }, { ...buena, u: "http://www.facebook.com/ads/library" }, { ...buena, t: [] }, { ...buena, t: [{ x: 5 }] }, { ...buena, t: "x" }]) {
    assert.ok("error" in validarLectura(mala), JSON.stringify(mala));
  }
  const grande = validarLectura({ ...buena, t: Array.from({ length: 300 }, () => ({ x: "a".repeat(9000), l: "b".repeat(9000) })) });
  assert.ok("lectura" in grande);
  if ("lectura" in grande) {
    assert.equal(grande.lectura.t.length, 100);
    assert.equal(grande.lectura.t[0].x.length, 4000);
    assert.equal(grande.lectura.t[0].l?.length, 3000);
  }
});
