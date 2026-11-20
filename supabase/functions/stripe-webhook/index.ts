// Supabase Edge Function: receives Stripe webhooks and switches a user's plan between "free" and "pro".
// Deploy with JWT verification OFF (Stripe can't send a Supabase login token):
//   supabase functions deploy stripe-webhook --no-verify-jwt
// Secret needed (Supabase → Edge Functions → Secrets): STRIPE_WEBHOOK_SECRET (starts with whsec_).
// Checkout links must carry ?client_reference_id=<user id>; the app adds it automatically.

import Stripe from "npm:stripe@23.2.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.2";

// No Stripe API calls are made here; the key is only required by the constructor.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "sk_unused");
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ACTIVE = new Set(["active", "trialing", "past_due"]);

const customerId = (c: string | { id: string } | null | undefined) => (typeof c === "string" ? c : c?.id ?? null);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const signature = req.headers.get("Stripe-Signature");
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !secret) return new Response("Missing signature or secret", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret, undefined, cryptoProvider);
  } catch (err) {
    console.error("Bad signature", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (!userId) break;
        const { error } = await admin.from("profiles")
          .update({ plan: "pro", stripe_customer_id: customerId(session.customer) })
          .eq("id", userId);
        if (error) throw error;
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const plan = event.type !== "customer.subscription.deleted" && ACTIVE.has(sub.status) ? "pro" : "free";
        const { error } = await admin.from("profiles").update({ plan }).eq("stripe_customer_id", customerId(sub.customer));
        if (error) throw error;
        break;
      }
    }
  } catch (err) {
    console.error("Failed to update plan", err);
    return new Response("Update failed", { status: 500 }); // Stripe retries
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
