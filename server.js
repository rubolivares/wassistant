import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { File } from 'node:buffer';
import querystring from 'querystring';

dotenv.config();

// Set File global for OpenAI SDK compatibility (required for Node < 20)
if (typeof globalThis.File === 'undefined') {
  globalThis.File = File;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and form-encoded bodies
// IMPORTANT: urlencoded must come before json to handle Twilio's form-encoded webhooks
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json());

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

// Helper function to download file from URL using fetch (more reliable)
async function downloadFile(url, filepath, accountSid = null, authToken = null) {
  try {
    const isTwilioUrl = url.includes('api.twilio.com');
    
    // Build headers
    const headers = {};
    
    // Always use authentication for Twilio URLs if credentials are provided
    if (isTwilioUrl && accountSid && authToken) {
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
      console.log('🔐 Using Twilio authentication for media download');
    } else if (isTwilioUrl) {
      console.log('⚠️  No Twilio credentials provided - attempting public access');
    }
    
    console.log(`⬇️  Fetching: ${url}`);
    
    // Use fetch to download the file
    const response = await fetch(url, { headers });
    
    console.log(`📥 Download response status: ${response.status}`);
    console.log(`📥 Response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error response body: ${errorText.substring(0, 500)}`);
      throw new Error(`Failed to download file: HTTP ${response.status} - ${errorText.substring(0, 200)}`);
    }
    
    // Get the file as a buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Write to file
    fs.writeFileSync(filepath, buffer);
    
    console.log(`✅ Download complete: ${buffer.length} bytes`);
    return filepath;
  } catch (error) {
    console.error('❌ Download error:', error.message);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    throw error;
  }
}

// Helper function to transcribe audio using OpenAI Whisper
async function transcribeAudio(audioFilePath) {
  try {
    // Read the file and create a File object for OpenAI
    const fileBuffer = fs.readFileSync(audioFilePath);
    const fileName = audioFilePath.split('/').pop() || 'audio.ogg';
    
    // Create a File object compatible with OpenAI SDK
    const audioFile = new File([fileBuffer], fileName, {
      type: 'audio/ogg'
    });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
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
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Raw body type:', typeof req.body);
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    
    // If body is a string, it means Express didn't parse it - parse it manually
    if (typeof req.body === 'string') {
      console.log('⚠️  Body is a string, parsing manually...');
      req.body = querystring.parse(req.body);
      console.log('✅ Parsed body:', JSON.stringify(req.body, null, 2));
    } else if (req.body && typeof req.body === 'object' && req.body.body && typeof req.body.body === 'string') {
      console.log('⚠️  Body nested in body property, parsing...');
      req.body = querystring.parse(req.body.body);
      console.log('✅ Parsed body:', JSON.stringify(req.body, null, 2));
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      console.log('✅ Body already parsed by Express');
    }
    
    console.log('');
    
    // Extract common Twilio message fields (case-insensitive)
    // Handle both form-encoded (Twilio standard) and JSON formats
    const messageBody = req.body.Body || req.body.body || req.body.BodyText || '';
    const from = req.body.From || req.body.from || '';
    const to = req.body.To || req.body.to || '';
    const messageSid = req.body.MessageSid || req.body.messageSid || '';
    const accountSid = req.body.AccountSid || req.body.accountSid || '';
    const numMedia = parseInt(req.body.NumMedia || req.body.numMedia || '0');
    
    // Handle JSON format (from automation tools)
    const mediaUrl = req.body[`MediaUrl0`] || req.body[`mediaUrl0`] || req.body.mediaUrl || '';
    const mediaContentType = req.body[`MediaContentType0`] || req.body[`mediaContentType0`] || req.body.mediaType || '';
    
    console.log('📨 Message Content:', messageBody);
    console.log('📞 From:', from);
    console.log('📞 To:', to);
    console.log('🆔 Message SID:', messageSid);
    console.log('🆔 Account SID:', accountSid);
    console.log('📎 Number of Media:', numMedia);
    
    // Check if there's a voice note/audio message
    // Handle both form-encoded format (MediaUrl0) and JSON format (mediaUrl)
    if (numMedia > 0 || mediaUrl) {
      console.log('🎤 Media URL:', mediaUrl);
      console.log('🎤 Media Content Type:', mediaContentType);
      
      // Check if it's an audio file
      if (mediaUrl && (mediaContentType.startsWith('audio/') || mediaUrl.includes('.wav') || mediaUrl.includes('.ogg') || mediaUrl.includes('.mp3'))) {
        console.log('🎵 Audio file detected! Processing transcription...');
        
        // Get Twilio credentials for authentication (optional - media URLs are public by default)
        // Use Account SID from env if available, otherwise use the one from webhook
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || accountSid;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        
        // Download the audio file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        tempAudioPath = join(__dirname, `temp_audio_${Date.now()}.${mediaContentType.split('/')[1] || 'ogg'}`);
        
        console.log('⬇️  Downloading audio file from Twilio...');
        await downloadFile(mediaUrl, tempAudioPath, twilioAccountSid, twilioAuthToken || null);
        console.log('✅ Audio file downloaded successfully:', tempAudioPath);
        
        // Check file exists and get size
        const stats = fs.statSync(tempAudioPath);
        console.log(`📊 Audio file size: ${stats.size} bytes`);
        
        // Transcribe using OpenAI Whisper
        console.log('🔄 Sending audio to OpenAI Whisper for transcription...');
        const transcription = await transcribeAudio(tempAudioPath);
        
        // Log transcription with a readable format
        console.log('\n' + '='.repeat(60));
        console.log('🎤 VOICE NOTE TRANSCRIPTION RESULT');
        console.log('='.repeat(60));
        console.log('📞 From:', from);
        console.log('🆔 Message SID:', messageSid);
        console.log('📝 Transcription:');
        console.log('─'.repeat(60));
        console.log(transcription);
        console.log('─'.repeat(60));
        console.log('✅ Transcription completed successfully!');
        console.log('='.repeat(60) + '\n');
        
        // Clean up temp file
        fs.unlinkSync(tempAudioPath);
        tempAudioPath = null;
        
        // Escape XML special characters in transcription
        const escapeXml = (text) => {
          return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        };
        
        // Return TwiML response with transcription to Twilio
        res.status(200);
        res.type('text/xml');
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(transcription)}</Message>
</Response>`;
        
        // Log what we're sending to Twilio
        console.log('\n📤 Sending TwiML response to Twilio:');
        console.log(twimlResponse);
        console.log('');
        
        res.send(twimlResponse);
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
    
    // Always return TwiML (Twilio expects XML, not JSON)
    // Return 200 to prevent Twilio from retrying
    res.status(200);
    res.type('text/xml');
    
    // Escape error message for XML
    const escapeXml = (text) => {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };
    
    const errorMessage = `Error processing voice note: ${escapeXml(error.message)}`;
    const twimlError = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${errorMessage}</Message>
</Response>`;
    
    console.error('📤 Sending error TwiML response to Twilio:');
    console.error(twimlError);
    
    res.send(twimlError);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp AI Assistant server running on port ${PORT}`);
  console.log(`WhatsApp Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`Twilio Webhook URL: http://localhost:${PORT}/twilio`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

