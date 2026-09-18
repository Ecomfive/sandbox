import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { crearSkuSimple, crearCombo, cambiarEstadoSku } from "./actions";
import { ComboBuilder } from "./combo-builder";

export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO: Record<string, string> = {
  propuesto: "Propuesto",
  en_revision: "En revisión",
  aprobado: "Aprobado",
};

const TONO_ESTADO: Record<string, "warning" | "info" | "success"> = {
  propuesto: "warning",
  en_revision: "info",
  aprobado: "success",
};

interface SkuMaestro {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  estado: string;
  creado_en: string;
  aprobado_en: string | null;
}

export default async function CatalogoMaestroPage() {
  await requireModulo("catalogo-maestro");
  const supabase = createServiceClient();

  const { data: skus } = await supabase
    .from("skus_maestros")
    .select("id, codigo, nombre, tipo, estado, creado_en, aprobado_en")
    .order("creado_en", { ascending: false });

  const lista: SkuMaestro[] = skus ?? [];
  const ids = lista.map((s) => s.id);

  const { data: componentesFilas } = await supabase
    .from("sku_maestro_componentes")
    .select("combo_id, cantidad, componente:componente_id(codigo, nombre)")
    .in("combo_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const componentesPorCombo = new Map<string, { codigo: string; nombre: string; cantidad: number }[]>();
  for (const fila of componentesFilas ?? []) {
    const componente = fila.componente as unknown as { codigo: string; nombre: string } | null;
    if (!componente) continue;
    if (!componentesPorCombo.has(fila.combo_id)) componentesPorCombo.set(fila.combo_id, []);
    componentesPorCombo.get(fila.combo_id)!.push({ ...componente, cantidad: fila.cantidad });
  }

  const opcionesSimples = lista.filter((s) => s.tipo === "simple" && s.estado === "aprobado");

  const conteo = { propuesto: 0, en_revision: 0, aprobado: 0 };
  for (const s of lista) conteo[s.estado as keyof typeof conteo]++;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Catálogo maestro de SKU</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un SKU maestro representa un producto físico, sin importar en qué plataforma se venda.
          Los combos se arman con varios SKU maestros simples y una cantidad de cada uno. Todo pasa
          por revisión antes de quedar aprobado.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Propuestos</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{conteo.propuesto}</p>
        </div>
        <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">En revisión</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{conteo.en_revision}</p>
        </div>
        <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Aprobados</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{conteo.aprobado}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <form action={crearSkuSimple} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Proponer SKU simple</h2>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Nombre</label>
            <input type="text" name="nombre" required className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Código (opcional, se genera uno si lo dejas vacío)</label>
            <input type="text" name="codigo" className={fieldClass} />
          </div>
          <Button type="submit" className="self-start">
            Proponer
          </Button>
        </form>

        <form action={crearCombo} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Proponer combo</h2>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Nombre</label>
            <input type="text" name="nombre" required className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Código (opcional)</label>
            <input type="text" name="codigo" className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Componentes</label>
            {opcionesSimples.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Todavía no hay SKUs simples aprobados para armar un combo. Aprueba al menos uno primero.
              </p>
            ) : (
              <ComboBuilder opciones={opcionesSimples} />
            )}
          </div>
          <Button type="submit" disabled={opcionesSimples.length === 0} className="self-start">
            Proponer combo
          </Button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">Código</th>
              <th className="py-2 pr-3 font-medium">Nombre</th>
              <th className="py-2 pr-3 font-medium">Tipo</th>
              <th className="py-2 pr-3 font-medium">Componentes</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
              <th className="py-2 pr-3 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                  Todavía no hay SKUs maestros propuestos.
                </td>
              </tr>
            )}
            {lista.map((s) => {
              const componentes = componentesPorCombo.get(s.id) ?? [];
              const siguientes: { etiqueta: string; valor: string }[] =
                s.estado === "propuesto"
                  ? [{ etiqueta: "Enviar a revisión", valor: "en_revision" }]
                  : s.estado === "en_revision"
                    ? [
                        { etiqueta: "Aprobar", valor: "aprobado" },
                        { etiqueta: "Regresar a propuesto", valor: "propuesto" },
                      ]
                    : [{ etiqueta: "Regresar a revisión", valor: "en_revision" }];

              return (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 pl-4 font-medium">{s.codigo}</td>
                  <td className="py-2 pr-3">{s.nombre}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {s.tipo === "combo" ? "Combo" : "Simple"}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {s.tipo === "combo"
                      ? componentes.map((c) => `${c.cantidad}× ${c.codigo}`).join(", ") || "—"
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={TONO_ESTADO[s.estado]}>{ETIQUETA_ESTADO[s.estado]}</Badge>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      {siguientes.map((sig) => (
                        <form key={sig.valor} action={cambiarEstadoSku}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="nuevo_estado" value={sig.valor} />
                          <Button type="submit" variant="secondary" className="text-xs">
                            {sig.etiqueta}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
