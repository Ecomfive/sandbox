// «Ecomfive · Dropi» (pedido de Hernán, 26 oct 2026): lee Dropi DESDE SU PESTAÑA, con la sesión que la persona abrió ahí, y le
// pasa lo leído al sistema. Dropi rechaza las lecturas que vienen de un servidor, por eso lo hace el navegador. Solo lee: corre los
// lectores de lectores/ (copias de scripts/*-navegador.js del sistema) dentro de la pestaña de Dropi, y cada lector sube sus
// archivos a las direcciones firmadas que da el sistema (solo se aceptan las de su carpeta temporal en Supabase). El token de
// Dropi no sale de la pestaña: a la página del sistema solo se le dice si hay sesión, de qué cuenta y cuándo vence.
//
// Pedidos que entiende (del puente en las páginas del sistema o de la ventanita de la extensión):
//   { tipo: "hola" }                              → { version }
//   { tipo: "sesion", pais: "pa"|"cr"|"mx", abrir } → { pestana, hay, tipoUsuario, tienda, vence }  (abrir: crea la pestaña si falta)
//   { tipo: "mostrar", pais }                     → pone la pestaña de Dropi de ese país al frente (la crea si falta)
//   { tipo: "lanzar", lector, subida, dias }      → arranca el lector en la pestaña (sin esperarlo); `dias` solo en la primera lectura
//                                                   de un país ({ pedidos, cartera }: Costa Rica trae desde el 1 de septiembre)
//   { tipo: "avance", lector }                    → lo que lleva el lector (window.__dropiDiario / __ventasDropi, sin el detalle)

const ORIGEN = { pa: "https://app.dropi.pa", cr: "https://app.dropi.cr", mx: "https://app.dropi.mx" };
const LECTORES = {
  proveedor: { pais: "pa", archivo: "lectores/dropi-diario.js", funcion: "dropiDiario", estado: "__dropiDiario", archivos: ["pedidos", "cartera", "retiros", "stock"] },
  ventas: { pais: "pa", archivo: "lectores/ventas-dropi.js", funcion: "ventasDropi", estado: "__ventasDropi", archivos: ["resumen", "movimientos"] },
  // Costa Rica (28 oct 2026): los mismos lectores en la pestaña de app.dropi.cr.
  proveedor_cr: { pais: "cr", archivo: "lectores/dropi-diario.js", funcion: "dropiDiario", estado: "__dropiDiario", archivos: ["pedidos", "cartera", "retiros", "stock"] },
  ventas_cr: { pais: "cr", archivo: "lectores/ventas-dropi.js", funcion: "ventasDropi", estado: "__ventasDropi", archivos: ["resumen", "movimientos"] },
  // México (0.4.0, 30 oct 2026): los mismos lectores en la pestaña de app.dropi.mx, con la cuenta de proveedor.
  proveedor_mx: { pais: "mx", archivo: "lectores/dropi-diario.js", funcion: "dropiDiario", estado: "__dropiDiario", archivos: ["pedidos", "cartera", "retiros", "stock"] },
  ventas_mx: { pais: "mx", archivo: "lectores/ventas-dropi.js", funcion: "ventasDropi", estado: "__ventasDropi", archivos: ["resumen", "movimientos"] },
  catalogo_mx: { pais: "mx", archivo: "lectores/catalogo.js", funcion: "leerCatalogo", estado: "__catalogo", archivos: ["catalogo"] },
};
// Las direcciones firmadas de subida del sistema: solo a su carpeta temporal de «Actualizar Dropi» y solo en el proyecto de Supabase
// del sistema (auditoría 27 oct 2026: antes cualquier proyecto *.supabase.co pasaba y lo leído podía terminar en otro lado).
const SUBIDA = /^https:\/\/bcpndbpxbcfruivgizjn\.supabase\.co\/storage\/v1\/object\/upload\/sign\/wms-compras\/tmp-dropi-panel\/[0-9a-f-]{36}\/[a-z]+\.json\?token=/;

const validarPais = (p) => {
  if (!Object.hasOwn(ORIGEN, p)) throw new Error("País no válido.");
  return p;
};

function cargada(id) {
  return new Promise((ok) => {
    const reloj = setTimeout(listo, 30000);
    function listo() {
      clearTimeout(reloj);
      chrome.tabs.onUpdated.removeListener(alCambiar);
      ok();
    }
    function alCambiar(tid, info) {
      if (tid === id && info.status === "complete") listo();
    }
    chrome.tabs.onUpdated.addListener(alCambiar);
  });
}

