import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { diasDeStock, type PaisTuWinner } from "@/lib/tuwinner/tuwinner";
import { cargarGanadores, cargarLecturas, cargarSeguimiento, rangoDeVentas, type Seguimiento } from "../datos";
import { EncabezadoTuWinner } from "../encabezado";
import { fechaCorta, n, NOMBRE_PAIS } from "../formato";
import { ElegirProducto } from "./elegir-producto";

export const metadata = { title: "Seguimiento · Tu Winner" };

export const dynamic = "force-dynamic";

const PRODUCTO = /^(PA|MX)-(\d{1,9})$/;

/** Las ventas de cada día en barras (con los reabastecimientos en verde detrás), como en el boceto. */
function Grafica({ s }: { s: Seguimiento }) {
  const v = s.dias.slice(-14);
  if (!v.length) return <p className="meta">Todavía no hay días leídos de este producto.</p>;
  const w = 560;
  const h = 200;
  const izq = 40;
  const abajo = 24;
  const max = Math.max(10, ...v.map((d) => d.ventas));
  const tope = Math.ceil(max / 50) * 50;
  const ancho = (w - izq - 8) / v.length;
  const y = (val: number) => h - abajo - (val / tope) * (h - abajo - 12);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={`Ventas por día de ${s.producto.nombre}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const val = (tope / 4) * i;
        return (
          <g key={i}>
            <line x1={izq} x2={w - 4} y1={y(val)} y2={y(val)} stroke="var(--tw-line)" strokeWidth={1} />
            <text x={izq - 6} y={y(val) + 4} textAnchor="end" fontSize={10} fill="var(--tw-muted)">
              {n(Math.round(val))}
            </text>
          </g>
        );
      })}
      {v.map((d, i) => {
        const cx = izq + i * ancho + ancho * 0.18;
        const bw = ancho * 0.64;
        return (
          <g key={d.dia}>
            {d.reabastecio > 0 && (
              <>
                <rect x={cx} y={12} width={bw} height={h - abajo - 12} rx={4} fill="var(--success-soft)" />
                <text x={cx + bw / 2} y={26} textAnchor="middle" fontSize={10} fill="var(--success)">
                  +{n(d.reabastecio)}
                </text>
              </>
            )}
            <rect x={cx} y={y(d.ventas)} width={bw} height={h - abajo - y(d.ventas)} rx={3} fill="var(--tw-linea)" />
            {d.ventas > 0 && (
              <text x={cx + bw / 2} y={y(d.ventas) - 4} textAnchor="middle" fontSize={10} fill="var(--tw-fg)">
                {n(d.ventas)}
              </text>
            )}
            <text x={cx + bw / 2} y={h - 8} textAnchor="middle" fontSize={10} fill="var(--tw-muted)">
              {fechaCorta(d.dia)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const precio = (pais: PaisTuWinner, v: number | null) => (v === null ? "—" : pais === "PA" ? `$${v.toFixed(2)}` : `MX$${n(v)}`);

/** El historial: cuándo entró a los ganadores, los reabastecimientos, los cambios de precio o de proveedor, los días seguidos, el stock y lo nuestro. */
function Historial({ s }: { s: Seguimiento }) {
  const p = s.producto;
  const g = s.ganador;
  const filas: { f: string; texto: React.ReactNode; orden: string }[] = [];
  for (const e of s.eventos) {
    const dia = e.momento.slice(0, 10);
    const texto =
      e.tipo === "entro" ? (
        "Entra a los ganadores de Tu Winner."
      ) : e.tipo === "salio" ? (
        "Sale de los ganadores de Tu Winner."
      ) : e.tipo === "precio" ? (
        <>
          El proveedor cambió el precio: {precio(p.pais, Number(e.antes))} → <b>{precio(p.pais, Number(e.despues))}</b>.
        </>
      ) : (
        <>
          Cambió de proveedor: {e.antes} → <b>{e.despues}</b>.
        </>
      );
    filas.push({ f: fechaCorta(dia), texto, orden: e.momento });
  }
  for (const d of s.dias)
    if (d.reabastecio)
      filas.push({
        f: fechaCorta(d.dia),
        texto: (
          <>
            El proveedor reabasteció <b>{n(d.reabastecio)}</b> unidades.
          </>
        ),
        orden: `${d.dia}T12`,
      });
  filas.sort((a, b) => (a.orden < b.orden ? -1 : 1));
  const stockDias = diasDeStock(p.stock, p.ventas7);
  return (
    <ul className="eventos">
      {filas.map((x, i) => (
        <li key={i}>
          <span className="f">{x.f}</span>
          <span>{x.texto}</span>
        </li>
      ))}
      {p.ganador && g && (
        <li>
          <span className="f">Hoy</span>
          <span>
            Lleva <b>{g.diasGanando} {g.diasGanando === 1 ? "día" : "días seguidos"}</b> como ganador · {n(p.ventas7)} ventas en 7 días.
          </span>
        </li>
      )}
      <li>
        <span className="f">Hoy</span>
        <span>
          Precio del proveedor {precio(p.pais, p.precio)}
          {p.sugerido !== null ? ` (sugerido ${precio(p.pais, p.sugerido)})` : ""} · stock {n(p.stock)}
          {stockDias !== null && stockDias < 21 ? (
            <>
              {" "}
              · <b>se le acaba en unos {stockDias} días</b> al ritmo de esta semana
            </>
          ) : null}
          .
        </span>
      </li>
      {g && (
        <li>
          <span className="f">Nosotros</span>
          <span>
            {g.estado === "nuestro" ? (
              <>
                Es nuestro ({g.etiqueta}): {n(g.nos?.ventas ?? 0)} ventas esta semana.
              </>
            ) : g.estado === "tenemos" && g.nos && g.nos.pubs === 0 ? (
              <>Lo tenemos ({g.etiqueta}) pero sin publicación en {NOMBRE_PAIS[p.pais]}.</>
            ) : g.estado === "tenemos" && g.nos && g.nos.ventas === 0 ? (
              <>
                Lo tenemos ({g.etiqueta}) en {g.nos.pubs} {g.nos.pubs === 1 ? "publicación" : "publicaciones"} y vendimos <b>0</b> esta semana: revisar precio, stock o publicación.
              </>
            ) : g.estado === "tenemos" ? (
              <>
                Lo tenemos ({g.etiqueta}){g.nos ? `: ${n(g.nos.ventas)} ventas esta semana` : ""}.
              </>
            ) : g.estado === "privado" ? (
              "Es un producto privado del proveedor: no se ve qué es."
            ) : (
              "No lo tenemos: candidato para Selección de productos."
            )}
          </span>
        </li>
      )}
    </ul>
  );
}

/** Tu Winner › Seguimiento: las ventas de cada día de un ganador y su historial (boceto aprobado). Se guarda cada lectura, así se ve más que la última semana. */
export default async function SeguimientoPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireModulo("tu-winner");
  const { p } = await searchParams;
  const supabase = createServiceClient();
  const [ganadores, lecturas] = await Promise.all([cargarGanadores(supabase, false), cargarLecturas(supabase, 1)]);
  const escribe = !u.modulosSoloLectura.includes("tu-winner");
  const todos = ganadores ? [...ganadores.PA, ...ganadores.MX] : [];
  const elegido = PRODUCTO.exec(String(p ?? "")) ?? (todos[0] ? PRODUCTO.exec(`${todos[0].pais}-${todos[0].dropiId}`) : null);
  const s = elegido && ganadores ? await cargarSeguimiento(supabase, elegido[1] as PaisTuWinner, elegido[2], ganadores) : null;
  const opciones = todos.map((g) => ({ valor: `${g.pais}-${g.dropiId}`, etiqueta: `${NOMBRE_PAIS[g.pais]} · ${g.nombre}${g.proveedor ? ` · ${g.proveedor}` : ""}` }));
  if (s && !opciones.some((o) => o.valor === `${s.producto.pais}-${s.producto.dropiId}`))
    opciones.unshift({ valor: `${s.producto.pais}-${s.producto.dropiId}`, etiqueta: `${NOMBRE_PAIS[s.producto.pais]} · ${s.producto.nombre} (ya no gana)` });
  return (
    <div className="tw-pagina">
      <EncabezadoTuWinner ultima={lecturas?.[0] ?? null} rango={rangoDeVentas(ganadores)} escribe={escribe && !!lecturas} />
      {!ganadores ? (
        <p className="aviso mal">Falta correr en Supabase la migración 0223 (Tu Winner).</p>
      ) : !s ? (
        <p className="nota">Todavía no hay ganadores leídos: pulsa «Leer ahora».</p>
      ) : (
        <section style={{ display: "grid", gap: 14 }}>
          <ElegirProducto opciones={opciones} valor={`${s.producto.pais}-${s.producto.dropiId}`} />
          <div className="dos">
            <div className="panel">
              <h2>
                {s.producto.nombre} · ventas por día en {NOMBRE_PAIS[s.producto.pais]}
              </h2>
              <Grafica s={s} />
              <div className="leyenda">
                <span>
                  <i style={{ background: "var(--tw-linea)" }} /> Ventas del día (lo que bajó el stock)
                </span>
                <span>
                  <i style={{ background: "var(--success)" }} /> Reabastecimiento
                </span>
              </div>
            </div>
            <div className="panel">
              <h2>Historial</h2>
              <Historial s={s} />
            </div>
          </div>
          <p className="nota">
            <b>Por qué guardar cada lectura:</b> Tu Winner solo muestra la última semana. El sistema guarda la lectura de cada día: así se ve cuántos días seguidos lleva ganando un
            producto, cuándo dejó de ganar, cuándo el proveedor cambió el precio y cuándo se quedó sin stock.
          </p>
        </section>
      )}
    </div>
  );
}
