import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clerkMiddlewareOptions } from "@/lib/clerk-config";

// Public routes: proposal view page (for clients) and API event tracking
const isPublicRoute = createRouteMatcher([
  "/p/(.*)",           // public proposal view
  "/api/events(.*)",   // analytics tracking endpoint
  "/api/proposals/(.*)/accept", // public acceptance endpoint
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

// clerkMiddleware still reads the session on every matched request, including
// public proposal views, so the page can tell an owner from a client. protect()
// only runs for signed-in app routes. Role checks should use the session token
// (see getAuthContext) instead of calling Clerk's user API again.
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
}, clerkMiddlewareOptions());

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
