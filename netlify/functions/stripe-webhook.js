// ─────────────────────────────────────────────────────────────────────────────
//  stripe-webhook.js — Netlify Function
//  Handles Stripe subscription events and writes status to Firestore
//  (ptf_parents/{sanitized_email})
//
//  Required Netlify environment variables:
//    STRIPE_SECRET_KEY       — from Stripe dashboard → Developers → API Keys
//    STRIPE_WEBHOOK_SECRET   — from Stripe dashboard → Developers → Webhooks
//    FIREBASE_SERVICE_ACCOUNT — full JSON content of your Firebase service
//                               account key (minified to one line)
//
//  Stripe webhook events to enable:
//    checkout.session.completed
//    customer.subscription.deleted
//    invoice.payment_failed
// ─────────────────────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const admin  = require('firebase-admin');

// Initialize Firebase Admin SDK (only once across warm invocations)
if (!admin.apps.length) {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  } catch (e) {
    console.error('Firebase Admin init error:', e.message);
  }
}

const db = admin.firestore ? admin.firestore() : null;

function sanitize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 60);
}

async function setParent(email, data) {
  if (!db || !email) return;
  const sid = sanitize(email);
  await db.collection('ptf_parents').doc(sid).set(
    { ...data, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // ── Verify Stripe signature ──
  const sig = event.headers['stripe-signature'];
  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const obj = stripeEvent.data.object;

  try {
    switch (stripeEvent.type) {

      // ── Checkout completed → subscription started ──
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') break;
        const email =
          obj.customer_email ||
          (obj.customer_details && obj.customer_details.email);
        if (!email) {
          console.warn('checkout.session.completed: no email found in event');
          break;
        }
        await setParent(email.toLowerCase(), {
          email:                email.toLowerCase(),
          subscribed:           true,
          stripeCustomerId:     obj.customer,
          stripeSubscriptionId: obj.subscription,
          subscribedAt:         new Date().toISOString()
        });
        console.log('✅ Subscription activated for:', email);
        break;
      }

      // ── Subscription canceled or expired ──
      case 'customer.subscription.deleted': {
        let email = null;
        try {
          const customer = await stripe.customers.retrieve(obj.customer);
          email = customer.email;
        } catch (e) {
          console.warn('Could not retrieve customer:', e.message);
        }
        if (email) {
          await setParent(email.toLowerCase(), {
            subscribed:  false,
            canceledAt:  new Date().toISOString()
          });
          console.log('❌ Subscription canceled for:', email);
        }
        break;
      }

      // ── Payment failed — log but don't immediately revoke ──
      case 'invoice.payment_failed': {
        console.warn('⚠️ Payment failed for customer:', obj.customer);
        // Stripe will retry; subscription stays active during grace period.
        // If you want to revoke immediately, add setParent logic here.
        break;
      }

      default:
        // Ignore all other events
        break;
    }
  } catch (err) {
    console.error('Error handling event', stripeEvent.type, err);
    return { statusCode: 500, body: 'Internal error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
