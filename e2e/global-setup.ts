export default async function globalSetup() {
  process.loadEnvFile(".env.local");
  // FC-23: never run e2e against anything but the local stack.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") {
    throw new Error(
      `Refusing to run e2e against ${process.env.NEXT_PUBLIC_SUPABASE_URL}; expected http://127.0.0.1:54321`,
    );
  }
  const res = await fetch("http://127.0.0.1:54324/api/v1/messages").catch(
    () => null,
  );
  if (!res?.ok) throw new Error("Mailpit is not reachable on 127.0.0.1:54324. Run npm run db:start.");
}
