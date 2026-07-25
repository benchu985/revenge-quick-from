import { after, before } from "@vendetta/patcher";
import { findByName, findByProps } from "@vendetta/metro";
import {
  ensureDefaults,
  getUserId,
  openFromSearch,
  settings,
} from "../lib/search";

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

// pending single-tap timers (cancel on second tap)
const pendingTimers: Record<string, any> = {};

function makeDoubleTapHandler(
  original: ((...a: any[]) => any) | undefined,
  user: any,
  key: string,
) {
  return (...args: any[]) => {
    ensureDefaults();
    if (!settings.doubleTapAvatar) {
      return original?.(...args);
    }

    const now = Date.now();
    const prev = (makeDoubleTapHandler as any)._last?.[key] ?? 0;
    (makeDoubleTapHandler as any)._last ??= {};
    (makeDoubleTapHandler as any)._last[key] = now;

    if (now - prev <= (settings.doubleTapMs || 350)) {
      if (pendingTimers[key]) {
        clearTimeout(pendingTimers[key]);
        delete pendingTimers[key];
      }
      openFromSearch(user);
      return;
    }

    // first tap — wait, then open profile if no second tap
    if (pendingTimers[key]) clearTimeout(pendingTimers[key]);
    pendingTimers[key] = setTimeout(() => {
      delete pendingTimers[key];
      original?.(...args);
    }, (settings.doubleTapMs || 350) + 10);
  };
}

/**
 * Patch common avatar / message-avatar components.
 * Returns array of unpatch functions.
 */
export default function patchAvatarDoubleTap(): (() => void)[] {
  const unpatches: (() => void)[] = [];

  // --- Message avatar (chat list) ---
  const messageAvatarNames = [
    "MessageAvatar",
    "Avatar",
    "GuildMemberAvatar",
    "UserAvatar",
    "ReanimatedUserAvatar",
  ];

  for (const name of messageAvatarNames) {
    const mod = safeFindByName(name, false);
    if (!mod) continue;

    // default export component
    const target = mod.default ? mod : { default: mod };
    unpatches.push(
      after("default", target, (args, res) => {
        try {
          const props = args?.[0] ?? res?.props;
          if (!props) return res;

          const user =
            props.user ??
            props.author ??
            props.message?.author ??
            props.guildMember?.user ??
            null;
          const userId = getUserId(user) ?? props.userId ?? props.id;
          if (!userId && !user) return res;

          const key = `avatar:${userId ?? "x"}`;
          const original =
            props.onPress ??
            props.onClick ??
            res?.props?.onPress ??
            res?.props?.onClick;

          const handler = makeDoubleTapHandler(
            typeof original === "function" ? original : undefined,
            user ?? { id: userId },
            key,
          );

          if (res?.props) {
            res.props.onPress = handler;
            // also cover Pressable-style
            if (res.props.onClick) res.props.onClick = handler;
          }
          if (props && args?.[0]) {
            args[0].onPress = handler;
          }
        } catch (e) {
          console.error("[QuickFrom] avatar patch", e);
        }
        return res;
      }),
    );
  }

  // --- Pressable / TouchableOpacity used as avatar hit target ---
  // Hook into React Native Pressable render via findByProps avatarSource/onPressUser
  const avatarPressable = safeFindByProps("onPressUser", "size");
  if (avatarPressable?.type || avatarPressable?.default) {
    const comp = avatarPressable.default ?? avatarPressable;
    if (comp?.type) {
      unpatches.push(
        after("type", comp, (args, res) => {
          try {
            const p = args?.[0];
            const user = p?.user ?? p?.onPressUser;
            const userId = getUserId(typeof user === "object" ? user : p?.user);
            if (!userId) return res;
            if (res?.props?.onPress) {
              const orig = res.props.onPress;
              res.props.onPress = makeDoubleTapHandler(
                orig,
                typeof user === "object" ? user : { id: userId },
                `ap:${userId}`,
              );
            }
          } catch {}
          return res;
        }),
      );
    }
  }

  // --- Chat row: intercept openUserProfileModal / openProfile ---
  // Double-tap on avatar usually calls these; we can snipe rapid re-entry
  const profileOpener =
    safeFindByProps("openUserProfileModal") ??
    safeFindByProps("openProfile") ??
    safeFindByProps("showUserProfile");

  if (profileOpener) {
    const method =
      (profileOpener.openUserProfileModal && "openUserProfileModal") ||
      (profileOpener.openProfile && "openProfile") ||
      (profileOpener.showUserProfile && "showUserProfile") ||
      null;

    if (method) {
      unpatches.push(
        before(method, profileOpener, (args) => {
          ensureDefaults();
          if (!settings.doubleTapAvatar) return;

          const arg0 = args?.[0];
          const userId =
            (typeof arg0 === "string" ? arg0 : null) ??
            arg0?.userId ??
            arg0?.id ??
            arg0?.user?.id ??
            null;
          if (!userId) return;

          const key = `profile:${userId}`;
          const now = Date.now();
          const prev = (patchAvatarDoubleTap as any)._profLast?.[key] ?? 0;
          (patchAvatarDoubleTap as any)._profLast ??= {};
          (patchAvatarDoubleTap as any)._profLast[key] = now;

          if (now - prev <= (settings.doubleTapMs || 350)) {
            // cancel profile open, run search instead
            openFromSearch(
              arg0?.user ?? arg0 ?? { id: userId },
            );
            // prevent original by nulling args awkwardly — use instead would be better
            // mark for skip
            (args as any)._quickFromSkip = true;
            args.length = 0;
            args[0] = { __quickFromCancel: true, userId: "0" };
          }
        }),
      );
    }
  }

  // --- Header bar DM / channel member avatar ---
  const HeaderAvatar = safeFindByName("HeaderAvatar", false);
  if (HeaderAvatar) {
    const target = HeaderAvatar.default ? HeaderAvatar : { default: HeaderAvatar };
    unpatches.push(
      after("default", target, (args, res) => {
        try {
          const user = args?.[0]?.user ?? args?.[0]?.channel?.recipients?.[0];
          const userId = getUserId(user);
          if (!userId || !res?.props) return res;
          const orig = res.props.onPress;
          res.props.onPress = makeDoubleTapHandler(
            orig,
            user,
            `hdr:${userId}`,
          );
        } catch {}
        return res;
      }),
    );
  }

  return unpatches;
}
