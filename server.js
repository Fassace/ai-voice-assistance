const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enhanced configuration
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors({ origin: true })); // Allows all origins in development
app.use(express.json());
app.use(express.static('public'));

// Improved Groq API Service
const queryAI = async (prompt, context) => {
  try {
    // Validate API key
    if (!process.env.GROQ_API_KEY) {
      throw new Error('Groq API key not configured');
    }

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'mixtral-8x7b-32768',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. Answer questions based strictly on the provided context.'
          },
          {
            role: 'user',
            content: `Context: ${context}\n\nQuestion: ${prompt}\nAnswer:`
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
        timeout: 15000 // 15 second timeout
      }
    );

    if (!response.data.choices?.[0]?.message?.content) {
      throw new Error('Unexpected API response format');
    }

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Groq API Error Details:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    throw new Error(
      error.response?.data?.error?.message ||
      error.response?.statusText ||
      'Failed to process AI request'
    );
  }
};

// Enhanced Routes with Better Error Handling
app.post('/ask-ai', async (req, res) => {
  try {
    const { question, pdfText } = req.body;

    // Validate input
    if (!question?.trim() || !pdfText?.trim()) {
      return res.status(400).json({ 
        error: 'Both question and PDF text are required',
        received: { question, pdfText: pdfText ? '(exists)' : 'missing' }
      });
    }

    const answer = await queryAI(question, pdfText);
    
    res.json({ 
      answer,
      model: 'mixtral-8x7b-32768',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Processing Pipeline Error:', error);
    
    const statusCode = error.message.includes('API key') ? 401 : 
                      error.message.includes('required') ? 400 : 500;
    
    res.status(statusCode).json({
      error: 'AI processing failed',
      details: error.message,
      solution: statusCode === 401 ? 
        'Check your GROQ_API_KEY in .env file' :
        'Try again with a different question or PDF content'
    });
  }
});

// [Keep your existing PDF and audio routes...]

// New Debug Endpoint
app.get('/debug/ai', async (req, res) => {
  try {
    const testPrompt = "What is 2+2?";
    const answer = await queryAI(testPrompt, "Basic math question");
    res.json({
      status: 'success',
      answer,
      apiHealth: 'operational'
    });
  } catch (error) {
    res.status(500).json({
      status: 'failed',
      error: error.message,
      configuration: {
        hasApiKey: !!process.env.GROQ_API_KEY,
        keyLength: process.env.GROQ_API_KEY?.length || 0
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Groq API Status: ${process.env.GROQ_API_KEY ? 'Configured' : 'MISSING KEY'}`);
  console.log(`Test endpoint: http://localhost:${PORT}/debug/ai`);
});
