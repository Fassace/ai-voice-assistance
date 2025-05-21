# AI Voice Assistance

A Node.js application that provides AI-powered text generation (using Groq) and audio transcription (using AssemblyAI) with PDF processing capabilities.

## Features

- **Text Generation**: AI-powered responses using Groq's LLMs (Mixtral or Llama3)
- **Audio Transcription**: Convert audio files to text using AssemblyAI
- **PDF Processing**: Extract text and metadata from PDF files
- **API Endpoints**: RESTful endpoints for all services
- **Error Handling**: Comprehensive error handling with fallback mechanisms

## Technologies Used

- **Backend**: Node.js, Express
- **AI Services**:
  - [Groq](https://groq.com/) - For text generation
  - [AssemblyAI](https://www.assemblyai.com/) - For audio transcription
- **Libraries**:
  - `axios` - HTTP requests
  - `multer` - File upload handling
  - `pdf-parse` - PDF text extraction
  - `cors` - Cross-origin resource sharing
  - `dotenv` - Environment variables

## API Endpoints

| Endpoint          | Method | Description                           |
|-------------------|--------|---------------------------------------|
| `/upload-pdf`     | POST   | Process PDF files (max 25MB)          |
| `/ask-ai`.        | POST   | Generate AI responses (requires text context) |
| `/upload-audio`   | POST   | Transcribe audio files (max 5MB)      |
| `/health`         | GET    | Service health check                  |

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ai-voice-assistance.git
   cd ai-voice-assistance
