"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    null,
  );
  const error =
    state && "error" in state
      ? state.error
      : linkError
        ? "That sign-in link is invalid or expired. Request a new one."
        : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          className="rounded border px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        Send sign-in link
      </button>
      {state && "ok" in state && (
        <p role="status">Check your email for a sign-in link.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
