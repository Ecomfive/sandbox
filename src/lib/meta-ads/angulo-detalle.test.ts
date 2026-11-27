import assert from "node:assert/strict";
import { test } from "node:test";
import { cualesParaIA, detallesDe, enComun, nombreConTemas, nombreDeAngulo, temasDe, textoDeDetalles } from "./angulo-detalle";
import { analizarHistorico, type CampanaHist, type VideoHist } from "./historico";
import { sinResultados, type Resultados } from "./metricas";
import { compararGanadores, rasgosDeVideo, type Entidad } from "./rasgos-ganadores";

const r = (o: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...o });

test("una táctica general se nombra con su detalle; un ángulo concreto, no", () => {
  assert.equal(nombreDeAngulo("Antes y después", "Manchas en la cara"), "Antes y después · manchas en la cara");
  assert.equal(nombreDeAngulo("Antes y después", ""), "Antes y después");
  assert.equal(nombreDeAngulo("Detox de colon", "algo"), "Detox de colon");
  assert.equal(nombreDeAngulo(null, "algo"), null);
  assert.equal(nombreConTemas("Experto o autoridad", ["urólogo, próstata", "dermatóloga, acné", "nutricionista"]), "Experto o autoridad (urólogo, próstata, dermatóloga, acné y 1 más)");
  assert.equal(nombreConTemas("Caída del cabello", ["x"]), "Caída del cabello");
});

test("los temas se juntan sin importar mayúsculas, con cuántos videos y lo que falta", () => {
  const v = (detalle: string | null, gasto: number) => ({ angulo: "Antes y después", detalle, gasto, compras: 1 });
  const l = detallesDe([v("Manchas en la cara", 10), v("manchas en la cara", 5), v("Próstata", 40), v(null, 100), v("Várices", 1), v("Peso", 2)]);
  assert.deepEqual(l.map((d) => `${d.detalle || "(sin)"} ${d.videos} ${d.gasto}`), ["próstata 1 40", "manchas en la cara 2 15", "peso 1 2", "várices 1 1", "(sin) 1 100"]);
  assert.equal(textoDeDetalles(l, 2), "próstata (1 video), manchas en la cara (2 videos) y 2 temas más; 1 video sin detalle todavía");
  assert.equal(temasDe("Detox de colon", [v("x", 1)]), null);
});

test("lo común: el tema siempre se dice; lo demás solo si se repite", () => {
  const c = enComun(
    [
      { detalle: "manchas", gancho: "pregunta", formato: "testimonio", cta: "comprar" },
      { detalle: "acné", gancho: "pregunta", formato: "demostración", cta: null },
      { detalle: null, gancho: "oferta", formato: "UGC", cta: null },
    ],
    { conTema: true },
  );
  assert.deepEqual(c.map((x) => `${x.titulo}: ${x.texto}`), ["De qué son: acné (1 de 2), manchas (1 de 2)", "Gancho: pregunta (2 de 3)"]);
});

test("el caso de «Antes y después»: peor en la semana y mejor en el mes dice cuándo, de qué es y cuáles", () => {
  const ventanas = (semPrev: [number, number], semRec: [number, number], mesPrev: [number, number], mesRec: [number, number]) => ({
    semana: { prev: r({ gasto: semPrev[0], compras: semPrev[1] }), rec: r({ gasto: semRec[0], compras: semRec[1] }) },
    mes: { prev: r({ gasto: mesPrev[0], compras: mesPrev[1] }), rec: r({ gasto: mesRec[0], compras: mesRec[1] }) },
  });
  const campana: CampanaHist = { id: "c1", nombre: "PA | NAD | CBO", producto: "NAD", clave: "NAD", familia: "suplemento", activa: true, etapa: null, estructura: "CBO", puja: null, angulo: "Antes y después", tope: 10, total: r({ gasto: 1400, compras: 150 }), v: ventanas([224, 30], [258, 21], [1112, 100], [1128, 136]) };
  const video = (id: string, detalle: string, v: CampanaHist["v"]): VideoHist => ({ id, nombre: `Video ${id}`, producto: "NAD", clave: "NAD", familia: "suplemento", angulo: "Antes y después", detalle, ganchoTipo: "pregunta", formato: "testimonio", ctaTipo: null, tope: 10, total: r({ gasto: 300, compras: 30 }), v, campanas: ["c1"] });
  const a = analizarHistorico({
    campanas: [campana],
    videos: [video("peor", "Manchas en la cara", ventanas([100, 20], [150, 8], [500, 40], [500, 70])), video("bien", "Próstata", ventanas([100, 10], [100, 15], [500, 60], [500, 62]))],
    productos: [],
    desde: "2026-09-01",
    hasta: "2026-11-25",
  });
  const semana = a.hallazgos.find((h) => h.id === "tendencia:Ángulo:Antes y después:semana")!;
  const mes = a.hallazgos.find((h) => h.id === "tendencia:Ángulo:Antes y después:mes")!;
  assert.match(semana.titulo, /empeoró en la última semana/);
  assert.match(mes.titulo, /mejoró en el último mes/);
  assert.match(semana.detalle, /En el último mes frente al mes anterior, en cambio, mejoró/i);
  assert.equal(semana.quienes?.deQue, "De qué son los que empeoraron: manchas en la cara (1 video).");
  assert.deepEqual(semana.quienes?.videos.map((v) => `${v.id} ${v.antes} ${v.ahora} ${v.detalle}`), ["peor 5 18.75 Manchas en la cara"]);
  assert.deepEqual(semana.quienes?.campanas.map((c) => c.id), ["c1"]);
  assert.equal(mes.quienes?.deQue, "De qué son los que mejoraron: manchas en la cara (1 video).");
  assert.match(a.tendencias.find((t) => t.nivel === "Ángulo" && t.ventana === "semana")!.deQue ?? "", /manchas en la cara/);
  assert.match(a.rankings.angulos[0].deQue ?? "", /manchas en la cara \(1 video\)/);
  const ia = cualesParaIA(semana) as { de_que_son: string; videos: { nombre: string }[] };
  assert.match(ia.de_que_son, /manchas/);
  assert.equal(ia.videos[0].nombre, "Video peor");
  assert.deepEqual(cualesParaIA({}), {});
});

test("en «qué tienen en común», una táctica general dice de qué es en los que funcionaron", () => {
  const entidad = (id: string, angulo: string, detalle: string, compras: number): Entidad => ({
    id,
    nombre: id,
    rasgos: rasgosDeVideo({ angulo, detalle, ganchoTipo: null, formato: null, ctaTipo: null, duracionS: null, ctaSegundo: null, oferta: null, recursos: [] }),
    r: r({ gasto: 100, compras, impresiones: 1000, clics: compras ? 50 : 5 }),
    tope: 10,
  });
  const ganan = ["Manchas", "Manchas", "Acné", "Acné", "Manchas"].map((d, i) => entidad(`g${i}`, "Antes y después", d, 20));
  const resto = [0, 1, 2, 3, 4, 5].map((i) => entidad(`p${i}`, "Alivio de várices", "", 0));
  const c = compararGanadores([...ganan, ...resto], "ctr")!;
  const angulo = c.comunes.find((x) => x.dimension === "Ángulo")!;
  assert.equal(angulo.valor, "Antes y después (manchas, acné)");
  assert.ok(c.recomendaciones.some((t) => t.includes("Antes y después (manchas, acné)")));
});
