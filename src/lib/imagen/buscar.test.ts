import assert from "node:assert/strict";
import test from "node:test";
import { leerDescripcion, leerVerificacion, pedidoVerificar } from "./ia-imagen";
import { depurar, elegirParaComparar, nivelDeDistancia, ordenar, porHuella, porNombre, unirCoincidencias, type Candidato } from "./buscar";

const cand = (id: string, nombre: string, huella: string | null, ambito: Candidato["ambito"] = "producto", foto: string | null = "https://x/f.jpg"): Candidato => ({
  ambito, id, nombre, foto, huella, detalle: id, href: `/x/${id}`,
});

// Una huella a `bits` bits de la base (todo ceros): se encienden los primeros bits, de 4 en 4 por cifra hexadecimal.
const huella = (bits: number) => {
  let hex = "";
  let resto = bits;
  for (let i = 0; i < 16; i++) {
    const n = Math.min(4, resto);
    hex += ((1 << n) - 1).toString(16);
    resto -= n;
  }
  return hex;
};
const BASE = "0000000000000000";

test("las fotos por huella: de la más parecida a la menos, y las muy distintas no entran", () => {
  const r = porHuella(BASE, [cand("a", "A", huella(8)), cand("b", "B", huella(2)), cand("c", "C", huella(30)), cand("d", "D", null)]);
  assert.deepEqual(r.map((x) => [x.id, x.distancia]), [["b", 2], ["a", 8]]);
  assert.deepEqual(r.map((x) => x.nivel), ["misma", "muy_parecida"]);
});

test("el tope por ámbito evita que uno grande tape a los demás", () => {
  const muchos = Array.from({ length: 15 }, (_, i) => cand(`s${i}`, `S${i}`, huella(3), "scraping"));
  const r = porHuella(BASE, [...muchos, cand("p1", "P1", huella(9), "producto")], { limitePorAmbito: 4 });
  assert.equal(r.filter((x) => x.ambito === "scraping").length, 4);
  assert.equal(r.filter((x) => x.ambito === "producto").length, 1);
});

test("los niveles de parecido", () => {
  assert.equal(nivelDeDistancia(0), "misma");
  assert.equal(nivelDeDistancia(5), "misma");
  assert.equal(nivelDeDistancia(6), "muy_parecida");
  assert.equal(nivelDeDistancia(10), "muy_parecida");
  assert.equal(nivelDeDistancia(11), "se_parece");
});

test("por nombre: el mismo producto con otra foto sale por las palabras que dijo la IA, y solo los que tienen foto", () => {
  const lista = [
    cand("1", "Limpiador a Vapor de Alta Presión", null),
    cand("2", "P-D Limpiador a vapor portátil", null),
    cand("3", "Crema hidratante facial", null),
    cand("4", "Limpiador a vapor sin foto", null, "producto", null),
  ];
  const r = porNombre(["limpiador", "vapor", "portátil"], lista);
  assert.deepEqual(r.map((x) => x.id).sort(), ["1", "2"]);
  assert.ok(r.every((x) => x.distancia === null));
  assert.deepEqual(porNombre([], lista), []);
});

test("al unir, la coincidencia con huella manda sobre la de solo nombre", () => {
  const a = porNombre(["limpiador", "vapor"], [cand("1", "Limpiador a vapor", huella(4))]);
  const b = porHuella(BASE, [cand("1", "Limpiador a vapor", huella(4))]);
  const u = unirCoincidencias(a, b);
  assert.equal(u.length, 1);
  assert.equal(u[0].distancia, 4);
});

test("el orden final: lo que la IA dijo que es el mismo primero, lo descartado al final", () => {
  const base = { ambito: "producto" as const, foto: null, huella: null, detalle: "", href: "", nivel: null, afinidad: null };
  const lista = [
    { ...base, id: "d", nombre: "D", distancia: 2, veredicto: "distinto" as const, motivo: null },
    { ...base, id: "s", nombre: "S", distancia: 3, veredicto: null, motivo: null },
    { ...base, id: "p", nombre: "P", distancia: 9, veredicto: "parecido" as const, motivo: null },
    { ...base, id: "m", nombre: "M", distancia: 12, veredicto: "mismo" as const, motivo: null },
  ];
  assert.deepEqual(ordenar(lista).map((x) => x.id), ["m", "p", "s", "d"]);
});

