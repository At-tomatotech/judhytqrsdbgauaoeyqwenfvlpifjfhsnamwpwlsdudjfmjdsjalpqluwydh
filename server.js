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

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
     ? process.env.APP_URL
     : 'http://localhost:8080'
}));
app.use(express.json());

// Add a test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend connection successful!' });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const systemPrompt =
      "You are a helpful fitness assistant that provides accurate, science-backed information about exercise, nutrition, and wellness. " +
      "Give concise, practical advice tailored to the user's needs. When appropriate, recommend consulting with healthcare or fitness professionals. " +
      "Focus on safe, sustainable practices and avoid extreme recommendations. " +
      "If asked about specific medical conditions, emphasize the importance of professional medical advice.";
    
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
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:8080',
          'X-Title': 'Fitness Chat AI',
        },
      }
    );
    
    const aiMessage = response.data.choices[0].message.content;
    
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

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend should be available at http://localhost:8080`);
});