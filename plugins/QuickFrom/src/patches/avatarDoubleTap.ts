import { after, before, instead } from "@vendetta/patcher";
import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { ReactNative } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import {
  ensureDefaults,
  getUserId,
  openFromSearch,
  settings,
} from "../lib/search";
// getUserId from user via search re-export;

function safeFindByName(name: string, def = false) {
  try {
    return findByName(name, def);
  } catch {
    return null;
  }
}

function safeFindByProps(...props: string[]) {
  try {
    return findByProps(...props);
  } catch {
    return null;
  }
}

function safeStore(name: string) {
  try {
    return findByStoreName?.(name) ?? null;
  } catch {
    return null;
  }
}

const pendingTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const lastTap: Record<string, number> = {};

/** Resolve a user object from common prop shapes */
function resolveUser(src: any): any | null {
  if (!src) return null;
  if (typeof src === "string") return { id: src };
  return (
    src.user ??
    src.author ??
    src.message?.author ??
    src.guildMember?.user ??
    src.member?.user ??
    (src.id && (src.username || src.globalName || src.discriminator !== undefined)
      ? src
      : null) ??
    (src.userId ? { id: src.userId } : null) ??
    null
  );
}

function lookupUser(id: string) {
  try {
    const UserStore = safeStore("UserStore") ?? safeFindByProps("getUser");
    return UserStore?.getUser?.(id) ?? { id };
  } catch {
    return { id };
  }
}

/**
 * Double-tap gate:
 * - 1st tap: delay original (profile open)
 * - 2nd tap in window: cancel original, run search
 * Returns true if this press should STOP the original handler entirely
 * (i.e. second tap — caller must not call original).
 */
function gateDoubleTap(
  key: string,
  user: any,
  original?: (...a: any[]) => any,
  origArgs?: any[],
): "search" | "scheduled" | "passthrough" {
  ensureDefaults();
  if (!settings.doubleTapAvatar) return "passthrough";

  const now = Date.now();
  const windowMs = settings.doubleTapMs || 350;
  const prev = lastTap[key] ?? 0;
  lastTap[key] = now;

  if (now - prev <= windowMs) {
    if (pendingTimers[key]) {
      clearTimeout(pendingTimers[key]);
      delete pendingTimers[key];
    }
    openFromSearch(user);
    return "search";
  }

  // first tap — hold profile open until window ends
  if (pendingTimers[key]) clearTimeout(pendingTimers[key]);
  pendingTimers[key] = setTimeout(() => {
    delete pendingTimers[key];
    try {
      original?.(...(origArgs ?? []));
    } catch (e) {
      console.error("[QuickFrom] delayed original", e);
    }
  }, windowMs + 15);
  return "scheduled";
}

function wrapPress(original: any, user: any, key: string) {
  if (typeof original !== "function") {
    return (...args: any[]) => {
      gateDoubleTap(key, user, undefined, args);
    };
  }
  return (...args: any[]) => {
    const r = gateDoubleTap(key, user, original, args);
    if (r === "passthrough") return original(...args);
    // search | scheduled → do NOT call original now
  };
}

function patchOnPressProps(props: any, user: any, key: string): boolean {
  if (!props || !user) return false;
  let patched = false;
  for (const name of ["onPress", "onClick", "onPressIn"] as const) {
    // only wrap real press openers; skip onPressIn spam
    if (name === "onPressIn") continue;
    if (typeof props[name] === "function") {
      // avoid double-wrapping
      if ((props[name] as any).__quickFrom) continue;
      const wrapped = wrapPress(props[name], user, key);
      (wrapped as any).__quickFrom = true;
      props[name] = wrapped;
      patched = true;
    }
  }
  // If no onPress at all, still install one that only does double-tap search
  // (single tap does nothing extra — parent may handle)
  if (!patched && (props.onPress == null)) {
    const wrapped = wrapPress(undefined, user, key);
    (wrapped as any).__quickFrom = true;
    props.onPress = wrapped;
    patched = true;
  }
  return patched;
}

