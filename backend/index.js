require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bot = require('./bot');
const apiRouter = require('./api');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// API Routes
app.use('/api', apiRouter);

// Serve frontend if available
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));
app.use((req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Launch Telegram Bot
bot.launch().then(() => {
  console.log('Telegram Bot is running');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
