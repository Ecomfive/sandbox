import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agruparPorDia,
  conversacionParaIA,
  diaDePanama,
  diasPorAnalizar,
  etiquetaDeMotivo,
  frecuenciaDeMotivos,
  interesPorProducto,
  MAX_DIAS_POR_PEDIDO,
  MAX_LETRAS_MENSAJE,
  MAX_PRODUCTOS_POR_DIA,
  MAX_RESUMEN,
  MOTIVOS,
  normalizarAnalisis,
  normalizarPerfil,
  pedidoActividad,
  pedidoPerfil,
  productosDelAnalisis,
  situacionDelCliente,
  textoParaIA,
  tramosDeDias,
  VERSION_ANALISIS,
  type DiaGuardado,
  type MensajeActividad,
} from "./actividad";

const m = (id: string, direccion: string, momento: string, texto: string | null = "hola", tipo = "texto"): MensajeActividad => ({ id, direccion, tipo, texto, momento });
const guardado = (firma: string, version = VERSION_ANALISIS): DiaGuardado => ({ firma, version });

describe("motivos", () => {
  it("los ids no se repiten y cada uno tiene su etiqueta", () => {
    assert.equal(new Set(MOTIVOS.map((x) => x.id)).size, MOTIVOS.length);
    assert.ok(MOTIVOS.every((x) => x.etiqueta.length > 5));
  });

  it("los motivos de la primera versión se siguen leyendo con su etiqueta", () => {
    assert.equal(etiquetaDeMotivo("producto_stock"), "Producto o stock");
    assert.equal(etiquetaDeMotivo("llegada_mercancia"), "Preguntó cuándo llega mercancía");
    assert.equal(etiquetaDeMotivo("desconocido"), "desconocido");
  });
});

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
    const guardados = new Map(dias.map((d) => [d.dia, guardado(d.firma)]));
    assert.equal(diasPorAnalizar(agruparPorDia(mensajes), guardados).length, 0);
    const conNuevo = agruparPorDia([...mensajes, m("5", "entrante", "2026-10-28T16:00:00Z", "¿Y entonces?")]);
    assert.deepEqual(diasPorAnalizar(conNuevo, guardados).map((d) => d.dia), ["2026-10-28"]);
    assert.deepEqual(diasPorAnalizar(dias, new Map()).map((d) => d.dia), ["2026-10-27", "2026-10-28"]);
  });

  it("un día analizado con una versión anterior se vuelve a analizar aunque no haya mensajes nuevos", () => {
    const guardados = new Map(dias.map((d) => [d.dia, guardado(d.firma, VERSION_ANALISIS - 1)]));
    assert.equal(diasPorAnalizar(dias, guardados).length, 2);
  });
});

