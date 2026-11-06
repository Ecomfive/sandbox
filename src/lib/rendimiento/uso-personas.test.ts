import assert from "node:assert/strict";
import test from "node:test";
import { frenteDeRuta, pct, resumirPersonas, restarDias, type DatosUsoPersonas } from "./uso-personas";

const persona = (id: string, nombre: string) => ({ id, nombre, email: `${id}@x.com`, avatar: null, rol: null, ultimaVez: null });

test("cada ruta cae en su parte del sistema", () => {
  assert.equal(frenteDeRuta("/crm-dropshippers/bandeja"), "crm");
  assert.equal(frenteDeRuta("/publicaciones-dropi"), "ids-dropi");
  assert.equal(frenteDeRuta("/publicaciones-drop"), "ids-drop-effi");
  assert.equal(frenteDeRuta("/producto/12"), "producto");
  assert.equal(frenteDeRuta("/productos"), "finanzas");
  assert.equal(frenteDeRuta("/productos-test"), "producto");
  assert.equal(frenteDeRuta("/inventario/remisiones"), "inventario");
  assert.equal(frenteDeRuta("/"), "general");
  assert.equal(frenteDeRuta("/una-pagina-nueva"), "general");
});

test("mirar esta supervisión no cuenta como trabajo en IDs Dropi", () => {
  assert.equal(frenteDeRuta("/publicaciones-dropi/uso-sistema"), "general");
});

test("resta días cruzando el mes", () => {
  assert.equal(restarDias("2026-11-06", 6), "2026-10-31");
});

const datos: DatosUsoPersonas = {
  personas: [persona("a", "Ana"), persona("b", "Beto"), persona("c", "Carla")],
  minutos: [
    { persona: "a", dia: "2026-11-05", frente: "crm", pagina: "Bandeja", minutos: 90 },
    { persona: "a", dia: "2026-11-06", frente: "crm", pagina: "Bandeja", minutos: 30 },
    { persona: "a", dia: "2026-11-06", frente: "compras", pagina: "Compras", minutos: 30 },
    { persona: "b", dia: "2026-11-06", frente: "inventario", pagina: "Inventario", minutos: 10 },
    { persona: "b", dia: "2026-10-01", frente: "crm", pagina: "Bandeja", minutos: 500 },
  ],
  jornadas: [
    { persona: "a", dia: "2026-11-05", minutos: 150 },
    { persona: "a", dia: "2026-11-06", minutos: 150 },
    { persona: "b", dia: "2026-11-06", minutos: 5 },
  ],
  cambios: [{ persona: "a", dia: "2026-11-06", n: 4 }],
  mensajes: [
    { persona: "a", dia: "2026-11-06", n: 7 },
    { persona: "a", dia: "2026-10-01", n: 100 },
  ],
  whatsapp: [
    { numero: "Comercial", dia: "2026-11-06", crm: 1, celular: 9 },
    { numero: "Atención", dia: "2026-11-05", crm: 50, celular: 2 },
    { numero: "Atención", dia: "2026-10-01", crm: 900, celular: 0 },
  ],
  externos: [
    { persona: "a", dia: "2026-11-06", plataforma: "dropi", seccion: "orders", minutos: 40 },
    { persona: "a", dia: "2026-11-06", plataforma: "effi", seccion: "", minutos: 10 },
    { persona: "b", dia: "2026-11-06", plataforma: "dropi", seccion: "orders", minutos: 5 },
    { persona: "a", dia: "2026-10-01", plataforma: "dropi", seccion: "products", minutos: 900 },
  ],
  conExtension: ["a"],
};

test("junta a cada persona solo con lo del periodo", () => {
  const r = resumirPersonas(datos, "2026-11-01");
  assert.deepEqual(r.filas.map((f) => f.nombre), ["Ana", "Beto", "Carla"]);
  const ana = r.filas[0];
  assert.equal(ana.minutos, 150);
  assert.equal(ana.dias, 2);
  assert.equal(ana.pctDia, 50);
  assert.equal(ana.cambios, 4);
  assert.equal(ana.mensajes, 7);
  assert.deepEqual(ana.porFrente, { crm: 120, compras: 30 });
  assert.equal(ana.paginas[0].pagina, "Bandeja");
  assert.equal(r.filas[1].porFrente.crm, undefined);
  assert.equal(r.minutos, 160);
});

test("quien no entró queda sin porcentaje y no cuenta como usuario", () => {
  const r = resumirPersonas(datos, "2026-11-01");
  assert.equal(r.usaron, 2);
  assert.equal(r.filas[2].pctDia, null);
  assert.equal(r.filas[2].minutos, 0);
});

test("el % del día no pasa de 100", () => {
  const r = resumirPersonas({ ...datos, jornadas: [{ persona: "b", dia: "2026-11-06", minutos: 1 }] }, "2026-11-01");
  assert.equal(r.filas.find((f) => f.id === "b")?.pctDia, 100);
});

test("con extensión se ve cuánto de su tiempo fue en el sistema", () => {
  const ana = resumirPersonas(datos, "2026-11-01").filas[0];
  assert.equal(ana.midiendo, true);
  assert.equal(ana.minutosExterno, 50);
  assert.deepEqual(ana.porPlataforma, { dropi: 40, effi: 10 });
  assert.equal(ana.pctSistema, 75);
});

test("sin extensión queda sin medir, no en cero", () => {
  const r = resumirPersonas(datos, "2026-11-01");
  assert.equal(r.filas.find((f) => f.id === "c")?.midiendo, false);
  assert.equal(r.filas.find((f) => f.id === "c")?.pctSistema, null);
  assert.equal(r.filas.find((f) => f.id === "b")?.pctSistema, null);
});

test("las secciones de afuera van de la más usada a la menos, con quién las usa", () => {
  const r = resumirPersonas(datos, "2026-11-01");
  assert.deepEqual(r.secciones[0], { plataforma: "dropi", seccion: "orders", minutos: 45, personas: ["Ana", "Beto"] });
  assert.equal(r.minutosExterno, 55);
});

test("WhatsApp por número, del que más mandó al que menos", () => {
  const r = resumirPersonas(datos, "2026-11-01");
  assert.deepEqual(r.whatsapp, [
    { numero: "Atención", crm: 50, celular: 2 },
    { numero: "Comercial", crm: 1, celular: 9 },
  ]);
});

test("el porcentaje sin total es cero", () => {
  assert.equal(pct(5, 0), 0);
  assert.equal(pct(1, 3), 33);
});
