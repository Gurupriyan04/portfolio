/* ==========================================================================
   GURU PRIYAN C — PORTFOLIO CONTACT BACKEND
   A minimal Express server with one real job: receive a contact form
   submission from the portfolio site and email it to you via Gmail.

   Your Gmail credentials live ONLY here, as environment variables — never
   in the frontend code, never committed to git. See .env.example.
   ========================================================================== */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

/* ---------------------------------------------------------------------
   MongoDB connection (MongoDB Atlas free tier recommended — see README)
   Required env var: MONGODB_URI
--------------------------------------------------------------------- */
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err.message));
} else {
  console.warn('MONGODB_URI not set — message history will not be saved.');
}

/* ---------------------------------------------------------------------
   CORS — only allow requests from your own portfolio site(s).
   Set ALLOWED_ORIGINS in your environment as a comma-separated list, e.g.
   "https://your-username.github.io,http://localhost:8000"
--------------------------------------------------------------------- */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, server-to-server health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  }
}));

/* ---------------------------------------------------------------------
   Basic rate limiting — 5 submissions per 15 minutes per IP, to keep
   this from being used to spam your inbox or abuse your Gmail account.
--------------------------------------------------------------------- */
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many messages sent — please try again later.' }
});

/* ---------------------------------------------------------------------
   Mail transport — Gmail via App Password (SMTP)
   Required env vars: GMAIL_USER, GMAIL_APP_PASSWORD, RECEIVER_EMAIL
--------------------------------------------------------------------- */
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000
});

/* ---------------------------------------------------------------------
   Routes
--------------------------------------------------------------------- */
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Portfolio contact backend is running.' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, message, _honeypot } = req.body || {};

    // Simple honeypot: a hidden field bots tend to fill in, humans never see it
    if (_honeypot) {
      return res.json({ success: true }); // pretend success, silently drop
    }

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Name, email, and message are all required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'That email address looks invalid.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ success: false, error: 'Message is too long.' });
    }

    const receiver = process.env.RECEIVER_EMAIL || process.env.GMAIL_USER;

    // Save to the database first, so we still have a record even if the email send fails
    let savedMessage = null;
    if (mongoose.connection.readyState === 1) {
      try {
        savedMessage = await Message.create({
          name, email, message,
          ip: req.ip,
          emailSent: false
        });
      } catch (dbErr) {
        console.error('Error saving message to database:', dbErr.message);
      }
    }

    await transporter.sendMail({
      from: `"Portfolio Contact Form" <${process.env.GMAIL_USER}>`,
      to: receiver,
      replyTo: email,
      subject: `New portfolio message from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
      html: `
        <p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `
    });

    if (savedMessage) {
      savedMessage.emailSent = true;
      await savedMessage.save().catch(err => console.error('Error updating message status:', err.message));
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error sending contact email:', err);
    return res.status(500).json({ success: false, error: 'Something went wrong sending your message. Please try emailing directly instead.' });
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ---------------------------------------------------------------------
   Protected admin endpoint — view saved messages.
   Requires header:  X-Admin-Key: <your ADMIN_API_KEY>
   This key is separate from anything stored in the public data.json —
   never put it there. Enter it directly in the admin panel's Messages tab.
--------------------------------------------------------------------- */
function requireAdminKey(req, res, next) {
  const key = req.get('X-Admin-Key');
  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({ success: false, error: 'ADMIN_API_KEY is not configured on the server.' });
  }
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ success: false, error: 'Invalid or missing admin key.' });
  }
  next();
}

app.get('/api/messages', requireAdminKey, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ success: false, error: 'Database is not connected.' });
  }
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(500);
    return res.json({ success: true, messages });
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(500).json({ success: false, error: 'Could not fetch messages.' });
  }
});

app.delete('/api/messages/:id', requireAdminKey, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ success: false, error: 'Database is not connected.' });
  }
  try {
    await Message.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting message:', err);
    return res.status(500).json({ success: false, error: 'Could not delete message.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Portfolio contact backend listening on port ${PORT}`);
});
