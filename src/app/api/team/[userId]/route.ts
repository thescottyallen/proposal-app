import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { roleFromMetadata, type AppRole } from "@/lib/roles";

// PATCH /api/team/:userId — update a user's role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: callerId } = await auth();
  if (!callerId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { userId: targetId } = await params;
  const client = await clerkClient();

  // Check caller is admin
  const caller = await client.users.getUser(callerId);
  const callerRole = roleFromMetadata(caller.publicMetadata as Record<string, unknown>);
  if (callerRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prevent admin from demoting themselves
  if (callerId === targetId) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
  }

  const body = await request.json() as { role: AppRole };
  const { role } = body;

  if (!["admin", "member", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await client.users.updateUserMetadata(targetId, {
    publicMetadata: { role },
  });

  return NextResponse.json({ success: true });
}

// DELETE /api/team/:userId — remove a user from the application
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: callerId } = await auth();
  if (!callerId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { userId: targetId } = await params;
  const client = await clerkClient();

  // Check caller is admin
  const caller = await client.users.getUser(callerId);
  const callerRole = roleFromMetadata(caller.publicMetadata as Record<string, unknown>);
  if (callerRole !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (callerId === targetId) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
  }

  await client.users.deleteUser(targetId);

  return NextResponse.json({ success: true });
}
