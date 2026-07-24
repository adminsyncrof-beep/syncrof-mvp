const express = require('express');
require('dotenv').config();

const app = express();
app.use(express.json());

// Dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SYNCROF</title>
      <style>
        body { font-family: Arial; margin: 50px; }
        h1 { color: #7C3AED; }
        .ok { color: green; }
        .error { color: red; }
      </style>
    </head>
    <body>
      <h1>🚀 SYNCROF - Unified AI Payments</h1>
      <p>API is running ✅</p>
      <h3>Models:</h3>
      <ul>
        <li>GPT-4o</li>
        <li>Claude 3.5 Sonnet</li>
        <li>Gemini 1.5 Pro</li>
      </ul>
    </body>
    </html>
  `);
});

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 SYNCROF running on port ' + PORT);
});
