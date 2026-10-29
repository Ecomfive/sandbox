import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agruparPorDia,
  conversacionParaIA,
  diaDePanama,
  diasPorAnalizar,
  frecuenciaDeMotivos,
  MAX_LETRAS_MENSAJE,
  MAX_RESUMEN,
  normalizarAnalisis,
  pedidoActividad,
  situacionDelCliente,
  textoParaIA,
  type MensajeActividad,
} from "./actividad";

const m = (id: string, direccion: string, momento: string, texto: string | null = "hola", tipo = "texto"): MensajeActividad => ({ id, direccion, tipo, texto, momento });

describe("día de Panamá", () => {
  it("resta las 5 horas de Panamá: la medianoche de Panamá es a las 05:00 UTC", () => {
    assert.equal(diaDePanama("2026-10-28T04:59:00Z"), "2026-10-27");
    assert.equal(diaDePanama("2026-10-28T05:00:00Z"), "2026-10-28");
  });
});

describe("agrupar por día", () => {
  const mensajes = [
    m("3", "saliente", "2026-10-28T15:00:00Z", "Ya lo reviso"),
    m("1", "entrante", "2026-10-27T20:00:00Z", "¿Dónde está mi guía?"),
    m("2", "nota", "2026-10-27T21:00:00Z", "nota privada del equipo"),
    m("4", "entrante", "2026-10-28T14:00:00Z", "Hola"),
  ];
  const dias = agruparPorDia(mensajes);

  it("deja los días del más viejo al más nuevo y cada día en orden de hora", () => {
    assert.deepEqual(dias.map((d) => d.dia), ["2026-10-27", "2026-10-28"]);
    assert.deepEqual(dias[1].mensajes.map((x) => x.id), ["4", "3"]);
  });

  it("no cuenta las notas privadas del equipo", () => {
    assert.equal(dias[0].mensajes.length, 1);
  });

  it("la firma cambia cuando llega otro mensaje, y solo entonces hay que volver a analizar", () => {
    const igual = agruparPorDia(mensajes);
    const guardados = new Map(dias.map((d) => [d.dia, d.firma]));
    assert.equal(diasPorAnalizar(igual, guardados).length, 0);
    const conNuevo = agruparPorDia([...mensajes, m("5", "entrante", "2026-10-28T16:00:00Z", "¿Y entonces?")]);
    assert.deepEqual(diasPorAnalizar(conNuevo, guardados).map((d) => d.dia), ["2026-10-28"]);
    assert.deepEqual(diasPorAnalizar(dias, new Map()).map((d) => d.dia), ["2026-10-27", "2026-10-28"]);
  });
});

describe("lo que se le manda a la IA", () => {
  it("quita teléfonos, correos y enlaces", () => {
    const t = textoParaIA(m("1", "entrante", "2026-10-27T20:00:00Z", "Escríbeme al +507 6123-4567 o a ana@correo.com, mira https://tienda.com/p/1?x=2"));
    assert.ok(!/6123|ana@|tienda\.com/.test(t), t);
    assert.ok(t.includes("[número]") && t.includes("[correo]") && t.includes("[enlace]"));
  });

  it("no confunde un número de pedido corto con un teléfono", () => {
    assert.equal(textoParaIA(m("1", "entrante", "2026-10-27T20:00:00Z", "Mi pedido 12345 no llega")), "Mi pedido 12345 no llega");
  });

  it("describe un archivo sin texto y recorta lo largo", () => {
    assert.equal(textoParaIA(m("1", "entrante", "2026-10-27T20:00:00Z", null, "imagen")), "[mandó una foto]");
    const largo = textoParaIA(m("1", "entrante", "2026-10-27T20:00:00Z", "a".repeat(MAX_LETRAS_MENSAJE + 100)));
    assert.equal(largo.length, MAX_LETRAS_MENSAJE + 1);
  });

  it("arma un bloque por día con Cliente y Equipo", () => {
    const texto = conversacionParaIA(agruparPorDia([m("1", "entrante", "2026-10-27T20:00:00Z", "¿Dónde está mi guía?"), m("2", "saliente", "2026-10-27T20:05:00Z", "Ya la reviso")]));
    assert.equal(texto, "## 2026-10-27\nCliente: ¿Dónde está mi guía?\nEquipo: Ya la reviso");
  });

  it("el pedido lista los motivos permitidos y pide solo JSON", () => {
    const p = pedidoActividad(agruparPorDia([m("1", "entrante", "2026-10-27T20:00:00Z")]));
    assert.ok(p.instrucciones.includes("estado_guia") && p.instrucciones.includes("Responde SOLO con JSON"));
  });
});

