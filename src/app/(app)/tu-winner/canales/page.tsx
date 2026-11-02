import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarCanales, cargarGanadores, cargarLecturas, rangoDeVentas } from "../datos";
import { EncabezadoTuWinner } from "../encabezado";
import { TablaCanales } from "../tabla-canales";

export const metadata = { title: "Se repite en varios canales · Tu Winner" };

export const dynamic = "force-dynamic";

/** Tu Winner › Se repite en varios canales: los ganadores juntados por producto y en cuántas fuentes del Testing Lab aparecen (boceto aprobado). */
export default async function CanalesPage() {
  const u = await requireModulo("tu-winner");
  const supabase = createServiceClient();
  const [ganadores, lecturas] = await Promise.all([cargarGanadores(supabase, false), cargarLecturas(supabase, 1)]);
  const filas = ganadores ? await cargarCanales(supabase, ganadores) : [];
  const escribe = !u.modulosSoloLectura.includes("tu-winner");
  const puedeSeleccion = escribe && u.modulos.includes("seleccion-productos") && !u.modulosSoloLectura.includes("seleccion-productos");
  return (
    <div className="tw-pagina">
      <EncabezadoTuWinner ultima={lecturas?.[0] ?? null} rango={rangoDeVentas(ganadores)} escribe={escribe && !!lecturas} />
      {!ganadores ? (
        <p className="aviso mal">Falta correr en Supabase la migración 0223 (Tu Winner).</p>
      ) : (
        <section style={{ display: "grid", gap: 14 }}>
          <p className="sub" style={{ margin: 0 }}>
            Un producto que gana en Tu Winner, sigue vendiendo en el catálogo de Dropi, tiene anuncios corriendo y lo piden los clientes es una apuesta más segura. Aquí se juntan las
            fuentes por producto: cuantos más canales, más arriba.
          </p>
          <div className="leyenda">
            <span>
              <i style={{ background: "var(--primario)" }} /> Canal donde aparece
            </span>
            <span>
              <span className="et no" style={{ padding: "0 6px" }}>
                No lo tenemos
              </span>{" "}
              oportunidad para Selección
            </span>
          </div>
          <TablaCanales filas={filas} puedeSeleccion={puedeSeleccion} />
          <p className="nota">
            <b>Drop Killer</b> todavía no está conectado al sistema: su columna queda lista para cuando se cargue. La Biblioteca de anuncios sale de las capturas del módulo Instagram;
            la competencia, del catálogo de Dropi de Análisis de competencia.
          </p>
        </section>
      )}
    </div>
  );
}
