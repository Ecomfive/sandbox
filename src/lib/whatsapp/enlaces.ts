/**
 * Enlaces y archivos peligrosos en los chats de WhatsApp (31 oct 2026, pedido de Hernán: «analizar enlaces maliciosos»). Solo reglas
 * propias, sin servicios de afuera (Google Safe Browsing quedó para después). Cada enlace sale con su riesgo:
 * - «peligroso»: no se puede abrir desde el sistema y tampoco mandar (un sitio que se hace pasar por Dropi, WhatsApp, un banco…; una
 *   dirección IP; letras de otro alfabeto que imitan a las nuestras; un «@» que esconde el sitio real; un .apk o .exe para instalar).
 * - «sospechoso»: se abre solo después de un aviso (acortadores como bit.ly, terminaciones baratas como .xyz, sin https, palabras de
 *   estafa como «login» o «premio» en el nombre del sitio).
 * - «conocido»: un sitio oficial de la lista (Dropi, WhatsApp, Meta, Google…). - «normal»: cualquier otro, se abre como en WhatsApp.
 */

export type Riesgo = "peligroso" | "sospechoso" | "conocido" | "normal";

export interface RevisionEnlace {
  /** La dirección para abrir (con https:// si venía sin nada); null si no se puede abrir (un esquema raro o mal escrito). */
  url: string | null;
  /** El sitio, en minúsculas («app.dropi.co»); null si no se entiende. */
  sitio: string | null;
  riesgo: Riesgo;
  /** Por qué, en palabras para el equipo; vacío si es conocido o normal. */
  motivos: string[];
}

export type ParteTexto = { tipo: "texto"; texto: string } | ({ tipo: "enlace"; texto: string } & RevisionEnlace);

/** Las marcas que se suelen imitar y sus sitios oficiales (el dominio registrado, sin subdominios). */
/** `exacta`: palabras comunes («apple», «google»), que cuentan solo si son una parte entera del nombre («apple-id.com»), no «applebees». */
const MARCAS: { marca: string; oficiales: RegExp; exacta?: true }[] = [
  { marca: "dropi", oficiales: /^dropi\.(co|pa|cr|mx|cl|ec|gt|pe|py|ar|com|com\.co|com\.py|com\.ar|com\.pe|com\.gt|com\.ec)$/ },
  { marca: "whatsapp", oficiales: /^(whatsapp\.(com|net)|wa\.me)$/ },
  { marca: "facebook", oficiales: /^(facebook\.(com|net)|fb\.(com|me)|fbcdn\.net)$/ },
  { marca: "instagram", oficiales: /^(instagram\.com|cdninstagram\.com)$/ },
  { marca: "paypal", oficiales: /^paypal\.(com|me)$/ },
  { marca: "binance", oficiales: /^binance\.com$/ },
  { marca: "bgeneral", oficiales: /^bgeneral\.com$/ },
  { marca: "bancogeneral", oficiales: /^bgeneral\.com$/ },
  { marca: "yappy", oficiales: /^(yappy\.com\.pa|bgeneral\.com)$/ },
  { marca: "banistmo", oficiales: /^banistmo\.com$/ },
  { marca: "bancolombia", oficiales: /^bancolombia\.com$/ },
  { marca: "nequi", oficiales: /^nequi\.com\.co$/ },
  { marca: "google", exacta: true, oficiales: /^(google\.[a-z.]+|goo\.gl|googleusercontent\.com|googleapis\.com)$/ },
  { marca: "apple", exacta: true, oficiales: /^apple\.com$/ },
  { marca: "icloud", exacta: true, oficiales: /^icloud\.com$/ },
  { marca: "microsoft", oficiales: /^microsoft\.com$/ },
  { marca: "outlook", exacta: true, oficiales: /^(outlook\.com|live\.com|office\.com)$/ },
  { marca: "tiktok", exacta: true, oficiales: /^tiktok\.com$/ },
  { marca: "shopify", exacta: true, oficiales: /^(shopify\.com|myshopify\.com)$/ },
  { marca: "mercadolibre", oficiales: /^mercadolibre\.[a-z.]+$/ },
  { marca: "ecomfive", oficiales: /^ecomfive\.io$/ },
];

