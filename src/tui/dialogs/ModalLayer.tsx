/**
 * ModalLayer (§12): the single router that renders the one active overlay. It
 * reads `state.permission`/`state.modal` from {@link useUi} and switches on
 * `state.permission ? "permission" : state.modal?.kind` — so a pending
 * permission always wins over an open modal. The chosen dialog is centred in an
 * absolutely-positioned, opaque-backed box that fills the screen. Each kind gets
 * exactly the props it needs; `prompt`/`confirm` narrow `state.modal.props` by
 * the {@link ModalProps} discriminant (no `any`). Renders nothing when idle.
 */
import { Box } from "ink";
import type { ReactNode } from "react";
import { Timeline } from "./Timeline.tsx";
import { DialogExportOptions } from "./DialogExportOptions.tsx";
import { DeleteRecovery } from "./DeleteRecovery.tsx";
import { useTheme, useUi } from "../context.tsx";
import type { CommandContext, ModalKind, ModalProps } from "../types.ts";
import { Palette } from "./Palette.tsx";
import { Help } from "./Help.tsx";
import { WhichKey } from "./WhichKey.tsx";
import { Sessions } from "./Sessions.tsx";
import { Models } from "./Models.tsx";
import { Agents } from "./Agents.tsx";
import { Themes } from "./Themes.tsx";
import { Skills } from "./Skills.tsx";
import { Status } from "./Status.tsx";
import { Connectors } from "./Connectors.tsx";
import { Permission } from "./Permission.tsx";
import { Prompt } from "./Prompt.tsx";
import { Confirm } from "./Confirm.tsx";

function renderDialog(kind: ModalKind | undefined, props: ModalProps | undefined, ctx: CommandContext): ReactNode | null {
  switch (kind) {
    case "permission":
      return <Permission />;
    case "palette":
      return <Palette ctx={ctx} />;
    case "help":
      return <Help ctx={ctx} />;
    case "status":
      return <Status ctx={ctx} />;
    case "connectors":
      return <Connectors ctx={ctx} />;
    case "skills":
      return <Skills ctx={ctx} />;
    case "sessions":
      return <Sessions ctx={ctx} />;
    case "models":
      return <Models ctx={ctx} />;
    case "agents":
      return <Agents ctx={ctx} />;
    case "themes":
      return <Themes ctx={ctx} />;
    case "whichkey":
      return <WhichKey onCancel={ctx.closeModal} />;
    case "timeline":
      return <Timeline ctx={ctx} />;
    case "prompt":
      if (props && (props.kind === "rename" || props.kind === "login")) {
        return (
          <Prompt
            message={props.message}
            initial={"initial" in props ? props.initial : ""}
            mask={props.kind === "login"}
            onSubmit={props.onSubmit}
            onCancel={ctx.closeModal}
          />
        );
      }
      return null;
    case "confirm":
      if (props && props.kind === "confirm") {
        return <Confirm message={props.message} onYes={props.onYes} onNo={props.onNo} />;
      }
      return null;
    case "export":
      if (props && props.kind === "export") {
        return <DialogExportOptions defaults={props.defaults} onSubmit={props.onSubmit} onCancel={ctx.closeModal} />;
      }
      return null;
    case "delete-recovery":
      if (props && props.kind === "delete-recovery") {
        return <DeleteRecovery sessionID={props.sessionID} sessionTitle={props.sessionTitle} error={props.error} onChoice={props.onChoice} />;
      }
      return null;
    default:
      return null;
  }
}

export function ModalLayer({ ctx }: { ctx: CommandContext }) {
  const { theme } = useTheme();
  const state = useUi();
  const kind: ModalKind | undefined = state.permission ? "permission" : state.modal?.kind;
  const dialog = renderDialog(kind, state.modal?.props, ctx);
  if (!dialog) return null;
  return (
    <Box
      position="absolute"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={theme.bgOverlay}
    >
      {dialog}
    </Box>
  );
}
