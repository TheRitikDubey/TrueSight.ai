import { database } from "../chat/database.js";
import type { GoogleProfile } from "../auth/google.js";

export const publicUser = { id: true, email: true, name: true, avatar: true } as const;
export async function findOrCreateGoogleUser(profile: GoogleProfile) {
  const email = profile.email.trim().toLowerCase();
  // Native PostgreSQL upsert + unique constraints serialize concurrent first logins.
  // Never silently replace the Google subject already bound to an email.
  const user = await database().user.upsert({
    where: { email },
    create: { ...profile, email, authProvider: "google" },
    update: { email },
  });
  if (user.googleId !== profile.googleId) throw new Error("Google identity does not match this account.");
  return database().user.update({
    where: { id: user.id },
    data: { name: profile.name, avatar: profile.avatar ?? null },
    select: publicUser,
  });
}
