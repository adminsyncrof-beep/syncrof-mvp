const express = require('express');
require('dotenv').config();

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('<h1>SYNCROF API</h1><p>Running</p>');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/create-payment-intent', (req, res) => {
  res.json({ clientSecret: 'test123' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('SYNCROF listening on port ' + PORT);
});
