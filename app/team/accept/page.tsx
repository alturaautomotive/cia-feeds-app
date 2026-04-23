"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No invite token provided.");
    }
  }, [token]);

  async function handleAccept() {
    setStatus("accepting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_token: "This invite link is invalid or has already been used.",
          token_expired: "This invite link has expired. Please ask for a new one.",
          already_accepted: "You have already joined this team.",
        };
        setErrorMsg(messages[data.error] || data.error || "Failed to accept invite.");
        setStatus("error");
        return;
      }
      setStatus("success");
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Team Invitation</h1>

        {status === "idle" && token && (
          <>
            <p className="text-sm text-gray-600 mb-6">
              You have been invited to join a team on CIA Feeds. Click below to accept.
            </p>
            <button
              onClick={handleAccept}
              className="w-full bg-indigo-600 text-white rounded-md py-2.5 text-sm font-semibold hover:bg-indigo-700"
            >
              Accept Invitation
            </button>
          </>
        )}

        {status === "accepting" && (
          <p className="text-sm text-gray-600 mt-4">Accepting invitation...</p>
        )}

        {status === "success" && (
          <div className="mt-4">
            <div className="rounded-md bg-green-50 border border-green-200 p-4 mb-4">
              <p className="text-sm text-green-700 font-medium">
                Invitation accepted! Redirecting to login...
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-4">
            <div className="rounded-md bg-red-50 border border-red-200 p-4 mb-4">
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
            {token && (
              <button
                onClick={handleAccept}
                className="text-sm text-indigo-600 hover:text-indigo-700 underline"
              >
                Try again
              </button>
            )}
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
