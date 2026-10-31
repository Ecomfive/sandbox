import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alinearVariables,
  calidadDeMeta,
  construirComponentes,
  desdeComponentes,
  estadoDeMeta,
  leerListaMeta,
  nombreSugerido,
  normalizarCuerpo,
  normalizarIdioma,
  ranurasUnicas,
  rellenar,
  resolverVariables,
  segundosDeEspera,
  siguienteRanura,
  textoEspera,
  textoLimite,
  validarPlantilla,
  vistaPrevia,
  type DatosPlantilla,
} from "./plantillas";
import { PLANTILLAS_DE_LLEGADA, PLANTILLAS_SUGERIDAS } from "./plantillas-sugeridas";

const base: DatosPlantilla = {
  nombre: "retomar_compra",
  idioma: "es",
  categoria: "marketing",
  encabezado: null,
  cuerpo: "Hola {{1}}, hace unos días hablamos y quedó algo pendiente. ¿Quieres que lo retomemos?",
  pie: null,
  botones: ["Sí", "No, gracias"],
  variables: [{ campo: "primer_nombre", ejemplo: "María" }],
};

describe("variables del cuerpo", () => {
  it("encuentra y ordena las variables, escriban como las escriban", () => {
    assert.deepEqual(ranurasUnicas("Hola {{2}} y {{ 1 }} y {{1}}"), [1, 2]);
    assert.equal(normalizarCuerpo("Hola {{ 1 }}, {{2}}"), "Hola {{1}}, {{2}}");
    assert.equal(siguienteRanura("Hola {{1}} {{2}}"), 3);
    assert.equal(siguienteRanura("Sin variables"), 1);
  });
  it("deja las variables alineadas con el cuerpo, conservando lo elegido", () => {
    const v = alinearVariables("Hola {{1}} {{2}}", [{ campo: "tienda", ejemplo: "Mi tienda" }]);
    assert.equal(v.length, 2);
    assert.deepEqual(v[0], { campo: "tienda", ejemplo: "Mi tienda" });
    assert.equal(v[1].campo, "manual");
    assert.equal(alinearVariables("Sin variables", [{ campo: "tienda", ejemplo: "x" }]).length, 0);
    assert.equal(alinearVariables("{{1}}", [])[0].campo, "primer_nombre");
  });
  it("rellena el cuerpo con valores y deja lo que falta", () => {
    assert.equal(rellenar("Hola {{1}}, {{2}}", ["Ana"]), "Hola Ana, {{2}}");
    assert.equal(vistaPrevia(base), "Hola María, hace unos días hablamos y quedó algo pendiente. ¿Quieres que lo retomemos?");
  });
});

describe("nombreSugerido", () => {
  it("lo vuelve un nombre que acepta Meta", () => {
    assert.equal(nombreSugerido("Retomar compra"), "retomar_compra");
    assert.equal(nombreSugerido("  ¡Oferta Única! 2x1 "), "oferta_unica_2x1");
    assert.equal(nombreSugerido("Atención día"), "atencion_dia");
    assert.equal(nombreSugerido("***"), "");
  });
});

