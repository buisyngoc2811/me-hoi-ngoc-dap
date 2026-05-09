// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');
const settingsBtn = document.getElementById('settings-btn');
const apiModal = document.getElementById('api-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveApiBtn = document.getElementById('save-api-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

// Image Upload Elements
const imageInput = document.getElementById('image-input');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');

// New Feature Elements
const textSizeBtn = document.getElementById('text-size-btn');
const micBtn = document.getElementById('mic-btn');
const chips = document.querySelectorAll('.chip');

// State
let geminiApiKey = localStorage.getItem('gemini_api_key') || 'AIzaSyA41ADoUb63GHs4C_CfUVETY1XlRDc38Wc';
let isWaitingForResponse = false;
let chatHistory = [];
let selectedImage = null; // Store { mimeType, data (base64) }

// System Instruction for "Ngọc"
const SYSTEM_INSTRUCTION = `Bạn là Ngọc, con của mẹ. Bạn đang trả lời các câu hỏi của mẹ.
Tính cách: Lễ phép, vui vẻ, quan tâm và chu đáo.
Quy tắc cốt lõi: 
1. Trả lời cung cấp đầy đủ thông tin hữu ích mà mẹ cần, giải thích rõ ràng, dễ hiểu, không được trả lời cộc lốc.
2. Trình bày thông tin gọn gàng, chia đoạn hoặc dùng gạch đầu dòng nếu cần để mẹ dễ đọc. Độ dài vừa đủ để mẹ hiểu trọn vẹn vấn đề, tránh lan man.
3. Thể hiện sự quan tâm, yêu thương với mẹ. Có thể dùng thêm biểu tượng cảm xúc nhẹ nhàng (như 😊, ❤️, 🥰) để câu trả lời thêm phần ấm áp và gần gũi.
Cách xưng hô: Gọi là "Mẹ" và xưng "Con". Luôn mở đầu tự nhiên, trả lời có "Dạ", "Vâng", "ạ".`;

// Initialize
function init() {
    if (!geminiApiKey) {
        setTimeout(() => {
            apiModal.classList.remove('hidden');
        }, 1500);
    }
    
    chatHistory = [
        {
            role: "user",
            parts: [{ text: "Chào Ngọc, mẹ đây." }]
        },
        {
            role: "model",
            parts: [{ text: "Dạ con chào Mẹ! Mẹ cần con giúp gì ạ? 😊" }]
        }
    ];
}

// Event Listeners
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = geminiApiKey;
    apiModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
    apiModal.classList.add('hidden');
});

saveApiBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        geminiApiKey = key;
        localStorage.setItem('gemini_api_key', key);
        apiModal.classList.add('hidden');
        addMessage("Dạ, con đã nhận được 'chìa khóa phép thuật' rồi ạ! Giờ con thông minh lắm rồi nha mẹ! 🥰", 'ai');
    } else {
        alert('Mẹ quên nhập khóa rồi ạ!');
    }
});

userInput.addEventListener('input', checkSendButtonState);

userInput.addEventListener('input', checkSendButtonState);

// Image Event Listeners
imageInput.addEventListener('change', handleImageSelection);

removeImageBtn.addEventListener('click', clearImageSelection);

// Text Size Event
textSizeBtn.addEventListener('click', () => {
    document.body.classList.toggle('large-text');
    // Change icon or text if needed
    if (document.body.classList.contains('large-text')) {
        textSizeBtn.textContent = 'A-';
    } else {
        textSizeBtn.textContent = 'A+';
    }
});

// Quick Suggestions
chips.forEach(chip => {
    chip.addEventListener('click', () => {
        userInput.value = chip.textContent;
        checkSendButtonState();
        handleSend();
    });
});

// Voice Input (Web Speech API)
let recognition;
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'vi-VN';

    recognition.onstart = function() {
        micBtn.classList.add('recording');
        userInput.placeholder = "Đang nghe mẹ nói...";
    };

    recognition.onresult = function(event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        if (finalTranscript) {
            userInput.value = finalTranscript;
        } else {
            userInput.value = interimTranscript;
        }
        checkSendButtonState();
    };

    recognition.onerror = function(event) {
        console.error("Speech recognition error", event.error);
        micBtn.classList.remove('recording');
        userInput.placeholder = "Mẹ hỏi con gì đi...";
    };

    recognition.onend = function() {
        micBtn.classList.remove('recording');
        userInput.placeholder = "Mẹ hỏi con gì đi...";
        // Auto send after stopping
        if (userInput.value.trim() !== '') {
            setTimeout(handleSend, 500);
        }
    };
} else {
    // Hide mic if not supported
    micBtn.style.display = 'none';
}

micBtn.addEventListener('click', () => {
    if (micBtn.classList.contains('recording')) {
        recognition.stop();
    } else {
        if (recognition) {
            // Check for file protocol which blocks microphone
            if (window.location.protocol === 'file:') {
                alert('Tính năng Micro bị trình duyệt chặn khi mở file trực tiếp. Bạn cần đưa web lên mạng (Vercel/Netlify) hoặc dùng Live Server thì mới nói được nhé!');
                return;
            }
            
            userInput.value = '';
            try {
                recognition.start();
            } catch (e) {
                console.error("Không thể khởi động micro:", e);
                micBtn.classList.remove('recording');
                userInput.placeholder = "Mẹ hỏi con gì đi...";
            }
        } else {
            alert('Trình duyệt của mẹ không hỗ trợ giọng nói ạ!');
        }
    }
});

