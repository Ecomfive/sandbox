import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizarHtml } from "./sanitizar-html";

// Se corre con: npm run test:seguridad

/** Cargas de ataque habituales: ninguna debe dejar código ejecutable en el resultado. */
const ATAQUES: [string, string][] = [
  ["script", "<script>alert(1)</script>"],
  ["script partido", "<scr<script>ipt>alert(1)</scr</script>ipt>"],
  ["img con onerror", '<img src=x onerror="alert(1)">'],
  ["img con barra en vez de espacio", "<img/src=x/onerror=alert(1)>"],
  ["svg con onload", "<svg/onload=alert(1)>"],
  ["svg completo", '<svg><script>alert(1)</script></svg>'],
  ["body con onload", "<body onload=alert(1)>"],
  ["iframe", '<iframe src="https://evil.example"></iframe>'],
  ["object y embed", '<object data="x.swf"></object><embed src="x.swf">'],
  ["enlace javascript", '<a href="javascript:alert(1)">x</a>'],
  ["enlace javascript en mayúsculas", '<a href="JaVaScRiPt:alert(1)">x</a>'],
  ["enlace javascript con tabulación", '<a href="jav\tascript:alert(1)">x</a>'],
  ["enlace javascript con entidad", '<a href="&#106;avascript:alert(1)">x</a>'],
  ["enlace javascript con espacio inicial", '<a href="  javascript:alert(1)">x</a>'],
  ["enlace data html", '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
  ["img con data", '<img src="data:image/svg+xml,<svg onload=alert(1)>">'],
  ["form con formaction", '<form action="javascript:alert(1)"><button formaction="javascript:alert(1)">x</button></form>'],
  ["details ontoggle", "<details open ontoggle=alert(1)>x</details>"],
  ["math con enlace", '<math><mi xlink:href="data:x,<script>alert(1)</script>">x</mi></math>'],
  ["style con expresión", '<p style="background:url(javascript:alert(1))">x</p>'],
  ["style etiqueta", "<style>@import 'https://evil.example/x.css'</style>"],
  ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ["base", '<base href="https://evil.example/">'],
  ["link", '<link rel="stylesheet" href="https://evil.example/x.css">'],
  ["on* con comillas raras", "<div onmouseover=\"alert(1)\" onclick='alert(2)'>x</div>"],
];

for (const [nombre, ataque] of ATAQUES) {
  test(`neutraliza: ${nombre}`, () => {
    const limpio = sanitizarHtml(ataque);
    assert.doesNotMatch(limpio, /<\s*(script|iframe|object|embed|svg|math|style|meta|base|link|form)\b/i, `etiqueta peligrosa en: ${limpio}`);
    assert.doesNotMatch(limpio, /\son\w+\s*=/i, `atributo on* en: ${limpio}`);
    assert.doesNotMatch(limpio, /javascript\s*:/i, `javascript: en: ${limpio}`);
    assert.doesNotMatch(limpio, /\bdata\s*:/i, `data: en: ${limpio}`);
    assert.doesNotMatch(limpio, /url\s*\(/i, `url() en: ${limpio}`);
  });
}

test("conserva el formato normal de una descripción", () => {
  const html = '<h2>Título</h2><p>Texto con <b>negrita</b>, <i>cursiva</i> y <u>subrayado</u>.</p><ul><li>Uno</li><li>Dos</li></ul><blockquote>Cita</blockquote>';
  assert.equal(sanitizarHtml(html), html);
});

test("conserva un enlace https y le agrega rel seguro", () => {
  const limpio = sanitizarHtml('<a href="https://ecomfive.io/producto" target="_blank">ver</a>');
  assert.match(limpio, /href="https:\/\/ecomfive\.io\/producto"/);
  assert.match(limpio, /rel="noopener noreferrer nofollow"/);
  assert.match(limpio, /target="_blank"/);
});

test("conserva una imagen https y quita su onerror", () => {
  const limpio = sanitizarHtml('<img src="https://cdn.example.com/a.jpg" alt="Foto" onerror="alert(1)">');
  assert.match(limpio, /src="https:\/\/cdn\.example\.com\/a\.jpg"/);
  assert.match(limpio, /alt="Foto"/);
  assert.doesNotMatch(limpio, /onerror/);
});

test("conserva solo los estilos de texto permitidos", () => {
  const limpio = sanitizarHtml('<p style="text-align:center;color:#ff0000;position:fixed;background:url(x)">x</p>');
  assert.match(limpio, /text-align:center/);
  assert.match(limpio, /color:#ff0000/);
  assert.doesNotMatch(limpio, /position|background|url/);
});

test("un texto vacío o sin etiquetas queda igual", () => {
  assert.equal(sanitizarHtml(""), "");
  assert.equal(sanitizarHtml("Solo texto"), "Solo texto");
});
