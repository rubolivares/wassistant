import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and form-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Helper function to download file from URL (handles both HTTP and HTTPS)
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(filepath);
        return downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      if (fs.existsSync(filepath)) {
        fs.unlink(filepath, () => {}); // Delete the file on error
      }
      reject(err);
    });
  });
}

// Helper function to transcribe audio using OpenAI Whisper
async function transcribeAudio(audioFilePath) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFilePath),
      model: 'whisper-1',
    });
    return transcription.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw error;
  }
}

app.post('/twilio', async (req, res) => {
  let tempAudioPath = null;
  
  try {
    console.log('\n=== Twilio Webhook Received ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    console.log('');
    
    // Extract common Twilio message fields (case-insensitive)
    const messageBody = req.body.Body || req.body.body || req.body.BodyText || '';
    const from = req.body.From || req.body.from || '';
    const to = req.body.To || req.body.to || '';
    const messageSid = req.body.MessageSid || req.body.messageSid || '';
    const accountSid = req.body.AccountSid || req.body.accountSid || '';
    const numMedia = parseInt(req.body.NumMedia || req.body.numMedia || '0');
    
    console.log('📨 Message Content:', messageBody);
    console.log('📞 From:', from);
    console.log('📞 To:', to);
    console.log('🆔 Message SID:', messageSid);
    console.log('🆔 Account SID:', accountSid);
    console.log('📎 Number of Media:', numMedia);
    
    // Check if there's a voice note/audio message
    if (numMedia > 0) {
      const mediaUrl = req.body[`MediaUrl0`] || req.body[`mediaUrl0`];
      const mediaContentType = req.body[`MediaContentType0`] || req.body[`mediaContentType0`] || '';
      
      console.log('🎤 Media URL:', mediaUrl);
      console.log('🎤 Media Content Type:', mediaContentType);
      
      // Check if it's an audio file
      if (mediaUrl && mediaContentType.startsWith('audio/')) {
        console.log('🎵 Audio file detected! Processing transcription...');
        
        // Download the audio file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        tempAudioPath = join(__dirname, `temp_audio_${Date.now()}.${mediaContentType.split('/')[1] || 'ogg'}`);
        
        await downloadFile(mediaUrl, tempAudioPath);
        console.log('✅ Audio file downloaded:', tempAudioPath);
        
        // Transcribe using OpenAI Whisper
        const transcription = await transcribeAudio(tempAudioPath);
        console.log('📝 Transcription:', transcription);
        
        // Clean up temp file
        fs.unlinkSync(tempAudioPath);
        tempAudioPath = null;
        
        // Return JSON response with transcription
        res.status(200);
        res.type('application/json');
        res.json({
          success: true,
          transcription: transcription,
          messageSid: messageSid,
          from: from,
          mediaType: mediaContentType
        });
        return;
      }
    }
    
    // Log all other fields
    console.log('\nAll Twilio fields:');
    Object.keys(req.body).forEach(key => {
      if (!['Body', 'body', 'From', 'from', 'To', 'to', 'MessageSid', 'messageSid', 'AccountSid', 'accountSid', 'NumMedia', 'numMedia'].includes(key)) {
        console.log(`  ${key}:`, req.body[key]);
      }
    });
    
    console.log('================================\n');
    
    // For non-audio messages, respond with TwiML (Twilio expects XML response)
    res.status(200);
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    
    // Clean up temp file if it exists
    if (tempAudioPath && fs.existsSync(tempAudioPath)) {
      try {
        fs.unlinkSync(tempAudioPath);
      } catch (e) {
        console.error('Error deleting temp file:', e);
      }
    }
    
    // Return error response as JSON if it was an audio request, otherwise TwiML
    const numMedia = parseInt(req.body?.NumMedia || req.body?.numMedia || '0');
    const mediaContentType = req.body?.[`MediaContentType0`] || req.body?.[`mediaContentType0`] || '';
    
    if (numMedia > 0 && mediaContentType.startsWith('audio/')) {
      res.status(500);
      res.type('application/json');
      res.json({
        success: false,
        error: error.message
      });
    } else {
      // Still return 200 with TwiML to prevent Twilio from retrying
      res.status(200);
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp AI Assistant server running on port ${PORT}`);
  console.log(`WhatsApp Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Twilio Webhook URL: http://localhost:${PORT}/twilio`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

