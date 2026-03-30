import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { roleFromMetadata, type AppRole } from "@/lib/roles";

// GET /api/team — list all users with their roles
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const client = await clerkClient();

    const caller = await client.users.getUser(userId);
    const callerRole = roleFromMetadata(caller.publicMetadata as Record<string, unknown>);
    if (callerRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: users } = await client.users.getUserList({ limit: 100 });

    const mapped = users.map((u) => ({
      id:        u.id,
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? "",
      imageUrl:  u.imageUrl,
      role:      roleFromMetadata(u.publicMetadata as Record<string, unknown>),
      createdAt: u.createdAt,
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("GET /api/team error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/team — invite a new user by email
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const client = await clerkClient();

    const caller = await client.users.getUser(userId);
    const callerRole = roleFromMetadata(caller.publicMetadata as Record<string, unknown>);
    if (callerRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json() as { emailAddress: string; role: AppRole };
    const { emailAddress, role } = body;

    if (!emailAddress || !role) {
      return NextResponse.json({ error: "emailAddress and role are required" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const invitation = await client.invitations.createInvitation({
      emailAddress,
      redirectUrl: `${appUrl}/sign-up`,
      publicMetadata: { role },
      ignoreExisting: true,
    });

    return NextResponse.json({ id: invitation.id, emailAddress: invitation.emailAddress });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/team error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