test("lo que responde la IA se valida: veredictos de una lista, n.º dentro del rango y sin repetir", () => {
  const texto = JSON.stringify({ resultados: [
    { n: 1, veredicto: "mismo", motivo: "Mismo aparato blanco con tanque" },
    { n: 2, veredicto: "PARECIDO", motivo: "" },
    { n: 2, veredicto: "mismo" },
    { n: 9, veredicto: "mismo" },
    { n: 3, veredicto: "quizás" },
    { n: 3, veredicto: "distinto", motivo: "x".repeat(400) },
  ] });
  const r = leerVerificacion(texto, 3);
  assert.deepEqual(r.map((x) => [x.n, x.veredicto]), [[1, "mismo"], [2, "parecido"], [3, "distinto"]]);
  assert.equal(r[1].motivo, null);
  assert.equal(r[2].motivo!.length, 160);
  assert.deepEqual(leerVerificacion("no es json", 3), []);
});

test("la descripción de la IA se limpia y sin nada útil se descarta", () => {
  const d = leerDescripcion('```json\n{"producto":"  limpiador a vapor portátil ","palabras":["limpiador"," vapor ",5,""],"seguro":true}\n```');
  assert.ok(d);
  assert.deepEqual([d!.producto, d!.palabras, d!.seguro], ["limpiador a vapor portátil", ["limpiador", "vapor"], true]);
  assert.equal(leerDescripcion('{"producto":"","palabras":[]}'), null);
  assert.equal(leerDescripcion("nada"), null);
  assert.equal(leerDescripcion('{"producto":"collage","palabras":["x"],"seguro":false}')!.seguro, false);
});

test("el pedido de comparar manda primero la foto buscada y después las de los candidatos, en el orden de la lista", () => {
  const p = pedidoVerificar("data:image/jpeg;base64,AAA", [{ nombre: "Uno", foto: "https://x/1.jpg" }, { nombre: "Dos", foto: "https://x/2.jpg" }]);
  assert.deepEqual(p.imagenes, ["data:image/jpeg;base64,AAA", "https://x/1.jpg", "https://x/2.jpg"]);
  assert.match(p.texto, /1\. Uno\n2\. Dos/);
});

test("una palabra suelta en común no basta: «Cepillo limpiador» no sale cuando la IA dijo limpiador a vapor", () => {
  const lista = [
    cand("1", "Limpiador a Vapor de 2500W", null),
    cand("2", "Cepillo limpiador eléctrico", null),
    cand("3", "Escoba de limpieza 3 en 1", null),
    cand("4", "Limpiador", null),
  ];
  const r = porNombre(["limpiador", "vapor", "portátil"], lista);
  assert.deepEqual(r.map((x) => x.id), ["1"]);
  assert.ok((r[0].afinidad ?? 0) > 0.5);
  // con una sola palabra buscada sí alcanza una en común
  assert.deepEqual(porNombre(["limpiador"], lista).map((x) => x.id).sort(), ["1", "2", "4"]);
});

test("a la IA se le muestran primero las fotos casi iguales y los nombres más parecidos, sin que uno tape al otro", () => {
  const f = (id: string, distancia: number | null, afinidad: number | null) => ({ ...cand(id, id, null), distancia, nivel: null, veredicto: null, motivo: null, afinidad });
  const lista = [f("h1", 3, null), f("h2", 8, null), f("h3", 16, null), f("h4", 17, null), f("n1", null, 1), f("n2", null, 0.75), f("n3", null, 0.5)];
  const r = elegirParaComparar(lista, 4);
  assert.deepEqual(r.map((x) => x.id), ["h1", "h2", "n1", "n2"]);
  assert.equal(elegirParaComparar(lista, 20).length, 7);
});

test("con la IA se quita lo que dijo que es otro producto y lo lejano sin confirmar; sin ella solo lo descartado", () => {
  const f = (id: string, distancia: number | null, veredicto: "mismo" | "distinto" | null) => ({ ...cand(id, id, null), distancia, nivel: null, veredicto, motivo: null, afinidad: null });
  const lista = [f("a", 4, "mismo"), f("b", 6, "distinto"), f("c", 15, null), f("d", 9, null), f("e", null, null)];
  const con = depurar(lista, true);
  assert.deepEqual(con.visibles.map((x) => x.id), ["a", "d"]);
  assert.equal(con.descartadas, 3);
  assert.deepEqual(depurar(lista, false).visibles.map((x) => x.id), ["a", "c", "d", "e"]);
});
