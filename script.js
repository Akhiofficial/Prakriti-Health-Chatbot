const API_KEY = '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';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const PROXY_URL = 'http://localhost:3000/api/chat';

// Function to get API key from localStorage or prompt user
function getAPIKey() {
    let apiKey = localStorage.getItem('openrouter_api_key');
    if (!apiKey) {
        apiKey = API_KEY; // Use the default API key if none in localStorage
        localStorage.setItem('openrouter_api_key', apiKey);
    }
    return apiKey;
}

let isReadingEnabled = false; // Reading is initially disabled
let currentResponse = ''; // Store the most recent bot response for TTS
let isSpeaking = false; // Track if the bot is currently speaking
let selectedVoice = null; // Store selected voice
let voices = []; // Store available voices
let loadingVoice = false;

document.getElementById('voice-select').addEventListener('change', async (event) => {
    const selectedVoiceName = voices[event.target.value].name;
    loadingVoice = true;
    try {
        await loadVoice(selectedVoiceName);
        selectedVoice = voiceMap.get(selectedVoiceName);
        console.log(`Voice ${selectedVoiceName} loaded successfully`);
    } catch (error) {
        console.error(`Failed to load voice ${selectedVoiceName}:`, error);
        alert(`Failed to load the selected voice. Please try another one.`);
    } finally {
        loadingVoice = false;
    }
}); 

async function loadVoice(voiceName) {
    return new Promise((resolve, reject) => {
        const voice = speechSynthesis.getVoices().find(v => v.name === voiceName);
        if (!voice) {
            reject(new Error(`Voice ${voiceName} not found`));
            return;
        }

        const utterance = new SpeechSynthesisUtterance('');
        utterance.voice = voice;
        utterance.onend = () => resolve(voice);
        utterance.onerror = (event) => reject(new Error(`Error loading voice: ${event.error}`));
        speechSynthesis.speak(utterance);
    });
}

function preloadSpeechSynthesis() {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', preloadSpeechSynthesis);

function populateVoiceList() {
    const voices = speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    voiceSelect.innerHTML = '';

    voices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.setAttribute('data-voice-index', index);
        voiceSelect.appendChild(option);
    });

    // Set default voice if available
    if (voices.length > 0) {
        selectedVoice = voices[0];
        voiceSelect.selectedIndex = 0;
    }
}

// Ensure voices are loaded
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

document.getElementById('voice-select').addEventListener('change', (event) => {
    const selectedIndex = event.target.selectedOptions[0].getAttribute('data-voice-index');
    selectedVoice = speechSynthesis.getVoices()[selectedIndex];
});

// Load voices asynchronously
window.speechSynthesis.onvoiceschanged = populateVoiceList;

function appendMessage(message, isUser = false) {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', isUser ? 'user-message' : 'bot-message');
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    
    // Format the message with markdown or table support
    messageContent.innerHTML = formatMessage(message);

    if (!isUser) {
        const actionContainer = document.createElement('div');
        actionContainer.classList.add('response-actions');
        
        // Copy icon
        const copyButton = document.createElement('button');
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.classList.add('icon-btn', 'copy-btn');
        copyButton.title = "Copy"; // Tooltip
        copyButton.addEventListener('click', () => copyToClipboard(message));
        
        // Refresh icon
        const refreshButton = document.createElement('button');
        refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshButton.classList.add('icon-btn', 'refresh-btn');
        refreshButton.title = "Refresh"; // Tooltip
        refreshButton.addEventListener('click', async () => {
            const newResponse = await getResponseFromAPI(message);
            messageDiv.remove(); // Remove old response
            appendMessage(newResponse); // Append refreshed response
        });

          // Read button to toggle TTS
          const readButton = document.createElement('button');
          readButton.innerHTML = '<i class="fas fa-volume-up"></i>';
          readButton.classList.add('icon-btn', 'read-btn');
          readButton.title = "Read Message"; // Tooltip
          readButton.addEventListener('click', () => toggleReading(message, readButton));
  
          actionContainer.appendChild(copyButton);
          actionContainer.appendChild(refreshButton);
          actionContainer.appendChild(readButton);
          
          messageDiv.appendChild(messageContent);
          messageDiv.appendChild(actionContainer);
      } else {
          messageDiv.appendChild(messageContent);
      }

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Store the most recent bot message for TTS purposes
    if (!isUser) {
        currentResponse = message;
    }
}