/** La pestaña de Dropi del país: la que ya está abierta o, con `crear`, una nueva. `frente`: la pone al frente. */
async function pestana(pais, crear, frente) {
  const [t] = await chrome.tabs.query({ url: `${ORIGEN[pais]}/*` });
  if (t) {
    if (frente) {
      await chrome.tabs.update(t.id, { active: true });
      await chrome.windows.update(t.windowId, { focused: true });
    }
    return t;
  }
  if (!crear) return null;
  const nueva = await chrome.tabs.create({ url: `${ORIGEN[pais]}/dashboard/home`, active: !!frente });
  await cargada(nueva.id);
  if (frente) await chrome.windows.update(nueva.windowId, { focused: true });
  return chrome.tabs.get(nueva.id);
}

async function enPagina(tabId, func, args = []) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return r ? r.result : undefined;
}

// Corre dentro de la pestaña de Dropi: si hay sesión, de qué cuenta y cuándo vence. Nunca devuelve el token.
function leerSesion() {
  let t = null;
  let o = {};
  let vence = null;
  try {
    t = JSON.parse(localStorage.getItem("DROPI_token") || "null");
  } catch {}
  try {
    o = (JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}") || {}).objects || {};
  } catch {}
  try {
    vence = t ? new Date(JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000).toISOString() : null;
  } catch {}
  return { hay: !!t && !location.pathname.startsWith("/auth"), tipoUsuario: o.type_user || null, tienda: o.store_name || null, vence };
}

async function atender(m) {
  switch (m && m.tipo) {
    case "hola":
      return { version: chrome.runtime.getManifest().version };
    case "sesion": {
      const t = await pestana(validarPais(m.pais), !!m.abrir, false);
      if (!t) return { pestana: false, hay: false, tipoUsuario: null, tienda: null, vence: null };
      return { pestana: true, ...(await enPagina(t.id, leerSesion)) };
    }
    case "mostrar":
      await pestana(validarPais(m.pais), true, true);
      return { ok: true };
    case "lanzar": {
      const l = LECTORES[m.lector];
      if (!l || !Object.hasOwn(LECTORES, m.lector)) throw new Error("Lector desconocido.");
      const subida = {};
      for (const a of l.archivos) {
        const u = m.subida && m.subida[a];
        if (typeof u !== "string" || !SUBIDA.test(u)) throw new Error("Dirección de subida no válida.");
        subida[a] = u;
      }
      const d = m.dias;
      // Hasta 1.000 días (MAX_DIAS_LECTURA del sistema): la primera lectura de México trae desde julio de 2024.
      const entero = (x) => Number.isInteger(x) && x > 0 && x <= 1000;
      const dias = d && entero(d.pedidos) && entero(d.cartera) ? { pedidos: d.pedidos, cartera: d.cartera } : null;
      const t = await pestana(l.pais, true, false);
      await chrome.scripting.executeScript({ target: { tabId: t.id }, world: "MAIN", files: [l.archivo] });
      await enPagina(
        t.id,
        (funcion, s, dd) => {
          window[funcion](s, dd || undefined);
          return "iniciado";
        },
        [l.funcion, subida, dias],
      );
      await chrome.storage.session.set({ [`pestana-${m.lector}`]: t.id });
      return { ok: true };
    }
    case "avance": {
      const l = LECTORES[m.lector];
      if (!l || !Object.hasOwn(LECTORES, m.lector)) throw new Error("Lector desconocido.");
      const guardada = (await chrome.storage.session.get(`pestana-${m.lector}`))[`pestana-${m.lector}`];
      // Si la extensión se recargó a medias, no recuerda la pestaña: se busca la de Dropi del país (27 oct 2026).
      const t = (guardada ? await chrome.tabs.get(guardada).catch(() => null) : null) || (await pestana(l.pais, false, false));
      if (!t) throw new Error("Se cerró la pestaña de Dropi mientras se leía.");
      return enPagina(
        t.id,
        (variable) => {
          const e = window[variable];
          if (!e) return null;
          const { errores, ...resto } = e;
          return JSON.parse(JSON.stringify({ ...resto, errores: errores ? Object.keys(errores).length : 0 }));
        },
        [l.estado],
      );
    }
  }
  throw new Error("Pedido desconocido.");
}

// La única página que puede hablarle a la extensión (por el puente). La ventanita de la extensión también puede.
const SISTEMA = "https://mom-beta-proveduria.vercel.app";

chrome.runtime.onMessage.addListener((msg, remitente, responder) => {
  // Solo de esta misma extensión, y si viene del puente, solo desde una página del sistema (auditoría 27 oct 2026).
  if (remitente.id !== chrome.runtime.id) return false;
  const desdeVentanita = !remitente.tab && (remitente.url || "").startsWith(chrome.runtime.getURL(""));
  if (!desdeVentanita && remitente.origin !== SISTEMA) return false;
  atender(msg).then(responder, (e) => responder({ error: String((e && e.message) || e) }));
  return true;
});
