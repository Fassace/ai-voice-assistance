// server.js (Key Improvements)
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
const PORT = process.env.PORT;

// Configurations
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors({
  origin: ['https://ai-voice-assistance-rtbo.onrender.com', 'http://localhost:5000'],
  methods: ['GET', 'POST']
}));
app.use(express.json());
app.use(express.static('public'));

// Enhanced AI Service
const queryAI = async (prompt) => {
  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1',
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000
      }
    );

    return response.data[0]?.generated_text || 'No answer generated';
  } catch (error) {
    console.error('AI Service Error:', error);
    throw new Error('Failed to process AI request');
  }
};

// Enhanced Routes
app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');
    
    const data = await pdfParse(req.file.buffer);
    res.json({ text: data.text });
  } catch (error) {
    console.error('PDF Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/ask-ai', async (req, res) => {
  try {
    const { question, pdfText } = req.body;
    if (!question || !pdfText) throw new Error('Missing required fields');
    
    const prompt = `Based on this context: ${pdfText}\n\nAnswer this question: ${question}`;
    const answer = await queryAI(prompt);
    
    res.json({ answer });
  } catch (error) {
    console.error('AI Route Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/upload-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No audio file uploaded');

    // Determine content type based on file extension
    const contentType = req.file.originalname.endsWith('.mp3') 
      ? 'audio/mp3' 
      : 'audio/wav';

    // Correct Whisper model endpoint
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/openai/whisper-large-v3', // Updated model
      req.file.buffer,
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': contentType, // Dynamic content type
        },
        timeout: 30000 // 30-second timeout
      }
    );

    // Handle different response formats
    const transcription = response.data.text || 
                         (response.data[0] && response.data[0].transcription_text);
    
    if (!transcription) {
      throw new Error('No transcription returned from API');
    }

    res.json({ text: transcription });
    
  } catch (error) {
    console.error('Audio Error:', error);
    
    // Enhanced error handling
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error || 
                        error.response?.data || 
                        error.message;
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: error.response?.data?.details || null
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