/** Sitios oficiales que no son una marca imitable pero sí de todos los días. */
const CONOCIDOS = /^(youtube\.com|youtu\.be|wa\.me|vercel\.app|linktr\.ee|canva\.com|dropbox\.com|wetransfer\.com|zoom\.us|calendly\.com|loom\.com|notion\.so)$/;
/** Nuestro sistema, en Vercel (el resto de *.vercel.app es de cualquiera). */
const NUESTRO = /^mom-beta-proveduria(-[a-z0-9-]+)?\.vercel\.app$/;

/** Acortadores: esconden a dónde lleva el enlace. */
const ACORTADORES = /^(bit\.ly|bitly\.com|tinyurl\.com|cutt\.ly|t\.ly|is\.gd|v\.gd|ow\.ly|rebrand\.ly|shorturl\.at|rb\.gy|tiny\.cc|s\.id|t\.co|buff\.ly|shorte\.st|adf\.ly|bit\.do|lnkd\.in|qrco\.de|x\.gd|urlz\.fr|acortar\.link|n9\.cl)$/;
/** Terminaciones baratas o muy usadas en estafas. */
const TERMINACIONES_RIESGOSAS = new Set(["zip", "mov", "xyz", "top", "click", "link", "country", "gq", "tk", "ml", "ga", "cf", "work", "rest", "buzz", "icu", "cam", "monster", "sbs", "cfd", "quest", "bond", "loan", "win", "bid", "review", "kim", "men", "date", "party", "racing", "download", "stream", "cyou", "lol", "mom", "beauty", "hair", "skin"]);
/** Palabras de estafa en el nombre del sitio (no en la ruta). */
const PALABRAS_ESTAFA = /(login|signin|verify|verifica|validar|secure|seguridad|account|cuenta|wallet|billetera|premio|regalo|bono|gratis|reembolso|soporte|support|desbloqueo|suspendid|confirm)/;

/** Archivos que instalan o ejecutan programas: no se abren desde el sistema. */
const EXT_PELIGROSAS = new Set(["apk", "xapk", "apks", "aab", "exe", "msi", "msix", "bat", "cmd", "scr", "pif", "com", "cpl", "msc", "js", "jse", "vbs", "vbe", "wsf", "wsh", "jar", "ps1", "psm1", "hta", "lnk", "reg", "iso", "img", "vhd", "dmg", "pkg", "app", "deb", "rpm", "sh", "run", "gadget", "appx", "ipa", "url", "scf", "inf"]);
/** Archivos que pueden esconder un programa (comprimidos) o macros (Office con «m»): se avisa antes de abrir. */
const EXT_SOSPECHOSAS = new Set(["zip", "rar", "7z", "tar", "gz", "docm", "xlsm", "pptm", "dotm", "xltm", "svg", "html", "htm", "shtml", "xhtml"]);
const MIME_PELIGROSOS = /^(application\/(vnd\.android\.package-archive|x-msdownload|x-msdos-program|x-ms-installer|x-msi|x-executable|x-sh|x-bat|java-archive|x-apple-diskimage|x-iso9660-image|hta))$/;

/** Las letras que se usan para imitar otras (0→o, 1→l, 3→e, 4→a, 5→s, 7→t) y sin guiones. */
const sinDisfraz = (s: string) => s.replace(/0/g, "o").replace(/[1!|]/g, "l").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/-/g, "");

/** Distancia de edición (cuántas letras cambian), para «whatsap» o «facebok». */
function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let antes = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, antes + (a[i - 1] === b[j - 1] ? 0 : 1));
      antes = guardado;
    }
  }
  return fila[b.length];
}

/** El dominio registrado («app.dropi.co» → «dropi.co»; «yappy.com.pa» se queda igual). Aproximado, sin la lista pública de sufijos. */
export function dominioRegistrado(sitio: string): string {
  const partes = sitio.split(".");
  if (partes.length <= 2) return sitio;
  const [penultima, ultima] = partes.slice(-2);
  const tres = ultima.length === 2 && /^(com|net|org|gob|gov|edu|co|ac|or|ne|go|mil|nom|info)$/.test(penultima);
  return partes.slice(tres ? -3 : -2).join(".");
}

