const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configurations (unchanged)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 25 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'audio/*'];
    if (!allowedTypes.some(type => file.mimetype.includes(type.split('/')[0]))) {
      return cb(new Error('Invalid file type'), false);
    }
    cb(null, true);
  }
});

app.use(cors({
  origin: ['https://ai-voice-assistance-rtbo.onrender.com', 'http://localhost:5000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('public'));

// Modified Hugging Face AI Service
const queryAI = async (prompt, retries = 3) => {
  try {
    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new Error('Hugging Face API key not configured');
    }

    // Changed to free-tier friendly model
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/google/gemma-7b-it',
      { inputs: prompt },
      {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Handle response format for Gemma model
    const answer = response.data?.generated_text || 
                  (Array.isArray(response.data) ? response.data[0]?.generated_text : '') || 
                  'No answer generated';

    return {
      answer: answer.replace(prompt, '').trim(),
      model: 'gemma-7b-it' // Updated model name
    };
  } catch (error) {
    console.error(`Hugging Face API Attempt ${4-retries} failed:`, error.message);
    
    // Added specific handling for free-tier limits
    if (error.response?.status === 429) {
      throw new Error('Free tier rate limit reached. Try again later.');
    }
    
    if (retries > 0 && error.response?.status !== 401) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      return queryAI(prompt, retries - 1);
    }
    
    throw new Error(
      error.response?.data?.error || 
      error.message || 
      'Failed to process AI request'
    );
  }
};

// PDF Processing Route (unchanged)
app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        acceptedTypes: ['application/pdf']
      });
    }

    if (req.file.buffer.slice(0, 4).toString() !== '%PDF') {
      return res.status(415).json({ 
        error: 'Invalid PDF file',
        details: 'File header does not match PDF signature'
      });
    }

    const data = await pdfParse(req.file.buffer);
    
    res.json({ 
      success: true,
      text: data.text,
      metadata: {
        pages: data.numpages,
        version: data.version,
        info: data.info
      }
    });

  } catch (error) {
    console.error('PDF Processing Error:', {
      error: error.message,
      file: req.file?.originalname,
      size: req.file?.size
    });

    const statusCode = error.message.includes('Invalid PDF') ? 415 : 500;
    
    res.status(statusCode).json({
      error: 'PDF processing failed',
      details: error.message,
      solution: statusCode === 415 ? 
        'Upload a valid PDF file' : 
        'Try again or contact support'
    });
  }
});

// AI Question Answering (updated model reference)
app.post('/ask-ai', async (req, res) => {
  try {
    const { question, pdfText } = req.body;
    
    if (!question?.trim() || !pdfText?.trim()) {
      return res.status(400).json({ 
        error: 'Invalid input',
        details: {
          questionProvided: !!question,
          textProvided: !!pdfText
        }
      });
    }

    const prompt = `Context:\n${pdfText}\n\nQuestion: ${question}\nAnswer:`;
    const { answer } = await queryAI(prompt);
    
    res.json({ 
      success: true,
      answer,
      model: 'gemma-7b-it', // Updated model name
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Processing Error:', {
      error: error.message,
      question: req.body.question?.length,
      contextLength: req.body.pdfText?.length
    });

    const statusCode = error.message.includes('API key') ? 401 : 
                      error.message.includes('rate limit') ? 429 : 
                      500;
    
    res.status(statusCode).json({
      error: 'AI processing failed',
      details: error.message,
      solution: statusCode === 401 ? 
        'Check your HUGGINGFACE_API_KEY configuration' : 
        statusCode === 429 ?
        'Free tier limit reached. Try again later or upgrade account.' :
        'Try again with a different question'
    });
  }
});

// Modified Audio Route with free-tier Whisper
app.post('/upload-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No audio file uploaded',
        acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg']
      });
    }

    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: 'File too large',
        maxSize: '10MB',
        received: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`
      });
    }

    const contentType = req.file.mimetype === 'audio/mpeg' ? 'audio/mpeg' : 'audio/wav';

    // Changed to free-tier compatible Whisper model
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/facebook/whisper-medium.en',
      req.file.buffer,
      {
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': contentType
        },
        timeout: 30000
      }
    );

    const transcription = response.data.text || 
                         response.data?.transcription_text ||
                         (response.data[0]?.transcription_text);
    
    if (!transcription) {
      throw new Error('No transcription returned from API');
    }

    res.json({
      success: true,
      text: transcription,
      model: 'whisper-medium.en' // Updated model name
    });
    
  } catch (error) {
    console.error('Audio Processing Error:', {
      error: error.message,
      fileType: req.file?.mimetype,
      fileSize: req.file?.size
    });

    const statusCode = error.message.includes('rate limit') ? 429 : 500;
    
    res.status(statusCode).json({
      error: 'Audio processing failed',
      details: error.message,
      solution: statusCode === 429 ?
        'Free tier limit reached. Try again later.' :
        'Try again or check your API key'
    });
  }
});

// Health Check Endpoint (unchanged)
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      pdf_processing: 'active',
      huggingface_ai: process.env.HUGGINGFACE_API_KEY ? 'configured' : 'missing_api_key',
      audio_transcription: process.env.HUGGINGFACE_API_KEY ? 'available' : 'requires_api_key',
      memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB used`
    }
  };

  try {
    if (process.env.HUGGINGFACE_API_KEY) {
      const test = await axios.get('https://api-inference.huggingface.co/models', {
        headers: { 'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
        timeout: 5000
      });
      health.services.huggingface_ai = test.data ? 'operational' : 'unavailable';
    }
  } catch (error) {
    health.services.huggingface_ai = 'connection_failed';
    health.huggingface_error = error.message;
  }

  res.json(health);
});

// Error Handling Middleware (unchanged)
app.use((err, req, res, next) => {
  console.error('Server Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Hugging Face API: ${process.env.HUGGINGFACE_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`PDF Limit: 25MB | Audio Limit: 10MB`);
});
