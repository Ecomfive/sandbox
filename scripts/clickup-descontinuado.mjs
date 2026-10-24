// ClickUp quedó descontinuado (24 oct 2026, pedido de Hernán): el sistema es la fuente de todo (compras, publicaciones de Dropi,
// productos, dropshippers, envíos). Volver a traer datos de ClickUp duplicaría o pisaría lo que ya se trabaja aquí, así que los
// scripts que leían o importaban de ClickUp llaman a esto primero y se detienen.

export function clickupDescontinuado(script) {
  console.error(
    `ClickUp está descontinuado (24 oct 2026): «${script}» ya no se usa. El sistema es la fuente; ` +
      "traer datos de ClickUp duplicaría o pisaría lo que ya se trabaja aquí.",
  );
  process.exit(1);
}
