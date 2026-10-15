/**
 * El marcador de la Biblioteca de anuncios: un favorito del navegador que, al pulsarlo con la Biblioteca de Meta abierta, lee sus
 * tarjetas (texto y enlace de cada anuncio) y las manda a la plataforma abriendo `/instagram/biblioteca` con la lectura en el
 * fragmento de la dirección (`#d=…`, que nunca viaja por la red hasta que la página la lee). Se hace así porque la Biblioteca solo se
 * puede leer desde el navegador de una persona, y desde la página de Meta no se puede llamar a otro sitio (su CSP lo impide), pero sí
 * abrir una pestaña. El código va completo en el favorito (sin cargar nada de fuera) y usa solo JavaScript básico.
 *
 * La tarjeta de un anuncio es el contenedor más grande que solo contiene un «Identificador de la biblioteca»; así no depende de los
 * nombres de clase de Meta, que cambian. Mandan solo texto: nada de la sesión de Meta sale de la página.
 */
const CODIGO = [
  "(function(){",
  "var O=__ORIGEN__;",
  "try{",
  "if(!/(^|\\.)facebook\\.com$/.test(location.hostname)||location.pathname.indexOf('/ads/library')!==0){alert('Abre la Biblioteca de anuncios de Meta y vuelve a pulsar este marcador.');return}",
  "var H=[].filter.call(document.querySelectorAll('span,div'),function(e){return !e.children.length&&/^(Identificador de la biblioteca|Library ID)/.test(e.textContent)});",
  "if(!H.length){alert('No encontré anuncios en esta página.');return}",
  "var T=[];",
  "for(var i=0;i<H.length&&i<100;i++){",
  "var n=H[i],u=n;",
  "while(n.parentElement){var p=n.parentElement,c=0;for(var j=0;j<H.length;j++){if(p.contains(H[j]))c++}",
  "if(c>1||p.innerText.length>4000||/Ordenar por|Order by/.test(p.innerText))break;u=p;n=p}",
  "var a=u.querySelector('a[href*=\"l.facebook.com/l.php\"]');",
  // El enlace de la página del anunciante (`facebook.com/<usuario>/`): de ahí sale su cuenta.
  "var q=[].filter.call(u.querySelectorAll('a[href]'),function(z){return /^https:\\/\\/www\\.facebook\\.com\\/[^\\/?#]+\\/?$/.test(z.href)})[0];",
  "T.push({x:(u.innerText||'').slice(0,4000),l:a?a.href.slice(0,3000):null,p:q?q.href.slice(0,300):null})",
  "}",
  "var r=(document.body.innerText.match(/~?\\s*[\\d][\\d.,\\s]*\\s+(resultados?|results?)/i)||[''])[0];",
  "var d={v:1,u:location.href.slice(0,600),r:r.slice(0,80),t:T};",
  "var b=btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');",
  "var url=O+'/instagram/biblioteca#d='+b;",
  "if(!window.open(url,'_blank'))location.href=url",
  "}catch(e){alert('No se pudo leer la Biblioteca: '+e.message)}",
  "})();",
].join("");

/** El código del marcador para una plataforma en ese origen (`https://…`), sin el prefijo `javascript:`. */
export function codigoMarcador(origen: string): string {
  const o = new URL(origen);
  if (o.protocol !== "https:" && !(o.protocol === "http:" && (o.hostname === "localhost" || o.hostname === "127.0.0.1"))) throw new Error("El origen del marcador debe ser https.");
  return CODIGO.replace("__ORIGEN__", JSON.stringify(o.origin));
}

/** La dirección del favorito (`javascript:…`), lista para ponerla en un enlace que se arrastra a la barra de favoritos. */
export function marcadorBiblioteca(origen: string): string {
  return `javascript:${encodeURIComponent(codigoMarcador(origen))}`;
}

/** Lo contrario de lo que hace el marcador con la lectura: el JSON desde el fragmento `#d=…`, o null si no se puede leer. */
export function decodificarLectura(fragmento: string): unknown | null {
  const m = fragmento.match(/(?:^|[#&])d=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const base64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const binario = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
