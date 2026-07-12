/**
 * A pure in-memory multiline text buffer with a cursor. No I/O, no rendering —
 * the PromptEditor (Task 26) drives it from key events and reads value()/cursor()
 * for display. Cursor position clamps to line bounds; up/down preserve a
 * preferred column the way real editors do.
 */
const WS = /\s/;

export class TextBuffer {
  private lines: string[] = [""];
  private row = 0;
  private col = 0;
  /** Column the cursor "wants" when moving across lines of differing length. */
  private preferredCol = 0;

  constructor(initial = "") {
    this.setValue(initial);
  }

  value(): string {
    return this.lines.join("\n");
  }

  setValue(v: string): void {
    this.lines = v.split("\n");
    if (this.lines.length === 0) this.lines = [""];
    this.row = this.lines.length - 1;
    this.col = this.lineLen(this.row);
    this.preferredCol = this.col;
  }

  cursor(): { row: number; col: number } {
    return { row: this.row, col: this.col };
  }

  isEmpty(): boolean {
    return this.value().length === 0;
  }

  private line(): string {
    return this.lines[this.row] ?? "";
  }

  private lineLen(row: number): number {
    return (this.lines[row] ?? "").length;
  }

  insert(s: string): void {
    const line = this.line();
    const before = line.slice(0, this.col);
    const after = line.slice(this.col);
    const parts = s.split("\n");
    if (parts.length === 1) {
      this.lines[this.row] = before + parts[0] + after;
      this.col += (parts[0] ?? "").length;
    } else {
      const inserted = [before + parts[0]];
      for (let i = 1; i < parts.length - 1; i++) inserted.push(parts[i] ?? "");
      const last = parts[parts.length - 1] ?? "";
      inserted.push(last + after);
      this.lines.splice(this.row, 1, ...inserted);
      this.row += parts.length - 1;
      this.col = last.length;
    }
    this.preferredCol = this.col;
  }

  backspace(): void {
    if (this.col > 0) {
      const line = this.line();
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col);
      this.col -= 1;
    } else if (this.row > 0) {
      const prevLen = this.lineLen(this.row - 1);
      this.lines[this.row - 1] = (this.lines[this.row - 1] ?? "") + this.line();
      this.lines.splice(this.row, 1);
      this.row -= 1;
      this.col = prevLen;
    }
    this.preferredCol = this.col;
  }

  del(): void {
    const line = this.line();
    if (this.col < line.length) {
      this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + 1);
    } else if (this.row < this.lines.length - 1) {
      this.lines[this.row] = line + (this.lines[this.row + 1] ?? "");
      this.lines.splice(this.row + 1, 1);
    }
    this.preferredCol = this.col;
  }

  moveLeft(): void {
    if (this.col > 0) {
      this.col -= 1;
    } else if (this.row > 0) {
      this.row -= 1;
      this.col = this.lineLen(this.row);
    }
    this.preferredCol = this.col;
  }

  moveRight(): void {
    if (this.col < this.line().length) {
      this.col += 1;
    } else if (this.row < this.lines.length - 1) {
      this.row += 1;
      this.col = 0;
    }
    this.preferredCol = this.col;
  }

  moveUp(): void {
    if (this.row > 0) {
      this.row -= 1;
      this.col = Math.min(this.preferredCol, this.lineLen(this.row));
    }
  }

  moveDown(): void {
    if (this.row < this.lines.length - 1) {
      this.row += 1;
      this.col = Math.min(this.preferredCol, this.lineLen(this.row));
    }
  }

  home(): void {
    this.col = 0;
    this.preferredCol = 0;
  }

  end(): void {
    this.col = this.line().length;
    this.preferredCol = this.col;
  }

  wordLeft(): void {
    if (this.col === 0) {
      this.moveLeft();
      return;
    }
    this.col = this.wordBoundaryLeft();
    this.preferredCol = this.col;
  }

  wordRight(): void {
    const line = this.line();
    if (this.col >= line.length) {
      this.moveRight();
      return;
    }
    let i = this.col;
    while (i < line.length && WS.test(line[i] ?? "")) i += 1;
    while (i < line.length && !WS.test(line[i] ?? "")) i += 1;
    this.col = i;
    this.preferredCol = i;
  }

  deleteWordLeft(): void {
    if (this.col === 0) {
      this.backspace();
      return;
    }
    const line = this.line();
    const target = this.wordBoundaryLeft();
    this.lines[this.row] = line.slice(0, target) + line.slice(this.col);
    this.col = target;
    this.preferredCol = target;
  }

  killToLineStart(): void {
    this.lines[this.row] = this.line().slice(this.col);
    this.col = 0;
    this.preferredCol = 0;
  }

  /** Column at the start of the word left of the cursor (skip \s+ then \S+). */
  private wordBoundaryLeft(): number {
    const line = this.line();
    let i = this.col;
    while (i > 0 && WS.test(line[i - 1] ?? "")) i -= 1;
    while (i > 0 && !WS.test(line[i - 1] ?? "")) i -= 1;
    return i;
  }
}
