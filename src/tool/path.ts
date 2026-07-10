/**
 * Path safety for the file tools. The implementation lives in util/path.ts so
 * command expansion and the TUI can share it without an upward import; this
 * module re-exports it for the tool layer.
 */
export { resolvePath, isSensitiveFile, readAttachment, type ResolvedPath, type Attachment } from "../util/path.ts";