function toggleReading(message, button) {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        button.innerHTML = '<i class="fas fa-volume-up"></i>';
        button.title = "Read Message";
    } else {
        speak(message, button);
        button.title = "Stop Reading";
    }
}

let voiceMap = new Map();

async function preloadVoices() {
    const availableVoices = await new Promise(resolve => {
        let voices = speechSynthesis.getVoices();
        if (voices.length) {
            resolve(voices);
        } else {
            speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
        }
    });

    for (const voice of availableVoices) {
        try {
            await loadVoice(voice.name);
            voiceMap.set(voice.name, voice);
            console.log(`Preloaded voice: ${voice.name}`);
        } catch (error) {
            console.error(`Failed to preload voice ${voice.name}:`, error);
        }
    }

    console.log("All voices preloaded");
    populateVoiceList();
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', () => {
    preloadVoices().then(() => {
        console.log("Voices preloaded");
        populateVoiceList();
    });
});

function cleanTextForSpeech(text) {
    return text
        .replace(/[*(){}[\]=+\-_]/g, '') // Remove symbols
        .replace(/\|/g, ', ') // Replace pipe with comma for better speech
        .replace(/\n/g, '. ') // Replace newlines with periods for pauses
        .replace(/\s+/g, ' ') // Remove extra spaces
        .trim(); // Trim leading and trailing whitespace
}

function speak(text, button) {
    if (!('speechSynthesis' in window)) {
        console.error("Speech synthesis not supported");
        alert("Speech synthesis is not supported in your browser.");
        return;
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const cleanedText = cleanTextForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;

    let speakingStarted = false;
    const timeoutId = setTimeout(() => {
        if (!speakingStarted) {
            console.error("Speech failed to start");
            button.innerHTML = '<i class="fas fa-volume-up"></i>';
            button.disabled = false;
            alert("Speech playback failed. Please try again.");
        }
    }, 5000);

    utterance.onstart = () => {
        speakingStarted = true;
        clearTimeout(timeoutId);
        button.innerHTML = '<i class="fas fa-stop"></i>';
        button.disabled = false;
        console.log("Speech started");
    };

    utterance.onend = () => {
        button.innerHTML = '<i class="fas fa-volume-up"></i>';
        button.disabled = false;
        console.log("Speech ended");
    };

    utterance.onerror = (event) => {
        console.error("Speech error:", event.error);
        button.innerHTML = '<i class="fas fa-volume-up"></i>';
        button.disabled = false;
        alert(`Speech error: ${event.error}. Please try again.`);
    };

    speechSynthesis.speak(utterance);
}
function copyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    alert('Response copied to clipboard!');
}

function formatMessage(message) {
    let formattedMessage = message
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold for **text**
        .replace(/__(.*?)__/g, '<em>$1</em>') // Italics for __text__
        .replace(/\n/g, '<br>'); // Newlines for paragraphs

    if (message.includes('|')) {
        formattedMessage = formatTable(message);
    }

    if (formattedMessage.includes('<li>')) {
        formattedMessage = `<ul>${formattedMessage}</ul>`;
    }

    return formattedMessage;
}

