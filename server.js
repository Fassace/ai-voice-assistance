const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const { promisify } = require('util');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configurations
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

app.use(cors({
  origin: ['https://ai-voice-assistance-rtbo.onrender.com', 'http://localhost:5000'],
  methods: ['GET', 'POST']
}));
app.use(express.json());
app.use(express.static('public'));

// Groq AI Service
const queryAI = async (prompt) => {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'mixtral-8x7b-32768', // Same model you were using
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. Answer questions concisely and accurately based on the provided context.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1024
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Groq API Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to process AI request');
  }
};

// PDF Processing Route
app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const data = await pdfParse(req.file.buffer);
    const cleanText = data.text.replace(/\s+/g, ' ').trim();
    
    res.json({ 
      text: cleanText || 'No text extracted',
      pages: data.numpages
    });
  } catch (error) {
    console.error('PDF Processing Error:', error);
    res.status(500).json({ 
      error: 'Failed to process PDF',
      details: error.message
    });
  }
});

// AI Question Answering Route
app.post('/ask-ai', async (req, res) => {
  try {
    const { question, pdfText } = req.body;
    
    if (!question || !pdfText) {
      return res.status(400).json({ error: 'Both question and PDF text are required' });
    }

    const prompt = `Context:\n${pdfText}\n\nQuestion: ${question}\nAnswer:`;
    const answer = await queryAI(prompt);
    
    res.json({ 
      answer,
      model: 'mixtral-8x7b-32768',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('AI Processing Error:', error);
    res.status(500).json({ 
      error: 'Failed to generate answer',
      details: error.message
    });
  }
});

// Audio Transcription Route
app.post('/upload-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Fallback to local Whisper if you implement it later
    throw new Error('Audio transcription requires setup - see comments for alternatives');

    /* 
    Alternative implementations:
    1. Local Whisper: https://github.com/ggerganov/whisper.cpp
    2. AssemblyAI (free tier): https://www.assemblyai.com/
    3. OpenAI Whisper API (paid): https://platform.openai.com/docs/guides/speech-to-text
    */
    
  } catch (error) {
    console.error('Audio Processing Error:', error);
    res.status(500).json({ 
      error: 'Audio processing not configured',
      details: error.message,
      solutions: [
        'Implement local Whisper.cpp for free transcription',
        'Use AssemblyAI free tier',
        'Use OpenAI Whisper API'
      ]
    });
  }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      pdf_processing: 'active',
      groq_ai: process.env.GROQ_API_KEY ? 'configured' : 'missing_api_key',
      audio_transcription: 'not_configured'
    }
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Groq AI configured: ${process.env.GROQ_API_KEY ? 'Yes' : 'No'}`);
});
