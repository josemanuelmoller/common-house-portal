import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();
  // The Hall is the default client home.
  // /dashboard remains accessible via the sidebar "Overview" link.
  if (userId) redirect("/hall");
  redirect("/sign-in");
}
