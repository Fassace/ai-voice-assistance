const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configurations
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

// Groq AI Service
const queryAI = async (prompt, retries = 3) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('Groq API key not configured');
    }

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "mixtral-8x7b-32768", // or "llama3-70b-8192" as alternative
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const answer = response.data.choices[0]?.message?.content || 'No answer generated';

    return {
      answer: answer.trim(),
      model: 'mixtral-8x7b-32768',
      source: 'groq'
    };
  } catch (error) {
    console.error(`Groq API Attempt ${4-retries} failed:`, error.message);
    
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retries)));
      
      // Try fallback model if the primary fails
      const fallbackModel = "llama3-70b-8192";
      try {
        const fallbackResponse = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: fallbackModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        const fallbackAnswer = fallbackResponse.data.choices[0]?.message?.content || 'No answer generated';
        return {
          answer: fallbackAnswer.trim(),
          model: fallbackModel,
          source: 'groq-fallback'
        };
      } catch (fallbackError) {
        return queryAI(prompt, retries - 1);
      }
    }
    
    throw new Error(
      error.response?.data?.error?.message || 
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

// AI Question Answering (updated for Groq)
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
      timestamp: new Date().toISOString()
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

// Audio Transcription with AssemblyAI
const transcribeWithAssemblyAI = async (audioBuffer, contentType) => {
  try {
    // Step 1: Upload audio file
    const uploadResponse = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      audioBuffer,
      {
        headers: {
          'Authorization': process.env.ASSEMBLYAI_API_KEY,
          'Content-Type': contentType
        },
        timeout: 30000
      }
    );

    // Step 2: Start transcription
    const transcriptionResponse = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      {
        audio_url: uploadResponse.data.upload_url,
        language_detection: true
      },
      {
        headers: {
          'Authorization': process.env.ASSEMBLYAI_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Step 3: Poll for results
    const transcriptId = transcriptionResponse.data.id;
    let status = 'queued';
    let transcriptText = '';
    const startTime = Date.now();
    
    while (status !== 'completed' && Date.now() - startTime < 180000) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            'Authorization': process.env.ASSEMBLYAI_API_KEY
          }
        }
      );
      
      status = statusResponse.data.status;
      if (status === 'completed') {
        transcriptText = statusResponse.data.text;
        break;
      }
      if (status === 'error') {
        throw new Error(`Transcription failed: ${statusResponse.data.error}`);
      }
    }

    if (!transcriptText) {
      throw new Error('Transcription timed out');
    }

    return {
      text: transcriptText,
      model: 'assemblyai',
      source: 'api'
    };
  } catch (error) {
    console.error('AssemblyAI Transcription Error:', error.message);
    throw error;
  }
};

// Audio Route using AssemblyAI
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

    const contentType = req.file.mimetype === 'audio/mpeg' ? 'audio/mpeg' : 'audio/wav';
    const { text, model, source } = await transcribeWithAssemblyAI(req.file.buffer, contentType);
    
    res.json({
      success: true,
      text,
      model,
      source,
      timestamp: new Date().toISOString()
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
      solution,
      maxRecommendedSize: '5MB'
    });
  }
});

// Health Check Endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'operational',
    timestamp: new Date().toISOString(),
    services: {
      pdf_processing: 'active',
      text_generation: process.env.GROQ_API_KEY ? 'configured' : 'missing_api_key',
      audio_transcription: process.env.ASSEMBLYAI_API_KEY ? 'configured' : 'missing_api_key',
      memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB used`,
      warnings: []
    }
  };

  // Test Groq connection
  if (process.env.GROQ_API_KEY) {
    try {
      await axios.get('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        timeout: 5000
      });
    } catch (error) {
      health.services.text_generation = 'connection_failed';
      health.warnings.push('Groq connection failed');
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
      health.services.audio_transcription = 'connection_failed';
      health.warnings.push('AssemblyAI connection failed');
    }
  }

  res.json(health);
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Groq API: ${process.env.GROQ_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`AssemblyAI API: ${process.env.ASSEMBLYAI_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`PDF Limit: 25MB | Audio Limit: 5MB`);
});
