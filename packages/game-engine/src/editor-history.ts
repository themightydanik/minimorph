import type { LayoutOverride } from "@minimorph/game-content";
/** One transaction for a continuous drag; snapshots include gameplay properties and stable IDs. */
export class EditorHistory {
  private past: LayoutOverride[] = [];
  private future: LayoutOverride[] = [];
  private transaction: LayoutOverride | undefined;
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  begin(value: LayoutOverride) {
    this.transaction ??= structuredClone(value);
  }
  record(before: LayoutOverride, after: LayoutOverride) {
    if (this.transaction || JSON.stringify(before) === JSON.stringify(after))
      return;
    this.past.push(structuredClone(before));
    if (this.past.length > 50) this.past.shift();
    this.future = [];
  }
  end(value: LayoutOverride) {
    const before = this.transaction;
    this.transaction = undefined;
    if (before) this.record(before, value);
  }
  undo(value: LayoutOverride) {
    const next = this.past.pop();
    if (!next) return;
    this.future.push(structuredClone(value));
    return structuredClone(next);
  }
  redo(value: LayoutOverride) {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(structuredClone(value));
    return structuredClone(next);
  }
}
