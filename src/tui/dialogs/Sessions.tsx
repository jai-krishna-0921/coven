/**
 * Sessions dialog (§12): the top-level session list from `app.store.list()`,
 * filterable via {@link SelectDialog}. `enter` switches the active session
 * through `store.setSessionID` (the real UiStore method) then closes.
 */
import { SelectDialog, type SelectOption } from "./Select.tsx";
import type { CommandContext } from "../types.ts";

export function Sessions({ ctx }: { ctx: CommandContext }) {
  const options: SelectOption[] = ctx.app.store.list().map((session) => {
    const count = ctx.app.store.messagesOf(session.id).length;
    return {
      value: session.id,
      label: `${session.title} · ${session.agent} · ${count} msgs`,
    };
  });

  return (
    <SelectDialog
      title="Sessions"
      options={options}
      footer="enter switch · esc close"
      onSelect={(id) => {
        ctx.store.setSessionID(id);
        ctx.closeModal();
      }}
      onCancel={() => ctx.closeModal()}
    />
  );
}
