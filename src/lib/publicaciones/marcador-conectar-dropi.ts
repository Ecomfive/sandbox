/**
 * El favorito «Conectar Dropi» (migración 0137): se arrastra a la barra de favoritos y se pulsa con Dropi abierto en la cuenta de
 * proveedor de ECOMFIVE. Toma la sesión de esa pestaña y abre `/publicaciones-dropi/conectar` con ella en el fragmento de la dirección
 * (`#p=pa&t=…`, que no viaja por la red hasta que la página lo lee y se lo pasa al servidor). Lo pulsa una persona: el sistema nunca
 * inicia sesión en Dropi por su cuenta. El código va completo en el favorito y usa solo JavaScript básico.
 */
const CODIGO = [
  "(function(){",
  "var O=__ORIGEN__;",
  "try{",
  "if(!/^app\\.dropi\\.[a-z]{2}$/.test(location.hostname)){alert('Abre Dropi (app.dropi.pa) con la cuenta de ECOMFIVE y vuelve a pulsar Conectar Dropi.');return}",
  "var t=JSON.parse(localStorage.getItem('DROPI_token')||'null');",
  "if(!t){alert('No hay una sesión de Dropi en esta pestaña: inicia sesión y vuelve a pulsar Conectar Dropi.');return}",
  "var url=O+'/publicaciones-dropi/conectar#p='+location.hostname.split('.').pop()+'&t='+encodeURIComponent(t);",
  "if(!window.open(url,'_blank'))location.href=url",
  "}catch(e){alert('No se pudo conectar Dropi: '+e.message)}",
  "})();",
].join("");

/** El favorito para la plataforma en ese origen (`https://…`, o `http://localhost` para probar), con el prefijo `javascript:`. */
export function marcadorConectarDropi(origen: string): string {
  const o = new URL(origen);
  if (o.protocol !== "https:" && !(o.protocol === "http:" && (o.hostname === "localhost" || o.hostname === "127.0.0.1"))) throw new Error("El origen del favorito debe ser https.");
  return `javascript:${encodeURIComponent(CODIGO.replace("__ORIGEN__", JSON.stringify(o.origin)))}`;
}

/** Lo que trae el fragmento de `/publicaciones-dropi/conectar` (`#p=pa&t=…`): el país de Dropi y la sesión, o null si no sirve. */
export function leerFragmentoConectar(hash: string): { pais: string; token: string } | null {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const pais = (q.get("p") ?? "").toLowerCase();
  const token = q.get("t") ?? "";
  if (!/^[a-z]{2}$/.test(pais) || token.split(".").length !== 3 || token.length > 4000) return null;
  return { pais, token };
}
