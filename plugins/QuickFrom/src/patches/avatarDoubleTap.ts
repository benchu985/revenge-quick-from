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

const pendingTimers: Record<string, any> = {};
const lastTap: Record<string, number> = {};

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
    const prev = lastTap[key] ?? 0;
    lastTap[key] = now;

    if (now - prev <= (settings.doubleTapMs || 350)) {
      if (pendingTimers[key]) {
        clearTimeout(pendingTimers[key]);
        delete pendingTimers[key];
      }
      openFromSearch(user);
      return;
    }

    if (pendingTimers[key]) clearTimeout(pendingTimers[key]);
    pendingTimers[key] = setTimeout(() => {
      delete pendingTimers[key];
      original?.(...args);
    }, (settings.doubleTapMs || 350) + 10);
  };
}

export default function patchAvatarDoubleTap(): (() => void)[] {
  const unpatches: (() => void)[] = [];

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

    const target = mod.default ? mod : { default: mod };
    try {
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
    } catch (e) {
      console.error("[QuickFrom] failed hooking", name, e);
    }
  }

  // Profile open double-tap sniper
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
      const profLast: Record<string, number> = {};
      try {
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
            const prev = profLast[key] ?? 0;
            profLast[key] = now;

            if (now - prev <= (settings.doubleTapMs || 350)) {
              openFromSearch(arg0?.user ?? arg0 ?? { id: userId });
              // neuter call
              try {
                args.length = 0;
                args[0] = { __quickFromCancel: true, userId: "0" };
              } catch {}
            }
          }),
        );
      } catch (e) {
        console.error("[QuickFrom] profile opener hook", e);
      }
    }
  }

  const HeaderAvatar = safeFindByName("HeaderAvatar", false);
  if (HeaderAvatar) {
    const target = HeaderAvatar.default
      ? HeaderAvatar
      : { default: HeaderAvatar };
    try {
      unpatches.push(
        after("default", target, (args, res) => {
          try {
            const user =
              args?.[0]?.user ?? args?.[0]?.channel?.recipients?.[0];
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
    } catch {}
  }

  console.log("[QuickFrom] avatar hooks:", unpatches.length);
  return unpatches;
}