describe("tramos de días", () => {
  it("parte la lista en tramos, el de los días más nuevos primero y cada tramo en orden cronológico", () => {
    const dias = Array.from({ length: MAX_DIAS_POR_PEDIDO * 2 + 3 }, (_, i) => i);
    const tramos = tramosDeDias(dias);
    assert.equal(tramos.length, 3);
    assert.deepEqual(tramos[0], dias.slice(-MAX_DIAS_POR_PEDIDO));
    assert.deepEqual(tramos[2], [0, 1, 2]);
    assert.equal(tramos.flat().length, dias.length);
  });

  it("una lista vacía no da tramos", () => {
    assert.deepEqual(tramosDeDias([]), []);
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

  it("el pedido lista los motivos permitidos, pide los productos y pide solo JSON", () => {
    const p = pedidoActividad(agruparPorDia([m("1", "entrante", "2026-10-27T20:00:00Z")]));
    assert.ok(p.instrucciones.includes("llegada_mercancia") && p.instrucciones.includes("Responde SOLO con JSON"));
    assert.ok(p.instrucciones.includes('"productos"') && p.instrucciones.includes("Cutting Mix"));
  });
});

describe("lo que devuelve la IA", () => {
  const dias = ["2026-10-27", "2026-10-28"];

  it("lee el JSON aunque venga rodeado de texto, con sus productos", () => {
    const r = normalizarAnalisis('Claro:\n{"dias":[{"dia":"2026-10-27","motivos":["estado_guia"],"productos":["Cutting Mix"],"resumen":"Preguntó por su guía","estado":"resuelta"}]}\nListo', dias);
    assert.deepEqual(r, [{ dia: "2026-10-27", motivos: ["estado_guia"], productos: ["Cutting Mix"], resumen: "Preguntó por su guía", estado: "resuelta" }]);
  });

  it("descarta motivos que no están en la lista, los repetidos y los días que no se pidieron", () => {
    const r = normalizarAnalisis(
      JSON.stringify({
        dias: [
          { dia: "2026-10-27", motivos: ["inventado", "queja_servicio", "queja_servicio", "retiro_estado", "devolucion_solicitud", "otro"], resumen: "x", estado: "pendiente" },
          { dia: "2026-01-01", motivos: ["queja_servicio"], resumen: "fuera", estado: "resuelta" },
          { dia: "2026-10-27", motivos: ["queja_servicio"], resumen: "repetido", estado: "resuelta" },
        ],
      }),
      dias,
    );
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].motivos, ["queja_servicio", "retiro_estado", "devolucion_solicitud"]);
  });

  it("un motivo de la primera versión ya no es válido (se vuelve «otro»)", () => {
    const r = normalizarAnalisis(JSON.stringify({ dias: [{ dia: "2026-10-27", motivos: ["producto_stock"], resumen: "x", estado: "resuelta" }] }), dias);
    assert.deepEqual(r[0].motivos, ["otro"]);
  });

  it("limpia los productos: comillas, espacios, repetidos, vacíos y tope", () => {
    const productos = [" «Cutting   Mix» ", "cutting mix", "", "a", 5, "Aceite de semilla de calabaza.", ...Array.from({ length: 10 }, (_, i) => `Producto ${i}`)];
    const r = normalizarAnalisis(JSON.stringify({ dias: [{ dia: "2026-10-27", motivos: ["llegada_mercancia"], productos, resumen: "x", estado: "resuelta" }] }), dias);
    assert.equal(r[0].productos.length, MAX_PRODUCTOS_POR_DIA);
    assert.deepEqual(r[0].productos.slice(0, 3), ["Cutting Mix", "cutting mix", "Aceite de semilla de calabaza"]);
  });

  it("sin productos queda una lista vacía", () => {
    const r = normalizarAnalisis(JSON.stringify({ dias: [{ dia: "2026-10-27", motivos: ["saludo"], resumen: "Saludó", estado: "sin_consulta" }] }), dias);
    assert.deepEqual(r[0].productos, []);
  });

  it("un estado inválido es «sin consulta», sin motivos queda «otro» y el resumen se recorta; sin resumen se descarta", () => {
    const r = normalizarAnalisis(
      JSON.stringify({ dias: [{ dia: "2026-10-27", motivos: [], resumen: "r".repeat(MAX_RESUMEN + 50), estado: "rara" }, { dia: "2026-10-28", motivos: ["queja_servicio"], resumen: "  ", estado: "resuelta" }] }),
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

describe("productos del análisis", () => {
  const catalogo = [
    { id: "1", nombre: "Cutting Mix", codigo: "CUTTING/MIX" },
    { id: "2", nombre: "Aceite de Semilla de Calabaza (180 Softgels)", codigo: "ACEITE/SEMILLA/CALABAZA" },
  ];

  it("usa el nombre del catálogo cuando lo reconoce y deja el resto como lo escribió la IA", () => {
    assert.deepEqual(productosDelAnalisis(["cutting mix", "semilla de calabaza", "Crema Nida"], catalogo), ["Cutting Mix", "Aceite de Semilla de Calabaza (180 Softgels)", "Crema Nida"]);
  });

  it("no repite un producto que se nombró de dos maneras", () => {
    assert.deepEqual(productosDelAnalisis(["Cutting Mix", "cutting mix"], catalogo), ["Cutting Mix"]);
  });
});

describe("motivos más frecuentes", () => {
  it("cuenta los días por motivo, ordena de más a menos y no cuenta los días sin consulta", () => {
    const f = frecuenciaDeMotivos([
      { dia: "1", motivos: ["estado_guia", "queja_servicio"], estado: "resuelta" },
      { dia: "2", motivos: ["estado_guia"], estado: "pendiente" },
      { dia: "3", motivos: ["saludo"], estado: "sin_consulta" },
      { dia: "4", motivos: ["retiro_estado"], estado: "resuelta" },
    ]);
    assert.deepEqual(f.map((x) => [x.id, x.dias]), [["estado_guia", 2], ["retiro_estado", 1], ["queja_servicio", 1]]);
  });

  it("los motivos de la primera versión siguen contando con su etiqueta hasta que se vuelva a analizar", () => {
    const f = frecuenciaDeMotivos([
      { dia: "1", motivos: ["producto_stock"], estado: "resuelta" },
      { dia: "2", motivos: ["producto_stock"], estado: "resuelta" },
    ]);
    assert.deepEqual(f, [{ id: "producto_stock", etiqueta: "Producto o stock", dias: 2 }]);
  });
});

describe("interés por producto", () => {
  it("cuenta clientes y días por producto, sin distinguir mayúsculas, del más al menos pedido", () => {
    const r = interesPorProducto([
      { cliente: "a", productos: ["Cutting Mix", "Aceite de semilla"] },
      { cliente: "a", productos: ["cutting mix"] },
      { cliente: "b", productos: ["Cutting Mix"] },
      { cliente: "c", productos: ["Aceite de semilla"] },
    ]);
    assert.deepEqual(r, [
      { nombre: "Cutting Mix", dias: 3, clientes: 2 },
      { nombre: "Aceite de semilla", dias: 2, clientes: 2 },
    ]);
  });

  it("un producto repetido el mismo día cuenta una vez", () => {
    assert.deepEqual(interesPorProducto([{ cliente: "a", productos: ["X1", "x1"] }]), [{ nombre: "X1", dias: 1, clientes: 1 }]);
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

describe("análisis completo del cliente", () => {
  const resumenes = [
    { dia: "2026-10-28", estado: "resuelta" as const, motivos: ["llegada_mercancia"], productos: ["Cutting Mix"], resumen: "Preguntó cuándo llega el Cutting Mix" },
    { dia: "2026-10-27", estado: "pendiente" as const, motivos: ["queja_servicio"], productos: [], resumen: "Se quejó de una demora" },
  ];

  it("el pedido lleva el historial por día en orden, los mensajes recientes y la forma del JSON", () => {
    const p = pedidoPerfil(resumenes, agruparPorDia([m("1", "entrante", "2026-10-28T20:00:00Z", "¿Ya llegó el cutting?")]));
    assert.ok(p.texto.indexOf("2026-10-27") < p.texto.indexOf("2026-10-28"));
    assert.ok(p.texto.includes("Preguntó cuándo llega mercancía") && p.texto.includes("productos: Cutting Mix") && p.texto.includes("Cliente: ¿Ya llegó el cutting?"));
    assert.ok(p.instrucciones.includes('"proxima_accion"') && p.instrucciones.includes("compromisos"));
  });

  it("sin días analizados lo dice", () => {
    assert.ok(pedidoPerfil([], []).texto.includes("(sin días analizados)"));
  });

  it("lee el perfil aunque venga rodeado de texto y lo limpia", () => {
    const r = normalizarPerfil('Aquí va:\n{"perfil":" Cliente   activo que pregunta mucho por stock ","sentimiento":"molesto","urgencia":"alta","riesgo":"alto","compromisos":["Confirmar llegada","Confirmar llegada",""],"oportunidades":["Ofrecer Cutting Mix"],"proxima_accion":"Responderle hoy con la fecha"}');
    assert.deepEqual(r, {
      perfil: "Cliente activo que pregunta mucho por stock",
      sentimiento: "molesto",
      urgencia: "alta",
      riesgo: "alto",
      compromisos: ["Confirmar llegada"],
      oportunidades: ["Ofrecer Cutting Mix"],
      proximaAccion: "Responderle hoy con la fecha",
    });
  });

  it("un valor fuera de lo permitido se vuelve neutral, media o medio; las listas se recortan", () => {
    const r = normalizarPerfil(JSON.stringify({ perfil: "x", sentimiento: "furioso", urgencia: "altísima", riesgo: "nulo", compromisos: ["tarea a1", "tarea b2", "tarea c3", "tarea d4", "tarea e5", "tarea f6"], oportunidades: "no es lista" }));
    assert.equal(r?.sentimiento, "neutral");
    assert.equal(r?.urgencia, "media");
    assert.equal(r?.riesgo, "medio");
    assert.equal(r?.compromisos.length, 4);
    assert.deepEqual(r?.oportunidades, []);
    assert.equal(r?.proximaAccion, "");
  });

  it("sin perfil escrito o con basura no hay análisis", () => {
    assert.equal(normalizarPerfil('{"perfil":"  "}'), null);
    assert.equal(normalizarPerfil("nada"), null);
    assert.equal(normalizarPerfil("{roto"), null);
  });
});
