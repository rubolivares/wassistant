# WhatsApp AI Assistant

A WhatsApp AI assistant application with webhook support for receiving messages.

## Features

- ✅ Webhook endpoint to receive WhatsApp messages
- ✅ Support for multiple message types (text, image, audio, video, document, location)
- ✅ Status update handling (delivery receipts, read receipts)
- ✅ Webhook verification for WhatsApp Cloud API

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy the environment file:
```bash
cp .env.example .env
```

3. Configure your `.env` file with:
   - `WEBHOOK_VERIFY_TOKEN`: Token for webhook verification (set this in your WhatsApp Cloud API settings)
   - `WHATSAPP_ACCESS_TOKEN`: Your WhatsApp Business API access token
   - `WHATSAPP_PHONE_NUMBER_ID`: Your WhatsApp phone number ID

4. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Webhook Configuration

### Setting up the webhook in WhatsApp Cloud API:

1. Go to your WhatsApp Cloud API dashboard
2. Navigate to Webhook configuration
3. Set the webhook URL to: `https://your-domain.com/webhook`
4. Set the verify token to match your `WEBHOOK_VERIFY_TOKEN` in `.env`
5. Subscribe to the `messages` field

### Testing locally:

Use a tool like [ngrok](https://ngrok.com/) to expose your local server:

```bash
ngrok http 3000
```

Then use the ngrok URL in your WhatsApp webhook configuration.

## API Endpoints

- `GET /webhook` - Webhook verification endpoint
- `POST /webhook` - Receives WhatsApp messages and status updates
- `GET /health` - Health check endpoint

## Message Types Supported

- Text messages
- Image messages
- Audio messages
- Video messages
- Document messages
- Location messages

## Deployment on Railway

### Prerequisites
- A GitHub account
- A Railway account (sign up at [railway.app](https://railway.app))

### Steps to Deploy

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Connect Railway to GitHub:**
   - Go to [railway.app](https://railway.app) and sign in
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway will automatically detect it's a Node.js app

3. **Configure Environment Variables:**
   - In your Railway project dashboard, go to "Variables"
   - Add the following environment variables:
     - `PORT` (Railway sets this automatically, but you can keep it if needed)
     - `WEBHOOK_VERIFY_TOKEN` - Your webhook verification token
     - `WHATSAPP_ACCESS_TOKEN` - Your WhatsApp Business API access token
     - `WHATSAPP_PHONE_NUMBER_ID` - Your WhatsApp phone number ID

4. **Get your Railway URL:**
   - Railway will automatically generate a URL like: `https://your-app-name.up.railway.app`
   - You can also set a custom domain in the "Settings" tab

5. **Configure WhatsApp Webhook:**
   - Use your Railway URL: `https://your-app-name.up.railway.app/webhook`
   - Set the verify token to match your `WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the `messages` field

6. **Deploy:**
   - Railway will automatically deploy on every push to your main branch
   - Check the "Deployments" tab to see build logs and status

### Railway Auto-Deploy
Railway automatically deploys when you push to your connected GitHub branch. No manual deployment needed!

## Next Steps

- [ ] Integrate AI assistant (OpenAI, Anthropic, etc.)
- [ ] Add message sending functionality
- [ ] Implement conversation context management
- [ ] Add database for message history
- [ ] Add authentication and security



