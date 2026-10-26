// La ventanita de la extensión: cómo está la sesión de Dropi Panamá y los accesos al panel del sistema y a Dropi.
const PANEL = "https://mom-beta-proveduria.vercel.app/publicaciones-dropi/actualizar";
const pedir = (msg) => chrome.runtime.sendMessage(msg);
const hora = (iso) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

document.getElementById("version").textContent = `Versión ${chrome.runtime.getManifest().version}`;
document.getElementById("panel").addEventListener("click", () => chrome.tabs.create({ url: PANEL }));
document.getElementById("abrir-pa").addEventListener("click", () => pedir({ tipo: "mostrar", pais: "pa" }).then(() => window.close()));

pedir({ tipo: "sesion", pais: "pa", abrir: false }).then((s) => {
  const detalle = document.getElementById("detalle-pa");
  const estado = document.getElementById("estado-pa");
  if (!s || s.error) {
    detalle.textContent = (s && s.error) || "No se pudo revisar.";
    return;
  }
  if (!s.pestana) {
    detalle.textContent = "Dropi Panamá no está abierto.";
    return;
  }
  const valida = s.hay && s.tipoUsuario === "SUPPLIER" && s.tienda === "ECOMFIVE" && (!s.vence || new Date(s.vence) > new Date());
  estado.textContent = valida ? "Activa" : s.hay ? "Otra cuenta o vencida" : "Sin sesión";
  estado.className = valida ? "ok" : "mal";
  detalle.textContent = valida && s.vence ? `ECOMFIVE · vence ${hora(s.vence)}` : "Inicia sesión con la cuenta de ECOMFIVE.";
});