describe("lo que devuelve la IA", () => {
  const dias = ["2026-10-27", "2026-10-28"];

  it("lee el JSON aunque venga rodeado de texto", () => {
    const r = normalizarAnalisis('Claro:\n{"dias":[{"dia":"2026-10-27","motivos":["estado_guia"],"resumen":"Preguntó por su guía","estado":"resuelta"}]}\nListo', dias);
    assert.deepEqual(r, [{ dia: "2026-10-27", motivos: ["estado_guia"], resumen: "Preguntó por su guía", estado: "resuelta" }]);
  });

  it("descarta motivos que no están en la lista, los repetidos y los días que no se pidieron", () => {
    const r = normalizarAnalisis(
      JSON.stringify({
        dias: [
          { dia: "2026-10-27", motivos: ["inventado", "queja", "queja", "retiro_pago", "devolucion", "otro"], resumen: "x", estado: "pendiente" },
          { dia: "2026-01-01", motivos: ["queja"], resumen: "fuera", estado: "resuelta" },
          { dia: "2026-10-27", motivos: ["queja"], resumen: "repetido", estado: "resuelta" },
        ],
      }),
      dias,
    );
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].motivos, ["queja", "retiro_pago", "devolucion"]);
  });

  it("un estado inválido es «sin consulta», sin motivos queda «otro» y el resumen se recorta; sin resumen se descarta", () => {
    const r = normalizarAnalisis(
      JSON.stringify({ dias: [{ dia: "2026-10-27", motivos: [], resumen: "r".repeat(MAX_RESUMEN + 50), estado: "rara" }, { dia: "2026-10-28", motivos: ["queja"], resumen: "  ", estado: "resuelta" }] }),
      dias,
    );
    assert.equal(r.length, 1);
    assert.equal(r[0].estado, "sin_consulta");
    assert.deepEqual(r[0].motivos, ["otro"]);
    assert.equal(r[0].resumen.length, MAX_RESUMEN);
  });

  it("con basura devuelve una lista vacía", () => {
    assert.deepEqual(normalizarAnalisis("no sé", dias), []);
    assert.deepEqual(normalizarAnalisis("{roto", dias), []);
    assert.deepEqual(normalizarAnalisis('{"dias":"x"}', dias), []);
  });
});

describe("motivos más frecuentes", () => {
  it("cuenta los días por motivo, ordena de más a menos y no cuenta los días sin consulta", () => {
    const f = frecuenciaDeMotivos([
      { dia: "1", motivos: ["estado_guia", "queja"], estado: "resuelta" },
      { dia: "2", motivos: ["estado_guia"], estado: "pendiente" },
      { dia: "3", motivos: ["saludo"], estado: "sin_consulta" },
      { dia: "4", motivos: ["retiro_pago"], estado: "resuelta" },
    ]);
    assert.deepEqual(f.map((x) => [x.id, x.dias]), [["estado_guia", 2], ["retiro_pago", 1], ["queja", 1]]);
  });
});

describe("situación del cliente", () => {
  const ultimo = (estado: "resuelta" | "pendiente" | "sin_consulta") => ({ dia: "2026-10-28", estado, resumen: "Pidió un reembolso" });

  it("si el último mensaje es suyo, está esperando respuesta, diga lo que diga el análisis", () => {
    assert.deepEqual(situacionDelCliente("entrante", "2026-10-28T15:00:00Z", ultimo("resuelta")), { tipo: "espera", desde: "2026-10-28T15:00:00Z" });
  });

  it("si el equipo escribió pero la consulta quedó sin resolver, lo dice", () => {
    assert.deepEqual(situacionDelCliente("saliente", "2026-10-28T15:00:00Z", ultimo("pendiente")), { tipo: "sin_resolver", dia: "2026-10-28", resumen: "Pidió un reembolso" });
  });

  it("si no, está al día", () => {
    assert.deepEqual(situacionDelCliente("saliente", "2026-10-28T15:00:00Z", ultimo("resuelta")), { tipo: "al_dia" });
    assert.deepEqual(situacionDelCliente(null, null, null), { tipo: "al_dia" });
  });
});
