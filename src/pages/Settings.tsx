import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../components/AuthProvider";
import { clearCategoriesCache, fetchCategories, type Category } from "../lib/receipts";

const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD", "NZD", "JMD", "INR", "NGN", "ZAR"];
const SCHEDULE_C_LINES = [
  "Line 8", "Line 9", "Line 10", "Line 11", "Line 15", "Line 16", "Line 17", "Line 18", "Line 20a", "Line 20b",
  "Line 21", "Line 22", "Line 23", "Line 24a", "Line 24b", "Line 25", "Line 27a",
];

type CategoryWithOwner = Category & { user_id: string | null };

export function Settings() {
  const { session } = useAuth();
  const navigate = useNavigate();

  // Profile
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<CategoryWithOwner[]>([]);
  const [newCat, setNewCat] = useState({ name: "", line: "Line 27a", percent: "100" });
  const [catError, setCatError] = useState<string | null>(null);

  // Password
  const [password, setPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  // Delete
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadCategories() {
    const { data } = await supabase.from("categories")
      .select("id, name, schedule_c_line, deductible_percent, user_id").order("name");
    setCategories((data ?? []) as CategoryWithOwner[]);
  }

  useEffect(() => {
    supabase.from("profiles").select("full_name, currency").single().then(({ data }) => {
      if (data) { setName(data.full_name ?? ""); setCurrency(data.currency ?? "USD"); }
    });
    loadCategories();
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const { error } = await supabase.from("profiles")
      .update({ full_name: name.trim() || null, currency }).eq("id", session!.user.id);
    setProfileMsg(error ? "Couldn't save: " + error.message : "Saved ✓");
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setCatError(null);
    const label = newCat.name.trim();
    if (!label) return;
    if (categories.some((c) => c.name.toLowerCase() === label.toLowerCase())) {
      setCatError("A category with that name already exists.");
      return;
    }
    const { error } = await supabase.from("categories").insert({
      user_id: session!.user.id,
      name: label,
      schedule_c_line: newCat.line || null,
      deductible_percent: Math.max(0, Math.min(100, Number(newCat.percent) || 0)),
    });
    if (error) { setCatError(error.message); return; }
    setNewCat({ name: "", line: "Line 27a", percent: "100" });
    clearCategoriesCache();
    loadCategories();
  }

  async function updateCategory(c: CategoryWithOwner, patch: Partial<CategoryWithOwner>) {
    setCatError(null);
    const { error } = await supabase.from("categories").update(patch).eq("id", c.id);
    if (error) setCatError(error.message);
    clearCategoriesCache();
    loadCategories();
  }

  async function deleteCategory(c: CategoryWithOwner) {
    if (!confirm(`Delete "${c.name}"? Receipts in it become Uncategorized.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) setCatError(error.message);
    clearCategoriesCache();
    loadCategories();
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    setPwMsg(error ? error.message : "Password updated ✓");
    if (!error) setPassword("");
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      // 1. Remove all receipt files in the user's folder.
      const folder = session!.user.id;
      for (;;) {
        const { data, error } = await supabase.storage.from("receipts").list(folder, { limit: 100 });
        if (error) throw error;
        if (!data?.length) break;
        const { error: rmErr } = await supabase.storage.from("receipts").remove(data.map((f) => `${folder}/${f.name}`));
        if (rmErr) throw rmErr;
      }
      // 2. Delete the account (cascades to all rows).
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await supabase.auth.signOut();
      navigate("/");
    } catch (err) {
      setDeleteError(
        (err instanceof Error ? err.message : "Something went wrong") +
        ". If this keeps happening, the database update (0002_settings.sql) may not have been run yet.",
      );
      setDeleting(false);
    }
  }

  const custom = categories.filter((c) => c.user_id);
  const builtIn = categories.filter((c) => !c.user_id);

  return (
    <main className="container settings">
      <h1>Settings</h1>

      <section className="card">
        <h2>Profile</h2>
        <form onSubmit={saveProfile}>
          <div className="two">
            <label>Your name<input value={name} placeholder="e.g. Okeif" onChange={(e) => setName(e.target.value)} /></label>
            <label>Default currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="form-foot">
            <button className="btn">Save</button>
            {profileMsg && <span className="muted">{profileMsg}</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Your categories</h2>
        <p className="muted small-text">
          Add your own expense categories, for example a client, a project, or a type of cost you buy often.
          Choose the IRS Schedule C line it belongs to so your tax summary stays correct.
        </p>

        {custom.length > 0 && (
          <div className="cat-row cat-head muted small-text" aria-hidden>
            <span>Name</span><span>Schedule C</span><span>Deductible</span><span />
          </div>
        )}
        {custom.length > 0 && (
          <ul className="cat-list">
            {custom.map((c) => (
              <li key={c.id} className="cat-row">
                <input defaultValue={c.name} aria-label="Category name"
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && updateCategory(c, { name: e.target.value.trim() })} />
                <select value={c.schedule_c_line ?? ""} aria-label="Schedule C line"
                  onChange={(e) => updateCategory(c, { schedule_c_line: e.target.value || null })}>
                  <option value="">No line (personal)</option>
                  {SCHEDULE_C_LINES.map((l) => <option key={l}>{l}</option>)}
                </select>
                <select value={c.deductible_percent} aria-label="Deductible percent"
                  onChange={(e) => updateCategory(c, { deductible_percent: Number(e.target.value) })}>
                  {[100, 50, 0].map((p) => <option key={p} value={p}>{p}%</option>)}
                </select>
                <button className="link danger" onClick={() => deleteCategory(c)}>Delete</button>
              </li>
            ))}
          </ul>
        )}

        <form className="cat-row add" onSubmit={addCategory}>
          <input placeholder="New category name" value={newCat.name} aria-label="New category name"
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <select value={newCat.line} aria-label="Schedule C line" onChange={(e) => setNewCat({ ...newCat, line: e.target.value })}>
            <option value="">No line (personal)</option>
            {SCHEDULE_C_LINES.map((l) => <option key={l}>{l}</option>)}
          </select>
          <select value={newCat.percent} aria-label="Deductible percent" onChange={(e) => setNewCat({ ...newCat, percent: e.target.value })}>
            {["100", "50", "0"].map((p) => <option key={p} value={p}>{p}%</option>)}
          </select>
          <button className="btn small" type="submit">Add category</button>
        </form>
        {catError && <p className="alert">{catError}</p>}

        <details className="builtin">
          <summary>Built-in categories ({builtIn.length})</summary>
          <ul>
            {builtIn.map((c) => (
              <li key={c.id}>{c.name} <span className="muted">· {c.schedule_c_line ?? "not deductible"}{c.deductible_percent < 100 && c.deductible_percent > 0 ? ` · ${c.deductible_percent}%` : ""}</span></li>
            ))}
          </ul>
        </details>
      </section>

      <section className="card">
        <h2>Account</h2>
        <p className="muted">Signed in as <strong>{session?.user.email}</strong></p>
        <form onSubmit={changePassword} className="form-inline">
          <label>New password
            <input type="password" minLength={8} required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn outline">Change password</button>
        </form>
        {pwMsg && <p className="muted">{pwMsg}</p>}
        <button className="btn outline" onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}>
          Sign out
        </button>
      </section>

      <p className="muted small-text center">
        <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy Policy</a> ·{" "}
        <a href={`${import.meta.env.BASE_URL}terms.html`}>Terms of Service</a>
      </p>

      <section className="card danger-zone">
        <h2>Delete account</h2>
        <p className="muted small-text">
          Permanently deletes your account, every receipt and every image. Download an export first if you
          need your records: this can't be undone.
        </p>
        <label>Type <b>DELETE</b> to confirm
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        </label>
        {deleteError && <p className="alert">{deleteError}</p>}
        <button className="btn danger-btn" disabled={confirmText !== "DELETE" || deleting} onClick={deleteAccount}>
          {deleting ? "Deleting…" : "Delete my account"}
        </button>
      </section>
    </main>
  );
}
