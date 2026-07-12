/**
 * Models dialog (§12): `catalog.list()` grouped by provider, filterable via
 * {@link SelectDialog}. Each row shows the context window and `$in/$out` pricing;
 * providers with a resolvable key (`auth.resolveKey`) are marked with a check.
 * `enter` persists the choice through `engine.setModel` (the real engine method),
 * records it in `prefs.recentModels` (MRU, capped), then closes.
 *
 * `catalog`/`auth` are optional App members — both are accessed with `?.` (no
 * non-null assertions); a missing catalog yields an empty, still-navigable list.
 */
import { SelectDialog, type SelectOption } from "./Select.tsx";
import { useTheme } from "../context.tsx";
import type { CommandContext } from "../types.ts";
import type { CatalogModelLike } from "../../app.ts";

const RECENT_CAP = 8;

/** Compact context-window label: 200000 → "200K". */
function formatContext(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}K` : `${tokens}`;
}

function modelRow(model: CatalogModelLike, check: string | undefined): SelectOption {
  const price = `$${model.cost.input}/$${model.cost.output}`;
  return {
    value: `${model.providerID}/${model.modelID}`,
    label: `${model.name}  ${formatContext(model.contextLimit)}  ${price}`,
    hint: check,
    group: model.providerID,
  };
}

export function Models({ ctx }: { ctx: CommandContext }) {
  const { icons } = useTheme();
  const models = ctx.app.catalog?.list() ?? [];
  // A provider is "ready" if a key resolves OR it is keyless-local (empty env,
  // e.g. Ollama) — so local models aren't misleadingly shown as un-connected.
  const keyless = new Set(
    (ctx.app.catalog?.providers() ?? []).filter((p) => p.env.length === 0).map((p) => p.id),
  );
  const options: SelectOption[] = models.map((model) => {
    const ready = keyless.has(model.providerID) || ctx.app.auth?.resolveKey(model.providerID) !== undefined;
    return modelRow(model, ready ? icons.ok : undefined);
  });

  return (
    <SelectDialog
      title="Models"
      options={options}
      footer="enter select · esc close"
      onSelect={(ref) => {
        ctx.app.engine.setModel(ctx.session.id, ref);
        const recent = [ref, ...ctx.prefs.recentModels.filter((m) => m !== ref)].slice(0, RECENT_CAP);
        ctx.setPrefs({ recentModels: recent });
        ctx.closeModal();
      }}
      onCancel={() => ctx.closeModal()}
    />
  );
}
