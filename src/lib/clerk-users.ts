import { clerkClient } from "@clerk/nextjs/server";

export interface ResolvedClerkUser {
  name: string;
  email: string;
}

function displayName(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
}): ResolvedClerkUser {
  const email =
    user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ?? "";
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    email ||
    "Unknown user";
  return { name, email };
}

/** One Clerk list call per chunk, instead of getUser once per id. */
export async function resolveClerkUsers(
  ids: string[]
): Promise<Record<string, ResolvedClerkUser>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};

  const client = await clerkClient();
  const resolved: Record<string, ResolvedClerkUser> = {};
  const chunkSize = 100;

  for (let index = 0; index < unique.length; index += chunkSize) {
    const slice = unique.slice(index, index + chunkSize);
    try {
      const page = await client.users.getUserList({
        userId: slice,
        limit: slice.length,
      });
      for (const user of page.data) {
        resolved[user.id] = displayName(user);
      }
    } catch {
      // Leave these ids unresolved; the caller shows "Unknown user".
    }
    for (const uid of slice) {
      if (!resolved[uid]) resolved[uid] = { name: "Unknown user", email: "" };
    }
  }

  return resolved;
}
