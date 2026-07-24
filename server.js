import ws from 'ws';
const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

// Log environment variables (for debugging)
console.log('=== Environment Variables ===');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ SET' : '❌ MISSING');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? '✅ SET' : '❌ MISSING');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ SET' : '❌ MISSING');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('=============================\n');

// Initialize Supabase (only if URL exists)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    console.log('✅ Supabase initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Supabase:', error.message);
  }
} else {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY not set - running without database');
}

// Dashboard endpoint
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
        .status { margin: 20px 0; padding: 10px; border-radius: 5px; }
        .ok { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 SYNCROF - Unified AI Payments</h1>
        <p>One wallet. Three models. Automatic cost optimization.</p>
        
        <h3>API Status:</h3>
        <div class="status ${supabase ? 'ok' : 'error'}">
          ${supabase ? '✅ Database: Connected' : '❌ Database: Not connected'}
        </div>
        
        <h3>Models Available:</h3>
        <ul>
          <li>GPT-4o (OpenAI)</li>
          <li>Claude 3.5 Sonnet (Anthropic)</li>
          <li>Gemini 1.5 Pro (Google)</li>
        </ul>
        
        <p><strong>Status:</strong> API is running ✅</p>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    supabase: supabase ? 'connected' : 'disconnected',
    timestamp: new Date() 
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 SYNCROF running on port ${PORT}`);
  console.log(`📍 Dashboard: http://localhost:${PORT}`);
});