export default function patchAvatarDoubleTap(): (() => void)[] {
  const unpatches: (() => void)[] = [];
  ensureDefaults();

  // ─────────────────────────────────────────────
  // 1) Most reliable: intercept Pressable props
  //    Message avatars are usually RN.Pressable / Touchable
  // ─────────────────────────────────────────────
  try {
    const Pressable = (ReactNative as any)?.Pressable;
    if (Pressable?.type || Pressable) {
      const target = Pressable.type ? Pressable : { type: Pressable };
      // before type — mutate props before render (rosie pattern)
      unpatches.push(
        before("type", target, ([props]) => {
          try {
            ensureDefaults();
            if (!settings.doubleTapAvatar || !props) return;

            // Heuristics: avatar-sized pressables with user-ish props
            const user = resolveUser(props);
            const userId =
              getUserId(user) ??
              props.userId ??
              props.id ??
              props.accessibilityLabel?.match?.(/\d{5,}/)?.[0];

            // Must look like an avatar hit target
            const label = String(
              props.accessibilityLabel ?? props.accessibilityRole ?? "",
            ).toLowerCase();
            const isAvatarish =
              !!user ||
              !!props.userId ||
              label.includes("avatar") ||
              label.includes("profile") ||
              // discord often uses " , " patterns; also check source uri
              (props.children?.props?.source && props.onPress);

            if (!isAvatarish && !userId) return;
            if (!userId && !user) return;

            const u = user ?? lookupUser(String(userId));
            const key = `pressable:${getUserId(u) ?? userId}`;
            patchOnPressProps(props, u, key);
          } catch {}
        }),
      );
    }
  } catch (e) {
    console.error("[QuickFrom] Pressable hook", e);
  }

  // TouchableOpacity / TouchableWithoutFeedback
  for (const tName of [
    "TouchableOpacity",
    "TouchableWithoutFeedback",
    "TouchableHighlight",
  ]) {
    try {
      const T = (ReactNative as any)?.[tName];
      if (!T) continue;
      const target = T.type ? T : { type: T.render ? T : { type: T } };
      // RN class components use render / type differently — try both
      const hookTarget = T.render ? T : T.type ? { type: T.type } : null;
      if (T.render) {
        unpatches.push(
          before("render", T, function (this: any) {
            try {
              const props = this?.props;
              if (!props || !settings.doubleTapAvatar) return;
              const user = resolveUser(props);
              const userId = getUserId(user) ?? props.userId;
              if (!userId && !user) return;
              const u = user ?? lookupUser(String(userId));
              patchOnPressProps(props, u, `touch:${getUserId(u) ?? userId}`);
            } catch {}
          }),
        );
      } else if (hookTarget) {
        unpatches.push(
          before("type", hookTarget, ([props]) => {
            try {
              if (!props || !settings.doubleTapAvatar) return;
              const user = resolveUser(props);
              const userId = getUserId(user) ?? props.userId;
              if (!userId && !user) return;
              const u = user ?? lookupUser(String(userId));
              patchOnPressProps(props, u, `touch:${getUserId(u) ?? userId}`);
            } catch {}
          }),
        );
      }
    } catch {}
  }

  // ─────────────────────────────────────────────
  // 2) Named avatar components (if present)
  // ─────────────────────────────────────────────
  for (const name of [
    "MessageAvatar",
    "Avatar",
    "GuildMemberAvatar",
    "UserAvatar",
    "ReanimatedUserAvatar",
    "HeaderAvatar",
    "u", // sometimes minified — skip
  ]) {
    if (name.length < 3) continue;
    const mod = safeFindByName(name, false);
    if (!mod) continue;
    const target = mod.default !== undefined ? mod : { default: mod };
    try {
      unpatches.push(
        after("default", target, (args, res) => {
          try {
            const props = args?.[0];
            const user = resolveUser(props) ?? resolveUser(res?.props);
            const userId =
              getUserId(user) ?? props?.userId ?? props?.id ?? res?.props?.userId;
            if (!userId && !user) return res;

            const u = user ?? lookupUser(String(userId));
            const key = `avatar:${getUserId(u) ?? userId}`;

            if (res?.props) patchOnPressProps(res.props, u, key);
            if (props) patchOnPressProps(props, u, key);

            // Also walk children Pressables
            const pressable = findInReactTree(
              res,
              (c: any) =>
                c?.props &&
                (typeof c.props.onPress === "function" ||
                  c.type?.displayName === "Pressable" ||
                  c.type?.name === "Pressable"),
            );
            if (pressable?.props) patchOnPressProps(pressable.props, u, key);
          } catch (e) {
            console.error("[QuickFrom] avatar component", name, e);
          }
          return res;
        }),
      );
    } catch (e) {
      console.error("[QuickFrom] hook", name, e);
    }
  }

  // ─────────────────────────────────────────────
  // 3) HARD block: instead() on profile openers
  //    This is what actually stops "click avatar → profile"
  //    on double-tap, even if Pressable hook missed.
  // ─────────────────────────────────────────────
  const openerNames = [
    "openUserProfileModal",
    "openProfile",
    "showUserProfile",
    "openUserProfile",
    "openFriendUserProfile",
  ] as const;

  // Collect modules that might own these
  const openerModules: any[] = [];
  for (const prop of openerNames) {
    const m = safeFindByProps(prop);
    if (m && !openerModules.includes(m)) openerModules.push(m);
  }
  // also common multi-export module
  const multi =
    safeFindByProps("openUserProfileModal", "openProfile") ??
    safeFindByProps("openUserProfileModal");
  if (multi && !openerModules.includes(multi)) openerModules.push(multi);

  for (const mod of openerModules) {
    for (const method of openerNames) {
      if (typeof mod?.[method] !== "function") continue;
      try {
        unpatches.push(
          instead(method, mod, (args, orig) => {
            ensureDefaults();
            if (!settings.doubleTapAvatar) return orig(...args);

            const arg0 = args?.[0];
            const userId =
              (typeof arg0 === "string" ? arg0 : null) ??
              arg0?.userId ??
              arg0?.id ??
              arg0?.user?.id ??
              arg0?.authorId ??
              null;

            if (!userId) return orig(...args);

            const key = `profile:${userId}`;
            const user =
              resolveUser(arg0) ??
              arg0?.user ??
              lookupUser(String(userId));

            const r = gateDoubleTap(key, user, orig, args);
            if (r === "passthrough") return orig(...args);
            if (r === "search") {
              // blocked — already opened search
              return undefined;
            }
            // scheduled — profile opens after delay via gate; block now
            return undefined;
          }),
        );
      } catch (e) {
        console.error("[QuickFrom] instead", method, e);
      }
    }
  }

  // ─────────────────────────────────────────────
  // 4) Flux action fallback (USER_PROFILE_MODAL_OPEN etc.)
  // ─────────────────────────────────────────────
  try {
    const FD = safeFindByProps("dispatch", "subscribe", "wait");
    if (FD?.dispatch) {
      unpatches.push(
        instead("dispatch", FD, (args, orig) => {
          ensureDefaults();
          if (!settings.doubleTapAvatar) return orig(...args);

          const action = args?.[0];
          const type = action?.type;
          if (
            !type ||
            (type !== "USER_PROFILE_MODAL_OPEN" &&
              type !== "USER_PROFILE_OPEN" &&
              type !== "LAYER_PUSH" &&
              !String(type).includes("USER_PROFILE"))
          ) {
            return orig(...args);
          }

          // LAYER_PUSH only if profile-ish
          if (type === "LAYER_PUSH") {
            const layer = String(action.layer ?? action.component ?? "");
            if (!/profile/i.test(layer)) return orig(...args);
          }

          const userId =
            action.userId ??
            action.user?.id ??
            action.props?.userId ??
            action.props?.user?.id;
          if (!userId) return orig(...args);

          const key = `flux:${userId}`;
          const user = action.user ?? lookupUser(String(userId));
          const r = gateDoubleTap(key, user, orig, args);
          if (r === "passthrough") return orig(...args);
          return undefined; // block immediate open
        }),
      );
    }
  } catch (e) {
    console.error("[QuickFrom] flux hook", e);
  }

  console.log("[QuickFrom] avatar hooks installed:", unpatches.length);
  return unpatches;
}
