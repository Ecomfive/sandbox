const TEXTOS = {
  ok: "Funcionando",
  "sin-sesion": "Inicia sesión en el sistema Ecomfive en este navegador",
  error: "No se pudo conectar con el sistema",
};

chrome.storage.local.get("estado").then(({ estado }) => {
  document.getElementById("estado").textContent = TEXTOS[estado] ?? "Esperando la primera señal";
});
