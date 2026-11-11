import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarUtilidades } from "@/lib/finanzas/cargar-utilidades";
import { socioDelRetiro } from "@/lib/finanzas/utilidades";
import { TablaRetirosSocios, type FilaRetiroSocio } from "./tabla-retiros-socios";

export const metadata = { title: "Retiros de socios" };

export const dynamic = "force-dynamic";

export default async function RetirosSociosPage() {
  const usuario = await requireModulo("utilidades");
  const datos = await cargarUtilidades(createServiceClient());
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Retiros de socios" oculto />
        <EstadoVacioAF4 titulo="No se pudo leer la distribución de utilidades">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const socio = new Map(datos.socios.map((s) => [s.id, s.nombre]));
  const tienda = new Map(datos.unidades.map((u) => [u.id, u.nombre]));
  const filas: FilaRetiroSocio[] = [...datos.retiros]
    .sort((a, b) => b.periodo.localeCompare(a.periodo))
    .map((r) => {
      const id = socioDelRetiro(r, datos.socios);
      return {
        id: r.id,
        mes: r.periodo,
        tienda: tienda.get(r.unidad_id) ?? "—",
        descripcion: r.descripcion,
        cuenta: r.cuenta ?? "—",
        monto: r.monto,
        socio: id ? (socio.get(id) ?? "—") : "Sin atribuir",
        socioId: id,
        como: r.socio_manual ? "A mano" : id ? "Por nombre" : "Sin atribuir",
      };
    });
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Retiros de socios" imprimir={false} />
      <TablaRetirosSocios
        filas={filas}
        socios={datos.socios.filter((s) => s.activo).map((s) => ({ id: s.id, nombre: s.nombre }))}
        puedeEscribir={!usuario.modulosSoloLectura.includes("utilidades")}
      />
    </Pagina>
  );
}