function formatTable(message) {
    const rows = message.trim().split('\n');
    let tableHTML = '<table><thead><tr>';

    const headers = rows[0].split('|').map(header => header.trim());
    headers.forEach(header => {
        tableHTML += `<th>${header}</th>`;
    });
    tableHTML += '</tr></thead><tbody>';

    rows.slice(2).forEach(row => {
        tableHTML += '<tr>';
        const cells = row.split('|').map(cell => cell.trim());
        cells.forEach(cell => {
            tableHTML += `<td>${cell}</td>`;
        });
        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table>';
    return tableHTML;
}

async function getResponseFromAPI(userInput) {
    const instruction = `
    You are a highly knowledgeable health assistant focusing on health, nutrition, wellness, mental health, and life.
    Provide accurate and empathetic responses to user health concerns and queries.`;

    const apiKey = getAPIKey();
    if (!apiKey) {
        return "Please enter a valid API key to continue.";
    }

    try {
        console.log('Sending request to OpenRouter API...');
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "google/gemini-pro",
                messages: [
                    {
                        role: "system",
                        content: instruction
                    },
                    {
                        role: "user",
                        content: userInput
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000,
                stream: false
            })
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            if (response.status === 401) {
                // Clear the invalid API key
                localStorage.removeItem('openrouter_api_key');
                return "Your API key is invalid or has expired. Please enter a new API key.";
            }
            const errorData = await response.json().catch(() => ({}));
            console.error('API Error:', errorData);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response:', data);

        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        } else {
            console.error('Invalid API response:', data);
            throw new Error('Invalid response format from API');
        }
    } catch (error) {
        console.error('Error:', error);
        if (error.message.includes('Failed to fetch')) {
            return "I apologize, but I'm having trouble connecting to the API. Please check your internet connection and try again.";
        }
        return "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.";
    }
}

async function handleUserInput(input = null) {
    const userInput = input || document.getElementById('user-input').value.trim();
    if (!userInput) return;

    document.getElementById('user-input').value = '';
    appendMessage(userInput, true);

    const thinkingDiv = showThinking();

    try {
        const response = await getResponseFromAPI(userInput);
        thinkingDiv.remove();
        appendMessage(response);
    } catch (error) {
        thinkingDiv.remove();
        appendMessage("I'm having trouble processing your request. Please try again later.");
    }
}

function showThinking() {
    const chatContainer = document.getElementById('chat-container');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.classList.add('thinking');
    thinkingDiv.innerHTML = `
        <i class="fas fa-robot thinking-icon"></i>
        <div class="thinking-content">
            <div class="thinking-dots">
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
            </div>
        </div>
    `;
    chatContainer.appendChild(thinkingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return thinkingDiv;
}

// Event Listeners
document.getElementById('send-btn').addEventListener('click', () => handleUserInput());
document.getElementById('user-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleUserInput();
    }
});

// Suggested questions functionality
document.querySelectorAll('.suggested-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        handleUserInput(btn.textContent);
    });
});

// Clear chat functionality
document.getElementById('clear-chat').addEventListener('click', () => {
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = '';
    appendMessage("Chat cleared! How can I help you?");
});

// Toggle theme functionality
document.getElementById('toggle-theme').addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const themeButton = document.getElementById('toggle-theme');
    const icon = themeButton.querySelector('i');
    if (document.body.classList.contains('dark-theme')) {
        icon.classList.replace('fa-moon', 'fa-sun');
    } else {
        icon.classList.replace('fa-sun', 'fa-moon');
    }
});

// Initialize chat with a welcome message
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('chat-container').innerHTML = '';
    appendMessage("Hello! I'm your Prakriti Health Assistant. How can I help you today?");
});

// Check for browser support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();

// Set the language based on user selection or default to English
function setRecognitionLanguage(lang = 'en-US') {
    recognition.lang = lang;
}

// Start speech recognition
function startVoiceRecognition() {
    recognition.start();
     // Show some UI indication that voice input is active
     document.getElementById('voice-input-btn').classList.add('active');

}

// Handle speech recognition results
recognition.onresult = function(event) {
    const userInput = event.results[0][0].transcript;
    document.getElementById('user-input').value = userInput;
    handleUserInput(userInput);
    document.getElementById('voice-input-btn').classList.remove('active');
};


// Handle errors
recognition.onerror = function(event) {
    console.error('Speech recognition error:', event.error);
    document.getElementById('voice-input-btn').classList.remove('active');
    alert('Speech recognition error. Please try again.');
};

// Optional: Stop recognition after the user speaks
recognition.onend = function() {
    document.getElementById('voice-input-btn').classList.remove('active');
};

// Event listener for voice input button
document.getElementById('voice-input-btn').addEventListener('click', () => {
    const selectedLang = document.getElementById('voice-select').selectedOptions[0].getAttribute('data-lang');
    setRecognitionLanguage(selectedLang);
    startVoiceRecognition();
});

// Update recognition language when voice is changed
document.getElementById('voice-select').addEventListener('change', (event) => {
    const selectedLang = event.target.selectedOptions[0].getAttribute('data-lang');
    setRecognitionLanguage(selectedLang);
});

