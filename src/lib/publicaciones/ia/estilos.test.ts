import assert from "node:assert/strict";
import { test } from "node:test";
import { cuerpoMensaje, imagenParaClaude } from "./anthropic";
import { promptFoto } from "./asistente";
import { cuerpoRespuesta } from "./openai";
import { elegirEstilos, leerImagenModelo, MAX_BYTES_IMAGEN_MODELO, normalizarEstilo, pedidoEstiloImagen, textoEstilos, type EstiloImagen } from "./estilos";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const url = (mime: string, bytes: number[], relleno = 0) => `data:${mime};base64,${Buffer.from([...bytes, ...new Array(relleno).fill(1)]).toString("base64")}`;

const estilo = (extra: Partial<EstiloImagen>): EstiloImagen => ({ id: "1", nombre: "Fondo crema", tipo: "general", guia: "Fondo crema, luz suave desde la izquierda.", activo: true, ...extra });

test("una imagen modelo se comprueba por su firma y se vuelve a armar con su tipo real", () => {
  const png = leerImagenModelo(url("image/jpeg", PNG)); // dice jpeg, es png
  assert.ok("dataUrl" in png);
  assert.match(png.dataUrl, /^data:image\/png;base64,/);
  assert.ok("dataUrl" in leerImagenModelo(url("image/jpeg", JPG)));
  assert.ok("dataUrl" in leerImagenModelo(url("image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])));
});

test("se rechaza lo que no es una imagen válida, un GIF, algo muy pesado o un texto", () => {
  assert.ok("error" in leerImagenModelo(url("image/png", [0x3c, 0x73, 0x76, 0x67]))); // «<svg» disfrazado
  assert.ok("error" in leerImagenModelo(url("image/gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])));
  assert.ok("error" in leerImagenModelo(url("image/png", PNG, MAX_BYTES_IMAGEN_MODELO)));
  assert.ok("error" in leerImagenModelo("hola"));
  assert.ok("error" in leerImagenModelo("data:text/html;base64,PGgxPg=="));
  assert.ok("error" in leerImagenModelo(42));
});

test("el pedido no transcribe textos ni describe el producto y dice para qué fotos es", () => {
  const p = pedidoEstiloImagen("Beneficios", 2);
  assert.match(p.instrucciones, /NO lo transcribas/);
  assert.match(p.instrucciones, /No describas el producto concreto/);
  assert.match(p.instrucciones, /Describe la tipografía sin nombrar la fuente exacta/);
  assert.match(p.instrucciones, /"tipografia"/);
  assert.match(p.texto, /2 imágenes modelo adjuntas, para fotos de tipo «Beneficios»/);
  assert.match(pedidoEstiloImagen(null, 1).texto, /Imagen modelo adjunta, para cualquier tipo de foto/);
});

test("la guía sale de lo que devuelve la IA, una línea por campo y con tope", () => {
  const g = normalizarEstilo('```json\n{"estilo":"Limpio y cálido","composicion":"Producto centrado","colores":"","luz":"Suave","elementos":"x".repeat(400)}\n```'.replace('"x".repeat(400)', `"${"x".repeat(400)}"`));
  assert.ok(g);
  assert.match(g, /^Estilo: Limpio y cálido\nComposición: Producto centrado\nLuz: Suave\nElementos gráficos: x{300}$/);
  assert.equal(normalizarEstilo('{"estilo":"solo uno"}'), null);
  assert.equal(normalizarEstilo("sin json"), null);
});

test("a una foto le valen las guías generales y las de su tipo, activas y las más nuevas (hasta 3)", () => {
  const lista = [
    estilo({ id: "a", nombre: "A", tipo: "beneficios" }),
    estilo({ id: "b", nombre: "B", tipo: "uso" }),
    estilo({ id: "c", nombre: "C", activo: false }),
    estilo({ id: "d", nombre: "D" }),
    estilo({ id: "e", nombre: "E" }),
    estilo({ id: "f", nombre: "F" }),
  ];
  assert.deepEqual(elegirEstilos(lista, "beneficios").map((e) => e.id), ["a", "d", "e"]);
  assert.deepEqual(elegirEstilos(lista, "uso").map((e) => e.id), ["b", "d", "e"]);
  assert.deepEqual(elegirEstilos(lista).map((e) => e.id), ["a", "b", "d"]); // sin tipo (plan de fotos): las más nuevas de todas
  assert.equal(textoEstilos([], "uso"), "");
  assert.equal(textoEstilos(undefined), "");
});

test("la guía llega al pedido de la foto; en una foto sin texto deja claro que no lleva letras y en una informativa imita el reparto del texto", () => {
  const p = promptFoto({ nombre: "Gomitas" }, { tipo: "uso", instruccion: "Escena de energía" }, 1, [estilo({ tipo: "general" })]);
  assert.match(p, /Estilo visual del equipo/);
  assert.match(p, /«Fondo crema»\nFondo crema, luz suave/);
  assert.match(p, /no lleva letras/);
  const info = promptFoto({ nombre: "Gomitas" }, { tipo: "beneficios", instruccion: "Escena de energía", textos: ["Más energía"] }, 1, [estilo({ tipo: "beneficios" })]);
  assert.match(info, /Imita también cómo se reparte y se ve el texto/);
  assert.doesNotMatch(info, /no lleva letras/);
  assert.doesNotMatch(promptFoto({ nombre: "Gomitas" }, { tipo: "uso", instruccion: "x" }, 1, [estilo({ tipo: "beneficios" })]), /Estilo visual del equipo/);
  assert.doesNotMatch(promptFoto({ nombre: "Gomitas" }, { tipo: "uso", instruccion: "x" }, 1), /Estilo visual del equipo/);
});

test("una imagen que no se guarda viaja como base64 a OpenAI y a Claude; una pública, por su dirección", () => {
  const dato = "data:image/png;base64,AAAA";
  const entrada = { instrucciones: "i", texto: "t", imagenes: [dato, "https://x.test/a.jpg"] };
  const claude = cuerpoMensaje("m", entrada, false).messages[0].content as { type: string; source?: unknown }[];
  assert.deepEqual(claude[1].source, { type: "base64", media_type: "image/png", data: "AAAA" });
  assert.deepEqual(claude[2].source, { type: "url", url: "https://x.test/a.jpg" });
  assert.deepEqual(imagenParaClaude("https://x.test/b.png").source, { type: "url", url: "https://x.test/b.png" });
  const openai = cuerpoRespuesta("gpt-4.1-mini", entrada, false).input[0].content as { type: string; image_url?: string }[];
  assert.equal(openai[1].image_url, dato);
});

test("la guía de una imagen modelo también guarda la tipografía", () => {
  const g = normalizarEstilo('{"estilo":"Limpio","tipografia":"Sans-serif geométrica en negrita, título grande y texto de apoyo más pequeño, en gris oscuro"}');
  assert.equal(g, "Estilo: Limpio\nTipografía: Sans-serif geométrica en negrita, título grande y texto de apoyo más pequeño, en gris oscuro");
});
