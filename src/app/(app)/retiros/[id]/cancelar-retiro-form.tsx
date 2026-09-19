"use client";

import { cancelarRetiro } from "../actions";
import { Button } from "@/components/ui/button";

/** Pide confirmación antes de cancelar: es una acción irreversible sobre un registro financiero. */
export function CancelarRetiroForm({ retiroId }: { retiroId: string }) {
  return (
    <form
      action={cancelarRetiro}
      className="border-t border-border pt-4"
      onSubmit={(e) => {
        if (!confirm("¿Seguro que quieres cancelar este retiro? Esta acción no se puede deshacer.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={retiroId} />
      <Button
        type="submit"
        variant="secondary"
        className="!border-destructive !text-destructive hover:!bg-destructive-soft"
      >
        Cancelar retiro
      </Button>
    </form>
  );
}
