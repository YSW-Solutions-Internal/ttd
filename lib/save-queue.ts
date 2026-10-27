import type { SaveResult } from "./form-values.ts";

export type SaveState = "saved" | "saving" | "failed";

/**
 * The unsaved fields of one record, saved one save at a time. A save sends every
 * unsaved field; a failed save keeps them all, and they go again with the next
 * change or a retry (never automatically).
 */
export class SaveQueue {
  state: SaveState = "saved";
  result: SaveResult | null = null;
  private fields = new Map<string, string>();
  private running: Promise<void> | null = null;
  private save: (fd: FormData) => Promise<SaveResult>;
  private onUpdate: () => void;

  constructor(save: (fd: FormData) => Promise<SaveResult>, onUpdate: () => void) {
    this.save = save;
    this.onUpdate = onUpdate;
  }

  get unsaved(): boolean {
    return this.fields.size > 0;
  }

  change(name: string, value: string): void {
    this.fields.set(name, value);
    this.send();
  }

  retry(): void {
    this.send();
  }

  /** Resolves once no save is running, including follow-up saves. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private send(): void {
    if (this.running || this.fields.size === 0) return;
    const sent = new Map(this.fields);
    const fd = new FormData();
    for (const [k, v] of sent) fd.set(k, v);
    this.state = "saving";
    this.onUpdate();
    this.running = (async () => {
      let r: SaveResult;
      try {
        r = await this.save(fd);
      } catch {
        r = { error: "Could not reach the server." };
      }
      this.result = r;
      if (r.error) {
        this.state = "failed";
      } else {
        // A field changed again while saving stays unsaved.
        for (const [k, v] of sent) if (this.fields.get(k) === v) this.fields.delete(k);
        this.state = "saved";
      }
      this.running = null;
      if (!r.error) this.send();
      this.onUpdate();
    })();
  }
}
