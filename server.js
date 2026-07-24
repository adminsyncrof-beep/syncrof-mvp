const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  console.log('Supabase connected');
}

app.use(cors({
  origin: ['https://www.syncrof.com', 'https://syncrof.com', 'http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('Webhook: ' + event.type);
    res.json({received: true});
  } catch (err) {
    res.status(400).send('Webhook error');
  }
});

app.get('/', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>SYNCROF - AI Payments Gateway</title>
      <style>
        body { font-family: Arial; background: #f8f9fa; margin: 0; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #7C3AED; margin: 0; font-size: 2.5em; }
        .tagline { color: #666; font-size: 1.1em; margin-bottom: 30px; }
        .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .models { margin-top: 30px; }
        .model-list { list-style: none; padding: 0; }
        .model-list li { padding: 10px 0; color: #333; border-bottom: 1px solid #eee; }
        .info { background: #e7f3ff; border-left: 4px solid #7C3AED; padding: 15px; margin: 20px 0; }
        .info strong { color: #7C3AED; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>SYNCROF</h1>
        <p class="tagline">Unified AI Payments Operating System</p>
        
        <div class="status">API is LIVE and RUNNING</div>
        
        <div class="info">
          <strong>Website:</strong> https://www.syncrof.com<br>
          <strong>Status:</strong> Production Ready<br>
          <strong>Database:</strong> ${supabase ? 'Connected' : 'Not Connected'}
        </div>

        <div class="models">
          <h3>Available AI Models:</h3>
          <ul class="model-list">
            <li>✓ GPT-4o (OpenAI)</li>
            <li>✓ Claude 3.5 Sonnet (Anthropic)</li>
            <li>✓ Gemini 1.5 Pro (Google)</li>
          </ul>
        </div>

        <div class="info" style="margin-top: 30px;">
          <strong>How it works:</strong><br>
          1. Fund wallet via Stripe<br>
          2. Get API key<br>
          3. Use any AI model<br>
          4. One wallet, three models
        </div>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: supabase ? 'connected' : 'disconnected' });
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || !amount) {
      return res.status(400).json({ error: 'Email and amount required' });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      metadata: { email }
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('SYNCROF API running on port ' + PORT);
});
