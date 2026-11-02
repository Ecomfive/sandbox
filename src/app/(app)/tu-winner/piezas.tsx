"use client";

import { useState } from "react";
import type { DiaDeVentas } from "@/lib/tuwinner/tuwinner";
import type { Ganador } from "./datos";
import { iniciales, n, NOMBRE_PAIS } from "./formato";

// Piezas del panel Tu Winner, iguales a las del boceto aprobado: números, la foto, la línea de ventas por día y las etiquetas de cada ganador.

/** La foto de Tu Winner; si no carga (su servidor a veces falla), las iniciales. */
export function FotoProducto({ src, nombre }: { src: string | null; nombre: string }) {
  const [rota, setRota] = useState(false);
  return (
    <span className="foto" aria-hidden="true">
      {src && !rota ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setRota(true)} />
      ) : (
        iniciales(nombre)
      )}
    </span>
  );
}

/** La línea de ventas de cada día (área suave, punto en el último día) con los reabastecimientos en verde detrás. */
export function Spark({ dias }: { dias: DiaDeVentas[] }) {
  if (dias.length < 2) return <span className="meta">—</span>;
  const w = 160;
  const h = 34;
  const vals = dias.map((d) => d.ventas);
  const max = Math.max(1, ...vals);
  const paso = w / (vals.length - 1);
  const pts = vals.map((v, i) => [i * paso, h - 4 - (v / max) * (h - 8)] as const);
  const linea = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const ult = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      {dias.map((d, i) => (d.reabastecio ? <rect key={d.dia} x={i * paso - 2} y={2} width={4} height={h - 4} rx={2} fill="var(--success)" opacity={0.35} /> : null))}
      <path d={`${linea} L${w},${h} L0,${h} Z`} fill="var(--primario-suave)" />
      <path d={linea} fill="none" stroke="var(--tw-linea)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <circle cx={ult[0]} cy={ult[1]} r={2.6} fill="var(--tw-linea)" />
    </svg>
  );
}

const PREFIJO_REF = { producto: "En Producto", publicacion: "Lo vendemos", compra: "Comprado", test: "Testeado" } as const;

/** Las etiquetas de un ganador: si es nuestro, si ya lo tenemos (y dónde), privado o no lo tenemos; en cuántos canales; y nuestras ventas. */
export function EtiquetasGanador({ g }: { g: Ganador }) {
  const pais = NOMBRE_PAIS[g.pais];
  let principal: React.ReactNode;
  if (g.estado === "nuestro") principal = <span className="et nuestro">Nuestro{g.etiqueta ? ` · ${g.etiqueta}` : ""}</span>;
  else if (g.estado === "tenemos")
    principal = (
      <span className="et tenemos" title={g.etiqueta ?? undefined}>
        {PREFIJO_REF[g.tipoRef ?? "producto"]}
        {g.etiqueta ? ` · ${g.etiqueta.split(" · ")[0].replace(/^SKU /, "")}` : ""}
      </span>
    );
  else if (g.estado === "privado") principal = <span className="et canal">Privado del proveedor</span>;
  else principal = <span className="et no">No lo tenemos</span>;
  let comparar: React.ReactNode = null;
  if (g.estado === "nuestro" && g.nos) comparar = <div className="comparar">Nosotros: {n(g.nos.ventas)} ventas esta semana</div>;
  else if (g.nos && g.nos.pubs === 0) comparar = <div className="comparar">Sin publicación nuestra en {pais}</div>;
  else if (g.nos && g.nos.ventas === 0)
    comparar = (
      <div className="comparar">
        Nosotros: <b>0 ventas</b> esta semana con {g.nos.pubs} {g.nos.pubs === 1 ? "publicación" : "publicaciones"}
      </div>
    );
  else if (g.nos) comparar = <div className="comparar">Nosotros: {n(g.nos.ventas)} ventas esta semana</div>;
  return (
    <>
      <div className="etiquetas">
        {principal}
        {g.canales >= 3 && <span className="et canal">En {g.canales} canales</span>}
        {g.enSeleccion && <span className="et canal">En Selección · {g.enSeleccion}</span>}
      </div>
      {comparar}
    </>
  );
}
