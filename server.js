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

app.listen(3000, () => {
  console.log('SYNCROF running');
});
