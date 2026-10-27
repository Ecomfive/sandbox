// «Ecomfive · Dropi» › el puente en las páginas del sistema (solo mom-beta-proveduria.vercel.app; desde el 27 oct 2026 ya no en
// localhost, para que ninguna página local pueda usar la sesión de Dropi): el panel
// «Actualizar Dropi» le habla por window.postMessage con el canal «ecomfive-dropi», el puente se lo pasa a la extensión (fondo.js)
// y le devuelve la respuesta. Solo mensajes de la misma página. La sesión de Dropi nunca pasa por aquí.
(() => {
  const CANAL = "ecomfive-dropi";
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.canal !== CANAL || d.dir !== "pedido" || typeof d.id !== "string") return;
    chrome.runtime.sendMessage(d.msg, (resp) => {
      const error = chrome.runtime.lastError;
      window.postMessage({ canal: CANAL, dir: "respuesta", id: d.id, resp: error ? { error: error.message } : resp }, location.origin);
    });
  });
})();
