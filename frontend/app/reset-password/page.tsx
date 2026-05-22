"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function ResetPasswordPage() {
  const { supabase }          = useAuth();
  const router                = useRouter();
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState(false);
  const [ready,    setReady]    = useState(false);

  // Supabase puts the session tokens in the URL hash after redirect.
  // We need to let the client pick them up before we render the form.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else {
        // No session yet — wait for the onAuthStateChange triggered by the hash
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event) => {
            if (event === "PASSWORD_RECOVERY") {
              setReady(true);
              subscription.unsubscribe();
            }
          }
        );
      }
    });
  }, [supabase]);

  const handleSubmit = async () => {
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/"), 2500);
    }
    setLoading(false);
  };

  return (
    <div className="reset-page">
      <div className="auth-modal" style={{ position: "relative", margin: "auto" }}>
        <div className="auth-logo">🔑</div>

        {done ? (
          <>
            <h2 className="auth-title">Password updated!</h2>
            <p className="auth-sub" style={{ marginBottom: 0 }}>
              Redirecting you back to the app…
            </p>
            <div className="auth-success" style={{ marginTop: "1rem" }}>
              ✅ Your password has been changed successfully.
            </div>
          </>
        ) : !ready ? (
          <>
            <h2 className="auth-title">Verifying link…</h2>
            <p className="auth-sub">Please wait while we verify your reset link.</p>
            <div style={{ display: "flex", justifyContent: "center", padding: "1.5rem" }}>
              <span
                className="spinner"
                style={{ width: 24, height: 24, borderWidth: 3, borderTopColor: "var(--accent)" }}
              />
            </div>
          </>
        ) : (
          <>
            <h2 className="auth-title">Set new password</h2>
            <p className="auth-sub">Choose a strong password for your account.</p>

            <div className="auth-fields">
              <div className="auth-field">
                <label className="auth-field-label">New Password</label>
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
              <div className="auth-field">
                <label className="auth-field-label">Confirm Password</label>
                <input
                  type="password"
                  className="auth-input"
                  placeholder="Repeat your new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
              </div>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button
              className="auth-submit"
              onClick={handleSubmit}
              disabled={loading || !password || !confirm}
            >
              {loading && <span className="spinner" />}
              Update Password
            </button>
          </>
        )}
      </div>
    </div>
  );
}