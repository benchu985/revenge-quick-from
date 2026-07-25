/**
 * Avatar double-tap — conservative hooks only.
 * NO FluxDispatcher.instead (that was crashing startup).
 */
import { after, before, instead } from "@vendetta/patcher";
import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { getUserId } from "../lib/user";
import { openFromSearch } from "../lib/openResults";

function fp(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

function fn(name: string) {
  try {
    return findByName(name, false);
  } catch {
    return null;
  }
}

const pending: Record<string, any> = {};
const last: Record<string, number> = {};

function enabled() {
  const s = storage as any;
  return s.doubleTapAvatar !== false;
}

function windowMs() {
  return (storage as any).doubleTapMs || 350;
}

function lookup(id: string) {
  try {
    const US = findByStoreName?.("UserStore") ?? fp("getUser");
    return US?.getUser?.(id) ?? { id };
  } catch {
    return { id };
  }
}

function gate(
  key: string,
  user: any,
  original?: (...a: any[]) => any,
  args?: any[],
): "search" | "scheduled" | "pass" {
  if (!enabled()) return "pass";
  const now = Date.now();
  const prev = last[key] ?? 0;
  last[key] = now;
  const w = windowMs();

  if (now - prev <= w) {
    if (pending[key]) {
      clearTimeout(pending[key]);
      delete pending[key];
    }
    try {
      openFromSearch(user);
    } catch (e) {
      console.error("[QuickFrom] openFromSearch", e);
    }
    return "search";
  }

  if (pending[key]) clearTimeout(pending[key]);
  pending[key] = setTimeout(() => {
    delete pending[key];
    try {
      original?.(...(args ?? []));
    } catch {}
  }, w + 15);
  return "scheduled";
}

export default function patchAvatar(): (() => void)[] {
  const unpatches: (() => void)[] = [];

  // --- instead on profile openers only (safe, targeted) ---
  const methods = [
    "openUserProfileModal",
    "openProfile",
    "showUserProfile",
    "openUserProfile",
  ];

  for (const method of methods) {
    try {
      const mod = fp(method);
      if (!mod || typeof mod[method] !== "function") continue;

      unpatches.push(
        instead(method, mod, (args, orig) => {
          if (!enabled()) return orig(...args);

          const a0 = args?.[0];
          const userId =
            (typeof a0 === "string" ? a0 : null) ??
            a0?.userId ??
            a0?.id ??
            a0?.user?.id ??
            null;
          if (!userId) return orig(...args);

          const user = a0?.user ?? (typeof a0 === "object" ? a0 : null) ?? lookup(String(userId));
          const r = gate(`prof:${userId}`, user, orig, args);
          if (r === "pass") return orig(...args);
          // search | scheduled → swallow immediate open
          return undefined;
        }),
      );
    } catch (e) {
      console.error("[QuickFrom] instead", method, e);
    }
  }

  // --- Pressable before type (optional, wrapped hard) ---
  try {
    const Pressable = (ReactNative as any)?.Pressable;
    if (Pressable) {
      const target = typeof Pressable === "function" && !(Pressable as any).type
        ? { type: Pressable }
        : Pressable;
      if (target?.type) {
        unpatches.push(
          before("type", target, (args) => {
            try {
              if (!enabled()) return;
              const props = args?.[0];
              if (!props || typeof props.onPress !== "function") return;
              if ((props.onPress as any).__qf) return;

              const userId =
                props.userId ??
                props.user?.id ??
                props.author?.id ??
                null;
              // only touch if we have a user id — avoid wrapping every button
              if (!userId) return;

              const user = props.user ?? props.author ?? lookup(String(userId));
              const key = `p:${userId}`;
              const orig = props.onPress;
              const wrapped = (...a: any[]) => {
                const r = gate(key, user, orig, a);
                if (r === "pass") return orig(...a);
              };
              (wrapped as any).__qf = true;
              props.onPress = wrapped;
            } catch {}
          }),
        );
      }
    }
  } catch (e) {
    console.error("[QuickFrom] Pressable", e);
  }

  // --- MessageAvatar component if exists ---
  for (const name of ["MessageAvatar", "HeaderAvatar"]) {
    try {
      const mod = fn(name);
      if (!mod) continue;
      const target = mod.default !== undefined ? mod : { default: mod };
      unpatches.push(
        after("default", target, (args, res) => {
          try {
            if (!enabled() || !res?.props) return res;
            const props = args?.[0] ?? {};
            const user =
              props.user ??
              props.author ??
              props.message?.author ??
              null;
            const userId = getUserId(user) ?? props.userId;
            if (!userId) return res;
            if (typeof res.props.onPress === "function" && !(res.props.onPress as any).__qf) {
              const orig = res.props.onPress;
              const u = user ?? lookup(String(userId));
              const wrapped = (...a: any[]) => {
                const r = gate(`av:${userId}`, u, orig, a);
                if (r === "pass") return orig(...a);
              };
              (wrapped as any).__qf = true;
              res.props.onPress = wrapped;
            }
          } catch {}
          return res;
        }),
      );
    } catch {}
  }

  console.log("[QuickFrom] avatar hooks:", unpatches.length);
  return unpatches;
}
