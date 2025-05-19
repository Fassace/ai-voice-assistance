// script.js
document.addEventListener('DOMContentLoaded', () => {
  // Elements
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
    ttsControls: document.querySelectorAll('.tts-controls button')
  };

  let utterance = null;
  let recognition = null;

  // Event Listeners
  elements.pdfUploadBtn.addEventListener('click', handlePDFUpload);
  elements.askBtn.addEventListener('click', handleQuestion);
  elements.listenBtn.addEventListener('click', toggleListening);
  elements.audioUploadBtn.addEventListener('click', handleAudioUpload);
  elements.ttsControls.forEach(btn => btn.addEventListener('click', handleTTS));

  // PDF Handling
  async function handlePDFUpload() {
    const file = elements.pdfInput.files[0];
    if (!file) return showAlert('Please select a PDF file', 'error');

    try {
      showLoading('pdfStatus', 'Processing PDF...');
      const formData = new FormData();
      formData.append('pdfFile', file);

      const response = await fetch('/upload-pdf', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      elements.pdfText.value = data.text || 'No text extracted';
      showAlert('pdfStatus', 'PDF processed successfully!', 'success');
    } catch (error) {
      console.error('PDF Error:', error);
      showAlert('pdfStatus', 'Failed to process PDF', 'error');
    }
  }

  // AI Question Handling
  async function handleQuestion() {
    const question = elements.question.value.trim();
    const pdfText = elements.pdfText.value.trim();

    if (!question) return showAlert('aiAnswer', 'Please enter a question', 'error');
    if (!pdfText) return showAlert('aiAnswer', 'Upload a PDF first', 'error');

    try {
      showLoading('aiAnswer', 'Processing your question...');
      const response = await fetch('/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, pdfText })
      });

      if (!response.ok) throw new Error('AI request failed');
      
      const data = await response.json();
      showAlert('aiAnswer', data.answer, 'success');
    } catch (error) {
      console.error('AI Error:', error);
      showAlert('aiAnswer', 'Failed to get answer', 'error');
    }
  }

  // Voice Recognition
  function toggleListening() {
    if (!recognition) {
      recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.continuous = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        elements.question.value = transcript;
        handleQuestion();
      };

      recognition.onerror = (event) => {
        showAlert('aiAnswer', `Recognition error: ${event.error}`, 'error');
      };
    }

    if (elements.listenBtn.textContent.includes('Start')) {
      recognition.start();
      elements.listenBtn.textContent = '🎤 Listening...';
    } else {
      recognition.stop();
      elements.listenBtn.textContent = '🎤 Start Listening';
    }
  }

  // TTS Controls
  function handleTTS(event) {
    const action = event.target.id.replace('Btn', '');
    const text = elements.pdfText.value.trim();
    
    if (!text) return showAlert('aiAnswer', 'No text to read', 'error');

    switch(action) {
      case 'read':
        utterance = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(utterance);
        break;
      case 'pause':
        speechSynthesis.pause();
        break;
      case 'resume':
        speechSynthesis.resume();
        break;
      case 'stop':
        speechSynthesis.cancel();
        break;
    }
  }

  // Audio Handling
  async function handleAudioUpload() {
    const file = elements.audioInput.files[0];
    if (!file) return showAlert('audioStatus', 'Select an audio file', 'error');

    try {
      showLoading('audioStatus', 'Transcribing audio...');
      const formData = new FormData();
      formData.append('audioFile', file);

      const response = await fetch('/upload-audio', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Transcription failed');
      
      const data = await response.json();
      elements.transcribedText.value = data.text || 'No transcription';
      showAlert('audioStatus', 'Transcription complete!', 'success');
    } catch (error) {
      console.error('Audio Error:', error);
      showAlert('audioStatus', 'Transcription failed', 'error');
    }
  }

  // UI Helpers
  function showAlert(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    element.classList.remove('loading', 'error', 'success');
    element.classList.add(type);
    element.textContent = message;
  }

  function showLoading(elementId, message) {
    const element = document.getElementById(elementId);
    element.classList.add('loading');
    element.textContent = `${message}...`;
  }
});