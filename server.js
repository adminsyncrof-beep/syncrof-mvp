const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Express
const app = express();
app.use(express.json());

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { realtime: { transport: require('ws') } }
);

// === YOUR ROUTES START HERE ===

// Log usage function
async function logUsage(stripeId, model, tokens) {
  try {
    const cost = tokens * 0.00005;
    await supabase.from('usage_logs').insert({
      user_stripe_id: stripeId,
      model: model,
      tokens: tokens,
      cost_usd: cost,
    });
  } catch (err) {
    console.error('Log error:', err);
  }
}

// Test endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API endpoint
app.post('/api/chat', async (req, res) => {
  const { apiKey, message, model } = req.body;

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('litellm_key', apiKey)
    .single();

  if (!user) return res.status(401).json({ error: 'Invalid key' });

  // Log usage
  const tokensUsed = 100;
  await logUsage(user.stripe_customer_id, model, tokensUsed);

  res.json({ response: 'Success', tokensUsed });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
