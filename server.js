================================================================================
COMPLETE server.js - COPY & PASTE THIS ENTIRE FILE
================================================================================

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// =====================
// INITIALIZE SUPABASE
// =====================

let supabase = null;

if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  console.log('✅ Supabase initialized');
} else {
  console.warn('⚠️ Supabase credentials missing - some features disabled');
}

// =====================
// MIDDLEWARE
// =====================

// CORS - Allow only syncrof.com
app.use(cors({
  origin: [
    'https://www.syncrof.com',
    'https://syncrof.com',
    'http://localhost:3000',
    'http://localhost:8080'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

console.log('✅ CORS enabled for syncrof.com');

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many payment attempts, please try again.'
});

console.log('✅ Rate limiting enabled');

// Stripe webhook (MUST be before JSON parsing)
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`✅ Webhook verified: ${event.type}`);
  } catch (err) {
    console.error(`❌ Webhook error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'charge.succeeded':
        await handleChargeSucceeded(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      default:
        console.log(`⏭️ Unhandled event: ${event.type}`);
    }

    res.json({received: true});
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    res.status(500).json({error: error.message});
  }
});

// JSON middleware
app.use(express.json());

// =====================
// PAYMENT HANDLERS
// =====================

async function handleChargeSucceeded(charge) {
  console.log(`💰 Charge: $${charge.amount / 100} for ${charge.customer}`);

  try {
    if (!supabase) {
      console.warn('⚠️ Supabase not initialized, skipping transaction log');
      return;
    }

    const topupAmount = charge.amount / 100;

    await supabase.from('transactions').insert({
      user_stripe_id: charge.customer,
      transaction_type: 'charge',
      amount: topupAmount,
      stripe_reference_id: charge.id,
      created_at: new Date()
    });

    console.log(`✅ Charge logged: $${topupAmount}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log(`📋 Subscription: ${subscription.id}`);

  try {
    if (!supabase) {
      console.warn('⚠️ Supabase not initialized, skipping subscription log');
      return;
    }

    const monthlyBudget = 50.00;

    await supabase.from('transactions').insert({
      user_stripe_id: subscription.customer,
      transaction_type: 'subscription',
      amount: monthlyBudget,
      stripe_reference_id: subscription.id,
      created_at: new Date()
    });

    console.log(`✅ Subscription logged: $${monthlyBudget}/month`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

// =====================
// PAYMENT API ENDPOINTS
// =====================

// Create Payment Intent
app.post('/create-payment-intent', paymentLimiter, async (req, res) => {
  try {
    const { email, amount } = req.body;

    // Validate input
    if (!email || !amount) {
      return res.status(400).json({ error: 'Email and amount required' });
    }

    if (amount < 10 || amount > 10000) {
      return res.status(400).json({ error: 'Amount must be between $10 and $10,000' });
    }

    // Create or retrieve customer
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer;

    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({ email });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      customer: customer.id,
      metadata: { email, customer_email: email }
    });

    console.log(`💳 Payment intent: ${paymentIntent.id} for ${email} ($${amount})`);

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      customer_id: customer.id
    });
  } catch (error) {
    console.error(`❌ Payment error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Get User Dashboard
app.get('/dashboard/:userId', limiter, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('stripe_customer_id', req.params.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      email: user.email,
      budget_balance: user.budget_balance,
      budget_limit: user.budget_limit,
      api_key: user.litellm_key,
      created_at: user.created_at
    });
  } catch (error) {
    console.error(`❌ Dashboard error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Get User's API Key
app.post('/get-api-key', limiter, async (req, res) => {
  try {
    const { stripe_customer_id } = req.body;

    if (!stripe_customer_id) {
      return res.status(400).json({ error: 'stripe_customer_id required' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('litellm_key')
      .eq('stripe_customer_id', stripe_customer_id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ api_key: user.litellm_key });
  } catch (error) {
    console.error(`❌ API key error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// =====================
// PUBLIC ENDPOINTS
// =====================

// Dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SYNCROF - AI Payments Gateway</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f8f9fa; }
        .container { max-width: 1000px; margin: 0 auto; padding: 50px 20px; }
        .card { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 20px; }
        h1 { color: #7C3AED; font-size: 2.5em; margin-bottom: 10px; }
        p { color: #666; font-size: 1.1em; line-height: 1.6; }
        .status { display: inline-block; background: #d4edda; color: #155724; padding: 15px 20px; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .models { margin-top: 30px; }
        .models h3 { color: #333; margin-bottom: 15px; }
        .models li { color: #666; margin-bottom: 10px; padding-left: 20px; }
        .info { background: #e7f3ff; border-left: 4px solid #7C3AED; padding: 15px; border-radius: 4px; margin-top: 20px; }
        .info strong { color: #7C3AED; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>🚀 SYNCROF</h1>
          <p>Unified AI Payments Operating System</p>
          
          <div class="status">✅ API is LIVE and running</div>
          
          <div class="info">
            <strong>Website:</strong> https://www.syncrof.com<br>
            <strong>API:</strong> https://syncrof-mvp-production.up.railway.app<br>
            <strong>Status:</strong> Production Ready
          </div>

          <div class="models">
            <h3>🤖 Available AI Models:</h3>
            <ul>
              <li>GPT-4o (OpenAI)</li>
              <li>Claude 3.5 Sonnet (Anthropic)</li>
              <li>Gemini 1.5 Pro (Google)</li>
            </ul>
          </div>

          <div class="info" style="margin-top: 30px;">
            <strong>To get started:</strong><br>
            1. Visit https://www.syncrof.com<br>
            2. Fund your wallet with Stripe<br>
            3. Receive API key via email<br>
            4. Start using AI models!
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    api: 'syncrof-mvp',
    supabase: supabase ? 'connected' : 'disconnected',
    timestamp: new Date(),
    cors: 'enabled',
    rate_limiting: 'enabled'
  });
});

// Version
app.get('/version', (req, res) => {
  res.json({ version: '1.0.0', build: 'production' });
});

// =====================
// ERROR HANDLING
// =====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// =====================
// START SERVER
// =====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SYNCROF API v1.0.0');
  console.log('='.repeat(60));
  console.log(`📍 Dashboard: http://localhost:${PORT}`);
  console.log(`🌐 Website: https://www.syncrof.com`);
  console.log(`🛡️  Security: CORS + Rate Limiting enabled`);
  console.log(`💾 Database: ${supabase ? 'Connected' : 'Disconnected'}`);
  console.log('='.repeat(60) + '\n');
});

================================================================================
KEY FEATURES:
================================================================================

✅ Stripe payment integration
✅ CORS configured for www.syncrof.com
✅ Rate limiting (prevents attacks)
✅ Supabase database integration
✅ Error handling on all endpoints
✅ Production logging
✅ Webhook handling
✅ Payment intent creation
✅ User dashboard endpoint
✅ API key retrieval endpoint

================================================================================
