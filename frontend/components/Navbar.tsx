"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import AuthModal from "./AuthModal";

// ── Avatar component — always shows something ─────────────────────────────────
// Uses a plain <img> (not next/image) so it works with any URL without domain
// config. If the image fails to load, onError swaps it to the letter fallback.
function Avatar({
  avatarUrl,
  displayName,
  email,
  size = 32,
}: {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null | undefined;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const letter = ((displayName || email || "U")[0] || "U").toUpperCase();

  const fallbackStyle: React.CSSProperties = {
    width:          size,
    height:         size,
    borderRadius:   "50%",
    background:     "#4b5563",   // solid gray — always visible
    color:          "#f9fafb",
    fontWeight:     700,
    fontSize:       Math.round(size * 0.44),
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
    fontFamily:     "var(--font-body)",
    userSelect:     "none",
    lineHeight:     1,
  };

  // Show fallback if no URL, or if URL failed to load
  if (!avatarUrl || imgFailed) {
    return <span style={fallbackStyle}>{letter}</span>;
  }

  return (
    <img
      src={avatarUrl}
      alt={displayName || "Avatar"}
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      style={{
        width:        size,
        height:       size,
        borderRadius: "50%",
        objectFit:    "cover",
        display:      "block",
        flexShrink:   0,
      }}
    />
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────
export default function Navbar() {
  const { user, signOut, loading, avatarUrl, displayName } = useAuth();
  const [showAuth,     setShowAuth]     = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef                     = useRef<HTMLDivElement>(null);
  const pathname                        = usePathname();

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const navLink = (href: string, label: string, icon: string) => (
    <Link
      key={href}
      href={href}
      className={`nav-link ${pathname === href ? "nav-link--active" : ""}`}
    >
      <span>{icon}</span> {label}
    </Link>
  );

  const name = displayName || user?.email?.split("@")[0] || "";

  return (
    <>
      <nav className="navbar">

        {/* Brand */}
        <Link href="/" className="nav-brand">
          <span className="nav-brand-icon">🎯</span>
          <span className="nav-brand-text">ResumeAI</span>
        </Link>

        {/* Nav links */}
        <div className="nav-links">
          {navLink("/", "Screener", "⚡")}
          {user && navLink("/history",    "History",    "🕓")}
          {user && navLink("/candidates", "Candidates", "👥")}
        </div>

        {/* Auth area */}
        <div className="nav-auth">
          {!loading && (
            user ? (
              <div className="nav-profile-wrap" ref={dropdownRef}>

                {/* ── Avatar pill button ── */}
                <button
                  className="nav-avatar-btn"
                  onClick={() => setDropdownOpen((o) => !o)}
                  aria-label="Open profile menu"
                  aria-expanded={dropdownOpen}
                >
                  <Avatar
                    avatarUrl={avatarUrl}
                    displayName={displayName}
                    email={user.email}
                    size={32}
                  />
                  <div className="nav-profile-info">
                    <span className="nav-profile-name">{name}</span>
                    <span className="nav-profile-email">{user.email}</span>
                  </div>
                  <span className={`nav-chevron ${dropdownOpen ? "nav-chevron--open" : ""}`}>
                    ›
                  </span>
                </button>

                {/* ── Dropdown menu ── */}
                {dropdownOpen && (
                  <div className="nav-dropdown">

                    {/* Header with larger avatar */}
                    <div className="nav-dropdown-header">
                      <Avatar
                        avatarUrl={avatarUrl}
                        displayName={displayName}
                        email={user.email}
                        size={44}
                      />
                      <div style={{ minWidth: 0 }}>
                        <p className="nav-dropdown-name">{name}</p>
                        <p className="nav-dropdown-email">{user.email}</p>
                      </div>
                    </div>

                    <div className="nav-dropdown-divider" />

                    <Link
                      href="/history"
                      className="nav-dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      🕓 Analysis History
                    </Link>
                    <Link
                      href="/candidates"
                      className="nav-dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      👥 All Candidates
                    </Link>

                    <div className="nav-dropdown-divider" />

                    <button
                      className="nav-dropdown-item nav-dropdown-item--danger"
                      onClick={() => { setDropdownOpen(false); signOut(); }}
                    >
                      ↩ Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="nav-signin" onClick={() => setShowAuth(true)}>
                Sign In
              </button>
            )
          )}
        </div>
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}