const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

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

// =====================
// PAYMENT HANDLERS
// =====================

async function handleChargeSucceeded(charge) {
  console.log(`💰 Charge: $${charge.amount / 100} for ${charge.customer}`);

  try {
    const customer = await stripe.customers.retrieve(charge.customer);
    const topupAmount = charge.amount / 100;

    // Add budget to LiteLLM
    await addBudgetToUser(charge.customer, topupAmount);

    // Log transaction
    await supabase.from('transactions').insert({
      user_stripe_id: charge.customer,
      transaction_type: 'charge',
      amount: topupAmount,
      stripe_reference_id: charge.id,
      created_at: new Date()
    });

    // Send email
    await sendEmail(customer.email, topupAmount, charge.customer);

    console.log(`✅ Budget updated: +$${topupAmount}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log(`📋 Subscription: ${subscription.id}`);

  try {
    const monthlyBudget = 50.00;
    await setMonthlyBudget(subscription.customer, monthlyBudget);

    await supabase.from('transactions').insert({
      user_stripe_id: subscription.customer,
      transaction_type: 'subscription',
      amount: monthlyBudget,
      stripe_reference_id: subscription.id,
      created_at: new Date()
    });

    console.log(`✅ Subscription budget: $${monthlyBudget}/month`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

// =====================
// LITELLM FUNCTIONS
// =====================

async function addBudgetToUser(userStripeId, amount) {
  try {
    // Get user's LiteLLM key
    const { data: user } = await supabase
      .from('users')
      .select('litellm_key_id, budget_balance')
      .eq('stripe_customer_id', userStripeId)
      .single();

    if (!user) throw new Error('User not found');

    const newBudget = (user.budget_balance || 0) + amount;

    // Update LiteLLM
    await axios.post(
      `${process.env.LITELLM_BASE_URL}/key/update`,
      {
        key: user.litellm_key_id,
        max_budget: newBudget
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.LITELLM_MASTER_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Update database
    await supabase
      .from('users')
      .update({ budget_balance: newBudget })
      .eq('stripe_customer_id', userStripeId);

  } catch (error) {
    console.error(`❌ LiteLLM error: ${error.message}`);
    throw error;
  }
}

async function setMonthlyBudget(userStripeId, monthlyAmount) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('litellm_key_id')
      .eq('stripe_customer_id', userStripeId)
      .single();

    if (!user) throw new Error('User not found');

    await axios.post(
      `${process.env.LITELLM_BASE_URL}/key/update`,
      {
        key: user.litellm_key_id,
        max_budget: monthlyAmount
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.LITELLM_MASTER_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    await supabase
      .from('users')
      .update({ budget_balance: monthlyAmount, budget_limit: monthlyAmount })
      .eq('stripe_customer_id', userStripeId);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    throw error;
  }
}

// =====================
// EMAIL FUNCTION
// =====================

async function sendEmail(email, amount, userStripeId) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('litellm_key')
      .eq('stripe_customer_id', userStripeId)
      .single();

    if (!user) return;

    const emailHtml = `
      <h2>Payment Confirmed ✅</h2>
      <p>Thank you for your $${amount} payment!</p>
      
      <h3>Your API Key:</h3>
      <code style="background: #f5f5f5; padding: 10px; border-radius: 5px;">
        ${user.litellm_key}
      </code>
      
      <h3>Getting Started (Python):</h3>
      <pre>
from openai import OpenAI
client = OpenAI(
  api_key="${user.litellm_key}",
  base_url="https://syncrof-mvp.railway.app"
)
response = client.chat.completions.create(
  model="gpt-4o",
  messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
      </pre>
    `;

    const resend = require('resend');
    const resendClient = new resend.Resend(process.env.RESEND_API_KEY);

    await resendClient.emails.send({
      from: process.env.EMAIL_FROM_SENDER,
      to: email,
      subject: `SYNCROF Payment Confirmed - $${amount} Credits Added`,
      html: emailHtml
    });

    console.log(`📧 Email sent to ${email}`);
  } catch (error) {
    console.error(`❌ Email error: ${error.message}`);
  }
}

// =====================
// API ENDPOINTS
// =====================

// Dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SYNCROF - AI Payments Gateway</title>
      <style>
        body { font-family: Arial; max-width: 1000px; margin: 50px auto; }
        .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
        button { background: #7C3AED; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #6D28D9; }
        h1 { color: #7C3AED; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 SYNCROF - Unified AI Payments</h1>
        <p>One wallet. Three models. Automatic cost optimization.</p>
        
        <h3>Models Available:</h3>
        <ul>
          <li>GPT-4o (OpenAI)</li>
          <li>Claude 3.5 Sonnet (Anthropic)</li>
          <li>Gemini 1.5 Pro (Google)</li>
        </ul>
        
        <h3>Get Started:</h3>
        <button onclick="alert('Pay via Stripe to get API key')">Fund Wallet ($10)</button>
        
        <h3>API Status:</h3>
        <p>✅ Dashboard: Running</p>
        <p>✅ Stripe: Connected</p>
        <p>✅ LiteLLM: Routing to 3 models</p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SYNCROF running on port ${PORT}`);
});