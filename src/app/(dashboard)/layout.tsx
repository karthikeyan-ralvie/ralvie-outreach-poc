import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <Sidebar name={session.user.name} email={session.user.email} />
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