const esIp = (sitio: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(sitio) || sitio.startsWith("[");

/** La extensión de un nombre de archivo o de la ruta de un enlace («factura.pdf.exe» → «exe»). */
function extension(nombre: string): string | null {
  const m = /\.([a-z0-9]{1,6})$/i.exec(nombre.trim());
  return m ? m[1].toLowerCase() : null;
}

/** Revisa un enlace con las reglas propias. */
export function revisarEnlace(crudo: string): RevisionEnlace {
  const texto = crudo.trim();
  const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(texto)?.[1]?.toLowerCase() ?? null;
  if (esquema && /^(javascript|data|vbscript|file|blob)$/.test(esquema)) {
    return { url: null, sitio: null, riesgo: "peligroso", motivos: ["Es un enlace que ejecuta código o abre archivos de la computadora, no una página."] };
  }
  const conEsquema = esquema === "http" || esquema === "https" || esquema === "ftp" ? texto : `https://${texto}`;
  let u: URL;
  try {
    u = new URL(conEsquema);
  } catch {
    return { url: null, sitio: null, riesgo: "sospechoso", motivos: ["El enlace está mal escrito: no se sabe a dónde lleva."] };
  }
  const sitio = u.hostname.toLowerCase().replace(/\.$/, "");
  const url = u.toString();
  const motivos: string[] = [];
  let peligroso = false;
  const marcar = (motivo: string, esPeligroso: boolean) => {
    motivos.push(motivo);
    if (esPeligroso) peligroso = true;
  };

  // Lo que nunca se abre, aunque el sitio parezca oficial.
  if (u.username || u.password) marcar("Lleva un «@» que esconde el sitio real: lo de antes del @ es solo para engañar.", true);
  if (esIp(sitio)) marcar("Va a una dirección de números (IP) en lugar del nombre de un sitio, como hacen las estafas.", true);
  if (sitio.split(".").some((p) => p.startsWith("xn--"))) marcar("El nombre del sitio usa letras de otro alfabeto que imitan a las normales (por ejemplo, una «а» rusa en vez de «a»).", true);
  const ext = extension(decodeURIComponent(u.pathname));
  if (ext && EXT_PELIGROSAS.has(ext)) marcar(`Descarga un archivo .${ext}, que instala o ejecuta un programa y puede traer un virus.`, true);

  const dominio = dominioRegistrado(sitio);
  const oficial = MARCAS.some((m) => m.oficiales.test(dominio)) || CONOCIDOS.test(dominio) || NUESTRO.test(sitio);
  if (!oficial && !esIp(sitio)) {
    // Se hace pasar por una marca: una parte del nombre empieza con ella («dropi-pagos», «whatsappweb», «paypa1») o, en las largas, casi
    // la dice («whatsap», «facebok»). Solo al empezar, para no confundir «pineapple» con «apple».
    const etiquetas = sitio.split(".").flatMap((p) => [p, ...p.split("-")]).map(sinDisfraz);
    const imitada = MARCAS.find(
      ({ marca, exacta }) => etiquetas.some((e) => (exacta ? e === marca : e.startsWith(marca))) || (marca.length >= 7 && etiquetas.some((e) => e.length >= marca.length - 1 && distancia(e, marca) <= 1)),
    );
    if (imitada) marcar(`Se hace pasar por «${imitada.marca}», pero no es su sitio oficial.`, true);
  }
  if (peligroso) return { url, sitio, riesgo: "peligroso", motivos };
  if (oficial) return { url, sitio, riesgo: "conocido", motivos: [] };

  // Lo que se abre solo después de un aviso.
  if (ACORTADORES.test(sitio)) marcar("Es un enlace acortado: esconde a qué sitio lleva de verdad.", false);
  const terminacion = sitio.split(".").pop() ?? "";
  if (TERMINACIONES_RIESGOSAS.has(terminacion)) marcar(`Termina en «.${terminacion}», una terminación barata muy usada en estafas.`, false);
  if (u.protocol === "http:") marcar("No es seguro (http, sin «s»): lo que se escriba ahí puede verlo otra persona.", false);
  if (u.protocol === "ftp:") marcar("Es un enlace de archivos (ftp), no una página.", false);
  if (u.port) marcar(`Usa un puerto raro (:${u.port}), como los sitios armados a la carrera.`, false);
  const palabra = PALABRAS_ESTAFA.exec(sitio.replace(/[.-]/g, ""));
  if (palabra) marcar(`El nombre del sitio dice «${palabra[1]}», típico de las páginas que piden contraseñas o prometen premios.`, false);
  if (sitio.split(".").length >= 5 || sitio.length > 60) marcar("El nombre del sitio es demasiado largo o tiene demasiadas partes, para esconder el sitio real.", false);
  if (ext && EXT_SOSPECHOSAS.has(ext)) marcar(`Descarga un archivo .${ext}, que puede esconder un programa.`, false);
  return { url, sitio, riesgo: motivos.length ? "sospechoso" : "normal", motivos };
}

/**
 * Terminaciones que se reconocen como enlace aunque no lleven https:// ni www («bit.ly/abc», «premio.xyz»). Sin las que son palabras en
 * español («es», «de», «me»…), para que «ok.de acuerdo» siga siendo texto; con https:// o www. cualquier enlace se reconoce.
 */
const TERMINACIONES_SUELTAS =
  "com|net|org|io|co|ly|gl|gd|at|be|ee|us|app|dev|info|biz|shop|store|site|online|website|live|link|click|xyz|top|icu|club|vip|pro|pa|cr|mx|gt|hn|sv|ni|pe|cl|ec|ar|py|uy|bo|ve|tk|ml|ga|cf|gq|zip|mov|sbs|cfd|buzz|rest|work|cam|monster|bond|cyou|lol|mom|win|bid|loan|ru|cn|cc|ws|tv|fr|uk";
/** Un enlace dentro del texto: con esquema (https:, javascript:…), con «www.» o un dominio suelto con una terminación conocida. No un correo. */
const ENLACE = new RegExp(
  `(?<![\\w@.\\-/])(?:(?:https?|ftp|javascript|data|vbscript|file):[^\\s<>"]+|www\\.[^\\s<>"]+|(?:[a-z0-9](?:[a-z0-9\\-]*[a-z0-9])?\\.)+(?:${TERMINACIONES_SUELTAS})(?![\\w\\-.]*@)(?::\\d{2,5})?(?:[/?#][^\\s<>"]*)?(?![\\w\\-]))`,
  "gi",
);

/** Parte un mensaje en texto y enlaces, cada enlace revisado. Los signos del final («.», «)», «»»…) quedan fuera del enlace. */
export function partesConEnlaces(texto: string): ParteTexto[] {
  const partes: ParteTexto[] = [];
  let desde = 0;
  for (const m of texto.matchAll(ENLACE)) {
    let enlace = m[0];
    const recorte = /[.,;:!?¡¿)\]}»"'’”*_~]+$/.exec(enlace);
    // Un paréntesis que se abrió dentro del enlace (Wikipedia) se queda.
    if (recorte && !(recorte[0].startsWith(")") && enlace.includes("("))) enlace = enlace.slice(0, enlace.length - recorte[0].length);
    if (!enlace || !/[.:]/.test(enlace)) continue;
    const inicio = m.index ?? 0;
    if (inicio > desde) partes.push({ tipo: "texto", texto: texto.slice(desde, inicio) });
    partes.push({ tipo: "enlace", texto: enlace, ...revisarEnlace(enlace) });
    desde = inicio + enlace.length;
  }
  if (desde < texto.length) partes.push({ tipo: "texto", texto: texto.slice(desde) });
  return partes;
}

