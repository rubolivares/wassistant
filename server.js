import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and form-encoded bodies
// Note: For Twilio signature validation, we'd need raw body, but for now we'll validate without it
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper function to validate Twilio signature (optional)
function validateTwilioSignature(req, authToken) {
  if (!authToken) {
    console.log('⚠️  TWILIO_AUTH_TOKEN not set - skipping signature validation');
    return true; // Allow request if no auth token is configured
  }
  
  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    console.log('⚠️  No X-Twilio-Signature header found');
    return false;
  }
  
  // Note: Full signature validation requires raw body, which we don't have
  // For now, we'll just check if the header exists
  // In production, you'd want to use raw body middleware for full validation
  console.log('✅ Twilio signature header present');
  return true;
}

// Webhook verification endpoint (for WhatsApp Cloud API)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verify the webhook token
  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook endpoint to receive WhatsApp messages
app.post('/webhook', (req, res) => {
  const body = req.body;

  // Check if this is a WhatsApp message
  if (body.object === 'whatsapp_business_account') {
    const entries = body.entry;
    
    entries.forEach((entry) => {
      const changes = entry.changes;
      
      changes.forEach((change) => {
        if (change.field === 'messages') {
          const value = change.value;
          
          // Handle incoming messages
          if (value.messages) {
            value.messages.forEach((message) => {
              handleIncomingMessage(message, value.contacts?.[0]);
            });
          }
          
          // Handle status updates (message delivery, read receipts, etc.)
          if (value.statuses) {
            value.statuses.forEach((status) => {
              handleStatusUpdate(status);
            });
          }
        }
      });
    });
    
    // Respond with 200 OK to acknowledge receipt
    res.status(200).send('OK');
  } else {
    res.sendStatus(404);
  }
});

// Function to handle incoming messages
function handleIncomingMessage(message, contact) {
  const messageId = message.id;
  const from = message.from;
  const messageType = message.type;
  const timestamp = message.timestamp;
  
  console.log('\n=== New WhatsApp Message ===');
  console.log('Message ID:', messageId);
  console.log('From:', from);
  console.log('Type:', messageType);
  console.log('Timestamp:', new Date(timestamp * 1000).toISOString());
  
  if (contact) {
    console.log('Contact Name:', contact.profile?.name);
  }
  
  // Handle different message types
  switch (messageType) {
    case 'text':
      console.log('Text:', message.text?.body);
      // TODO: Process text message with AI
      break;
      
    case 'image':
      console.log('Image ID:', message.image?.id);
      console.log('Caption:', message.image?.caption);
      // TODO: Handle image message
      break;
      
    case 'audio':
      console.log('Audio ID:', message.audio?.id);
      // TODO: Handle audio message
      break;
      
    case 'video':
      console.log('Video ID:', message.video?.id);
      console.log('Caption:', message.video?.caption);
      // TODO: Handle video message
      break;
      
    case 'document':
      console.log('Document ID:', message.document?.id);
      console.log('Filename:', message.document?.filename);
      // TODO: Handle document message
      break;
      
    case 'location':
      console.log('Latitude:', message.location?.latitude);
      console.log('Longitude:', message.location?.longitude);
      // TODO: Handle location message
      break;
      
    default:
      console.log('Unsupported message type:', messageType);
  }
  
  console.log('===========================\n');
}

// Function to handle status updates
function handleStatusUpdate(status) {
  console.log('\n=== Status Update ===');
  console.log('Message ID:', status.id);
  console.log('Status:', status.status);
  console.log('Recipient:', status.recipient_id);
  console.log('Timestamp:', new Date(status.timestamp * 1000).toISOString());
  console.log('====================\n');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simple test endpoint for Railway testing (no WhatsApp required)
app.get('/test', (req, res) => {
  console.log('✅ Test endpoint hit!');
  res.json({ 
    status: 'success', 
    message: 'Railway deployment is working!',
    timestamp: new Date().toISOString(),
    method: 'GET'
  });
});

app.post('/test', (req, res) => {
  console.log('✅ Test POST endpoint hit!');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  res.json({ 
    status: 'success', 
    message: 'Railway deployment is working!',
    timestamp: new Date().toISOString(),
    method: 'POST',
    receivedData: req.body
  });
});

// Twilio webhook endpoint (GET for status callbacks, POST for incoming messages)
app.get('/twilio', (req, res) => {
  console.log('\n=== Twilio GET Request (Status Callback) ===');
  console.log('Query params:', JSON.stringify(req.query, null, 2));
  res.status(200).send('OK');
});

app.post('/twilio', (req, res) => {
  try {
    // Validate Twilio signature if auth token is configured
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (twilioAuthToken && !validateTwilioSignature(req, twilioAuthToken)) {
      console.log('❌ Twilio signature validation failed');
      res.status(403).send('Forbidden');
      return;
    }
    
    console.log('\n=== Twilio Webhook Received ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    console.log('Raw body type:', typeof req.body);
    console.log('');
    
    // Extract common Twilio message fields (case-insensitive)
    const messageBody = req.body.Body || req.body.body || req.body.BodyText || '';
    const from = req.body.From || req.body.from || '';
    const to = req.body.To || req.body.to || '';
    const messageSid = req.body.MessageSid || req.body.messageSid || '';
    const accountSid = req.body.AccountSid || req.body.accountSid || '';
    const numMedia = req.body.NumMedia || req.body.numMedia || '0';
    
    console.log('📨 Message Content:', messageBody);
    console.log('📞 From:', from);
    console.log('📞 To:', to);
    console.log('🆔 Message SID:', messageSid);
    console.log('🆔 Account SID:', accountSid);
    console.log('📎 Number of Media:', numMedia);
    
    // Log all other fields
    console.log('\nAll Twilio fields:');
    Object.keys(req.body).forEach(key => {
      if (!['Body', 'body', 'From', 'from', 'To', 'to', 'MessageSid', 'messageSid', 'AccountSid', 'accountSid', 'NumMedia', 'numMedia'].includes(key)) {
        console.log(`  ${key}:`, req.body[key]);
      }
    });
    
    console.log('================================\n');
    
    // Always respond with 200 OK and TwiML (Twilio expects XML response)
    res.status(200);
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    // Still return 200 with TwiML to prevent Twilio from retrying
    res.status(200);
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp AI Assistant server running on port ${PORT}`);
  console.log(`WhatsApp Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Twilio Webhook URL: http://localhost:${PORT}/twilio`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

