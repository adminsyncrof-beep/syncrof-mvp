// SYNCROF API — complete server.js
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const ws = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// --- Initialize Express ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Initialize Supabase (ws transport required on Node 20) ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { realtime: { transport: ws } }
);
console.log('Supabase connected');

// --- Pricing per token ---
const PRICING = {
  'GPT-4o': 0.00005,
  'Claude': 0.00003,
  'Gemini': 0.000025,
};

// --- Usage logging (matches Lovable schema: user_id uuid + unique request_id) ---
async function logUsage(userId, model, tokens) {
  try {
    const rate = PRICING[model] || 0.00005;
    const cost = tokens * rate;
    const { error } = await supabase.from('usage_logs').insert({
      user_id: userId,
      request_id: crypto.randomUUID(),
      model: model,
      tokens: tokens,
      cost_usd: cost,
    });
    if (error) console.error('Log error:', error);
    else console.log(`Logged ${model} ${tokens} tokens $${cost.toFixed(4)}`);
  } catch (err) {
    console.error('Log error:', err);
  }
}

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

// --- Chat endpoint ---
app.post('/api/chat', async (req, res) => {
  try {
    const { apiKey, message, model } = req.body;

    // Look up user by API key — select the uuid `id`
    const { data: user, error } = await supabase
      .from('users')
      .select('id, budget_balance')
      .eq('litellm_key', apiKey)
      .single();

    if (error || !user) return res.status(401).json({ error: 'Invalid key' });
    if (user.budget_balance <= 0) return res.status(402).json({ error: 'Insufficient funds' });

    // TODO: replace with real model call + real token count
    const tokensUsed = 100;

    await logUsage(user.id, model, tokensUsed);

    const rate = PRICING[model] || 0.00005;
    const cost = tokensUsed * rate;
    const remaining = user.budget_balance - cost;

    await supabase.from('users').update({ budget_balance: remaining }).eq('id', user.id);

    res.json({ response: 'Success', tokensUsed, remainingBalance: remaining });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SYNCROF API running on port ${PORT}`);
});
