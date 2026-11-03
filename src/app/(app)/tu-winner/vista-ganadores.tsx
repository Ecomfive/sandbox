"use client";

import { useState } from "react";
import { Bandera } from "@/components/paises/bandera";
import type { PaisTuWinner } from "@/lib/tuwinner/tuwinner";
import type { EstadoGanador, Ganador } from "./datos";
import { n } from "./formato";
import { ConFotoGrande, EtiquetasGanador, FotoProducto, Spark } from "./piezas";

type Filtro = "todos" | EstadoGanador;
const FILTROS: [Filtro, string][] = [
  ["todos", "Todos"],
  ["no", "No los tenemos"],
  ["tenemos", "Ya en Producto"],
  ["nuestro", "Nuestros"],
];

/**
 * «Ganadores» de Tu Winner (igual al boceto): el país (Panamá, México; Costa Rica no está en Tu Winner), el resumen, los filtros y la lista ordenada por
 * ventas de 7 días con su línea de ventas por día, stock y cómo está cada uno en el sistema.
 */
export function VistaGanadores({ ganadores }: { ganadores: Record<PaisTuWinner, Ganador[]> }) {
  const [pais, setPais] = useState<PaisTuWinner>(ganadores.PA.length || !ganadores.MX.length ? "PA" : "MX");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const todos = ganadores[pais];
  const cuenta = (e: EstadoGanador) => todos.filter((x) => x.estado === e).length;
  const tot = todos.reduce((a, x) => a + x.ventas7, 0);
  const lista = todos.filter((x) => filtro === "todos" || x.estado === filtro);
  const moneda = pais === "PA" ? "$" : "MX$";
  const precio = (x: Ganador) =>
    x.precio === null
      ? null
      : pais === "PA"
        ? `${moneda}${x.precio.toFixed(2)}${x.sugerido !== null ? ` · sugerido ${moneda}${x.sugerido.toFixed(2)}` : ""}`
        : `${moneda}${n(x.precio)}${x.sugerido !== null && x.sugerido !== x.precio ? ` · sugerido ${moneda}${n(x.sugerido)}` : ""}`;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="paises">
        {(["PA", "MX"] as const).map((c) => (
          <button
            key={c}
            type="button"
            className="pais"
            aria-pressed={pais === c}
            onClick={() => {
              setPais(c);
              setFiltro("todos");
            }}
          >
            <Bandera codigo={c} /> {c === "PA" ? "Panamá" : "México"} <span className="n">{n(ganadores[c].length)} ganadores</span>
          </button>
        ))}
        <button type="button" className="pais" disabled title="Tu Winner no tiene Costa Rica">
          <Bandera codigo="CR" /> Costa Rica <span className="n">sin datos</span>
        </button>
      </div>

      <div className="cifras">
        {(
          [
            ["Ganadores", n(todos.length), `${n(tot)} ventas en 7 días`],
            ["Nuestros", n(cuenta("nuestro")), "Productos de Ecomfive entre los ganadores"],
            ["Ya en Producto", n(cuenta("tenemos")), "Los vende otro proveedor y nosotros también los tenemos"],
            ["No los tenemos", n(cuenta("no")), "Candidatos para Selección de productos"],
          ] as const
        ).map(([t, v, d]) => (
          <div key={t} className="cifra">
            <span className="t">{t}</span>
            <span className="v">{v}</span>
            <span className="d">{d}</span>
          </div>
        ))}
      </div>

      <div className="filtros">
        {FILTROS.map(([k, t]) => (
          <button key={k} type="button" className="chip" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>
            {t}
          </button>
        ))}
        <span className="meta" style={{ marginLeft: "auto" }}>
          Ordenado por ventas de 7 días
        </span>
      </div>

      <div className="lista">
        <div className="fila cab">
          <span>#</span>
          <span />
          <span>Producto</span>
          <span className="col-graf">Ventas por día</span>
          <span className="num">Ventas 7 d</span>
          <span className="num col-stock">Stock</span>
          <span className="col-et">En el sistema</span>
        </div>
        {lista.length ? (
          lista.map((x) => (
            <div key={x.dropiId} className="fila">
              <span className="rank">{x.posicion}</span>
              <FotoProducto src={x.foto} nombre={x.nombre} />
              <span style={{ minWidth: 0 }}>
                {/* Pasar el cursor por el nombre también muestra la foto grande. */}
                <ConFotoGrande src={x.foto} claseEnvoltura="max-w-full min-w-0">
                  <span className="nombre">{x.nombre}</span>
                </ConFotoGrande>
                <div className="meta">{[x.proveedor, x.plataforma ?? `Dropi ${pais}`, `ID ${x.dropiId}`, precio(x)].filter(Boolean).join(" · ")}</div>
              </span>
              <span className="col-graf">
                <Spark dias={x.dias} />
              </span>
              <span className="num">
                <b>{n(x.ventas7)}</b>
              </span>
              <span className="num col-stock">
                {n(x.stock)}
                {x.stock !== null && x.stock < 30 && (
                  <div>
                    <span className="et alerta">Poco stock</span>
                  </div>
                )}
              </span>
              <span className="col-et" style={{ minWidth: 0 }}>
                <EtiquetasGanador g={x} />
              </span>
            </div>
          ))
        ) : (
          <div className="fila">
            <span />
            <span />
            <span className="meta">{todos.length ? "Ninguno con este filtro." : "Todavía no hay ganadores leídos de este país: pulsa «Leer ahora»."}</span>
          </div>
        )}
      </div>
      <p className="nota">
        <b>«Ventas»</b> es lo que bajó el stock en Dropi en 7 días, como lo calcula Tu Winner; en verde, los días en que el proveedor reabasteció. <b>«Nosotros»</b> son nuestras
        ventas del mismo producto en Ventas Dropi esa semana.
      </p>
    </section>
  );
}
