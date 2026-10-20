/* eslint-disable @next/next/no-img-element -- las imágenes son enlaces firmados de Storage que cambian cada hora */
import type { ClaveSeccion, ContenidoLanding, EspacioImagen } from "@/lib/landings/landing";
import s from "./vista-landing.module.css";

export interface OfertaVista {
  nombre: string;
  unidades: number;
  /** En la moneda de la landing (ya convertida desde dólares). */
  precio: number | null;
}

export function formatoPrecio(moneda: string) {
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency: moneda, maximumFractionDigits: moneda === "USD" ? 2 : 0 });
  } catch {
    return new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
  }
}

function Imagen({ url, alt, etiqueta }: { url: string | null | undefined; alt: string; etiqueta: string }) {
  return url ? <img src={url} alt={alt} /> : <div className={s.vacia}>{etiqueta}</div>;
}

/** El texto escrito o, si falta, una muestra gris de lo que va ahí. */
const o = (texto: string, muestra: string) => (texto.trim() ? texto : <span className={s.falta}>{muestra}</span>);

/** La landing como la verá el cliente, armada con lo que se lleva escrito. Solo muestra: no tiene controles. */
export function VistaLanding({
  nombre,
  moneda,
  precio,
  precioTachado,
  contenido: c,
  imagenes,
  ofertas,
  escritorio,
}: {
  nombre: string;
  moneda: string;
  precio: number | null;
  precioTachado: number | null;
  contenido: ContenidoLanding;
  imagenes: Partial<Record<EspacioImagen, string | null>>;
  ofertas: OfertaVista[];
  escritorio: boolean;
}) {
  const f = formatoPrecio(moneda);
  const descuento = precio !== null && precioTachado !== null && precioTachado > precio ? Math.round((1 - precio / precioTachado) * 100) : 0;
  const boton = c.boton.trim() || "Comprar ahora";

  const bloque = (clave: ClaveSeccion) => {
    switch (clave) {
      case "portada":
        return (
          <section key={clave} className={s.portada}>
            <Imagen url={imagenes.portada} alt={nombre} etiqueta="Imagen de portada" />
            <div className={s.portadaTexto}>
              <h1>{o(c.titular, "El titular de la landing")}</h1>
              <p>{o(c.subtitulo, "El subtítulo: qué es y por qué lo quiere el cliente.")}</p>
              <div className={s.precio}>
                <b>{precio === null ? <span className={s.falta}>Precio</span> : f.format(precio)}</b>
                {descuento > 0 && precioTachado !== null && (
                  <>
                    <s>{f.format(precioTachado)}</s>
                    <em>-{descuento}%</em>
                  </>
                )}
              </div>
              <span className={s.boton}>{boton}</span>
              <div className={s.confianza}>
                <span>Envío a todo el país</span>
                <span>Pagas al recibir</span>
                <span>Garantía</span>
              </div>
            </div>
          </section>
        );
      case "beneficios":
        return (
          <section key={clave} className={s.seccion}>
            <div className={s.dividida}>
              <div>
                <h2>Por qué te va a encantar</h2>
                <div className={s.beneficios}>
                  {c.beneficios.map((b, i) => (
                    <div key={i} className={s.beneficio}>
                      <i>{i + 1}</i>
                      <div>
                        <b>{o(b.titulo, `Beneficio ${i + 1}`)}</b>
                        <span>{o(b.detalle, "Una frase que lo explique.")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.redonda} style={{ marginTop: 16 }}>
                <Imagen url={imagenes.detalle} alt={`Detalle de ${nombre}`} etiqueta="Imagen de detalle" />
              </div>
            </div>
          </section>
        );
      case "en_uso":
        return (
          <section key={clave} className={`${s.seccion} ${s.oscura}`}>
            <div className={`${s.dividida} ${s.redonda}`}>
              <Imagen url={imagenes.en_uso} alt={`${nombre} en uso`} etiqueta="Imagen en uso" />
              <h2 style={{ marginTop: 16 }}>{nombre}</h2>
            </div>
          </section>
        );
      case "variantes":
        return (
          <section key={clave} className={s.seccion}>
            <h2>Elige el tuyo</h2>
            <div className={s.redonda}>
              <Imagen url={imagenes.variantes} alt={`Variantes de ${nombre}`} etiqueta="Imagen de variantes" />
            </div>
          </section>
        );
      case "ofertas":
        return (
          <section key={clave} className={s.seccion}>
            <h2>Aprovecha la oferta</h2>
            <div className={s.ofertas}>
              {ofertas.length ? (
                ofertas.map((of, i) => (
                  <div key={i} className={s.oferta}>
                    <div>
                      {of.nombre}
                      <small>
                        {of.unidades} {of.unidades === 1 ? "unidad" : "unidades"}
                      </small>
                    </div>
                    <b>{of.precio === null ? "—" : f.format(of.precio)}</b>
                  </div>
                ))
              ) : (
                <p className={s.falta}>Las ofertas salen de Creación de ofertas.</p>
              )}
            </div>
          </section>
        );
      case "comparativa":
        return (
          <section key={clave} className={s.seccion}>
            <h2>{nombre} vs. lo de siempre</h2>
            <table className={s.tabla}>
              <thead>
                <tr>
                  <th />
                  <th>{nombre.split(" ").slice(0, 2).join(" ")}</th>
                  <th>Otros</th>
                </tr>
              </thead>
              <tbody>
                {c.comparativa.map((fila, i) => (
                  <tr key={i}>
                    <td>{o(fila.texto, `Ventaja ${i + 1}`)}</td>
                    <td>✓</td>
                    <td>✕</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      case "resenas":
        return (
          <section key={clave} className={s.seccion} style={{ background: "var(--lp-suave)" }}>
            <h2>Lo que dicen nuestros clientes</h2>
            <div className={s.resenas}>
              {c.resenas.filter((r) => r.texto.trim()).length ? (
                c.resenas
                  .filter((r) => r.texto.trim())
                  .map((r, i) => (
                    <div key={i} className={s.resena}>
                      <p>{r.texto}</p>
                      <small>{[r.nombre, r.ciudad].filter((x) => x.trim()).join(" · ")}</small>
                    </div>
                  ))
              ) : (
                <p className={s.falta}>Reseñas de clientes reales.</p>
              )}
            </div>
          </section>
        );
      case "preguntas":
        return (
          <section key={clave} className={`${s.seccion} ${s.preguntas}`}>
            <h2>Preguntas frecuentes</h2>
            {c.preguntas
              .filter((p) => p.pregunta.trim())
              .map((p, i) => (
                <details key={i} open={i === 0}>
                  <summary>{p.pregunta}</summary>
                  <p>{p.respuesta}</p>
                </details>
              ))}
          </section>
        );
      case "garantia":
        return (
          <section key={clave} className={s.seccion}>
            <div className={s.garantia}>
              <div className={s.sello}>
                <div>
                  <b>✓</b>Garantía
                </div>
              </div>
              <h2 style={{ margin: 0 }}>Compra sin riesgo</h2>
              <p style={{ margin: 0, color: "var(--lp-gris)", maxWidth: "40ch" }}>{o(c.garantia, "Qué pasa si llega con un defecto.")}</p>
              <div className={s.redonda} style={{ maxWidth: 360, width: "100%" }}>
                <Imagen url={imagenes.empaque} alt={`Empaque de ${nombre}`} etiqueta="Imagen del empaque" />
              </div>
              <span className={s.boton} style={{ maxWidth: 360 }}>
                {boton}
              </span>
            </div>
          </section>
        );
    }
  };

  return (
    <div className={`${s.lp} ${escritorio ? s.ancha : ""}`}>
      {c.anuncio.trim() && <div className={s.anuncio}>{c.anuncio}</div>}
      <div className={s.cabecera}>
        Tu tienda
        <span>Carrito (0)</span>
      </div>
      {c.secciones.filter((x) => x.visible).map((x) => bloque(x.clave))}
      <div className={s.pie}>Política de envíos · Cambios y devoluciones</div>
      <div className={s.fija}>
        <b>{precio === null ? "" : f.format(precio)}</b>
        <span className={s.boton}>Comprar ahora</span>
      </div>
    </div>
  );
}