describe("validarPlantilla", () => {
  it("una plantilla bien hecha no tiene errores ni avisos", () => {
    assert.deepEqual(validarPlantilla(base), { errores: [], avisos: [] });
  });
  it("el nombre, el idioma y el mensaje son obligatorios", () => {
    const r = validarPlantilla({ ...base, nombre: "Retomar Compra", idioma: "xx", cuerpo: "", variables: [] });
    assert.ok(r.errores.some((e) => /minúsculas/.test(e)));
    assert.ok(r.errores.some((e) => /idioma/.test(e)));
    assert.ok(r.errores.some((e) => /Falta el mensaje/.test(e)));
    assert.ok(validarPlantilla({ ...base, nombre: "" }).errores.some((e) => /Falta el nombre/.test(e)));
  });
  it("las variables van en orden y cada una lleva su ejemplo", () => {
    const salto = validarPlantilla({ ...base, cuerpo: "Hola {{1}} y {{3}}, hablemos de tu pedido pendiente", variables: [base.variables[0], base.variables[0]] });
    assert.ok(salto.errores.some((e) => /orden/.test(e)));
    const sinEjemplo = validarPlantilla({ ...base, variables: [{ campo: "primer_nombre", ejemplo: "  " }] });
    assert.ok(sinEjemplo.errores.some((e) => /ejemplo de \{\{1\}\}/.test(e)));
    const faltan = validarPlantilla({ ...base, variables: [] });
    assert.ok(faltan.errores.some((e) => /Faltan datos/.test(e)));
    const llaves = validarPlantilla({ ...base, cuerpo: "Hola {{1} y {{x}}", variables: [] });
    assert.ok(llaves.errores.some((e) => /Revisa las variables/.test(e)));
  });
  it("una variable manual dice qué se escribe al enviar", () => {
    const r = validarPlantilla({ ...base, cuerpo: "Hola, el producto {{1}} ya tiene unidades disponibles para ti", variables: [{ campo: "manual", ejemplo: "Crema", etiqueta: "" }] });
    assert.ok(r.errores.some((e) => /qué se escribe/.test(e)));
  });
  it("respeta los límites de Meta", () => {
    assert.ok(validarPlantilla({ ...base, cuerpo: "a".repeat(1025), variables: [] }).errores.some((e) => /muy largo/.test(e)));
    assert.ok(validarPlantilla({ ...base, encabezado: "x".repeat(61) }).errores.some((e) => /encabezado/.test(e)));
    assert.ok(validarPlantilla({ ...base, encabezado: "Hola {{1}}" }).errores.some((e) => /no lleva variables/.test(e)));
    assert.ok(validarPlantilla({ ...base, pie: "x".repeat(61) }).errores.some((e) => /pie/.test(e)));
    assert.ok(validarPlantilla({ ...base, botones: ["a", "b", "c", "d"] }).errores.some((e) => /Hasta 3/.test(e)));
    assert.ok(validarPlantilla({ ...base, botones: ["x".repeat(26), "No"] }).errores.some((e) => /25/.test(e)));
    assert.ok(validarPlantilla({ ...base, botones: ["Sí", "sí"] }).errores.some((e) => /lo mismo/.test(e)));
    assert.ok(validarPlantilla({ ...base, botones: ["Sí", ""] }).errores.some((e) => /vacío/.test(e)));
  });
  it("avisa de lo que Meta suele rechazar sin impedir mandarla", () => {
    const alFinal = validarPlantilla({ ...base, cuerpo: "Quedó algo pendiente con tu pedido, hablemos pronto {{1}}" });
    assert.equal(alFinal.errores.length, 0);
    assert.ok(alFinal.avisos.some((a) => /empieza o termina/.test(a)));
    const alInicio = validarPlantilla({ ...base, cuerpo: "{{1}} hace unos días hablamos y quedó algo pendiente contigo" });
    assert.ok(alInicio.avisos.some((a) => /empieza o termina/.test(a)));
    const juntas = validarPlantilla({ ...base, cuerpo: "Hola {{1}}{{2}} hablamos de tu pedido pendiente hace unos días", variables: [base.variables[0], { campo: "tienda", ejemplo: "Bella Moda" }] });
    assert.ok(juntas.avisos.some((a) => /seguidas/.test(a)));
    const muchas = validarPlantilla({ ...base, cuerpo: "Hola {{1}} y {{2}}.", variables: [base.variables[0], { campo: "tienda", ejemplo: "Bella Moda" }] });
    assert.ok(muchas.avisos.some((a) => /muchas variables/.test(a)));
  });
  it("una utilidad que suena a promoción avisa; marketing sin forma de decir que no, también", () => {
    const util = validarPlantilla({ ...base, categoria: "utility", cuerpo: "Hola {{1}}, tenemos una oferta con descuento solo para ti esta semana", botones: [] });
    assert.ok(util.avisos.some((a) => /promoción/.test(a)));
    const sinNo = validarPlantilla({ ...base, botones: ["Sí"] });
    assert.ok(sinNo.avisos.some((a) => /No, gracias/.test(a)));
    const conTexto = validarPlantilla({ ...base, botones: [], cuerpo: "Hola {{1}}, hace unos días hablamos. Si no quieres que te escribamos más, dínoslo." });
    assert.ok(!conTexto.avisos.some((a) => /No, gracias/.test(a)));
  });
});

