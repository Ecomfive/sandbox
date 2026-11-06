// «Ecomfive · Uso»: cada minuto mira si la persona está activa en la pestaña de delante y si esa pestaña es de Dropi, Effi, Drop o Shopify. Si lo es, le dice al
// sistema la plataforma y la sección (sin números, ids ni el nombre de la tienda). No lee las páginas: Chrome solo le deja ver la dirección de esas plataformas,
// no la de ningún otro sitio. La sesión es la del sistema en este navegador: sin ella no se anota nada y el ícono muestra «!».
const RUTA = "https://mom-beta-proveduria.vercel.app/api/uso-externo";
/** Igual que el sistema: activa es con mouse o teclado en los últimos 5 minutos. */
const SEGUNDOS_ACTIVA = 300;
const VERSION = chrome.runtime.getManifest().version;

const PLATAFORMAS = [
  { id: "dropi", es: (h) => /^app\.dropi\.(pa|cr|mx)$/.test(h) },
  { id: "effi", es: (h) => h === "effi.com.co" || h.endsWith(".effi.com.co") },
  { id: "drop", es: (h) => h === "app.soydrop.com" },
  { id: "shopify", es: (h) => h === "admin.shopify.com" },
];

/** Las dos primeras palabras de la dirección. En Shopify se salta «/store/<tienda>». */
function seccionDe(url, plataforma) {
  let partes = url.pathname.split("/").filter(Boolean);
  if (plataforma === "shopify" && partes[0] === "store") partes = partes.slice(2);
  return partes
    .map((p) => p.toLowerCase())
    .filter((p) => /^[a-z_-]{1,30}$/.test(p))
    .slice(0, 2)
    .join("/");
}

async function anotarEstado(estado) {
  await chrome.storage.local.set({ estado, revisado: Date.now() });
  await chrome.action.setBadgeText({ text: estado === "ok" ? "" : "!" });
}

async function avisar(cuerpo) {
  try {
    const r = await fetch(RUTA, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, version: VERSION }) });
    await anotarEstado(r.ok ? "ok" : r.status === 401 ? "sin-sesion" : "error");
  } catch {
    await anotarEstado("error");
  }
}

async function medir() {
  if ((await chrome.idle.queryState(SEGUNDOS_ACTIVA)) !== "active") return;
  const ventana = await chrome.windows.getLastFocused();
  if (!ventana.focused) return;
  const [pestana] = await chrome.tabs.query({ active: true, windowId: ventana.id });
  if (!pestana?.url) return;
  const url = new URL(pestana.url);
  const plataforma = PLATAFORMAS.find((p) => url.protocol === "https:" && p.es(url.hostname));
  if (plataforma) await avisar({ plataforma: plataforma.id, seccion: seccionDe(url, plataforma.id) });
}

function arrancar() {
  chrome.alarms.create("minuto", { periodInMinutes: 1 });
  chrome.alarms.create("senal", { periodInMinutes: 60 });
  avisar({});
}

chrome.runtime.onInstalled.addListener(arrancar);
chrome.runtime.onStartup.addListener(arrancar);
chrome.alarms.onAlarm.addListener((a) => (a.name === "minuto" ? medir() : avisar({})));
