"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { registerWithInvite, acceptTeamInvite } from "@/lib/api";

type RegisterResult = {
  accessToken?: string;
};

type AcceptResult = {
  organizationId?: string;
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();

  const token = String(params.token || "");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const result = (await registerWithInvite({
        token,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      })) as RegisterResult;

      if (result.accessToken) {
        localStorage.setItem(
          "renkoo_access_token",
          result.accessToken,
        );
      }

      setMessage(
        "Account created. Joining your organization...",
      );

      setTimeout(() => {
        router.push("/");
      }, 500);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to accept this invitation.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExistingAccount() {
    setError("");
    setMessage("");

    try {
      setLoading(true);

      const result = (await acceptTeamInvite(
        token,
      )) as AcceptResult;

      if (result.organizationId) {
        setMessage(
          "Invitation accepted. Redirecting...",
        );

        router.push("/");
        return;
      }

      setError(
        "Please log in with the invited email address first.",
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to accept this invitation.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl border p-8 max-w-md w-full text-center">
          <div className="text-3xl font-extrabold mb-4">
            RENKOO
          </div>

          <h1 className="text-2xl font-bold mb-2">
            Invalid Invitation
          </h1>

          <p className="text-slate-500">
            This invitation link is invalid.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl border shadow-sm p-8 max-w-md w-full">
        <div className="text-center mb-7">
          <div className="text-3xl font-extrabold mb-3">
            RENKOO
          </div>

          <h1 className="text-2xl font-bold">
            You're invited
          </h1>

          <p className="text-slate-500 mt-2">
            Create your account to join your organization
            on RENKOO.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 text-green-700 rounded-lg p-3 mb-4 text-sm">
            {message}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
            disabled={loading}
            className="w-full border rounded-lg px-3 py-3 outline-none disabled:bg-slate-50"
          />

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            disabled={loading}
            className="w-full border rounded-lg px-3 py-3 outline-none disabled:bg-slate-50"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password — minimum 8 characters"
            autoComplete="new-password"
            disabled={loading}
            className="w-full border rounded-lg px-3 py-3 outline-none disabled:bg-slate-50"
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(e.target.value)
            }
            placeholder="Confirm password"
            autoComplete="new-password"
            disabled={loading}
            className="w-full border rounded-lg px-3 py-3 outline-none disabled:bg-slate-50"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 text-white py-3 font-semibold disabled:opacity-60"
          >
            {loading
              ? "Creating account..."
              : "Create Account & Join"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6 text-xs text-slate-400">
          <div className="h-px bg-slate-200 flex-1" />
          OR
          <div className="h-px bg-slate-200 flex-1" />
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        <button
          type="button"
          onClick={handleExistingAccount}
          disabled={loading}
          className="w-full rounded-lg border py-3 font-semibold text-slate-800 disabled:opacity-60"
        >
          I already have a RENKOO account
        </button>

        <p className="text-center text-xs text-slate-400 mt-5">
          Invitation links expire after 7 days.
        </p>
      </div>
    </main>
  );
}
