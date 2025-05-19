// script.js - Enhanced AI Voice Assistant
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elements = {
    pdfInput: document.getElementById('pdfInput'),
    pdfUploadBtn: document.getElementById('pdfUploadBtn'),
    pdfText: document.getElementById('pdfText'),
    question: document.getElementById('question'),
    askBtn: document.getElementById('askBtn'),
    aiAnswer: document.getElementById('aiAnswer'),
    listenBtn: document.getElementById('listenBtn'),
    audioInput: document.getElementById('audioInput'),
    audioUploadBtn: document.getElementById('audioUploadBtn'),
    transcribedText: document.getElementById('transcribedText'),
    readBtn: document.getElementById('readBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    stopBtn: document.getElementById('stopBtn'),
    statusIndicator: document.getElementById('statusIndicator')
  };

  // Speech Variables
  let utterance = null;
  let recognition = null;
  let isSpeaking = false;
  let isListening = false;

  // Initialize the app
  function init() {
    checkBrowserCompatibility();
    setupEventListeners();
  }

  // Check browser capabilities
  function checkBrowserCompatibility() {
    const compatibilityWarning = 
      !('speechSynthesis' in window) ? 'Text-to-speech not supported. ' : '' +
      !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) ? 'Speech recognition not supported.' : '';

    if (compatibilityWarning) {
      showAlert('statusIndicator', compatibilityWarning + ' Try Chrome or Edge.', 'error');
      disableUnsupportedFeatures();
    }
  }

  // Disable unsupported features
  function disableUnsupportedFeatures() {
    if (!('speechSynthesis' in window)) {
      [elements.readBtn, elements.pauseBtn, elements.resumeBtn, elements.stopBtn].forEach(btn => btn.disabled = true);
    }
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      elements.listenBtn.disabled = true;
    }
  }

  // Setup all event listeners
  function setupEventListeners() {
    // File operations
    elements.pdfUploadBtn.addEventListener('click', handlePDFUpload);
    elements.audioUploadBtn.addEventListener('click', handleAudioUpload);
    
    // AI interaction
    elements.askBtn.addEventListener('click', handleQuestion);
    elements.question.addEventListener('keypress', (e) => e.key === 'Enter' && handleQuestion());
    
    // Speech recognition
    elements.listenBtn.addEventListener('click', toggleSpeechRecognition);
    
    // Text-to-speech controls
    elements.readBtn.addEventListener('click', startSpeaking);
    elements.pauseBtn.addEventListener('click', pauseSpeaking);
    elements.resumeBtn.addEventListener('click', resumeSpeaking);
    elements.stopBtn.addEventListener('click', stopSpeaking);
  }

  // ======================
  // PDF HANDLING FUNCTIONS
  // ======================
  async function handlePDFUpload() {
    const file = elements.pdfInput.files[0];
    if (!file) return showAlert('statusIndicator', 'Please select a PDF file', 'error');

    try {
      showLoading('statusIndicator', 'Processing PDF');
      
      const formData = new FormData();
      formData.append('pdfFile', file);

      const response = await fetch('/upload-pdf', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`Server responded with ${response.status}`);
      
      const data = await response.json();
      elements.pdfText.value = data.text || 'No text extracted';
      showAlert('statusIndicator', 'PDF processed successfully!', 'success');
    } catch (error) {
      console.error('PDF Processing Error:', error);
      showAlert('statusIndicator', `Failed to process PDF: ${error.message}`, 'error');
    }
  }

  // ======================
  // AI QUESTION HANDLING
  // ======================
  async function handleQuestion() {
    const question = elements.question.value.trim();
    const pdfText = elements.pdfText.value.trim();

    if (!question) return showAlert('aiAnswer', 'Please enter a question', 'error');
    if (!pdfText) return showAlert('aiAnswer', 'Please upload a PDF first', 'error');

    try {
      showLoading('aiAnswer', 'Processing your question');
      
      const response = await fetch('/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, pdfText })
      });

      if (!response.ok) throw new Error(`AI request failed with status ${response.status}`);
      
      const data = await response.json();
      showAlert('aiAnswer', data.answer, 'success');
      
      // Auto-read the answer if text-to-speech is available
      if ('speechSynthesis' in window) {
        speakText(data.answer);
      }
    } catch (error) {
      console.error('AI Query Error:', error);
      showAlert('aiAnswer', `Failed to get answer: ${error.message}`, 'error');
    }
  }

  // ======================
  // SPEECH RECOGNITION
  // ======================
  function toggleSpeechRecognition() {
    if (!recognition) {
      recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListening = true;
        elements.listenBtn.textContent = '🎤 Listening...';
        showAlert('statusIndicator', 'Listening... Speak now', 'info');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        elements.question.value = transcript;
        showAlert('statusIndicator', 'Speech recognized', 'success');
        handleQuestion();
      };

      recognition.onerror = (event) => {
        console.error('Speech Recognition Error:', event.error);
        showAlert('statusIndicator', `Recognition error: ${event.error}`, 'error');
      };

      recognition.onend = () => {
        isListening = false;
        elements.listenBtn.textContent = '🎤 Start Listening';
      };
    }

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  }

  // ======================
  // TEXT-TO-SPEECH CONTROLS
  // ======================
  function speakText(text) {
    if (!text.trim()) {
      showAlert('statusIndicator', 'No text to read', 'error');
      return;
    }

    stopSpeaking(); // Stop any current speech
    
    utterance = new SpeechSynthesisUtterance(text);
    isSpeaking = true;
    
    utterance.onstart = () => {
      showAlert('statusIndicator', 'Reading text', 'info');
    };
    
    utterance.onend = () => {
      isSpeaking = false;
      showAlert('statusIndicator', 'Reading complete', 'success');
    };
    
    utterance.onerror = (event) => {
      console.error('Speech Synthesis Error:', event);
      showAlert('statusIndicator', `Speech error: ${event.error}`, 'error');
      isSpeaking = false;
    };
    
    speechSynthesis.speak(utterance);
  }

  function startSpeaking() {
    const text = elements.pdfText.value.trim() || elements.aiAnswer.textContent;
    speakText(text);
  }

  function pauseSpeaking() {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
      speechSynthesis.pause();
      isSpeaking = false;
      showAlert('statusIndicator', 'Speech paused', 'info');
    }
  }

  function resumeSpeaking() {
    if (speechSynthesis.paused) {
      speechSynthesis.resume();
      isSpeaking = true;
      showAlert('statusIndicator', 'Resuming speech', 'info');
    }
  }

  function stopSpeaking() {
    if (speechSynthesis.speaking || speechSynthesis.paused) {
      speechSynthesis.cancel();
      isSpeaking = false;
      showAlert('statusIndicator', 'Speech stopped', 'info');
    }
  }

  // ======================
  // AUDIO HANDLING
  // ======================
  async function handleAudioUpload() {
    const file = elements.audioInput.files[0];
    if (!file) return showAlert('statusIndicator', 'Please select an audio file', 'error');

    try {
      showLoading('statusIndicator', 'Transcribing audio');
      
      const formData = new FormData();
      formData.append('audioFile', file);

      const response = await fetch('/upload-audio', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`Transcription failed with status ${response.status}`);
      
      const data = await response.json();
      elements.transcribedText.value = data.text || 'No transcription returned';
      showAlert('statusIndicator', 'Transcription complete!', 'success');
    } catch (error) {
      console.error('Audio Transcription Error:', error);
      showAlert('statusIndicator', `Transcription failed: ${error.message}`, 'error');
    }
  }

  // ======================
  // UI HELPER FUNCTIONS
  // ======================
  function showAlert(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Element ${elementId} not found`);
      return;
    }
    
    element.className = `alert ${type}`;
    element.textContent = message;
    
    // Auto-hide info messages after 5 seconds
    if (type === 'info') {
      setTimeout(() => {
        if (element.textContent === message) {
          element.className = 'alert';
          element.textContent = '';
        }
      }, 5000);
    }
  }

  function showLoading(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.className = 'alert loading';
      element.textContent = `${message}...`;
    }
  }

  // Initialize the application
  init();
});