describe("construirComponentes y desdeComponentes", () => {
  it("arma lo que pide Meta: cuerpo con el ejemplo de cada variable, pie y botones de respuesta rápida", () => {
    const c = construirComponentes({ ...base, cuerpo: "Hola {{ 1 }}, el producto {{2}} ya está disponible para ti", encabezado: "Novedad", pie: "Ecomfive", variables: [base.variables[0], { campo: "manual", ejemplo: "Crema", etiqueta: "Producto" }] });
    assert.deepEqual(c[0], { type: "HEADER", format: "TEXT", text: "Novedad" });
    assert.deepEqual(c[1], { type: "BODY", text: "Hola {{1}}, el producto {{2}} ya está disponible para ti", example: { body_text: [["María", "Crema"]] } });
    assert.deepEqual(c[2], { type: "FOOTER", text: "Ecomfive" });
    assert.deepEqual(c[3], { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Sí" }, { type: "QUICK_REPLY", text: "No, gracias" }] });
  });
  it("sin variables no manda ejemplos; sin pie ni botones, solo el cuerpo", () => {
    const c = construirComponentes({ ...base, cuerpo: "Hola, ¿seguimos con tu pedido pendiente?", variables: [], botones: [] });
    assert.deepEqual(c, [{ type: "BODY", text: "Hola, ¿seguimos con tu pedido pendiente?" }]);
  });
  it("lee de vuelta lo que devuelve Meta", () => {
    const hecho = construirComponentes({ ...base, encabezado: "Novedad", pie: "Ecomfive" });
    const r = desdeComponentes(hecho);
    assert.equal(r.encabezado, "Novedad");
    assert.equal(r.cuerpo, base.cuerpo);
    assert.equal(r.pie, "Ecomfive");
    assert.deepEqual(r.botones, ["Sí", "No, gracias"]);
    assert.deepEqual(r.ejemplos, ["María"]);
    assert.deepEqual(desdeComponentes(null), { encabezado: null, cuerpo: "", pie: null, botones: [], ejemplos: [] });
  });
});

describe("resolverVariables", () => {
  const vars = [
    { campo: "primer_nombre" as const, ejemplo: "María" },
    { campo: "tienda" as const, ejemplo: "Bella Moda" },
    { campo: "manual" as const, ejemplo: "Crema", etiqueta: "Producto" },
  ];
  it("saca los datos de la ficha y de lo escrito al enviar", () => {
    const r = resolverVariables(vars, { nombre: "Ana López", tienda: "Mi Tienda" }, ["", "", "  Crema\nreparadora "]);
    assert.deepEqual(r, { valores: ["Ana", "Mi Tienda", "Crema reparadora"] });
  });
  it("dice qué falta", () => {
    assert.deepEqual(resolverVariables(vars, { nombre: "Ana", tienda: null }, ["", "", "x"]), { error: "Este dropshipper no tiene nombre de su tienda en el CRM." });
    assert.deepEqual(resolverVariables(vars, { nombre: null, tienda: "T" }, ["", "", "x"]), { error: "Este dropshipper no tiene primer nombre en el CRM." });
    assert.deepEqual(resolverVariables(vars, { nombre: "Ana", tienda: "T" }, []), { error: "Escribe Producto." });
  });
});

describe("lo que dice Meta", () => {
  it("traduce el estado, sin tocar lo que no cambia el estado", () => {
    assert.equal(estadoDeMeta("APPROVED"), "aprobada");
    assert.equal(estadoDeMeta("pending"), "pendiente");
    assert.equal(estadoDeMeta("IN_APPEAL"), "pendiente");
    assert.equal(estadoDeMeta("REJECTED"), "rechazada");
    assert.equal(estadoDeMeta("PAUSED"), "pausada");
    assert.equal(estadoDeMeta("DISABLED"), "deshabilitada");
    assert.equal(estadoDeMeta("REINSTATED"), "aprobada");
    assert.equal(estadoDeMeta("FLAGGED"), null);
    assert.equal(estadoDeMeta("DELETED"), null);
    assert.equal(estadoDeMeta(undefined), null);
  });
  it("traduce la calidad y el límite", () => {
    assert.equal(calidadDeMeta("GREEN"), "alta");
    assert.equal(calidadDeMeta("YELLOW"), "media");
    assert.equal(calidadDeMeta("RED"), "baja");
    assert.equal(calidadDeMeta("UNKNOWN"), "pendiente");
    assert.equal(calidadDeMeta("otra"), null);
    assert.equal(textoLimite("TIER_10K"), "10.000");
    assert.equal(textoLimite("TIER_UNLIMITED"), "Sin límite");
    assert.equal(textoLimite("TIER_NOT_SET"), null);
  });
  it("«en-US» y «en_US» son el mismo idioma", () => {
    assert.equal(normalizarIdioma("en-US"), normalizarIdioma("en_US"));
    assert.equal(normalizarIdioma("es"), "es");
  });
  it("lee la lista de plantillas de Meta y se salta lo incompleto", () => {
    const l = leerListaMeta([
      {
        id: 123,
        name: "retomar_compra",
        language: "es",
        status: "REJECTED",
        category: "MARKETING",
        rejected_reason: "INVALID_FORMAT",
        quality_score: { score: "YELLOW" },
        components: [{ type: "BODY", text: "Hola {{1}}", example: { body_text: [["Ana"]] } }],
      },
      { id: 9, status: "APPROVED" },
      { name: "sin_id" },
    ]);
    assert.equal(l.length, 1);
    assert.deepEqual({ ...l[0], ejemplos: undefined }, {
      metaId: "123", nombre: "retomar_compra", idioma: "es", estado: "rechazada", categoria: "marketing", calidad: "media", motivo: "INVALID_FORMAT",
      encabezado: null, cuerpo: "Hola {{1}}", pie: null, botones: [], ejemplos: undefined,
    });
    assert.equal(leerListaMeta([{ id: 1, name: "a", rejected_reason: "NONE" }])[0].motivo, null);
    assert.deepEqual(leerListaMeta(undefined), []);
  });
});

describe("plantillas sugeridas", () => {
  it("son 10 (5 para retomar, 3 de aviso de llegada, 1 interna y 1 de primer contacto), con nombres distintos que acepta Meta", () => {
    assert.equal(PLANTILLAS_SUGERIDAS.length, 10);
    assert.equal(PLANTILLAS_SUGERIDAS.filter((p) => p.grupo === "retomar").length, 5);
    assert.equal(PLANTILLAS_SUGERIDAS.filter((p) => p.grupo === "interno").length, 1);
    assert.equal(PLANTILLAS_SUGERIDAS.filter((p) => p.grupo === "primer_contacto").length, 1);
    assert.equal(new Set(PLANTILLAS_SUGERIDAS.map((p) => p.nombre)).size, 10);
    assert.equal(new Set(PLANTILLAS_SUGERIDAS.map((p) => p.clave)).size, 10);
  });
  for (const p of PLANTILLAS_SUGERIDAS) {
    it(`${p.nombre}: pasa la revisión sin errores ni avisos`, () => {
      const r = validarPlantilla({ nombre: p.nombre, idioma: "es", categoria: p.categoria, encabezado: null, cuerpo: p.cuerpo, pie: null, botones: p.botones, variables: p.variables });
      assert.deepEqual(r, { errores: [], avisos: [] });
      assert.equal(p.variables.length, ranurasUnicas(p.cuerpo).length);
    });
  }
  it("las de retomar una conversación son Marketing: así las trata Meta", () => {
    for (const p of PLANTILLAS_SUGERIDAS.filter((x) => x.grupo === "retomar" && x.clave !== "seguimiento_consulta")) assert.equal(p.categoria, "marketing");
    assert.equal(PLANTILLAS_SUGERIDAS.find((p) => p.clave === "seguimiento_consulta")?.categoria, "utility");
  });
  it("todas dejan decir que no", () => {
    for (const p of PLANTILLAS_SUGERIDAS.filter((x) => x.categoria === "marketing")) assert.ok(p.botones.some((b) => /\bno\b/i.test(b)), p.nombre);
  });
});

describe("plantilla de primer contacto", () => {
  it("lleva botón para aceptar y para rechazar, el nombre del asesor y el motivo", () => {
    const p = PLANTILLAS_SUGERIDAS.find((x) => x.clave === "primer_contacto")!;
    assert.deepEqual(p.botones, ["Sí, escríbeme", "No, gracias"]);
    assert.ok(p.botones.some((b) => /\bno\b/i.test(b)));
    assert.deepEqual(p.variables.map((v) => v.campo), ["primer_nombre", "manual", "manual"]);
    assert.equal(p.categoria, "utility");
  });
});

describe("plantillas de aviso de llegada", () => {
  it("son tres y de Utilidad: responden a algo que el cliente pidió y no promocionan", () => {
    assert.deepEqual(PLANTILLAS_DE_LLEGADA.map((p) => p.clave), ["aviso_llegada_producto", "aviso_llegada_varios", "aviso_llegada_cambio_fecha"]);
    for (const p of PLANTILLAS_DE_LLEGADA) assert.equal(p.categoria, "utility", p.nombre);
  });
  it("el producto y la fecha se escriben al enviar; el nombre sale solo", () => {
    for (const p of PLANTILLAS_DE_LLEGADA) {
      assert.equal(p.variables[0].campo, "primer_nombre", p.nombre);
      assert.ok(p.variables.slice(1).every((v) => v.campo === "manual" && v.etiqueta), p.nombre);
    }
  });
  it("ninguna invita a comprar ni a volver: no se confunden con Marketing", () => {
    for (const p of PLANTILLAS_DE_LLEGADA) assert.ok(!/descuento|oferta|promoci|aprovecha|compra ahora/i.test(p.cuerpo), p.nombre);
  });
});

describe("espera entre plantillas", () => {
  const ahora = new Date("2026-10-28T12:00:00Z");
  it("dos minutos entre una plantilla y otra", () => {
    assert.equal(segundosDeEspera("2026-10-28T11:59:00Z", ahora), 60);
    assert.equal(segundosDeEspera("2026-10-28T11:58:00Z", ahora), 0);
    assert.equal(segundosDeEspera("2026-10-28T11:30:00Z", ahora), 0);
    assert.equal(segundosDeEspera("2026-10-28T11:59:59.500Z", ahora), 120 - 0);
  });
  it("sin envío anterior o con una fecha rara no hay que esperar", () => {
    assert.equal(segundosDeEspera(null, ahora), 0);
    assert.equal(segundosDeEspera("no es fecha", ahora), 0);
  });
  it("lo dice en segundos o en minutos", () => {
    assert.equal(textoEspera(45), "45 segundos");
    assert.equal(textoEspera(89), "89 segundos");
    assert.equal(textoEspera(120), "2 minutos");
  });
});
