import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes: proposal view page (for clients) and API event tracking
const isPublicRoute = createRouteMatcher([
  "/p/(.*)",           // public proposal view
  "/api/events(.*)",   // analytics tracking endpoint
  "/api/proposals/(.*)/accept", // public acceptance endpoint
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
