import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already logged in? Send to /admin
  const user = await getCurrentUser();
  if (user) redirect("/admin");

  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <p className="text-muted-foreground text-sm">
            Provia administration
          </p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
