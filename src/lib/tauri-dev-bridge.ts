/**
 * Only active when the frontend is opened directly in a regular browser tab
 * (e.g. `pnpm dev` visited in Chrome) instead of inside the real Tauri
 * webview. Lets interaction testing (click/type/screenshot) run against
 * real Tauri commands mirrored by a Vite dev-server middleware, see
 * vite.config.ts. Inert in production builds and inert whenever the real
 * Tauri bridge (`window.__TAURI_INTERNALS__`) is already present.
 */

interface EventCallback {
  event: string;
  handler: (payload: { event: string; id: number; payload: unknown }) => void;
}

export function installTauriDevBridgeIfNeeded() {
  if (!import.meta.env.DEV) return;
  if ("__TAURI_INTERNALS__" in window) return;

  const callbacks = new Map<number, EventCallback>();
  let nextCallbackId = 1;

  // Lets tests manually simulate a Tauri-emitted event (e.g. the Rust
  // filesystem watcher's "fs://changed") without a full IPC emulation:
  // window.__DEV_EMIT__('fs://changed', { rootId, paths }).
  (window as unknown as { __DEV_EMIT__: (event: string, payload: unknown) => void }).__DEV_EMIT__ = (
    event,
    payload,
  ) => {
    for (const [id, cb] of callbacks) {
      if (cb.event === event) cb.handler({ event, id, payload });
    }
  };

  // listen()'s unlisten path calls this directly (separately from the
  // `plugin:event|unlisten` invoke below); a no-op here is fine since our
  // callbacks map is already cleaned up via the invoke call.
  (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };

  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    transformCallback: (callback: EventCallback["handler"]) => {
      const id = nextCallbackId++;
      callbacks.set(id, { event: "", handler: callback });
      return id;
    },
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      // A real native folder picker can't run headlessly in a browser tab.
      // Tests drive this by setting window.__DEV_PICK_FOLDER__ beforehand.
      if (cmd === "plugin:dialog|open") {
        return (window as unknown as { __DEV_PICK_FOLDER__?: string }).__DEV_PICK_FOLDER__ ?? null;
      }

      if (cmd === "plugin:event|listen") {
        const handlerId = args?.handler as number;
        const eventName = args?.event as string;
        const entry = callbacks.get(handlerId);
        if (entry) entry.event = eventName;
        return handlerId;
      }
      if (cmd === "plugin:event|unlisten") {
        // The real API keys unlisten by (event, eventId); our handler ids
        // are already globally unique, so eventId alone is enough here.
        const eventId = args?.eventId as number;
        callbacks.delete(eventId);
        return null;
      }

      const res = await fetch("/__dev_api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, args: args ?? {} }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json.result;
    },
  };
}
