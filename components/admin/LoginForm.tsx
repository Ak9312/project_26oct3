"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, Input, Label } from "@/components/ui/primitives";
import { api } from "@/lib/client";

export default function LoginForm({ enabled }: { enabled: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Enter the admin password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      window.location.href = "/admin/visibility";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-8 shadow-[0_1px_2px_rgba(9,9,11,0.04),0_12px_32px_rgba(9,9,11,0.06)]"
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Admin sign in</h1>
        <p className="text-sm text-zinc-600">Manage briefs, AI visibility tracking and your share links.</p>
      </div>
      {!enabled && (
        <Alert tone="warning">
          Admin isn&apos;t set up yet. Add <code className="font-mono text-[13px]">APP_PASSWORD</code> in Vercel → Settings →
          Environment Variables, then redeploy.
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw">Password</Label>
        <Input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "pw-error" : undefined}
        />
        {error && <p id="pw-error" className="text-[13px] text-red-700">{error}</p>}
      </div>
      <Button type="submit" size="lg" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
