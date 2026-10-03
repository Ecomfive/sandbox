import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { accesoCrm } from "@/lib/crm/areas";
import { sugerirDropshippers } from "@/lib/crm/sugerencias";
import { requireModulo } from "@/lib/auth";
import { TablaVinculos, type FilaVinculo } from "../tabla-vinculos";

export const metadata = { title: "Vínculos" };

export const dynamic = "force-dynamic";

const PLATAFORMA = "Dropi";

/** Usuarios de la plataforma con pedidos que todavía no están vinculados a ningún dropshipper, con una sugerencia por nombre de tienda. */
export default async function VinculosDropshippersPage() {
  const usuario = await requireModulo("crm-dropshippers");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataforma }, { data: dropshippers }] = await Promise.all([
    supabase.from("plataformas").select("id").eq("nombre", PLATAFORMA).maybeSingle(),
    supabase.from("dropshippers").select("id, nombre, tienda, tiendas").order("nombre").limit(2000),
  ]);
  const { data: usuarios } = plataforma
    ? await supabase.rpc("crm_usuarios_plataforma", { p_plataforma: plataforma.id, p_pais: pais.id })
    : { data: [] };

  const lista = (dropshippers ?? []).map((d) => ({ id: d.id as string, nombre: d.nombre as string, tiendas: ((d.tiendas as string[] | null)?.length ? (d.tiendas as string[]) : d.tienda ? [d.tienda as string] : []) }));
  const todos = (usuarios ?? []) as { id_externo: string; tienda_nombre: string | null; pedidos: number; ultimo_pedido: string | null; dropshipper_id: string | null }[];
  const sinVincular = todos.filter((u) => !u.dropshipper_id);

  const filas: FilaVinculo[] = sinVincular.map((u) => ({
    idExterno: String(u.id_externo),
    tienda: u.tienda_nombre,
    pedidos: Number(u.pedidos),
    ultimoPedido: u.ultimo_pedido,
    sugeridos: sugerirDropshippers(u.tienda_nombre, lista),
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Vínculos" oculto />
      <TablaVinculos
        filas={filas}
        dropshippers={lista}
        vinculados={todos.length - sinVincular.length}
        codigoPais={pais.codigo}
        plataforma={PLATAFORMA}
        puedeEscribir={accesoCrm(usuario).escribeAtencion}
      />
    </Pagina>
  );
}
