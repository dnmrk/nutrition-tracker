import { requireUser } from "@/lib/supabase/server";
import { TabBar } from "./tab-bar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
      <div className="flex-1">{children}</div>
      <TabBar />
    </div>
  );
}
