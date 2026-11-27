import { ElegirClave } from "@/components/repartidor/elegir-clave";
import { MisPagos } from "@/components/repartidor/mis-pagos";
import { NavRepartidor } from "@/components/repartidor/piezas";
import { repartidorConClaveTemporal, requireRepartidor } from "@/lib/despacho/sesion-repartidor";
import { datosPagos } from "./datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis pagos" };

/** App del delivery › Mis pagos (25 nov 2026, pantalla 3 del prototipo aprobado). */
export default async function PaginaMisPagos() {
  const cuenta = await requireRepartidor();
  const nombre = cuenta.nombre.split(/\s+/)[0] || cuenta.nombre;
  if (await repartidorConClaveTemporal()) return <ElegirClave temporal nombre={nombre} />;
  const datos = await datosPagos(cuenta);
  if (!datos) {
    return (
      <>
        <p className="m-4 rounded-lg bg-white p-4 text-sm">Tu cuenta todavía no está en el control de envíos. Avísale a Despacho.</p>
        <div className="flex-1" />
        <NavRepartidor activa="pagos" />
      </>
    );
  }
  const porFirmar = datos.semanas.find((s) => s.estado === "enviada") ?? null;
  return (
    <MisPagos
      nombre={cuenta.nombre}
      porFirmar={porFirmar}
      porCerrar={datos.porCerrar}
      enCurso={datos.enCurso}
      anteriores={datos.semanas.filter((s) => s.id !== porFirmar?.id)}
      faltanDatos={!datos.delivery.nombreCompleto || !datos.delivery.cedula}
    />
  );
}
