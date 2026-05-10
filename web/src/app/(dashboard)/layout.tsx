import TopNavBar from "@/components/layout/TopNavBar";
import SideNavBar from "@/components/layout/SideNavBar";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <TopNavBar />
      <div className="flex flex-1 pt-16 w-full min-h-0">
        <SideNavBar />
        <main className="ml-64 flex-1 flex flex-col md:flex-row gap-4 p-4 overflow-hidden h-full min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
