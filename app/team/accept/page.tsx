"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

type PageState = "loading-token" | "form" | "submitting" | "success" | "error";

interface TokenInfo {
  email: string;
  dealerName: string;
  role: string;
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<PageState>("loading-token");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("No invite token provided.");
      setState("error");
      return;
    }

    async function validateToken() {
      try {
        const res = await fetch(`/api/team/accept?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const messages: Record<string, string> = {
            invalid_token: "This invite link is invalid or has already been used.",
            missing_token: "No invite token provided.",
          };
          setErrorMsg(messages[data.error] || "Invalid invite link.");
          setState("error");
          return;
        }

        if (data.expired) {
          setErrorMsg("This invite link has expired. Please ask for a new one.");
          setState("error");
          return;
        }

        setTokenInfo({ email: data.email, dealerName: data.dealerName, role: data.role });
        setState("form");
      } catch {
        setErrorMsg("Network error. Please try again.");
        setState("error");
      }
    }

    validateToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || password.length < 8) return;

    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_token: "This invite link is invalid or has already been used.",
          token_expired: "This invite link has expired. Please ask for a new one.",
          already_accepted: "You have already joined this team.",
          validation_error: data.details
            ? Object.values(data.details).flat().join(". ")
            : "Please check your inputs.",
        };
        setErrorMsg(messages[data.error] || data.error || "Failed to create account.");
        setState("form");
        return;
      }

      // Auto sign in
      const result = await signIn("credentials", {
        email: data.email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        setState("success");
        window.location.href = "/dashboard";
      } else {
        setState("success");
        // Fallback: account created but auto-login failed
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("form");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2 text-center">Team Invitation</h1>

        {state === "loading-token" && (
          <p className="text-sm text-gray-600 mt-4 text-center">Validating invite...</p>
        )}

        {state === "form" && tokenInfo && (
          <>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Joining <span className="font-semibold">{tokenInfo.dealerName}</span> as{" "}
              <span className="font-semibold">{tokenInfo.role}</span> ({tokenInfo.email})
            </p>

            {errorMsg && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-4">
                <p className="text-sm text-red-600">{errorMsg}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Your name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Full name"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">At least 8 characters</p>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white rounded-md py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!name.trim() || password.length < 8}
              >
                Create account &amp; sign in
              </button>
            </form>
          </>
        )}

        {state === "submitting" && (
          <p className="text-sm text-gray-600 mt-4 text-center">Creating your account...</p>
        )}

        {state === "success" && (
          <div className="mt-4 text-center">
            <div className="rounded-md bg-green-50 border border-green-200 p-4 mb-4">
              <p className="text-sm text-green-700 font-medium">
                Account created! Redirecting to dashboard...
              </p>
            </div>
            <a
              href="/login"
              className="text-sm text-indigo-600 hover:text-indigo-700 underline"
            >
              Or click here to sign in manually
            </a>
          </div>
        )}

        {state === "error" && (
          <div className="mt-4 text-center">
            <div className="rounded-md bg-red-50 border border-red-200 p-4 mb-4">
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div>Loading...</div>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
