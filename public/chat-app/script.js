/* =====================================================================
 * ChatSphere Chat Client (text + video)
 *
 * Adapted from public.zip/script.js with the following changes:
 *  - Firebase auth removed (no signup wall — go straight from interests to chat)
 *  - DOM ids aligned with the new chat.html / video.html shells
 *  - Both text-only and video modes share the same logic; the page decides
 *    whether to acquire webcam by passing ?mode=chat or ?mode=video in URL.
 *  - Public TURN/STUN-only configuration (the metered TURN credentials from
 *    public.zip were third-party test creds and have been removed to avoid
 *    abuse; falls back to Google + Mozilla STUN, which still works on most
 *    networks for peer-to-peer video).
 * ===================================================================== */

(() => {
  // -------------------- Config --------------------
  const PRESET_INTERESTS = [
    'music', 'sports', 'movies', 'gaming', 'technology',
    'art', 'travel', 'books', 'cooking', 'anime',
    'science', 'fitness', 'photography', 'memes', 'politics'
  ];

  const RTC_CONFIGS = [
    {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    },
    {
      iceServers: [
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:stun.stunprotocol.org:3478' }
      ]
    },
    {
      iceServers: [
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  ];

  // -------------------- State --------------------
  const isVideoPage = location.pathname.endsWith('/video.html') ||
                      new URLSearchParams(location.search).get('mode') === 'video';

  let localStream = null;
  let peerConnection = null;
  let userLocation = { country: 'Unknown', countryCode: 'UN' };
  let isInitiator = false;
  let connectionAttempts = 0;
  let iceCandidatesQueue = [];
  let isRemoteDescSet = false;
  let currentConfigIndex = 0;
  let partnerId = null;
  let selectedInterests = [];
  let isLocalAudioMuted = false;
  let isLocalVideoOff = false;
  let isRemoteAudioMuted = false;
  let typingTimeout = null;
  let lastTypingEmit = 0;

  // -------------------- DOM refs --------------------
  const $ = (id) => document.getElementById(id);
  const interestCard    = $('interestCard');
  const interestGrid    = $('interestGrid');
  const interestCustom   = $('interestCustomInput');
  const addInterestBtn  = $('addInterestBtn');
  const startChatBtn     = $('startChatBtn');
  const chatArea         = $('chatArea');
  const partnerBar       = $('partnerBar');
  const partnerFlag      = $('partnerFlag');
  const partnerCountry   = $('partnerCountry');
  const sharedInterests  = $('sharedInterests');
  const partnerStatus    = $('partnerStatus');
  const chatBox          = $('chatBox');
  const chatInput        = $('chatInput');
  const sendBtn          = $('sendBtn');
  const newMatchBtn      = $('newMatchBtn');
  const skipBtn          = $('skipBtn');
  const attachmentBtn    = $('attachmentBtn');
  const fileInput        = $('fileInput');
  const onlineCount      = $('onlineCount');
  const typingIndicator  = $('typingIndicator');
  const localVideo       = $('localVideo');
  const remoteVideo      = $('remoteVideo');
  const localAudioToggle = $('localAudioToggle');
  const localVideoToggle = $('localVideoToggle');
  const remoteAudioToggle = $('remoteAudioToggle');
  const videoCard        = $('videoCard');

  // New toolbar elements (chat.html only — absent on video.html)
  const matchCountrySelect = $('matchCountry');
  const autoNextToggle     = $('autoNextToggle');
  const autoMessageToggle  = $('autoMessageToggle');
  const autoMessageText    = $('autoMessageText');
  const strangerScore      = $('strangerScore');
  const upvoteBtn          = $('upvoteBtn');
  const downvoteBtn        = $('downvoteBtn');
  const strangerCountryPill = $('strangerCountryPill');
  const strangerCountryName = $('strangerCountryName');
  const strangerCountryFlag = $('strangerCountryFlag');
  const sessionTimerEl     = $('sessionTimer');

  // Video page deck buttons + their popups (video.html only — absent on chat.html)
  const countryBtn         = $('countryBtn');
  const premiumBtn         = $('premiumBtn');
  const iamBtn             = $('iamBtn');
  const settingsBtn        = $('settingsBtn');
  const countryPopup       = $('countryPopup');
  const iamPopup           = $('iamPopup');
  const premiumPopup       = $('premiumPopup');
  const settingsPopup      = $('settingsPopup');
  const popupMatchCountry  = $('popupMatchCountry');
  const countryApplyBtn    = $('countryApplyBtn');
  const iamChips           = $('iamChips');
  const lookingChips       = $('lookingChips');
  const settingsThemeToggle  = $('settingsThemeToggle');
  const settingsAutoNext     = $('settingsAutoNext');
  const settingsAutoMessage  = $('settingsAutoMessage');
  const settingsAutoMessageText = $('settingsAutoMessageText');
  const settingsCameraDefault = $('settingsCameraDefault');
  const settingsMicDefault    = $('settingsMicDefault');

  // State for toolbar features
  let strangerScoreValue = 0;
  let sessionStartTs = 0;
  let sessionTimerInterval = null;
  let isAutoNextOn = false;
  let isAutoMessageOn = false;

  // New filter state (video page deck popups) — persisted in localStorage
  let matchCountryFilter = '';   // ISO country code or '' for any
  let identityValue       = '';  // male / female / couple / nonbinary
  let lookingForValue     = 'anyone';

  const socket = io();

  // -------------------- Build interest chips --------------------
  function renderInterestChips() {
    if (!interestGrid) return;
    interestGrid.innerHTML = '';
    PRESET_INTERESTS.forEach(name => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'interest-chip';
      chip.dataset.value = name;
      chip.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      chip.addEventListener('click', () => toggleInterest(chip, name));
      interestGrid.appendChild(chip);
    });
  }

  function toggleInterest(chipEl, value) {
    const idx = selectedInterests.indexOf(value);
    if (idx === -1) {
      selectedInterests.push(value);
      chipEl.classList.add('selected');
    } else {
      selectedInterests.splice(idx, 1);
      chipEl.classList.remove('selected');
    }
  }

  if (addInterestBtn) {
    addInterestBtn.addEventListener('click', () => {
      const val = (interestCustom.value || '').trim().toLowerCase();
      if (!val) return;
      if (selectedInterests.includes(val)) { interestCustom.value = ''; return; }
      // Add as a custom chip if not already in preset
      if (!PRESET_INTERESTS.includes(val)) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'interest-chip selected';
        chip.dataset.value = val;
        chip.innerHTML = `${val} <span class="chip-x">×</span>`;
        chip.addEventListener('click', () => {
          const idx = selectedInterests.indexOf(val);
          if (idx !== -1) selectedInterests.splice(idx, 1);
          chip.remove();
        });
        interestGrid.appendChild(chip);
      } else {
        // Just toggle the preset chip
        const presetChip = interestGrid.querySelector(`[data-value="${val}"]`);
        if (presetChip && !presetChip.classList.contains('selected')) {
          presetChip.classList.add('selected');
        }
      }
      selectedInterests.push(val);
      interestCustom.value = '';
    });
    interestCustom.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addInterestBtn.click(); }
    });
  }

  // -------------------- Geolocation --------------------
  // Map an ISO alpha-2 code ("BD") to its English country name ("Bangladesh")
  // using the browser-native Intl API (Chrome 81+, Firefox 86+, Safari 14.1+).
  function codeToCountryName(code) {
    const cc = String(code || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc) || cc === 'UN') return 'Unknown';
    try {
      const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(cc);
      if (name && name !== cc && name.toLowerCase() !== 'unknown') return name;
    } catch (_) { /* Intl.DisplayNames unavailable on this browser */ }
    return 'Unknown';
  }
  async function getUserLocation() {
    // Provider order: full name+code first, code-only provider last.
    const services = [
      'https://ipapi.co/json/',    // returns country_name + country_code
      'https://ipwho.is/',         // free, no key — returns country + country_code
      'https://ipinfo.io/json'     // FREE TIER RETURNS ONLY THE ISO CODE
    ];
    for (const service of services) {
      try {
        const response = await fetch(service);
        const data = await response.json();
        if (service.includes('ipapi.co') && !data.error) {
          return {
            country: data.country_name || codeToCountryName(data.country),
            countryCode: data.country_code || data.country || 'UN'
          };
        } else if (service.includes('ipwho.is') && data.success !== false && data.country) {
          return {
            country: data.country || codeToCountryName(data.country_code),
            countryCode: data.country_code || 'UN'
          };
        } else if (service.includes('ipinfo.io') && data.country) {
          // ⚠ ipinfo.io's data.country is the ISO alpha-2 CODE ("BD"), not the
          // name. Sending it as `country` made the pill show "Stranger is from
          // BD". Resolve the real name locally instead.
          const cc = String(data.country || '').toUpperCase();
          return {
            country: codeToCountryName(cc),
            countryCode: cc || 'UN'
          };
        }
      } catch (error) {
        console.warn(`Failed to get location from ${service}:`, error);
        continue;
      }
    }
    return { country: 'Unknown', countryCode: 'UN' };
  }

  window.addEventListener('load', async () => {
    userLocation = await getUserLocation().catch(() => ({ country: 'Unknown', countryCode: 'UN' }));
    console.log('User location detected:', userLocation);
  });

  // -------------------- Online count --------------------
  socket.on('onlineCount', (count) => {
    if (!onlineCount) return;
    // On the video page the markup is `<strong id="onlineCount">0</strong> online`
    // so we just set the number; on chat.html it's `<span id="onlineCount">0 online</span>`.
    if (isVideoPage) {
      onlineCount.textContent = count.toLocaleString();
    } else {
      onlineCount.textContent = `${count} online`;
    }
  });

  // -------------------- Start chat (from interest card) --------------------
  if (startChatBtn) {
    startChatBtn.addEventListener('click', async () => {
      // On the video page we allow starting without picking interests —
      // the server falls back to "match with any waiting user" when interests
      // are empty, which is the ChatSphere.com-style random-match UX.
      if (!isVideoPage && selectedInterests.length === 0) {
        alert('Please pick at least one interest so we can find you a like-minded stranger.');
        return;
      }

      if (interestCard) interestCard.style.display = 'none';
      if (chatArea) chatArea.classList.add('active');
      // Show the bottom-pinned input bar on chat.html (scoped CSS: body.chat-page.chat-active)
      document.body.classList.add('chat-active');

      // Enable the Stop / Skip button now that chat has started
      if (skipBtn) skipBtn.disabled = false;

      // For video page: acquire webcam (respecting camera/mic defaults from Settings)
      if (isVideoPage) {
        // Re-read defaults at click-time in case Settings changed since page load
        let camOn = true, micOn = true;
        try {
          if (window.localStorage.getItem('ChatSphere_cam_default') === 'off') camOn = false;
          if (window.localStorage.getItem('ChatSphere_mic_default') === 'off') micOn = false;
        } catch (_) {}
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: camOn ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.7777 } : false,
            audio: micOn
          });
          if (localVideo) localVideo.srcObject = localStream;
          // Reflect mic/cam state on the toggle buttons
          if (!camOn && localVideoToggle) {
            isLocalVideoOff = true;
            const icon = localVideoToggle.querySelector('i');
            if (icon) icon.className = 'bi bi-camera-video-off-fill';
            localVideoToggle.classList.add('off');
            localVideoToggle.title = 'Turn camera on';
          }
          if (!micOn && localAudioToggle) {
            isLocalAudioMuted = true;
            const icon = localAudioToggle.querySelector('i');
            if (icon) icon.className = 'bi bi-mic-mute-fill';
            localAudioToggle.classList.add('muted');
            localAudioToggle.title = 'Unmute mic';
          }
        } catch (err) {
          alert('Could not access webcam/mic: ' + err.message + '\nYou can still use text chat.');
          if (videoCard) videoCard.style.display = 'none';
        }
      } else {
        // Text-only chat — hide video card entirely
        if (videoCard) videoCard.style.display = 'none';
      }

      socket.emit('setInterests', {
        interests: selectedInterests,
        location: userLocation,
        matchCountry: matchCountryFilter || (matchCountrySelect ? matchCountrySelect.value : ''),
        identity: identityValue,
        lookingFor: lookingForValue
      });
      setSearching();
    });
  }

  // -------------------- Searching / partner UI --------------------
  function setSearching() {
    if (partnerBar) partnerBar.style.display = 'flex';
    if (partnerStatus) {
      partnerStatus.style.display = 'flex';
      partnerStatus.style.justifyContent = 'center';
      partnerStatus.style.alignItems = 'center';
      partnerStatus.style.textAlign = 'center';
      partnerStatus.innerHTML = `<span class="status-searching">Looking for a stranger who shares your interests…</span>`;
    }
    if (partnerFlag) partnerFlag.style.display = 'none';
    if (partnerCountry) partnerCountry.textContent = '';
    if (sharedInterests) sharedInterests.innerHTML = '';
    if (chatBox) {
      chatBox.innerHTML = '';
      // On the video page there's no visible partner bar, so surface the
      // searching status as a system line inside the chat box itself.
      appendSystem('Looking for a stranger…');
    }
    // Reset toolbar overlays for the search state
    stopSessionTimer();
    hideStrangerPill();
    resetStrangerScore();
    hideTypingIndicator();
  }

  function setPartner(data) {
    partnerId = data.id;
    if (partnerBar) partnerBar.style.display = 'flex';
    if (partnerStatus) partnerStatus.innerHTML = '';
    if (partnerFlag) {
      partnerFlag.style.display = 'inline-flex';
      const img = partnerFlag.querySelector('img');
      if (img) img.src = `https://flagcdn.com/32x24/${(data.countryCode || 'UN').toLowerCase()}.png`;
    }
    if (partnerCountry) {
      partnerCountry.innerHTML = `You're now chatting with a stranger
        <small>From ${data.country || 'Unknown'}</small>`;
    }
    if (sharedInterests && Array.isArray(data.interests) && data.interests.length) {
      sharedInterests.innerHTML = data.interests.map(i =>
        `<span class="chip">${escapeHtml(i)}</span>`).join('');
    } else if (sharedInterests) {
      sharedInterests.innerHTML = '';
    }

    // Reset WebRTC + chat
    if (peerConnection) { try { peerConnection.close(); } catch (_) {} peerConnection = null; }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (chatBox) chatBox.innerHTML = '';
    connectionAttempts = 0;
    currentConfigIndex = 0;
    iceCandidatesQueue = [];
    isRemoteDescSet = false;
    resetVideoControls();

    // Show the floating "Stranger is from X" pill (chat.html only)
    showStrangerPill(data.country || 'Unknown', data.countryCode || 'UN');

    // Start the session timer (chat.html only)
    startSessionTimer();

    // Reset the stranger score for the new session
    resetStrangerScore();

    // Fresh session — clear any stale typing indicator
    hideTypingIndicator();

    // Only initiate WebRTC if we have local media (video page)
    if (localStream && isVideoPage) {
      // Deterministic initiator: lower socket.id goes first
      if (socket.id && partnerId && socket.id.localeCompare(partnerId) < 0) {
        isInitiator = true;
        initiateCall(0);
      } else {
        isInitiator = false;
        createPeerConnection(0);
      }
    }
    appendSystem(`Connected — say hi! (Be Respectful.)`);
    // On the video page the partner bar is hidden; surface the partner's
    // country as a system line in the chat box so the user has context.
    // Uses a real flagcdn.com image (NOT an emoji) — Windows cannot render
    // country-flag emoji and would show the letters "BD" instead of the flag.
    if (isVideoPage && data.country && data.country !== 'Unknown') {
      appendSystemHtml(`Stranger is from <b>${escapeHtml(data.country)}</b> ${flagImgHtml(data.countryCode)}`);
    }

    // Auto-message: if the toggle is on and text isn't empty, send it now
    if (isAutoMessageOn && autoMessageText && autoMessageText.value.trim()) {
      const autoText = autoMessageText.value.trim();
      setTimeout(() => {
        socket.emit('chatMessage', { text: autoText });
        appendMessage(autoText, 'user');
      }, 350); // tiny delay so the partner's chat box is mounted first
    }
  }

  // -------------------- Socket event handlers --------------------
  socket.on('partner', setPartner);

  socket.on('partner-left', () => {
    if (peerConnection) { try { peerConnection.close(); } catch (_) {} peerConnection = null; }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (partnerStatus) {
      partnerStatus.innerHTML = `<span class="status-searching">Stranger left. Click "Next" to find someone else.</span>`;
    }
    if (partnerFlag) partnerFlag.style.display = 'none';
    if (partnerCountry) partnerCountry.textContent = '';
    if (sharedInterests) sharedInterests.innerHTML = '';
    appendSystem('Stranger disconnected.');
    resetVideoControls();
    // Stop timer + hide pill + hide typing indicator on partner leave
    stopSessionTimer();
    hideStrangerPill();
    hideTypingIndicator();
    // Auto-next: if the toggle is on, immediately search for a new stranger
    if (isAutoNextOn) {
      setTimeout(() => requestNewMatch(), 500);
    }
  });

  socket.on('searching', () => setSearching());

  socket.on('clearChat', () => {
    if (chatBox) chatBox.innerHTML = '';
  });

  // -------------------- Typing indicator --------------------
  // Subtle floating pill: "Stranger is typing" + three bouncing dots.
  // The dots act as the animated ellipsis.
  function hideTypingIndicator() {
    if (!typingIndicator) return;
    typingIndicator.style.display = 'none';
    typingIndicator.innerHTML = '';
  }
  socket.on('typing', (isTyping) => {
    if (!typingIndicator) return;
    if (isTyping) {
      typingIndicator.innerHTML =
        'Stranger is typing' +
        '<span class="typing-dots"><span></span><span></span><span></span></span>';
      typingIndicator.style.display = 'flex';
    } else {
      hideTypingIndicator();
    }
  });

  // -------------------- New match / skip --------------------
  if (newMatchBtn) {
    newMatchBtn.addEventListener('click', () => requestNewMatch());
  }
  if (skipBtn) {
    skipBtn.addEventListener('click', () => requestNewMatch());
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatArea && chatArea.classList.contains('active')) {
      requestNewMatch();
    }
  });

  function requestNewMatch() {
    if (peerConnection) { try { peerConnection.close(); } catch (_) {} peerConnection = null; }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (chatBox) chatBox.innerHTML = '';
    if (partnerFlag) partnerFlag.style.display = 'none';
    if (partnerCountry) partnerCountry.textContent = '';
    if (sharedInterests) sharedInterests.innerHTML = '';
    connectionAttempts = 0;
    currentConfigIndex = 0;
    iceCandidatesQueue = [];
    isRemoteDescSet = false;
    resetVideoControls();
    setSearching();
    // Re-send the user's CURRENT filter selections (country dropdown, I am /
    // Looking for chips) so mid-session filter changes apply to this next
    // match. Without this, the server would reuse the values captured at
    // connect time and ignore everything the user changed afterwards.
    socket.emit('newMatch', {
      matchCountry: matchCountryFilter || (matchCountrySelect ? matchCountrySelect.value : ''),
      identity: identityValue,
      lookingFor: lookingForValue
    });
  }

  // -------------------- WebRTC --------------------
  function createPeerConnection(configIndex = 0) {
    currentConfigIndex = configIndex;
    if (peerConnection) { try { peerConnection.close(); } catch (_) {} }
    const config = RTC_CONFIGS[configIndex] || RTC_CONFIGS[0];
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
        console.log('Added local track:', track.kind);
      });
    }

    peerConnection.onicecandidate = event => {
      socket.emit('signal', {
        type: 'ice-candidate',
        candidate: event.candidate || null
      });
    };

    peerConnection.ontrack = event => {
      console.log('Received remote track');
      if (event.streams[0] && event.streams[0].getTracks().length > 0) {
        if (remoteVideo) {
          remoteVideo.srcObject = event.streams[0];
          remoteVideo.play().catch(e => console.error('Error playing remote video:', e));
        }
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log('ICE state:', state);
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        if (connectionAttempts < RTC_CONFIGS.length - 1 && isInitiator) {
          connectionAttempts++;
          console.log(`Retrying with config ${connectionAttempts}`);
          setTimeout(() => initiateCall(connectionAttempts), 800);
        }
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
    };
  }

  async function initiateCall(configIndex = 0) {
    isInitiator = true;
    createPeerConnection(configIndex);
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);
      socket.emit('signal', { type: 'offer', sdp: peerConnection.localDescription });
    } catch (err) {
      console.error('Error in initiateCall:', err);
    }
  }

  socket.on('signal', async (data) => {
    if (!peerConnection) {
      // If we receive an offer but have no PC yet, create one as the callee
      if (data.type === 'offer' && localStream && isVideoPage) {
        createPeerConnection(0);
      } else {
        return;
      }
    }
    try {
      if (data.type === 'offer') {
        if (isInitiator) return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        isRemoteDescSet = true;
        while (iceCandidatesQueue.length) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidatesQueue.shift()));
        }
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { type: 'answer', sdp: peerConnection.localDescription });
      } else if (data.type === 'answer') {
        if (!isInitiator) return;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        isRemoteDescSet = true;
        while (iceCandidatesQueue.length) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidatesQueue.shift()));
        }
      } else if (data.type === 'ice-candidate') {
        if (data.candidate) {
          if (isRemoteDescSet) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            iceCandidatesQueue.push(data.candidate);
          }
        }
      } else if (data.type === 'audio-state' || data.type === 'video-state') {
        handlePartnerStateChange(data);
      }
    } catch (err) {
      console.error('Signal handling error:', err);
    }
  });

  // -------------------- Text chat --------------------
  // Classic ChatSphere format: left-aligned rows with colored label.
  //   Stranger: <text>   (label red, text in --ink)
  //   You:      <text>   (label blue, text in --ink)
  // Sent ("You:") messages carry a read receipt: a subtle gray single check
  // (✓ delivered) that turns into a blue double check (✓✓ read) once the
  // partner renders the message.
  function makeReadReceipt() {
    const receipt = document.createElement('span');
    receipt.className = 'read-receipt';
    receipt.title = 'Delivered';
    receipt.innerHTML = '<i class="bi bi-check2"></i>';
    return receipt;
  }

  function appendMessage(text, type = 'system') {
    if (!chatBox) return;
    const div = document.createElement('div');
    div.className = `message ${type}`;
    if (type === 'user' || type === 'stranger') {
      const label = document.createElement('span');
      label.className = 'msg-label';
      label.textContent = (type === 'user') ? 'You:' : 'Stranger:';
      const body = document.createElement('span');
      body.className = 'msg-text';
      body.textContent = ' ' + text;
      div.appendChild(label);
      div.appendChild(body);
      if (type === 'user') div.appendChild(makeReadReceipt());
    } else {
      // system / status — keep simple text
      div.textContent = text;
    }
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  function appendSystem(text) { appendMessage(text, 'system'); }
  // System line that may contain inline HTML (e.g. the flagcdn <img>), for
  // messages where a plain-text emoji flag would be invisible on Windows.
  function appendSystemHtml(html) {
    if (!chatBox) return;
    const div = document.createElement('div');
    div.className = 'message system';
    div.innerHTML = html;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function appendFileMessage(fileInfo, type) {
    if (!chatBox) return;
    // Normalize the type: callers historically used two different strings
    // ('user' from the sender path, 'user-message' from other paths) for the
    // same semantic — "this is the local user's own outgoing attachment". If
    // we don't normalize, the label falls through to "Stranger:" on the
    // sender's own file, the wrapper class becomes 'stranger' instead of
    // 'user', and no read-receipt is appended. Treat both as the same.
    const isOwn = (type === 'user' || type === 'user-message');
    const div = document.createElement('div');
    div.className = `message file ${isOwn ? 'user' : 'stranger'}`;

    // Always start with the colored label so file rows match the chat style
    const label = document.createElement('span');
    label.className = 'msg-label';
    label.textContent = isOwn ? 'You:' : 'Stranger:';
    div.appendChild(label);

    const body = document.createElement('span');
    body.className = 'file-body';

    if (fileInfo.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = fileInfo.url;
      img.onclick = () => viewFullscreen(fileInfo.url, fileInfo.name, 'image');
      body.appendChild(img);
    } else if (fileInfo.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.src = fileInfo.url;
      v.controls = true;
      v.onclick = () => viewFullscreen(fileInfo.url, fileInfo.name, 'video');
      body.appendChild(v);
    } else if (fileInfo.type === 'application/pdf') {
      const a = document.createElement('a');
      a.href = fileInfo.url;
      a.textContent = `📄 ${fileInfo.name}`;
      a.onclick = (e) => { e.preventDefault(); viewFullscreen(fileInfo.url, fileInfo.name, 'pdf'); };
      body.appendChild(a);
    } else {
      const a = document.createElement('a');
      a.href = fileInfo.url;
      a.download = fileInfo.name;
      a.textContent = `📎 ${fileInfo.name} (${(fileInfo.size / 1024 / 1024).toFixed(2)} MB)`;
      body.appendChild(a);
    }
    div.appendChild(body);
    if (isOwn) div.appendChild(makeReadReceipt());
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('chatMessage', { text });
    appendMessage(text, 'user');
    chatInput.value = '';
    // Stop "is typing"
    socket.emit('typing', false);
  }

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { sendMessage(); return; }
    });
    chatInput.addEventListener('input', () => {
      const now = Date.now();
      if (now - lastTypingEmit > 1200) {
        lastTypingEmit = now;
        socket.emit('typing', true);
      }
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
        lastTypingEmit = 0;
      }, 1400);
    });
  }

  socket.on('chatMessage', (data) => {
    if (data.file) {
      const blob = new Blob([data.file.data], { type: data.file.type });
      const url = URL.createObjectURL(blob);
      appendFileMessage({ ...data.file, url }, 'stranger');
    } else if (data.text) {
      appendMessage(data.text, 'stranger');
    }
    // Read receipts: we just rendered the partner's message, so they have
    // "seen" everything up to this point. Notify them (visibility-aware —
    // if the tab is hidden we hold the ack until the user actually looks).
    notifySeen();
  });

  // -------------------- Read receipts --------------------
  // RECEIVING SIDE: called whenever we render a partner message.
  // If the tab is visible → emit 'message-seen' (throttled to 400ms so a
  // burst of messages only acks once). If hidden → set a pending flag and
  // ack on the visibilitychange event when the user returns to the tab.
  let lastSeenEmit = 0;
  let seenPending = false;
  let seenTimeout = null;
  function notifySeen() {
    if (document.visibilityState === 'visible') {
      seenPending = false;
      const now = Date.now();
      const wait = Math.max(0, 400 - (now - lastSeenEmit));
      clearTimeout(seenTimeout);
      seenTimeout = setTimeout(() => {
        lastSeenEmit = Date.now();
        socket.emit('message-seen');
      }, wait);
    } else {
      seenPending = true;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && seenPending) {
      seenPending = false;
      clearTimeout(seenTimeout);
      seenTimeout = setTimeout(() => {
        lastSeenEmit = Date.now();
        socket.emit('message-seen');
      }, 150);
    }
  });

  // SENDING SIDE: partner confirmed they saw our messages → flip every
  // still-unread ✓ (delivered) on our sent lines into a blue ✓✓ (read).
  socket.on('message-seen', () => {
    if (!chatBox) return;
    chatBox.querySelectorAll('.read-receipt:not(.read)').forEach(receipt => {
      receipt.classList.add('read');
      receipt.title = 'Read';
      receipt.innerHTML = '<i class="bi bi-check2-all"></i>';
    });
  });

  // -------------------- File attachment --------------------
  if (attachmentBtn) attachmentBtn.addEventListener('click', () => fileInput && fileInput.click());

  if (fileInput) fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 80 * 1024 * 1024) {
      if (!confirm('File is large (>80MB) and may take time to send. Continue?')) {
        fileInput.value = '';
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      const blob = new Blob([arrayBuffer], { type: file.type });
      const url = URL.createObjectURL(blob);

      socket.emit('chatMessage', {
        file: { name: file.name, type: file.type, size: file.size, data: arrayBuffer }
      });
      appendFileMessage({ name: file.name, type: file.type, size: file.size, url }, 'user');
      fileInput.value = '';
    };
    reader.readAsArrayBuffer(file);
  });

  // -------------------- Video controls --------------------
  if (localAudioToggle) {
    localAudioToggle.addEventListener('click', toggleLocalAudio);
  }
  if (localVideoToggle) {
    localVideoToggle.addEventListener('click', toggleLocalVideo);
  }
  if (remoteAudioToggle) {
    remoteAudioToggle.addEventListener('click', toggleRemoteAudio);
  }

  function toggleLocalAudio() {
    if (!localStream) return;
    const tracks = localStream.getAudioTracks();
    if (!tracks.length) return;
    isLocalAudioMuted = !isLocalAudioMuted;
    tracks[0].enabled = !isLocalAudioMuted;
    const btn = localAudioToggle;
    const icon = btn.querySelector('i');
    if (isLocalAudioMuted) {
      icon.className = 'bi bi-mic-mute-fill';
      btn.classList.add('muted');
      btn.title = 'Unmute mic';
    } else {
      icon.className = 'bi bi-mic-fill';
      btn.classList.remove('muted');
      btn.title = 'Mute mic';
    }
    if (peerConnection) {
      socket.emit('signal', { type: 'audio-state', isMuted: isLocalAudioMuted });
    }
  }

  function toggleLocalVideo() {
    if (!localStream) return;
    const tracks = localStream.getVideoTracks();
    if (!tracks.length) return;
    isLocalVideoOff = !isLocalVideoOff;
    tracks[0].enabled = !isLocalVideoOff;
    const btn = localVideoToggle;
    const icon = btn.querySelector('i');
    if (isLocalVideoOff) {
      icon.className = 'bi bi-camera-video-off-fill';
      btn.classList.add('off');
      btn.title = 'Turn camera on';
    } else {
      icon.className = 'bi bi-camera-video-fill';
      btn.classList.remove('off');
      btn.title = 'Turn camera off';
    }
    if (peerConnection) {
      socket.emit('signal', { type: 'video-state', isOff: isLocalVideoOff });
    }
  }

  function toggleRemoteAudio() {
    isRemoteAudioMuted = !isRemoteAudioMuted;
    if (remoteVideo) remoteVideo.muted = isRemoteAudioMuted;
    const btn = remoteAudioToggle;
    const icon = btn.querySelector('i');
    if (isRemoteAudioMuted) {
      icon.className = 'bi bi-volume-mute-fill';
      btn.classList.add('muted');
      btn.title = "Unmute partner's audio";
    } else {
      icon.className = 'bi bi-volume-up-fill';
      btn.classList.remove('muted');
      btn.title = "Mute partner's audio";
    }
  }

  function handlePartnerStateChange(data) {
    if (data.type === 'video-state') {
      if (data.isOff) {
        appendSystem('Stranger turned off their camera.');
      } else {
        appendSystem('Stranger turned on their camera.');
      }
    }
  }

  function resetVideoControls() {
    isLocalAudioMuted = false;
    isLocalVideoOff = false;
    isRemoteAudioMuted = false;
    if (localAudioToggle) {
      localAudioToggle.querySelector('i').className = 'bi bi-mic-fill';
      localAudioToggle.classList.remove('muted');
    }
    if (localVideoToggle) {
      localVideoToggle.querySelector('i').className = 'bi bi-camera-video-fill';
      localVideoToggle.classList.remove('off');
    }
    if (remoteAudioToggle) {
      remoteAudioToggle.querySelector('i').className = 'bi bi-volume-up-fill';
      remoteAudioToggle.classList.remove('muted');
    }
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = true);
      localStream.getVideoTracks().forEach(t => t.enabled = true);
    }
  }

  // -------------------- Fullscreen viewer --------------------
  function viewFullscreen(src, name, kind) {
    const modal = document.createElement('div');
    modal.className = 'fs-modal';
    modal.innerHTML = `
      <button class="fs-close" aria-label="Close">&times;</button>
      <div class="fs-inner"></div>
    `;
    const inner = modal.querySelector('.fs-inner');
    let el;
    if (kind === 'image') {
      el = document.createElement('img');
      el.src = src;
    } else if (kind === 'video') {
      el = document.createElement('video');
      el.src = src;
      el.controls = true;
      el.autoplay = true;
    } else if (kind === 'pdf') {
      el = document.createElement('iframe');
      el.src = src;
    }
    inner.appendChild(el);
    const title = document.createElement('div');
    title.className = 'fs-title';
    title.textContent = name;
    inner.appendChild(title);

    const dl = document.createElement('a');
    dl.href = src;
    dl.download = name;
    dl.className = 'btn btn-secondary';
    dl.textContent = 'Download';
    inner.appendChild(dl);

    modal.querySelector('.fs-close').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(modal);
  }

  // -------------------- Helpers --------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // -------------------- Session timer --------------------
  function startSessionTimer() {
    if (!sessionTimerEl) return;
    stopSessionTimer();
    sessionStartTs = Date.now();
    sessionTimerEl.style.display = 'block';
    sessionTimerEl.textContent = '00:00:00';
    sessionTimerInterval = setInterval(updateSessionTimer, 1000);
  }
  function stopSessionTimer() {
    if (sessionTimerInterval) { clearInterval(sessionTimerInterval); sessionTimerInterval = null; }
    if (sessionTimerEl) sessionTimerEl.style.display = 'none';
    sessionStartTs = 0;
  }
  function updateSessionTimer() {
    if (!sessionTimerEl || !sessionStartTs) return;
    const elapsed = Math.floor((Date.now() - sessionStartTs) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    sessionTimerEl.textContent = `${h}:${m}:${s}`;
  }

  // -------------------- Floating stranger pill --------------------
  // Country-code → real flag IMAGE via flagcdn.com (NOT an emoji).
  // Windows does not ship country-flag emoji glyphs, so 🇧🇩 renders as the
  // literal letters "BD" there — a PNG flag renders identically everywhere.
  function flagImgHtml(cc) {
    const code = (cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || code === 'UN') return '🏳';
    return `<img class="flag-img" src="https://flagcdn.com/32x24/${code.toLowerCase()}.png" ` +
           `alt="${code} flag" width="22" height="17" loading="lazy">`;
  }
  function showStrangerPill(country, countryCode) {
    if (!strangerCountryPill) return;
    if (strangerCountryName) strangerCountryName.textContent = (country && country !== 'Unknown') ? country : (countryCode || 'Unknown');
    if (strangerCountryFlag) strangerCountryFlag.innerHTML = flagImgHtml(countryCode);
    strangerCountryPill.style.display = 'block';
    // Auto-hide after 6 seconds (matches ChatSphere screenshot behaviour)
    clearTimeout(showStrangerPill._t);
    showStrangerPill._t = setTimeout(() => {
      if (strangerCountryPill) strangerCountryPill.style.display = 'none';
    }, 6000);
  }
  function hideStrangerPill() {
    if (strangerCountryPill) strangerCountryPill.style.display = 'none';
    clearTimeout(showStrangerPill._t);
  }

  // -------------------- Stranger score --------------------
  function resetStrangerScore() {
    strangerScoreValue = 0;
    updateStrangerScoreDisplay();
  }
  function updateStrangerScoreDisplay() {
    if (!strangerScore) return;
    const strong = strangerScore.querySelector('strong');
    if (strong) strong.textContent = (strangerScoreValue >= 0 ? '+' : '') + strangerScoreValue;
    // Color-shift badge: green for positive, red for negative, neutral at 0
    if (strangerScoreValue > 0) {
      strangerScore.style.background = 'rgba(23, 166, 83, 0.12)';
      strangerScore.style.color = 'var(--green)';
      strangerScore.style.borderColor = 'rgba(23, 166, 83, 0.3)';
    } else if (strangerScoreValue < 0) {
      strangerScore.style.background = 'rgba(226, 59, 59, 0.12)';
      strangerScore.style.color = 'var(--red)';
      strangerScore.style.borderColor = 'rgba(226, 59, 59, 0.3)';
    } else {
      strangerScore.style.background = '';
      strangerScore.style.color = '';
      strangerScore.style.borderColor = '';
    }
  }
  function castVote(delta) {
    // Only allow voting while a partner is connected
    if (!partnerId) return;
    strangerScoreValue += delta;
    updateStrangerScoreDisplay();
    // Brief visual feedback
    if (strangerScore) {
      strangerScore.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
        { duration: 220, easing: 'ease-out' }
      );
    }
  }

  // -------------------- Toolbar wiring (chat.html only) --------------------
  // Auto-next toggle: persists across reloads and updates the in-memory flag.
  if (autoNextToggle) {
    try {
      if (window.localStorage.getItem('ChatSphere_auto_next') === '1') {
        autoNextToggle.checked = true;
        isAutoNextOn = true;
      }
    } catch (_) {}
    autoNextToggle.addEventListener('change', () => {
      isAutoNextOn = autoNextToggle.checked;
      try { window.localStorage.setItem('ChatSphere_auto_next', autoNextToggle.checked ? '1' : '0'); } catch (_) {}
    });
  }
  // Auto-message toggle + text input: persists across reloads.
  if (autoMessageToggle) {
    try {
      if (window.localStorage.getItem('ChatSphere_auto_message') === '1') {
        autoMessageToggle.checked = true;
        isAutoMessageOn = true;
        if (autoMessageText) autoMessageText.disabled = false;
      }
    } catch (_) {}
    autoMessageToggle.addEventListener('change', () => {
      isAutoMessageOn = autoMessageToggle.checked;
      if (autoMessageText) autoMessageText.disabled = !isAutoMessageOn;
      try { window.localStorage.setItem('ChatSphere_auto_message', autoMessageToggle.checked ? '1' : '0'); } catch (_) {}
    });
  }
  if (autoMessageText) {
    try {
      const savedText = window.localStorage.getItem('ChatSphere_auto_message_text');
      if (savedText) autoMessageText.value = savedText;
    } catch (_) {}
    autoMessageText.addEventListener('input', () => {
      try { window.localStorage.setItem('ChatSphere_auto_message_text', autoMessageText.value); } catch (_) {}
    });
  }
  // Upvote / Downvote buttons
  if (upvoteBtn) upvoteBtn.addEventListener('click', () => castVote(+1));
  if (downvoteBtn) downvoteBtn.addEventListener('click', () => castVote(-1));

  // -------------------- Video deck popups (video.html only) --------------------
  // Restore persisted filter state from localStorage so it survives reloads.
  try {
    const savedCountry = window.localStorage.getItem('ChatSphere_match_country');
    if (savedCountry) matchCountryFilter = savedCountry;
    const savedIdentity = window.localStorage.getItem('ChatSphere_identity');
    if (savedIdentity) identityValue = savedIdentity;
    const savedLooking = window.localStorage.getItem('ChatSphere_looking_for');
    if (savedLooking) lookingForValue = savedLooking;
  } catch (_) {}

  // chat.html: make the country dropdown the authoritative filter UI.
  // Reflect any restored saved filter (set on video.html's Country popup)
  // into the dropdown, and persist dropdown changes so the emit path
  // (matchCountryFilter || select.value) always matches what the user sees.
  // Null-guarded: video.html has no #matchCountry select.
  if (matchCountrySelect) {
    if (matchCountryFilter) matchCountrySelect.value = matchCountryFilter;
    matchCountrySelect.addEventListener('change', () => {
      matchCountryFilter = matchCountrySelect.value;
      try { window.localStorage.setItem('ChatSphere_match_country', matchCountryFilter); } catch (_) {}
    });
  }

  // Generic popup helpers
  function openPopup(popup) {
    if (!popup) return;
    popup.style.display = 'flex';
    // Lock body scroll while popup is open
    document.body.style.overflow = 'hidden';
  }
  function closePopup(popup) {
    if (!popup) return;
    popup.style.display = 'none';
    // Restore body scroll only when no popups are open
    const anyOpen = document.querySelectorAll('.deck-popup[style*="display: flex"]').length > 0;
    if (!anyOpen) document.body.style.overflow = '';
  }
  // Wire every [data-close] button inside popups + click-on-backdrop dismissal
  document.querySelectorAll('.deck-popup').forEach(popup => {
    popup.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closePopup(popup));
    });
    popup.addEventListener('click', e => {
      if (e.target === popup) closePopup(popup);
    });
  });
  // Esc closes any open popup (but NOT the chat — Esc still triggers Next while chat is active)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.deck-popup[style*="display: flex"]');
      if (open) {
        e.stopPropagation();
        closePopup(open);
      }
    }
  });

  // ---- Country button + popup ----
  if (countryBtn) {
    countryBtn.addEventListener('click', () => {
      if (popupMatchCountry) popupMatchCountry.value = matchCountryFilter;
      openPopup(countryPopup);
    });
  }
  if (countryApplyBtn) {
    countryApplyBtn.addEventListener('click', () => {
      matchCountryFilter = popupMatchCountry ? popupMatchCountry.value : '';
      try { window.localStorage.setItem('ChatSphere_match_country', matchCountryFilter); } catch (_) {}
      // Reflect on chat.html toolbar dropdown too if present
      if (matchCountrySelect) matchCountrySelect.value = matchCountryFilter;
      closePopup(countryPopup);
      // Provide user feedback
      const label = matchCountryFilter
        ? `Country filter set to ${matchCountryFilter}. Will apply on next match.`
        : 'Country filter cleared — will match any country on next search.';
      if (typeof appendSystem === 'function') appendSystem(label);
    });
  }

  // ---- I am button + popup (identity chips + looking-for chips) ----
  function syncIdentityChips() {
    if (iamChips) iamChips.querySelectorAll('.identity-chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.identity === identityValue);
    });
    if (lookingChips) lookingChips.querySelectorAll('.identity-chip').forEach(c => {
      c.classList.toggle('selected', c.dataset.looking === lookingForValue);
    });
  }
  if (iamBtn) {
    iamBtn.addEventListener('click', () => {
      syncIdentityChips();
      openPopup(iamPopup);
    });
  }
  if (iamChips) iamChips.addEventListener('click', e => {
    const chip = e.target.closest('.identity-chip');
    if (!chip) return;
    identityValue = chip.dataset.identity;
    try { window.localStorage.setItem('ChatSphere_identity', identityValue); } catch (_) {}
    syncIdentityChips();
  });
  if (lookingChips) lookingChips.addEventListener('click', e => {
    const chip = e.target.closest('.identity-chip');
    if (!chip) return;
    lookingForValue = chip.dataset.looking;
    try { window.localStorage.setItem('ChatSphere_looking_for', lookingForValue); } catch (_) {}
    syncIdentityChips();
  });

  // ---- Premium button + popup ----
  if (premiumBtn) {
    premiumBtn.addEventListener('click', () => openPopup(premiumPopup));
  }

  // ---- Settings button + popup ----
  function syncSettingsToggleStates() {
    if (settingsThemeToggle) {
      settingsThemeToggle.checked = document.body.classList.contains('dark-mode');
    }
    if (settingsAutoNext)      settingsAutoNext.checked      = isAutoNextOn;
    if (settingsAutoMessage)   settingsAutoMessage.checked   = isAutoMessageOn;
    if (settingsAutoMessageText) {
      try {
        const savedText = window.localStorage.getItem('ChatSphere_auto_message_text');
        if (savedText) settingsAutoMessageText.value = savedText;
      } catch (_) {}
      settingsAutoMessageText.disabled = !isAutoMessageOn;
    }
    if (settingsCameraDefault) {
      try { settingsCameraDefault.checked = window.localStorage.getItem('ChatSphere_cam_default') !== 'off'; } catch (_) {}
    }
    if (settingsMicDefault) {
      try { settingsMicDefault.checked = window.localStorage.getItem('ChatSphere_mic_default') !== 'off'; } catch (_) {}
    }
  }
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      syncSettingsToggleStates();
      openPopup(settingsPopup);
    });
  }
  // Theme toggle (delegates to theme.js logic by setting the body class + localStorage)
  if (settingsThemeToggle) {
    settingsThemeToggle.addEventListener('change', () => {
      const turnDark = settingsThemeToggle.checked;
      document.body.classList.toggle('dark-mode', turnDark);
      try { window.localStorage.setItem('ChatSphere_theme', turnDark ? 'dark' : 'light'); } catch (_) {}
      // Sync the existing #themeToggleBtn icon if present
      const themeBtn = document.getElementById('themeToggleBtn');
      if (themeBtn) {
        const icon = themeBtn.querySelector('i');
        if (icon) icon.className = turnDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
      }
    });
  }
  // Auto-next setting (synced with chat.html toolbar state if present)
  if (settingsAutoNext) {
    settingsAutoNext.addEventListener('change', () => {
      isAutoNextOn = settingsAutoNext.checked;
      try { window.localStorage.setItem('ChatSphere_auto_next', isAutoNextOn ? '1' : '0'); } catch (_) {}
      if (autoNextToggle) autoNextToggle.checked = isAutoNextOn;
    });
  }
  // Auto-message setting (synced with chat.html toolbar state if present)
  if (settingsAutoMessage) {
    settingsAutoMessage.addEventListener('change', () => {
      isAutoMessageOn = settingsAutoMessage.checked;
      try { window.localStorage.setItem('ChatSphere_auto_message', isAutoMessageOn ? '1' : '0'); } catch (_) {}
      if (settingsAutoMessageText) settingsAutoMessageText.disabled = !isAutoMessageOn;
      if (autoMessageToggle) autoMessageToggle.checked = isAutoMessageOn;
      if (autoMessageText) autoMessageText.disabled = !isAutoMessageOn;
    });
  }
  if (settingsAutoMessageText) {
    settingsAutoMessageText.addEventListener('input', () => {
      try { window.localStorage.setItem('ChatSphere_auto_message_text', settingsAutoMessageText.value); } catch (_) {}
      if (autoMessageText) autoMessageText.value = settingsAutoMessageText.value;
    });
  }
  // Camera/mic defaults (consumed in startChatBtn handler above — re-read on each Start)
  if (settingsCameraDefault) {
    settingsCameraDefault.addEventListener('change', () => {
      try { window.localStorage.setItem('ChatSphere_cam_default', settingsCameraDefault.checked ? 'on' : 'off'); } catch (_) {}
    });
  }
  if (settingsMicDefault) {
    settingsMicDefault.addEventListener('change', () => {
      try { window.localStorage.setItem('ChatSphere_mic_default', settingsMicDefault.checked ? 'on' : 'off'); } catch (_) {}
    });
  }
  // Restore saved camera/mic defaults to local flags so startChatBtn can read them
  let startWithCameraOn = true;
  let startWithMicOn = true;
  try {
    if (window.localStorage.getItem('ChatSphere_cam_default') === 'off') startWithCameraOn = false;
    if (window.localStorage.getItem('ChatSphere_mic_default') === 'off') startWithMicOn = false;
  } catch (_) {}

  // Sync chat.html's existing matchCountry dropdown (if present) to the shared state
  if (matchCountrySelect) {
    try {
      const savedCountry = window.localStorage.getItem('ChatSphere_match_country');
      if (savedCountry) matchCountrySelect.value = savedCountry;
    } catch (_) {}
    matchCountrySelect.addEventListener('change', () => {
      matchCountryFilter = matchCountrySelect.value;
      try { window.localStorage.setItem('ChatSphere_match_country', matchCountryFilter); } catch (_) {}
      if (popupMatchCountry) popupMatchCountry.value = matchCountryFilter;
    });
  }

  // -------------------- Init --------------------
  renderInterestChips();
  console.log('ChatSphere chat client initialised. Mode:', isVideoPage ? 'video' : 'text');
})();
