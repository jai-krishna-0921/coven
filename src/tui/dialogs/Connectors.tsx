/**
 * Connectors dialog (§ Auth): the provider picker behind `/login` and
 * `/connectors`. Rows come from {@link listConnectors} — the live catalog +
 * auth store — so each provider shows its real state:
 *   • keyless local providers (Ollama) → "local · no key needed", already ready;
 *   • keyed providers with a resolved key → "✓ env" / "✓ saved";
 *   • keyed providers with no key → "needs <ENV_VAR>".
 *
 * Selecting a keyed provider opens the masked key prompt (env-var name shown so
 * the user knows exactly what they're pasting). Selecting Ollama explains it is
 * keyless and jumps straight to the model picker so they can choose an
 * `ollama/*` model (or type `/model ollama/<name>` for a custom local model).
 */
import { SelectDialog, type SelectOption } from "./Select.tsx";
import { listConnectors, type ConnectorInfo } from "../commands.ts";
import type { CommandContext } from "../types.ts";

function statusHint(c: ConnectorInfo): string {
  if (c.keyless) return "local · no key needed";
  if (c.ready) return c.source === "env" ? "✓ connected (env)" : "✓ connected (saved)";
  return c.envVar ? `needs ${c.envVar}` : "needs API key";
}

export function Connectors({ ctx }: { ctx: CommandContext }) {
  const connectors = listConnectors(ctx);
  const options: SelectOption[] = connectors.map((c) => ({
    value: c.id,
    label: c.name,
    hint: statusHint(c),
  }));

  return (
    <SelectDialog
      title="Connectors — pick a provider to connect"
      options={options}
      footer="enter connect · esc close   ·   Ollama is local & keyless"
      onSelect={(id) => {
        const info = connectors.find((c) => c.id === id);
        if (!info) {
          ctx.closeModal();
          return;
        }
        if (info.keyless) {
          ctx.toast(`${info.name} is local & keyless — choose an ${info.id}/* model`, "info");
          ctx.openModal("models");
          return;
        }
        ctx.openModal("prompt", {
          kind: "login",
          message: `Paste API key for ${info.name}${info.envVar ? `  (${info.envVar})` : ""}`,
          onSubmit: (key) => {
            const trimmed = key.trim();
            if (!trimmed) {
              ctx.closeModal();
              return;
            }
            ctx.app.auth?.set(info.id, trimmed);
            ctx.app.providers.invalidate(info.id);
            ctx.toast(`Saved ${info.name} key`, "success");
            ctx.closeModal();
          },
        });
      }}
      onCancel={() => ctx.closeModal()}
    />
  );
}
