import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

// Configure dotenv
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize express
const app = express();
const PORT = process.env.PORT || 5000;

// API Key rotation system
const API_KEYS = [
  process.env.OPENROUTER_API_KEY_1,
  process.env.OPENROUTER_API_KEY_2,
  process.env.OPENROUTER_API_KEY_3,
  process.env.OPENROUTER_API_KEY_4,
  process.env.OPENROUTER_API_KEY_5
].filter(key => key); // Remove any undefined keys

let currentKeyIndex = 0;

// Function to get next API key
function getNextApiKey() {
  if (API_KEYS.length === 0) {
    throw new Error('No API keys configured');
  }
  
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

// Function to try API call with key rotation on rate limit
async function makeApiCall(message, maxRetries = API_KEYS.length) {
  const systemPrompt =
    "You are a knowledgeable and supportive fitness coach. Provide clear, accurate, and science-based advice about exercise, nutrition, and healthy living. " +
    "Tailor each answer to the user's specific question and goals. Respond in a way that is informative but brief—avoid unnecessary details, but include the most important facts or tips. " +
    "When appropriate, suggest consulting a healthcare or fitness professional. Never recommend unsafe or extreme practices. " +
    "If a medical condition is mentioned, always emphasize the need for professional medical advice. " +
    "AND DO NOT ANSWER non related fitness questions, instead say this Sorry, I can not answer any questions that are not related to fitness!";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const apiKey = getNextApiKey();
      
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'anthropic/claude-3-haiku',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:8080',
            'X-Title': 'Fitness Chat AI',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      // Check if it's a rate limit error (429) or quota exceeded
      if (error.response?.status === 429 || 
          error.response?.status === 402 || 
          error.response?.data?.error?.code === 'rate_limit_exceeded') {
        
        console.log(`Rate limit hit on attempt ${attempt + 1}, trying next key...`);
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // Continue to next iteration (next API key)
        continue;
      }
      
      // For non-rate-limit errors, throw immediately
      throw error;
    }
  }
}

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.APP_URL 
    : 'http://localhost:8080'
}));
app.use(express.json());

// Add a test route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend connection successful!',
    availableKeys: API_KEYS.length
  });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (API_KEYS.length === 0) {
      return res.status(500).json({ error: 'No API keys configured' });
    }

    const aiMessage = await makeApiCall(message);
    res.json({ message: aiMessage });
    
  } catch (error) {
    console.error('Error calling AI API:', error.response?.data || error.message);
    
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({
        error: 'Error processing request',
        details: error.response?.data || error.message,
      });
    }
    
    res.status(500).json({
      error: 'Failed to process your request. Please try again later.',
    });
  }
});

// This is an API-only server - no static file serving needed
// If you need to serve a frontend, make sure to build your frontend 
// and place the built files in a 'dist' directory

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend should be available at http://localhost:8080`);
  console.log(`Configured with ${API_KEYS.length} API keys`);
});
