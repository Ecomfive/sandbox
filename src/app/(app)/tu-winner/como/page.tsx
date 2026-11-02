import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarGanadores, cargarLecturas, rangoDeVentas } from "../datos";
import { EncabezadoTuWinner } from "../encabezado";

export const metadata = { title: "Cómo se actualiza · Tu Winner" };

export const dynamic = "force-dynamic";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Panama" });

/** Tu Winner › Cómo se actualiza: de dónde salen los datos (boceto aprobado) y las últimas lecturas. */
export default async function ComoPage() {
  const u = await requireModulo("tu-winner");
  const supabase = createServiceClient();
  const [ganadores, lecturas] = await Promise.all([cargarGanadores(supabase, false), cargarLecturas(supabase, 10)]);
  const escribe = !u.modulosSoloLectura.includes("tu-winner");
  return (
    <div className="tw-pagina">
      <EncabezadoTuWinner ultima={lecturas?.[0] ?? null} rango={rangoDeVentas(ganadores)} escribe={escribe && !!lecturas} />
      <section style={{ display: "grid", gap: 14 }}>
        <div className="panel">
          <h2>De dónde salen los datos</h2>
          <ol className="pasos">
            <li>
              Cada día, la primera vez que alguien abre Tu Winner en el sistema (o con «Leer ahora»), la extensión «Ecomfive · Dropi» abre Tu Winner en ese Chrome con la cuenta de
              Ecomfive y lee los ganadores de <b>Panamá</b> y <b>México</b>. <b>Costa Rica no está en Tu Winner.</b>
            </li>
            <li>
              De cada producto guarda: el <b>ID de Dropi</b>, nombre, precio del proveedor y sugerido, proveedor, plataforma, stock y las ventas de cada día.
            </li>
            <li>
              Con el ID de Dropi el cruce es exacto: se sabe si es <b>nuestro</b>, si ya está en <b>Producto</b> (por su publicación o por la competencia enlazada) y, si no, se busca por el
              nombre en Producto, lo publicado, lo comprado y lo testeado.
            </li>
            <li>Se junta con Scraping de proveedores, Biblioteca de anuncios (Instagram), Sugerencias de clientes y, cuando exista, Drop Killer, para «Se repite en varios canales».</li>
            <li>
              Lo que interese pasa a <b>Selección de productos</b> con un clic, con su código TW-0001, y desde ahí sigue el camino de siempre (test, compra).
            </li>
          </ol>
        </div>
        <div className="panel">
          <h2>Últimas lecturas</h2>
          {!lecturas ? (
            <p className="aviso mal">Falta correr en Supabase la migración 0223 (Tu Winner).</p>
          ) : !lecturas.length ? (
            <p className="meta">Todavía no se leyó Tu Winner.</p>
          ) : (
            <ul className="eventos">
              {lecturas.map((l) => (
                <li key={l.id}>
                  <span className="f">{fechaHora(l.inicio)}</span>
                  <span>
                    {l.estado === "listo"
                      ? `${l.resumen?.PA ?? 0} ganadores de Panamá y ${l.resumen?.MX ?? 0} de México`
                      : l.estado === "corriendo"
                        ? "Leyendo…"
                        : `No se pudo: ${l.error ?? "sin detalle"}`}
                    {l.quien ? ` · ${l.quien}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="nota">
          <b>Solo lee.</b> El sistema no cambia nada en Tu Winner ni en Dropi. La sesión de Tu Winner queda en el Chrome de quien la abre; el sistema nunca guarda la contraseña. Hace
          falta la extensión «Ecomfive · Dropi» 0.5.0.
        </div>
      </section>
    </div>
  );
}
