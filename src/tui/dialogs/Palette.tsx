/**
 * Command palette (§12): the full {@link buildPaletteItems} catalog surfaced
 * through {@link SelectDialog}, grouped by category, each row hinting its
 * keybinding. `enter` runs the chosen item; the palette closes first so items
 * that open another modal (models/agents/themes/help/rename/…) aren't clobbered
 * by a trailing `closeModal`.
 */
import { SelectDialog, type SelectOption } from "./Select.tsx";
import { buildPaletteItems } from "../commands.ts";
import type { CommandContext } from "../types.ts";

export function Palette({ ctx }: { ctx: CommandContext }) {
  const items = buildPaletteItems(ctx);
  const options: SelectOption[] = items.map((item) => ({
    value: item.id,
    label: item.title,
    hint: item.keybinding,
    group: item.category,
  }));

  return (
    <SelectDialog
      title="Commands"
      options={options}
      footer="enter run · esc close"
      onSelect={(value) => {
        const item = items.find((i) => i.id === value);
        ctx.closeModal();
        void Promise.resolve(item?.run(ctx)).catch((error) => {
          ctx.toast(error instanceof Error ? error.message : String(error), "error");
        });
      }}
      onCancel={() => ctx.closeModal()}
    />
  );
}
