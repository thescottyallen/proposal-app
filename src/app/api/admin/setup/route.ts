import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

// POST /api/admin/setup
// One-time bootstrap: makes the currently signed-in user an admin.
// Safe to call repeatedly — it just re-sets admin on the caller.
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const client = await clerkClient();

  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role: "admin" },
  });

  const user = await client.users.getUser(userId);
  const email = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId
  )?.emailAddress;

  return NextResponse.json({
    success: true,
    message: `${email} is now an admin. Sign out and back in, then visit /team.`,
  });
}
