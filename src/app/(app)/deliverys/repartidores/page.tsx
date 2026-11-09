import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { SIN_MIGRACION } from "@/lib/deliverys/guardar";
import { enmascararDocumento, enmascararTelefono } from "@/lib/deliverys/repartidor";
import type { MetodoPago } from "@/lib/deliverys/liquidacion";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaRepartidores, type FilaRepartidor } from "./tabla-repartidores";

export const metadata = { title: "Repartidores" };

export const dynamic = "force-dynamic";

const MODULO = "deliverys";

export default async function RepartidoresPage() {
  const usuario = await requireModulo(MODULO);
  const puedeEscribir = !usuario.modulosSoloLectura.includes(MODULO);
  const { data, error } = await createServiceClient().from("del_repartidores").select("id, nombre, documento, telefono, alias, medio_pago, activo").order("nombre");
  // Documento y teléfono salen del servidor ya enmascarados: el completo solo lo pide la ficha.
  const filas: FilaRepartidor[] = (data ?? []).map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    documento: enmascararDocumento(r.documento as string | null),
    telefono: enmascararTelefono(r.telefono as string | null),
    alias: (r.alias as string[] | null) ?? [],
    medioPago: (r.medio_pago as MetodoPago | null) ?? null,
    activo: r.activo !== false,
  }));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Repartidores" imprimir={false} />
      {error ? <EstadoVacioAF4 titulo="Falta la tabla de repartidores">{SIN_MIGRACION}</EstadoVacioAF4> : <TablaRepartidores filas={filas} puedeEscribir={puedeEscribir} />}
    </Pagina>
  );
}
