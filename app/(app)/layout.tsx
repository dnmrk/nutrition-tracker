import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <>
      <header className="border-b p-4">
        <nav aria-label="Main" className="flex items-center gap-4">
          <Link href="/">Today</Link>
          <Link href="/history">History</Link>
          <Link href="/settings">Settings</Link>
          <form action="/auth/signout" method="post" className="ml-auto">
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      {children}
    </>
  );
}
