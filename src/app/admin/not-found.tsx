import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Shown when notFound() is thrown inside any /admin/* route segment
 * (e.g. a problem code that no longer exists). Falls back gracefully
 * without exposing internals.
 */
export default function AdminNotFound() {
  return (
    <div className="px-6 py-16 max-w-md mx-auto text-center space-y-4">
      <h1 className="font-display text-3xl">Sahifa topilmadi</h1>
      <p className="text-muted-foreground">
        Siz qidirayotgan sahifa mavjud emas yoki o&apos;chirilgan.
      </p>
      <Button nativeButton={false} render={<Link href="/admin" />}>
        Dashboard&apos;ga qaytish
      </Button>
    </div>
  );
}
