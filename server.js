const crypto = require('crypto');

// Log usage — matches Lovable's expected schema
async function logUsage(userId, model, tokens) {
  try {
    const cost = tokens * 0.00005;
    await supabase.from('usage_logs').insert({
      user_id: userId,                       // Supabase uuid, NOT stripe id
      request_id: crypto.randomUUID(),       // unique per request
      model: model,
      tokens: tokens,
      cost_usd: cost,
    });
  } catch (err) {
    console.error('Log error:', err);
  }
}

// API endpoint
app.post('/api/chat', async (req, res) => {
  const { apiKey, message, model } = req.body;

  // Look up user by API key — select the uuid `id` column
  const { data: user } = await supabase
    .from('users')
    .select('id, budget_balance')
    .eq('litellm_key', apiKey)
    .single();

  if (!user) return res.status(401).json({ error: 'Invalid key' });
  if (user.budget_balance <= 0) return res.status(402).json({ error: 'Insufficient funds' });

  // ... your model call here ...
  const tokensUsed = 100; // replace with real token count later

  await logUsage(user.id, model, tokensUsed);

  // Deduct from balance
  const cost = tokensUsed * 0.00005;
  await supabase
    .from('users')
    .update({ budget_balance: user.budget_balance - cost })
    .eq('id', user.id);

  res.json({ response: 'Success', tokensUsed, remainingBalance: user.budget_balance - cost });
});
