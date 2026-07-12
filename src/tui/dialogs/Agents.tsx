/**
 * Agents dialog (§12): the user-selectable agents from `agents.primaries()`,
 * filterable via {@link SelectDialog}. Each row shows `name · mode · description`.
 * `enter` switches the session's driving agent through `engine.setAgent` (the
 * real engine method) then closes.
 */
import { SelectDialog, type SelectOption } from "./Select.tsx";
import type { CommandContext } from "../types.ts";

export function Agents({ ctx }: { ctx: CommandContext }) {
  const options: SelectOption[] = ctx.app.agents.primaries().map((agent) => ({
    value: agent.name,
    label: `${agent.name} · ${agent.mode} · ${agent.description}`,
  }));

  return (
    <SelectDialog
      title="Agents"
      options={options}
      footer="enter select · esc close"
      onSelect={(name) => {
        ctx.app.engine.setAgent(ctx.session.id, name);
        ctx.closeModal();
      }}
      onCancel={() => ctx.closeModal()}
    />
  );
}
