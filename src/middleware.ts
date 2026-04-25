import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/",
  "/api/(.*)",   // API routes manejan su propia autenticación
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

// Matcher notes:
//   (?!_next/)                       — skip Next's build output
//   (?!.*\.(?:ico|png|jpe?g|…)$)     — skip common static file paths (trailing
//                                      extension only). The previous version
//                                      banned ANY path with a dot anywhere,
//                                      which stripped Clerk from URLs like
//                                      /admin/hall/contacts/foo@gmail.com.
export const config = {
  matcher: [
    "/((?!_next/|.*\\.(?:ico|png|jpe?g|gif|svg|webp|css|js|json|woff2?|ttf|otf|map|txt|xml|pdf|mp4|webm|html)$).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
