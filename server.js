const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enhanced Configurations
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 25 * 1024 * 1024, // 25MB limit
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

// Enhanced Groq AI Service with Retry Logic
const queryAI = async (prompt, retries = 3) => {
  try {
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
            content: 'You are a helpful AI assistant. Provide concise, accurate answers based on the context.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1024,
        top_p: 0.9
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (!response.data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from Groq API');
    }

    return {
      answer: response.data.choices[0].message.content.trim(),
      usage: response.data.usage
    };
  } catch (error) {
    console.error(`Groq API Attempt ${4-retries} failed:`, error.message);
    
    if (retries > 0 && error.response?.status !== 401) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      return queryAI(prompt, retries - 1);
    }
    
    throw new Error(
      error.response?.data?.error?.message || 
      error.message || 
      'Failed to process AI request'
    );
  }
};

// Enhanced PDF Processing Route
app.post('/upload-pdf', upload.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        acceptedTypes: ['application/pdf']
      });
    }

    // Validate PDF magic number
    if (req.file.buffer.slice(0, 4).toString() !== '%PDF') {
      return res.status(415).json({ 
        error: 'Invalid PDF file',
        details: 'File header does not match PDF signature'
      });
    }

    const data = await pdfParse(req.file.buffer);
    const cleanText = data.text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?;:'"-]/g, '')
      .trim();

    if (!cleanText) {
      console.warn('PDF parsed but no text extracted:', {
        pages: data.numpages,
        metadata: data.info
      });
    }

    res.json({ 
      success: true,
      text: cleanText || 'No extractable text found',
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

// Enhanced AI Question Answering
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

    const prompt = `Context:\n${pdfText}\n\nQuestion: ${question}\nProvide a concise answer:`;
    const { answer, usage } = await queryAI(prompt);
    
    res.json({ 
      success: true,
      answer,
      model: 'mixtral-8x7b-32768',
      timestamp: new Date().toISOString(),
      usage
    });

  } catch (error) {
    console.error('AI Processing Error:', {
      error: error.message,
      question: req.body.question?.length,
      contextLength: req.body.pdfText?.length
    });

    const statusCode = error.message.includes('API key') ? 401 : 500;
    
    res.status(statusCode).json({
      error: 'AI processing failed',
      details: error.message,
      solution: statusCode === 401 ? 
        'Check your GROQ_API_KEY configuration' : 
        'Try again with a different question'
    });
  }
});

// Audio Route with Better Error Handling
app.post('/upload-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No audio file uploaded',
        acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg']
      });
    }

    // Basic validation
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: 'File too large',
        maxSize: '10MB',
        received: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`
      });
    }

    // Implementation placeholder
    throw new Error('Audio processing not implemented');
    
  } catch (error) {
    console.error('Audio Processing Error:', {
      error: error.message,
      fileType: req.file?.mimetype,
      fileSize: req.file?.size
    });

    res.status(500).json({
      error: 'Audio processing unavailable',
      details: error.message,
      upcomingFeatures: [
        'Local Whisper.cpp integration',
        'AssemblyAI cloud service'
      ]
    });
  }
});

// Enhanced Health Check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      pdf_processing: 'active',
      groq_ai: process.env.GROQ_API_KEY ? 'configured' : 'missing_api_key',
      audio_transcription: 'not_implemented',
      memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB used`
    }
  };

  try {
    // Test Groq connectivity
    if (process.env.GROQ_API_KEY) {
      const test = await axios.get('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        timeout: 5000
      });
      health.services.groq_ai = test.data ? 'operational' : 'unavailable';
    }
  } catch (error) {
    health.services.groq_ai = 'connection_failed';
    health.groq_error = error.message;
  }

  res.json(health);
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Groq API: ${process.env.GROQ_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`PDF Limit: 25MB | Audio Limit: 10MB`);
});
