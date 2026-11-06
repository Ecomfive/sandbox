// «Ecomfive · Uso» › el puente, solo en las páginas del sistema: pide la llave de quien tiene la sesión abierta y se la pasa a fondo.js, que no puede usar la sesión.
(async () => {
  try {
    const r = await fetch("/api/uso-externo/llave", { credentials: "same-origin" });
    if (!r.ok) return;
    const { llave } = await r.json();
    if (typeof llave === "string") await chrome.runtime.sendMessage({ tipo: "llave", llave });
  } catch {
    // La extensión se recargó con esta página abierta: al recargar la página vuelve a pedirla.
  }
})();