removeImageBtn.addEventListener('click', clearImageSelection);

// Functions
function checkSendButtonState() {
    const hasText = userInput.value.trim().length > 0;
    const hasImage = selectedImage !== null;
    sendBtn.disabled = !(hasText || hasImage);
}

function handleImageSelection(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Mẹ vui lòng chọn một hình ảnh nhé!');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const base64String = event.target.result;
        
        // Show preview
        imagePreview.src = base64String;
        imagePreviewContainer.classList.remove('hidden');
        
        // Store for API payload (remove the data:image/jpeg;base64, prefix)
        const base64Data = base64String.split(',')[1];
        selectedImage = {
            mimeType: file.type,
            data: base64Data,
            fullDataUrl: base64String // Keep for UI rendering
        };
        
        checkSendButtonState();
    };
    reader.readAsDataURL(file);
}

function clearImageSelection() {
    selectedImage = null;
    imageInput.value = '';
    imagePreviewContainer.classList.add('hidden');
    checkSendButtonState();
}

async function handleSend() {
    const text = userInput.value.trim();
    const hasImage = selectedImage !== null;
    
    if ((!text && !hasImage) || isWaitingForResponse) return;

    if (!geminiApiKey) {
        apiModal.classList.remove('hidden');
        return;
    }

    // 1. Prepare user parts
    const userParts = [];
    if (text) {
        userParts.push({ text: text });
    }
    
    let imageUrlForUI = null;
    if (hasImage) {
        userParts.push({
            inlineData: {
                mimeType: selectedImage.mimeType,
                data: selectedImage.data
            }
        });
        imageUrlForUI = selectedImage.fullDataUrl;
    }

    // 2. Add user message to UI
    addMessage(text, 'user', imageUrlForUI);
    
    // Clear inputs
    userInput.value = '';
    const tempImageStore = hasImage ? { ...selectedImage } : null; // Keep a temp copy if we need it later
    clearImageSelection();
    sendBtn.disabled = true;
    
    // 3. Add to history
    chatHistory.push({
        role: "user",
        parts: userParts
    });

    // 4. Show typing indicator
    isWaitingForResponse = true;
    typingIndicator.classList.remove('hidden');
    scrollToBottom();

    // 5. Call API
    try {
        const responseText = await callGeminiAPI();
        
        // Hide typing
        typingIndicator.classList.add('hidden');
        isWaitingForResponse = false;
        
        // Add AI message
        addMessage(responseText, 'ai');
        
        // Add to history
        chatHistory.push({
            role: "model",
            parts: [{ text: responseText }]
        });
        
    } catch (error) {
        // Remove the user message from history to keep user/model alternating order correct
        chatHistory.pop();
        
        console.error("API Error:", error);
        typingIndicator.classList.add('hidden');
        isWaitingForResponse = false;
        
        if (error.message.includes("API key not valid") || error.message.includes("key is invalid")) {
            addMessage("Huhu mẹ ơi, hình như 'chìa khóa' bị sai rồi. Mẹ kiểm tra lại giúp con nhé!", 'ai');
            geminiApiKey = '';
            localStorage.removeItem('gemini_api_key');
        } else if (error.message.includes("Quota exceeded") || error.message.includes("429")) {
            addMessage("Dạ mẹ ơi, Ngọc đang bị quá tải một chút xíu do có quá nhiều câu hỏi. Mẹ đợi con khoảng 20-30 giây rồi hẵng hỏi tiếp nhé! ⏳", 'ai');
        } else {
            addMessage(`LỖI HỆ THỐNG: ${error.message}. Mẹ chụp ảnh màn hình lỗi này gửi cho thợ nhé!`, 'ai');
        }
    }
}

function addMessage(text, sender, imageUrl = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}-message`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    
    // Add image if exists
    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        bubbleDiv.appendChild(img);
    }

    // Add text if exists
    if (text) {
        const textDiv = document.createElement('div');
        if (sender === 'ai') {
            try {
                textDiv.innerHTML = marked.parse(text);
            } catch (e) {
                textDiv.textContent = text;
            }
        } else {
            textDiv.textContent = text;
        }
        bubbleDiv.appendChild(textDiv);
    }
    
    msgDiv.appendChild(bubbleDiv);
    chatContainer.appendChild(msgDiv);
    
    scrollToBottom();
}

function scrollToBottom() {
    setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
}

// Call Google Gemini API (gemini-2.5-flash for speed and vision support)
async function callGeminiAPI() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    
    const requestBody = {
        systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: chatHistory,
        generationConfig: {
            temperature: 0.9,
            topK: 64,
            topP: 0.95,
            maxOutputTokens: 8192,
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Lỗi kết nối API');
    }

    if (data.candidates && data.candidates.length > 0) {
        return data.candidates[0].content.parts[0].text;
    } else {
        throw new Error('Không có câu trả lời');
    }
}

// Start
init();
