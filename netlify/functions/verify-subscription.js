// ─────────────────────────────────────────────────────────────────────────────
//  verify-subscription.js — Netlify Function
//  Called by parent-companion.html after Stripe redirect.
//  Looks up the subscription in Stripe by email, then writes confirmed
//  status to Firestore via REST API. No webhook or service account needed.
//
//  Required Netlify env var:
//    STRIPE_SECRET_KEY  (Stripe dashboard → Developers → API Keys → Secret key)
// ─────────────────────────────────────────────────────────────────────────────

const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);

const FB_PROJECT = 'pathway-to-freedom';
const FB_API_KEY  = 'AIzaSyA4u3QQgC39uxTAIXuzexTg0Pz889YovoI';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type':                 'application/json'
};

function san(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 60);
}

async function fsSet(docId, data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'boolean')     fields[k] = { booleanValue: v };
    else if (typeof v === 'string') fields[k] = { stringValue: v };
  }
  const mask = Object.keys(data)
    .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const url =
    `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}` +
    `/databases/(default)/documents/ptf_parents/${docId}?key=${FB_API_KEY}&${mask}`;
  const res = await fetch(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  }

  const email = ((event.queryStringParameters || {}).email || '').trim().toLowerCase();
  if (!email) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'email required' }) };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ error: 'Stripe not configured — add STRIPE_SECRET_KEY in Netlify' }) };
  }

  try {
    // Search Stripe for customers with this email
    const customers = await stripe.customers.list({ email, limit: 10 });

    let subscribed    = false;
    let customerId    = '';
    let subscriptionId = '';

    for (const customer of customers.data) {
      // Check all non-canceled subscription states (active, trialing, past_due, incomplete)
      const subs = await stripe.subscriptions.list({
        customer: customer.id,
        limit:    10
      });
      const validSub = subs.data.find(s => s.status !== 'canceled' && s.status !== 'unpaid');
      if (validSub) {
        subscribed     = true;
        customerId     = customer.id;
        subscriptionId = validSub.id;
        break;
      }
    }

    if (subscribed) {
      // Write confirmed status to Firestore
      await fsSet(san(email), {
        email,
        subscribed:           true,
        stripeCustomerId:     customerId,
        stripeSubscriptionId: subscriptionId,
        subscribedAt:         new Date().toISOString(),
        updatedAt:            new Date().toISOString()
      });
    }

    return {
      statusCode: 200,
      headers:    CORS,
      body:       JSON.stringify({ subscribed, email })
    };

  } catch (err) {
    console.error('verify-subscription error:', err.message);
    return {
      statusCode: 500,
      headers:    CORS,
      body:       JSON.stringify({ error: err.message })
    };
  }
};
