// La competencia en Drop (0.8.4, 24 nov 2026, pedido de Hernán): en app.soydrop.com/dropshipping, con la sesión de DROPSHIPPER (la de proveedor solo ve
// nuestros productos), lee todo el catálogo: cada producto con su proveedor, ID público, stock, precio al dropshipper y sugerido, foto, categoría y fecha de
// creación, y lo sube a la dirección firmada que da el sistema (Análisis de competencia y «Bajar precio» de Gestión de IDs Drop). Solo lee: no cambia nada.
// La sesión de dropshipper va en un perfil aparte de Chrome, para no pisar la de proveedor que usa «Actualizar Costa Rica».
// Es el mismo recorrido de scripts/scraping-proveedores-navegador.js › scrapingCompetenciaDrop: la vista en grilla, «Ver más productos» hasta el final y la ficha
// de cada producto (de a 4) para la categoría y la fecha.

async function leerCompetenciaDrop(subida) {
  const estado = (window.__competenciaDrop = { fase: "inicio", productos: 0, hechos: 0, inicio: new Date().toISOString(), fin: null, resultado: null, error: null });
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = performance.now();
  try {
    if (location.pathname !== "/dropshipping") throw new Error("La pestaña de Drop no está en el Catálogo: vuelve a pulsar «Actualizar».");
    // Esperar a que la página dibuje el catálogo (hasta 20 s).
    const enlaces = () => [...document.querySelectorAll('a[href^="/dropshipping/product/"]')];
    for (let i = 0; i < 100 && !enlaces().length; i++) await pausa(200);
    if (!enlaces().length) throw new Error("El Catálogo de Drop no mostró productos: revisa que la sesión esté abierta.");
    document.querySelector('button[aria-label="Vista grilla"]')?.click();
    await pausa(300);

    estado.fase = "catalogo";
    const paginas = [enlaces().length];
    for (let i = 0; i < 200; i++) {
      const mas = [...document.querySelectorAll("button")].find((b) => /Ver más productos/.test(b.innerText));
      if (!mas) break;
      const antes = enlaces().length;
      mas.click();
      let crecio = false;
      for (let j = 0; j < 80 && !crecio; j++) {
        await pausa(150);
        crecio = enlaces().length > antes;
      }
      if (!crecio) throw new Error("«Ver más productos» dejó de responder: el catálogo quedó a medias. Vuelve a pulsar «Actualizar».");
      paginas.push(enlaces().length - antes);
      estado.productos = enlaces().length;
    }

    const productos = new Map();
    for (const a of enlaces()) {
      const dropId = /\/product\/([0-9a-f]{24})/.exec(a.getAttribute("href"))?.[1];
      if (!dropId || productos.has(dropId)) continue;
      let tarjeta = a;
      while (tarjeta && !/Precio proveedor/.test(tarjeta.innerText ?? "")) tarjeta = tarjeta.parentElement;
      if (!tarjeta) continue;
      const lineas = tarjeta.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
      const i = lineas.findIndex((l) => /^ID-[A-Z0-9]+$/.test(l));
      const tras = (t) => lineas[lineas.findIndex((l) => l.startsWith(t)) + 1] ?? "";
      if (/\$/.test(tras("Precio proveedor"))) throw new Error("Los precios están en dólares: quita «Ver en USD» en Drop y vuelve a pulsar «Actualizar».");
      productos.set(dropId, {
        dropId,
        codigo: lineas[i] ?? null,
        nombre: lineas[i - 2] ?? "",
        proveedor: lineas[i - 1] ?? "",
        stock: lineas[i + 1] ?? "",
        precio: tras("Precio proveedor"),
        sugerido: tras("Precio sugerido"),
        foto: tarjeta.querySelector("img")?.getAttribute("src") ?? null,
      });
    }
    estado.productos = productos.size;
    if (!productos.size) throw new Error("No se leyó ningún producto del Catálogo de Drop.");
    // Con la sesión de proveedor el catálogo solo trae lo nuestro: así no se guarda una competencia vacía (y se avisa en qué perfil correrlo).
    const proveedores = new Set([...productos.values()].map((p) => p.proveedor.trim().toLowerCase()));
    if ([...proveedores].every((p) => /^ecomfive\b/.test(p)))
      throw new Error("Esta pestaña de Drop tiene la sesión de PROVEEDOR: solo se ven nuestros productos. La competencia se lee en el perfil de Chrome con la cuenta de dropshipper.");

    // La ficha de cada producto, para la categoría y la fecha de creación (de a 4; si una falla, queda sin ellas).
    estado.fase = "fichas";
    const cola = [...productos.values()];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let p = cola.shift(); p; p = cola.shift()) {
          try {
            const html = await (await fetch(`/dropshipping/product/${p.dropId}`, { headers: { accept: "text/html" }, credentials: "include" })).text();
            const plano = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => JSON.parse(`"${m[1]}"`)).join("");
            p.creado = /"createdAt":"([^"]+)","vendor":/.exec(plano)?.[1] ?? null;
            p.categoria = /"category":"([^"]*)"/.exec(plano)?.[1] ?? null;
          } catch {
            // Sin la ficha el producto se guarda igual, sin categoría ni fecha.
          }
          estado.hechos++;
        }
      }),
    );

    estado.fase = "subida";
    const cuerpo = { tipo: "competencia-drop", pais: "cr", inicio: estado.inicio, duracionMs: Math.round(performance.now() - t0), paginas, productos: [...productos.values()] };
    const r = await fetch(subida.competenciadrop, { method: "PUT", headers: { "x-upsert": "true", "content-type": "application/json" }, body: new Blob([JSON.stringify(cuerpo)], { type: "application/json" }) });
    if (!r.ok) throw new Error(`No se pudo pasar la lectura de Drop al sistema (${r.status}).`);
    estado.resultado = { productos: productos.size, proveedores: proveedores.size };
  } catch (e) {
    estado.error = String((e && e.message) || e);
  }
  estado.fase = "listo";
  estado.fin = new Date().toISOString();
}
