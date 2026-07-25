export function getUserTag(user: any): string {
  if (!user) return "";
  const username =
    user.username ??
    user.user?.username ??
    user.globalName ??
    user.user?.globalName ??
    "";
  const disc = user.discriminator ?? user.user?.discriminator;
  if (disc && disc !== "0" && disc !== "0000") return `${username}#${disc}`;
  return username;
}

export function getUserId(user: any): string | null {
  return (
    user?.id ??
    user?.userId ??
    user?.user?.id ??
    user?.author?.id ??
    null
  );
}
