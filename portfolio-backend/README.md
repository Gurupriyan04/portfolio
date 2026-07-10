# Portfolio Contact Backend

A tiny Express server with one job: receive your portfolio's contact form
submissions and email them to your Gmail inbox using a Gmail App Password
(via Nodemailer). Your Gmail credentials never touch the frontend — they
live only as environment variables on this backend.

## 1. Generate a Gmail App Password
1. Go to your Google Account → **Security**
2. Turn on **2-Step Verification** if it isn't already on (App Passwords require it)
3. Go to **https://myaccount.google.com/apppasswords**
4. Create a new app password (name it something like "Portfolio Backend")
5. Google gives you a 16-character code like `abcd efgh ijkl mnop` — copy it
   (remove the spaces when you paste it into `.env` / your host's env vars)

This app password is what `GMAIL_APP_PASSWORD` uses below. Keep it secret —
treat it like a password, because it is one.

## 2. Set up MongoDB Atlas (free, stores your message history)
1. Go to **mongodb.com/cloud/atlas** and sign up (free)
2. Create a new **free (M0) cluster** — any cloud provider/region is fine
3. Under **Database Access**, create a database user with a username/password
   (save these — you'll need them in the connection string)
4. Under **Network Access**, click **Add IP Address** → **Allow Access From
   Anywhere** (`0.0.0.0/0`) — needed since Render's IP isn't fixed on the free tier
5. Go to your cluster → **Connect** → **Drivers** → copy the connection string,
   it looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>` and `<password>` with your actual database user credentials,
   and add a database name before the `?`, e.g. `.../portfolio?retryWrites=true...`
   — this becomes your `MONGODB_URI`

Also generate an `ADMIN_API_KEY` — any long random string you make up (a
password generator works fine). This protects the message history endpoint;
it's separate from your admin panel login password and never gets stored in
your public `data.json`.

## 3. Test locally (optional but recommended)
```bash
cd portfolio-backend
npm install
cp .env.example .env
# edit .env and fill in GMAIL_USER, GMAIL_APP_PASSWORD, RECEIVER_EMAIL
npm start
```
Then test it:
```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","message":"Hello, this is a test."}'
```
You should get `{"success":true}` back and an email in your inbox within seconds.

## 4. Deploy for free on Render.com
1. Push this `portfolio-backend` folder to a **GitHub repository**
   (a small, separate repo from your portfolio site is fine).
2. Go to **render.com** → sign up / log in → **New +** → **Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Under **Environment**, add these variables (same as `.env.example`):
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
   - `RECEIVER_EMAIL`
   - `ALLOWED_ORIGINS` — your live portfolio URL(s), comma-separated,
     e.g. `https://your-username.github.io`
   - `MONGODB_URI`
   - `ADMIN_API_KEY`
6. Click **Create Web Service**. Render will build and deploy it — you'll get
   a URL like `https://guru-portfolio-backend.onrender.com`

Your contact form endpoint is then:
```
https://guru-portfolio-backend.onrender.com/api/contact
```
Paste that into your portfolio's **admin panel → Contact tab → "Backend API URL"**
field, download `data.json`, and replace the file — then your form is live.

**Free tier note:** Render's free web services "spin down" after inactivity and
take ~30-50 seconds to wake up on the next request. The first message after a
quiet period may feel slow — this is normal on the free tier, not a bug.

## 5. Viewing message history
Every contact form submission is saved to MongoDB (even if, for some reason,
the email fails to send). To view them:
1. Open your portfolio's `admin.html` → **Messages** tab
2. Enter your backend's base URL and the `ADMIN_API_KEY` you set above
   (this key is entered fresh each session — it's never saved into `data.json`)
3. Click **Load Messages**

You can also query it directly:
```bash
curl https://your-backend-url.onrender.com/api/messages \
  -H "X-Admin-Key: your-admin-api-key"
```

## 6. Verify it's working
Visit `https://your-backend-url.onrender.com/api/health` in a browser — you
should see `{"status":"ok", ...}`. If that loads, the server is running; the
next test is submitting the actual contact form on your live site.

## Built-in protections
- **Rate limiting**: max 5 submissions per IP per 15 minutes
- **CORS allow-list**: only requests from the origins you list in `ALLOWED_ORIGINS`
  are accepted — random sites/scripts can't call your backend
- **Honeypot field**: a hidden `_honeypot` field the frontend can include to
  quietly filter out simple bots (already wired up on the portfolio side)
- **Input validation**: rejects missing fields, invalid email format, and
  excessively long messages

## Troubleshooting
- **"Invalid login" error in logs** → almost always means you pasted your
  normal Gmail password instead of the 16-character App Password, or you
  still have spaces in the app password.
- **CORS error in the browser console** → your live site's exact URL isn't
  in `ALLOWED_ORIGINS` on the backend (must match protocol + domain exactly,
  no trailing slash).
- **Emails not arriving** → check Gmail's Spam folder once; also confirm
  `RECEIVER_EMAIL` is spelled correctly.