/** Los enlaces peligrosos de un texto (para no dejarlos salir en un mensaje del equipo). */
export function enlacesPeligrosos(texto: string): (RevisionEnlace & { texto: string })[] {
  return partesConEnlaces(texto).filter((p): p is Extract<ParteTexto, { tipo: "enlace" }> => p.tipo === "enlace" && p.riesgo === "peligroso");
}

/** Revisa un archivo que llegó por WhatsApp (su nombre y su tipo): los que instalan programas no se entregan. */
export function revisarArchivo(nombre: string | null | undefined, mime: string | null | undefined): { riesgo: "peligroso" | "sospechoso" | "normal"; motivo: string | null } {
  const ext = nombre ? extension(nombre) : null;
  const tipo = (mime ?? "").split(";")[0].trim().toLowerCase();
  if ((ext && EXT_PELIGROSAS.has(ext)) || MIME_PELIGROSOS.test(tipo)) {
    const que = ext ? `un archivo .${ext}` : "un programa";
    return { riesgo: "peligroso", motivo: `Es ${que}: instala o ejecuta un programa y puede traer un virus. Por seguridad no se abre desde el sistema.` };
  }
  if (ext && EXT_SOSPECHOSAS.has(ext)) {
    const porque = /^(docm|xlsm|pptm|dotm|xltm)$/.test(ext) ? "trae macros, que pueden ejecutar programas" : /^(svg|html?|shtml|xhtml)$/.test(ext) ? "es una página que puede pedir contraseñas" : "es un comprimido que puede esconder un programa";
    return { riesgo: "sospechoso", motivo: `Es un archivo .${ext}: ${porque}. Ábrelo solo si esperabas este archivo.` };
  }
  return { riesgo: "normal", motivo: null };
}
