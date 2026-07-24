// At top of file after imports
async function logUsage(stripeId, model, tokens) {
  try {
    const cost = tokens * 0.00005; // Simple pricing
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

// In your API endpoint, after calling the model:
app.post('/api/chat', async (req, res) => {
  const { apiKey, message, model } = req.body;

  // Get user
  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('litellm_key', apiKey)
    .single();

  if (!user) return res.status(401).json({ error: 'Invalid key' });

  // Call your API (LiteLLM, Claude, etc)
  // ... existing code ...

  // Log usage (after getting token count)
  const tokensUsed = 100; // Replace with actual token count
  await logUsage(user.stripe_customer_id, model, tokensUsed);

  res.json({ response: '...' });
});
