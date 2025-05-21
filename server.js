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

// Enhanced Hugging Face AI Service with fallback options
const queryAI = async (prompt, retries = 3) => {
  try {
    if (!process.env.HUGGINGFACE_API_KEY) {
      throw new Error('Hugging Face API key not configured');
    }

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

    const answer = response.data?.generated_text || 
                  (Array.isArray(response.data) ? response.data[0]?.generated_text : '') || 
                  'No answer generated';

    return {
      answer: answer.replace(prompt, '').trim(),
      model: 'gemma-7b-it',
      source: 'huggingface'
    };
  } catch (error) {
    console.error(`Hugging Face API Attempt ${4-retries} failed:`, error.message);
    
    if (error.response?.status === 402) {
      return {
        answer: "I can't process this right now (API credits exhausted). Please try again later.",
        model: 'fallback',
        source: 'local'
      };
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
    console.error('PDF Processing Error:', error.message);
    const statusCode = error.message.includes('Invalid PDF') ? 415 : 500;
    res.status(statusCode).json({
      error: 'PDF processing failed',
      details: error.message
    });
  }
});

// AI Question Answering (unchanged)
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
    const { answer, model, source } = await queryAI(prompt);
    
    res.json({ 
      success: true,
      answer,
      model,
      source,
      timestamp: new Date().toISOString(),
      creditsInfo: source === 'local' ? 'API credits exhausted - using fallback response' : undefined
    });

  } catch (error) {
    console.error('AI Processing Error:', error.message);
    
    const statusCode = error.message.includes('API key') ? 401 : 
                      error.message.includes('rate limit') ? 429 : 
                      500;
    
    res.status(statusCode).json({
      error: 'AI processing failed',
      details: error.message,
      solution: statusCode === 401 ? 'Check API configuration' :
               statusCode === 429 ? 'Rate limit reached - try later' :
               'Try again with different input'
    });
  }
});

// Modified Audio Route with AssemblyAI
app.post('/upload-audio', upload.single('audioFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No audio file uploaded',
        acceptedTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg']
      });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(413).json({
        error: 'File too large',
        maxSize: '5MB',
        received: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`,
        solution: 'Compress your audio or use shorter recordings'
      });
    }

    // Upload to AssemblyAI
    const uploadResponse = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      req.file.buffer,
      {
        headers: {
          'Authorization': process.env.ASSEMBLYAI_API_KEY,
          'Content-Type': req.file.mimetype
        },
        timeout: 30000
      }
    );

    // Start transcription
    const transcriptResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: uploadResponse.data.upload_url
      },
      {
        headers: {
          'Authorization': process.env.ASSEMBLYAI_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Poll for results
    let status = 'queued';
    let transcription = '';
    const startTime = Date.now();
    while (status !== 'completed' && Date.now() - startTime < 180000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptResponse.data.id}`,
        {
          headers: {
            'Authorization': process.env.ASSEMBLYAI_API_KEY
          }
        }
      );
      status = statusResponse.data.status;
      if (status === 'completed') {
        transcription = statusResponse.data.text;
        break;
      }
      if (status === 'error') {
        throw new Error(statusResponse.data.error);
      }
    }

    if (!transcription) {
      throw new Error('Transcription timed out');
    }

    res.json({
      success: true,
      text: transcription,
      model: 'assemblyai',
      source: 'api'
    });
    
  } catch (error) {
    console.error('Audio Processing Error:', error.message);
    
    const statusCode = error.response?.status || 500;
    let solution = 'Try again later';
    
    if (statusCode === 402) {
      solution = 'API credits exhausted. Consider upgrading your AssemblyAI plan.';
    } else if (statusCode === 429) {
      solution = 'Rate limit reached. Try again in a few minutes.';
    }

    res.status(statusCode).json({
      error: 'Audio processing failed',
      details: error.message,
      solution
    });
  }
});

// Updated Health Check Endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'operational',
    timestamp: new Date().toISOString(),
    services: {
      pdf_processing: 'active',
      text_generation: process.env.HUGGINGFACE_API_KEY ? 'huggingface-configured' : 'huggingface-missing-key',
      audio_transcription: process.env.ASSEMBLYAI_API_KEY ? 'assemblyai-configured' : 'assemblyai-missing-key',
      memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB used`
    },
    warnings: []
  };

  // Test Hugging Face connection
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      await axios.get('https://api-inference.huggingface.co/status', {
        headers: { 'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}` },
        timeout: 5000
      });
    } catch (error) {
      health.services.text_generation = 'huggingface-connection-failed';
      health.warnings.push('Hugging Face connection failed');
    }
  }

  // Test AssemblyAI connection
  if (process.env.ASSEMBLYAI_API_KEY) {
    try {
      await axios.get('https://api.assemblyai.com/v2', {
        headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY },
        timeout: 5000
      });
    } catch (error) {
      health.services.audio_transcription = 'assemblyai-connection-failed';
      health.warnings.push('AssemblyAI connection failed');
    }
  }

  res.json(health);
});

// Error Handling Middleware (unchanged)
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Hugging Face API: ${process.env.HUGGINGFACE_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`AssemblyAI API: ${process.env.ASSEMBLYAI_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`PDF Limit: 25MB | Audio Limit: 5MB`);
});
