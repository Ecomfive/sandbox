// CRM Dropshippers ↔ Dropi de otro país (3 nov 2026, pedido de Hernán: «Costa Rica y México no traen la información de los dropshippers
// como Panamá»): lo que corre DENTRO de app.dropi.<país> con la sesión de proveedor. Un pedido de Dropi solo trae el número de usuario de
// quien lo hizo; su nombre, correo y teléfono vienen en el Historial de Existencia de cada producto (`inventories/history`, cada
// movimiento trae `user`). Recorre el historial de los productos dados hasta encontrar a todos los usuarios buscados (o terminar) y sube
// la lista —id, nombre, apellido, correo, teléfono, la misma forma de datos-privados/dropi-usuarios.json de Panamá— a la dirección
// firmada que da `npx tsx scripts/dropi-usuarios.ts subida <país>`. La sesión de Dropi y los datos de los usuarios no pasan por el chat.
//
// Uso (con la herramienta del navegador de Claude): asignar la función a window y arrancarla SIN esperarla; el avance queda en
// window.__usuariosDropi:
//   window.usuariosDropi({ subida: "<dirección>", productos: [...], usuarios: [...] }); "iniciado"
//   JSON.stringify(window.__usuariosDropi)   → fase, productos leídos, encontrados / buscados, fin, error

async function usuariosDropi({ subida, productos, usuarios }) {
  const estado = (window.__usuariosDropi = { fase: "leyendo", productos: 0, total: productos.length, encontrados: 0, buscados: usuarios.length, fin: null, error: null });
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const token = JSON.parse(localStorage.getItem("DROPI_token") || "null");
    const yo = (JSON.parse(localStorage.getItem("DROPI_LoginResult") || "{}") || {}).objects || {};
    if (!token) throw new Error("No hay sesión de Dropi en esta página.");
    if (yo.type_user !== "SUPPLIER") throw new Error("La sesión no es de proveedor.");
    const api = `https://${location.hostname.replace(/^app\./, "api.")}/api`;
    const cabeceras = { Accept: "application/json", Authorization: "Bearer " + token, "X-Authorization": "Bearer " + token };
    const buscados = new Set(usuarios.map(Number));
    const hallados = new Map();
    const pedir = async (url) => {
      for (let intento = 0; intento < 5; intento++) {
        const r = await fetch(url, { headers: cabeceras }).catch(() => null);
        if (r && (r.status === 401 || r.status === 403)) throw new Error(`Dropi respondió ${r.status}: la sesión venció.`);
        const j = r?.ok ? await r.json().catch(() => null) : null;
        if (j) return j;
        await pausa(r?.status === 429 ? 20000 : 2000 * (intento + 1));
      }
      throw new Error("Dropi no respondió el historial después de 5 intentos.");
    };
    for (const id of productos) {
      for (let off = 0; off < 20000; off += 100) {
        const j = await pedir(`${api}/inventories/history?pageSize=100&offSet=${off}&idSelect=${id}&search=null&filterBy=&movement=null&warehouse=null`);
        const lote = Array.isArray(j.object) ? j.object : [];
        for (const m of lote) {
          const u = m.user;
          if (!u || !m.user_id || m.user_id === yo.id || hallados.has(m.user_id)) continue;
          hallados.set(m.user_id, { id: m.user_id, nombre: u.name || "", apellido: u.surname || "", email: u.email || "", telefono: u.phone || "" });
        }
        estado.encontrados = [...buscados].filter((b) => hallados.has(b)).length;
        if (lote.length < 100 || estado.encontrados === buscados.size) break;
      }
      estado.productos++;
      if (estado.encontrados === buscados.size) break;
    }
    estado.fase = "subiendo";
    // Solo los que compraron (los buscados); los demás del historial (ajustes, otras cuentas) no se suben.
    const lista = [...hallados.values()].filter((u) => buscados.has(u.id));
    const r = await fetch(subida, { method: "PUT", headers: { "Content-Type": "application/json", "x-upsert": "true" }, body: JSON.stringify(lista) });
    if (!r.ok) throw new Error(`No se pudo subir la lista (${r.status}).`);
    estado.subidos = lista.length;
    estado.fase = "listo";
  } catch (e) {
    estado.error = String(e?.message || e);
  }
  estado.fin = new Date().toISOString();
  return estado;
}
