import type { LecturaVista } from "./datos";
import { LeerTuWinner } from "./leer-tuwinner";
import { fechaCorta } from "./formato";

const fechaHora = (iso: string) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
  const hora = d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Panama" });
  const hoy = new Date().toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
  return `${dia === hoy ? "hoy " : ""}${dia}, ${hora}`;
};

/** El título del panel y la última lectura («Leído hoy 2 nov, 06:10 · ventas del 25 oct al 1 nov»), con «Leer ahora». Igual al boceto. */
export function EncabezadoTuWinner({ ultima, rango, escribe }: { ultima: LecturaVista | null; rango: { desde: string; hasta: string } | null; escribe: boolean }) {
  const lista = ultima && ultima.estado === "listo" ? ultima : null;
  const leidoHoy =
    !!lista && new Date(lista.fin ?? lista.inicio).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) === new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  return (
    <div className="encabezado">
      <div>
        <h1>Tu Winner</h1>
        <p className="sub">Los productos que más se venden hoy en Dropi según Tu Winner, cruzados con lo que ya tenemos y con las demás fuentes del Testing Lab.</p>
      </div>
      <div className="lectura">
        {ultima ? (
          <>
            <span className={`punto${ultima.estado === "error" ? " mal" : ultima.estado === "corriendo" ? " leyendo" : ""}`} />
            {ultima.estado === "error"
              ? `La última lectura falló (${fechaHora(ultima.inicio)}): ${ultima.error ?? "sin detalle"}`
              : ultima.estado === "corriendo"
                ? `Leyendo desde ${fechaHora(ultima.inicio)}…`
                : `Leído ${fechaHora(ultima.fin ?? ultima.inicio)}${rango ? ` · ventas del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}` : ""}`}
          </>
        ) : (
          <>
            <span className="punto mal" /> Todavía no se leyó Tu Winner
          </>
        )}
        {escribe && <LeerTuWinner leidoHoy={leidoHoy} auto />}
      </div>
    </div>
  );
}
