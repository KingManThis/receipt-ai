import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../components/AuthProvider";

type Profile = { full_name: string | null; plan: string };

export function Dashboard() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [receiptCount, setReceiptCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("full_name, plan").single()
      .then(({ data }) => setProfile(data));
    supabase.from("receipts").select("id", { count: "exact", head: true })
      .then(({ count }) => setReceiptCount(count ?? 0));
  }, []);

  const name = profile?.full_name || session?.user.email;

  return (
    <main className="container">
      <h1>Hi, {name}</h1>
      <div className="grid">
        <div className="card stat">
          <span className="muted">Receipts saved</span>
          <strong>{receiptCount ?? "…"}</strong>
        </div>
        <div className="card stat">
          <span className="muted">Plan</span>
          <strong>{profile?.plan === "pro" ? "Pro" : "Free"}</strong>
        </div>
      </div>
      <div className="card empty">
        <h2>Receipt upload is coming next</h2>
        <p className="muted">Phase 2 adds photo upload and AI extraction here.</p>
      </div>
    </main>
  );
}
