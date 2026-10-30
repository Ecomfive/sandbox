import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { accesoCrm, MODULO_DIRECCION } from "@/lib/crm/areas";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDireccion } from "./datos-direccion";
import { PanelDireccion } from "./panel-direccion";

export const metadata = { title: "Dirección" };

export const dynamic = "force-dynamic";

/**
 * CRM › Dirección (30 oct 2026, fase 1 del panel del CEO, módulo `crm-direccion`): la salud de cada dropshipper con cuenta de Dropi en el
 * país, la cola «Qué atender hoy» (caídas, dormidos, devoluciones altas y los que no hacen su primer pedido) y los pedidos por semana. Solo
 * lo ve Dirección: los chats y las pantallas de Comercial y Atención no cambian.
 */
export default async function DireccionCrmPage() {
  const usuario = await requireModulo(MODULO_DIRECCION);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const datos = await cargarDireccion(supabase, pais.id);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Dirección" oculto>
        La salud de la cartera y a quién atender hoy, con los pedidos de Dropi de cada dropshipper.
      </EncabezadoPagina>
      {"error" in datos ? (
        <p role="alert" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          {datos.error}
        </p>
      ) : (
        <PanelDireccion datos={datos} codigoPais={pais.codigo} escribe={accesoCrm(usuario).escribeDireccion} usuarioId={usuario.id} />
      )}
    </Pagina>
  );
}
