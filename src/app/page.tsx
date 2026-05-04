export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold">Provia</h1>
      <p className="text-muted-foreground mt-2">
        Admin panel coming soon. Visit{" "}
        <a className="underline" href="/api/health">
          /api/health
        </a>
        .
      </p>
    </main>
  );
}
