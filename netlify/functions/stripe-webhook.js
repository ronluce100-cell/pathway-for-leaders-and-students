// ─────────────────────────────────────────────────────────────────────────────
//  stripe-webhook.js — Netlify Function
//  Writes subscription status to Firestore via REST API (no service account needed)
//
//  Required Netlify environment variables (2 only):
//    STRIPE_SECRET_KEY      — Stripe dashboard → Developers → API Keys → Secret key
//    STRIPE_WEBHOOK_SECRET  — Stripe dashboard → Developers → Webhooks → signing secret
//
//  Stripe webhook events to enable:
//    checkout.session.completed
//    customer.subscription.deleted
// ─────────────────────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Same Firebase project & API key used by all PTF apps
const FB_PROJECT = 'pathway-to-freedom';
const FB_API_KEY  = 'AIzaSyA4u3QQgC39uxTAIXuzexTg0Pz889YovoI';

function san(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 60);
}

// Merge-write to Firestore using the REST API (PATCH with updateMask)
async function fsSet(docId, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'boolean')     fields[k] = { booleanValue: v };
    else if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
  }

  const mask = Object.keys(data)
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');

  const url =
    `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}` +
    `/databases/(default)/documents/ptf_parents/${docId}?key=${FB_API_KEY}&${mask}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore write failed (${res.status}): ${text}`);
  }
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Verify Stripe signature
  const sig = event.headers['stripe-signature'];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const obj = stripeEvent.data.object;

  try {
    switch (stripeEvent.type) {

      // ── Payment complete → activate subscription ──
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') break;

        const email =
          obj.customer_email ||
          (obj.customer_details && obj.customer_details.email);

        if (!email) {
          console.warn('No email in checkout.session.completed');
          break;
        }

        const sid = san(email);
        await fsSet(sid, {
          email:                email.toLowerCase(),
          subscribed:           true,
          stripeCustomerId:     obj.customer     || '',
          stripeSubscriptionId: obj.subscription || '',
          subscribedAt:         new Date().toISOString(),
          updatedAt:            new Date().toISOString()
        });
        console.log('✅ Activated:', email);
        break;
      }

      // ── Subscription canceled ──
      case 'customer.subscription.deleted': {
        // Look up email from Stripe customer record
        let email = null;
        try {
          const customer = await stripe.customers.retrieve(obj.customer);
          email = customer.email;
        } catch (e) {
          console.warn('Could not retrieve customer:', e.message);
        }

        if (email) {
          await fsSet(san(email), {
            subscribed: false,
            canceledAt: new Date().toISOString(),
            updatedAt:  new Date().toISOString()
          });
          console.log('❌ Canceled:', email);
        }
        break;
      }

      default:
        break; // Ignore other events
    }
  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
