const TEXTOS = {
  ok: "Funcionando",
  "sin-llave": "Abre el sistema Ecomfive en este navegador, con tu sesión",
  error: "No se pudo conectar con el sistema",
};

chrome.storage.local.get("estado").then(({ estado }) => {
  document.getElementById("estado").textContent = TEXTOS[estado] ?? "Esperando la primera señal";
});
