import { test } from "node:test";
import assert from "node:assert/strict";
import { SaveQueue } from "./save-queue.ts";
import type { SaveResult } from "./form-values.ts";

/** A save that records what it was sent and finishes only when told to. */
function fakeSave() {
  const calls: { sent: Record<string, string>; finish: (r: SaveResult | Error) => void }[] = [];
  const save = (fd: FormData) =>
    new Promise<SaveResult>((resolve, reject) => {
      calls.push({
        sent: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])),
        finish: (r) => (r instanceof Error ? reject(r) : resolve(r)),
      });
    });
  return { calls, save };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("sends only changed fields", async () => {
  const { calls, save } = fakeSave();
  const q = new SaveQueue(save, () => {});
  q.change("a", "1");
  assert.equal(q.state, "saving");
  assert.deepEqual(calls.map((c) => c.sent), [{ a: "1" }]);
  calls[0].finish({});
  await q.idle();
  assert.equal(q.state, "saved");
  assert.equal(q.unsaved, false);
});

test("queues changes made during a save", async () => {
  const { calls, save } = fakeSave();
  const q = new SaveQueue(save, () => {});
  q.change("a", "1");
  q.change("b", "2");
  q.change("a", "3");
  calls[0].finish({});
  await tick();
  assert.deepEqual(calls.map((c) => c.sent), [{ a: "1" }, { a: "3", b: "2" }]);
  assert.equal(q.has("a"), true);
  assert.equal(q.has("c"), false);
  assert.equal(q.unsaved, true);
  calls[1].finish({});
  await q.idle();
  assert.equal(calls.length, 2);
  assert.equal(q.unsaved, false);
});

test("keeps failed fields and sends them with the next change", async () => {
  const { calls, save } = fakeSave();
  const q = new SaveQueue(save, () => {});
  q.change("a", "1");
  calls[0].finish({ error: "bad", field: "a" });
  await q.idle();
  assert.equal(q.state, "failed");
  assert.equal(q.result?.field, "a");
  assert.equal(calls.length, 1);
  q.change("b", "2");
  assert.deepEqual(calls[1].sent, { a: "1", b: "2" });
});

test("a thrown save counts as failed and retry sends it again", async () => {
  const { calls, save } = fakeSave();
  const q = new SaveQueue(save, () => {});
  q.change("a", "1");
  calls[0].finish(new Error("offline"));
  await q.idle();
  assert.equal(q.state, "failed");
  assert.equal(typeof q.result?.error, "string");
  q.retry();
  assert.deepEqual(calls[1].sent, { a: "1" });
});

test("idle waits for the running save", async () => {
  const { calls, save } = fakeSave();
  const q = new SaveQueue(save, () => {});
  q.change("a", "1");
  let done = false;
  const idle = q.idle().then(() => (done = true));
  await tick();
  assert.equal(done, false);
  calls[0].finish({});
  await idle;
  assert.equal(done, true);
});

test("tells the owner about every state change", async () => {
  const { calls, save } = fakeSave();
  let updates = 0;
  const q = new SaveQueue(save, () => updates++);
  q.change("a", "1");
  calls[0].finish({});
  await q.idle();
  assert.ok(updates >= 2);
});
