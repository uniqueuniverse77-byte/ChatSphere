/**
 * ChatSphere - Full Working Chat Server
 *
 * Based on the public.zip backend (Socket.IO + WebRTC matchmaking),
 * adapted to serve the ChatSphere.com marketing front-end from /public.
 *
 * Features:
 *  - Static hosting for all ChatSphere.com pages (index, about, blog, etc.)
 *  - Socket.IO real-time signaling
 *  - Random matchmaking by interests + country
 *  - WebRTC peer-to-peer video/audio relay
 *  - Text chat + binary file transfer between matched strangers
 *  - Online user count broadcast
 *  - IP-based country detection (ipapi.co + ipinfo.io fallback)
 */

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const http = require('http').createServer(app);

// Socket.IO with increased buffer size for video file transfers
const io = require('socket.io')(http, {
  maxHttpBufferSize: 1e8, // 100 MB
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Serve all ChatSphere.com static front-end files
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  extensions: ['html']
}));

// Friendly 404 fallback to home for unknown .html routes (keeps nav links working)
app.use((req, res, next) => {
  if (req.method === 'GET' && path.extname(req.path) === '.html') {
    const candidate = path.join(__dirname, 'public', req.path);
    const fs = require('fs');
    if (!fs.existsSync(candidate)) {
      return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  }
  next();
});

// ------------------------------------------------------------------
// Matchmaking state
// ------------------------------------------------------------------
let waitingUsers = [];
let onlineUsers = 0;

// ------------------------------------------------------------------
// Public REST endpoint: current online user count.
// The landing page (index.html) polls this via fetch('/api/online-count')
// so it can display the live "N+ online" counter WITHOUT opening a
// Socket.IO / WebSocket connection just for that number. (chat.html and
// video.html, which already have a Socket.IO connection for chat, receive
// the same value via the 'onlineCount' event.)
//
// Response: 200 OK, application/json  ->  { "online": <number> }
// ------------------------------------------------------------------
app.get('/api/online-count', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ online: onlineUsers });
});

function normalizeIP(ip) {
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');
  return ip;
}

// ISO-3166 country name → alpha-2 code map (module-level so it can also be
// reversed for code → name lookups).
const COUNTRY_CODES = {
    'Philippines': 'PH','United States': 'US','United Kingdom': 'GB','Canada': 'CA',
    'Australia': 'AU','India': 'IN','Germany': 'DE','France': 'FR','Italy': 'IT',
    'Spain': 'ES','Netherlands': 'NL','Brazil': 'BR','Japan': 'JP','China': 'CN',
    'Russia': 'RU','Mexico': 'MX','South Korea': 'KR','Indonesia': 'ID',
    'Turkey': 'TR','Saudi Arabia': 'SA','Switzerland': 'CH','Taiwan': 'TW',
    'Belgium': 'BE','Ireland': 'IE','Israel': 'IL','Austria': 'AT','Norway': 'NO',
    'United Arab Emirates': 'AE','Nigeria': 'NG','Egypt': 'EG','South Africa': 'ZA',
    'Argentina': 'AR','Thailand': 'TH','Poland': 'PL','Malaysia': 'MY',
    'Colombia': 'CO','Chile': 'CL','Finland': 'FI','Singapore': 'SG',
    'Denmark': 'DK','Hong Kong': 'HK','Sweden': 'SE','Vietnam': 'VN',
    'Portugal': 'PT','Romania': 'RO','Czech Republic': 'CZ','New Zealand': 'NZ',
    'Peru': 'PE','Greece': 'GR','Pakistan': 'PK','Bangladesh': 'BD',
    'Hungary': 'HU','Kuwait': 'KW','Ukraine': 'UA','Iraq': 'IQ','Algeria': 'DZ',
    'Qatar': 'QA','Morocco': 'MA','Slovakia': 'SK','Ecuador': 'EC',
    'Belarus': 'BY','Angola': 'AO','Sudan': 'SD','Azerbaijan': 'AZ',
    'Ethiopia': 'ET','Kazakhstan': 'KZ','Tanzania': 'TZ','Guatemala': 'GT',
    'Bulgaria': 'BG','Serbia': 'RS','Kenya': 'KE','Croatia': 'HR',
    'Venezuela': 'VE','Uzbekistan': 'UZ','Libya': 'LY','Lebanon': 'LB',
    'Ghana': 'GH','Oman': 'OM','Mozambique': 'MZ','Panama': 'PA',
    'Nepal': 'NP','Bolivia': 'BO',"Côte d'Ivoire": 'CI','Cameroon': 'CM',
    'Uruguay': 'UY','Luxembourg': 'LU','Senegal': 'SN','Paraguay': 'PY',
    'Jordan': 'JO','El Salvador': 'SV','Costa Rica': 'CR','Bahrain': 'BH',
    'Tunisia': 'TN','Estonia': 'EE','Latvia': 'LV','Slovenia': 'SI',
    'Lithuania': 'LT','Macedonia': 'MK','Moldova': 'MD','Armenia': 'AM',
    'Albania': 'AL','Bosnia and Herzegovina': 'BA','Georgia': 'GE',
    'Mongolia': 'MN','Yemen': 'YE','Afghanistan': 'AF','Zimbabwe': 'ZW',
    'Myanmar': 'MM','Cyprus': 'CY','Honduras': 'HN','Nicaragua': 'NI',
    'Cambodia': 'KH','Laos': 'LA','Mali': 'ML','Malta': 'MT','Zambia': 'ZM',
    'Botswana': 'BW','Namibia': 'NA','Gabon': 'GA','Jamaica': 'JM',
    'Trinidad and Tobago': 'TT','Papua New Guinea': 'PG','Fiji': 'FJ',
    'Bhutan': 'BT','Guyana': 'GY','Uganda': 'UG','Gambia': 'GM',
    'Guinea': 'GN','Rwanda': 'RW','Benin': 'BJ','Burundi': 'BI',
    'Togo': 'TG','Sierra Leone': 'SL','Malawi': 'MW','Lesotho': 'LS',
    'Swaziland': 'SZ','Somalia': 'SO','Liberia': 'LR','Djibouti': 'DJ',
    'Comoros': 'KM','Cape Verde': 'CV','São Tomé and Príncipe': 'ST',
    'Seychelles': 'SC','Mauritius': 'MU','Eritrea': 'ER','Unknown': 'UN'
};

function getCountryCode(country) {
  return COUNTRY_CODES[country] || 'UN';
}

// Reverse lookup: alpha-2 code → country name (e.g. 'BD' → 'Bangladesh').
// Needed because ipinfo.io's free response only contains the ISO code.
let _codeToCountry = null;
function getCountryName(code) {
  if (!_codeToCountry) {
    _codeToCountry = {};
    for (const [name, cc] of Object.entries(COUNTRY_CODES)) _codeToCountry[cc] = name;
  }
  return _codeToCountry[code] || null;
}

// Detect client country from IP — runs in the background so it never blocks
// event-handler registration. Updates socket.country / socket.countryCode
// when it resolves. Safe to call multiple times.
async function detectCountry(socket) {
  const request = socket.request;
  let ip = request.headers['x-forwarded-for'] ||
           request.headers['x-real-ip'] ||
           request.connection.remoteAddress ||
           request.socket.remoteAddress ||
           (request.connection.socket ? request.connection.socket.remoteAddress : null);

  if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();
  ip = normalizeIP(ip);

  let country = 'Unknown';
  let countryCode = 'UN';

  const isPrivateIP =
    !ip || ip === '127.0.0.1' || ip === '::1' ||
    ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');

  if (isPrivateIP) {
    try {
      const publicIpRes = await fetch('https://api.ipify.org?format=json');
      const publicIpData = await publicIpRes.json();
      ip = publicIpData.ip;
    } catch (err) {
      console.error('Error fetching public IP:', err.message);
    }
  }

  // Primary: ipapi.co
  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await response.json();
    if (data && !data.error) {
      country = data.country_name || 'Unknown';
      countryCode = data.country || 'UN';
    }
  } catch (e) {
    console.warn('ipapi.co failed:', e.message);
  }

  // Fallback: ipinfo.io
  // NOTE: ipinfo.io's free /json response contains ONLY the ISO alpha-2 code
  // (e.g. { country: "BD" }) — no country name. Resolve the name locally via
  // the reverse map so users see "Bangladesh" instead of the raw code "BD".
  if (country === 'Unknown') {
    try {
      const fallbackRes = await fetch(`https://ipinfo.io/${ip}/json`);
      const fallbackData = await fallbackRes.json();
      if (fallbackData && fallbackData.country) {
        countryCode = fallbackData.country || 'UN';
        country = getCountryName(countryCode) || 'Unknown';
      }
    } catch (fallbackErr) {
      console.error('ipinfo.io fallback failed:', fallbackErr.message);
    }
  }

  // Last resort: ipwho.is (free, no key, returns BOTH the country name and
  // code). Covers the case where both ipapi.co and ipinfo.io are rate-limited
  // or blocked (common on cloud/datacenter egress IPs such as Render's).
  if (country === 'Unknown') {
    try {
      const whoRes = await fetch(`https://ipwho.is/${ip}`);
      const whoData = await whoRes.json();
      if (whoData && whoData.success !== false && whoData.country_code) {
        country = whoData.country || getCountryName(whoData.country_code) || 'Unknown';
        countryCode = whoData.country_code || 'UN';
      }
    } catch (whoErr) {
      console.error('All geolocation APIs failed:', whoErr.message);
    }
  }

  // Only overwrite if the client hasn't supplied its own location meanwhile
  // and we got something better than Unknown.
  if (country !== 'Unknown' || countryCode !== 'UN') {
    if (socket.country === 'Unknown') socket.country = country;
    if (socket.countryCode === 'UN') socket.countryCode = countryCode;
  }
  console.log(`User ${socket.id} detected country: ${socket.country} (Code: ${socket.countryCode}) (IP: ${ip})`);
}

// Find a partner: prefer same country + shared interest, then any shared interest.
// New optional filters (only applied when the user supplied them):
//   matchCountry — only match with partners from this country code (e.g. "US")
//   identity     — this user's identity (male/female/couple/nonbinary)
//   lookingFor   — what this user wants to meet ('anyone' or a specific identity)
function findMatchingUser(socket, interests, location, filters = {}) {
  const { matchCountry, identity, lookingFor } = filters;

  // Filter predicate combining all user-supplied filters
  // Checks BOTH directions:
  //   - my filters must accept the candidate partner
  //   - the candidate partner's stored filters must also accept me
  // This prevents e.g. a country-filtered user from being matched with someone
  // who didn't pass the filter.
  const passesUserFilters = (u) => {
    if (!u || !u.socket || u.socket.id === socket.id) return false;
    // === My filters vs candidate ===
    // Country filter: I want partner from matchCountry
    if (matchCountry && (u.countryCode || 'UN') !== matchCountry) return false;
    // "Looking for" filter — partner's identity must match what I want to meet
    if (lookingFor && lookingFor !== 'anyone' && u.identity && u.identity !== lookingFor) return false;
    // Mutual identity preference — partner must want my identity (or anyone)
    if (identity && u.lookingFor && u.lookingFor !== 'anyone' && u.lookingFor !== identity) return false;

    // === Candidate's filters vs me (using my socket's stored values) ===
    // Candidate wants someone from a specific country?
    if (u.socket && u.socket.matchCountry && (socket.countryCode || 'UN') !== u.socket.matchCountry) return false;
    // Candidate wants a specific identity?
    if (u.socket && u.socket.lookingFor && u.socket.lookingFor !== 'anyone'
        && socket.identity && socket.identity !== u.socket.lookingFor) return false;
    // Candidate's identity vs my lookingFor preference (already checked above, but keep for clarity)
    return true;
  };

  // 1) Best: same country + shared interest + passes filters
  let partnerIndex = waitingUsers.findIndex(
    u => passesUserFilters(u) &&
         u.country === location.country &&
         u.interests.some(i => interests.includes(i))
  );
  // 2) Same shared interest + passes filters (any country)
  if (partnerIndex === -1) {
    partnerIndex = waitingUsers.findIndex(
      u => passesUserFilters(u) &&
           u.interests.some(i => interests.includes(i))
    );
  }
  // 3) If user has a country/identity filter, fall back to anyone who passes
  //    those filters (no shared-interest requirement). Skip this fallback when
  //    no filters are set so empty-interest random matching keeps working.
  if (partnerIndex === -1 && (matchCountry || (lookingFor && lookingFor !== 'anyone') || identity)) {
    partnerIndex = waitingUsers.findIndex(u => passesUserFilters(u));
  }
  // 4) Last resort: any waiting user with no filters
  if (partnerIndex === -1 && (!interests || interests.length === 0)
      && !matchCountry && (!lookingFor || lookingFor === 'anyone') && !identity) {
    partnerIndex = waitingUsers.findIndex(u => u.socket.id !== socket.id);
  }
  return partnerIndex;
}

function createMatch(user1, user2) {
  waitingUsers = waitingUsers.filter(
    u => u.socket.id !== user1.socket.id && u.socket.id !== user2.socket.id
  );

  user1.socket.partner = user2.socket;
  user2.socket.partner = user1.socket;

  user1.socket.emit('clearChat');
  user2.socket.emit('clearChat');

  // Use the LIVE socket geo values (not the queue-time snapshot): server-side
  // detection may resolve AFTER the user was queued, and the live value is
  // always at least as fresh as the snapshot captured at setInterests time.
  user1.socket.emit('partner', {
    id: user2.socket.id,
    country: user2.socket.country || user2.country || 'Unknown',
    countryCode: user2.socket.countryCode || user2.countryCode || 'UN',
    interests: (user2.interests || []).filter(i => (user1.interests || []).includes(i))
  });

  user2.socket.emit('partner', {
    id: user1.socket.id,
    country: user1.socket.country || user1.country || 'Unknown',
    countryCode: user1.socket.countryCode || user1.countryCode || 'UN',
    interests: (user1.interests || []).filter(i => (user2.interests || []).includes(i))
  });

  console.log(`Matched ${user1.socket.id} (${user1.socket.country || user1.country}) with ${user2.socket.id} (${user2.socket.country || user2.country})`);
}

// ------------------------------------------------------------------
// Socket.IO connection lifecycle
// ------------------------------------------------------------------
io.on('connection', socket => {
  console.log('User connected:', socket.id);
  onlineUsers++;
  io.emit('onlineCount', onlineUsers);

  // Initialize with neutral defaults so events that arrive before
  // geolocation completes still work.
  socket.country = 'Unknown';
  socket.countryCode = 'UN';
  socket.interests = [];
  // New optional matchmaking filters (set by the client in setInterests)
  socket.matchCountry = '';   // '' = any country
  socket.identity = '';       // '' = not specified (male/female/couple/nonbinary)
  socket.lookingFor = 'anyone';

  // Fire geolocation lookup in the background. Handlers below use
  // socket.country / socket.countryCode which will be updated when the
  // lookup resolves.
  detectCountry(socket).catch(err => {
    console.warn(`Geolocation failed for ${socket.id}:`, err.message);
  });

  socket.on('setInterests', data => {
    let interests, location, matchCountry, identity, lookingFor;
    if (Array.isArray(data)) {
      interests = data;
      location = { country: socket.country, countryCode: socket.countryCode };
      matchCountry = ''; identity = ''; lookingFor = 'anyone';
    } else {
      interests = data.interests || [];
      // Client may pass its own location; prefer that, else use server-detected
      location = data.location || { country: socket.country, countryCode: socket.countryCode };
      matchCountry = (data.matchCountry || '').toUpperCase().slice(0, 2);
      identity = (data.identity || '').toLowerCase();
      lookingFor = (data.lookingFor || 'anyone').toLowerCase();
    }

    socket.interests = interests;
    socket.matchCountry = matchCountry;
    socket.identity = identity;
    socket.lookingFor = lookingFor;
    // Only overwrite server-detected values if client passed real ones
    if (location.country && location.country !== 'Unknown') socket.country = location.country;
    if (location.countryCode && location.countryCode !== 'UN') socket.countryCode = location.countryCode;

    console.log(`User ${socket.id} interests:`, interests, `location: ${socket.country} (${socket.countryCode})`,
      `filters: match=${matchCountry || '-'}, identity=${identity || '-'}, lookingFor=${lookingFor}`);

    const user = {
      socket,
      country: socket.country,
      interests,
      countryCode: socket.countryCode,
      identity,
      lookingFor
    };

    const partnerIndex = findMatchingUser(socket, interests, location, { matchCountry, identity, lookingFor });

    if (partnerIndex !== -1) {
      const partner = waitingUsers[partnerIndex];
      createMatch(user, partner);
    } else {
      waitingUsers.push(user);
      console.log(`User ${socket.id} added to waiting queue (size: ${waitingUsers.length})`);
      socket.emit('searching');
    }
  });

  socket.on('newMatch', (data) => {
    console.log(`User ${socket.id} requested a new match`);

    // The client re-sends its current filter selections with newMatch so
    // mid-session changes (country dropdown, I am / Looking for chips)
    // apply to THIS match instead of the values captured at connect time.
    // Payload is optional and validated exactly like setInterests.
    if (data && typeof data === 'object') {
      if (typeof data.matchCountry === 'string') socket.matchCountry = data.matchCountry.toUpperCase().slice(0, 2);
      if (typeof data.identity === 'string')     socket.identity = data.identity.toLowerCase();
      if (typeof data.lookingFor === 'string')   socket.lookingFor = data.lookingFor.toLowerCase() || 'anyone';
      console.log(`User ${socket.id} filters updated: match=${socket.matchCountry || '-'}, identity=${socket.identity || '-'}, lookingFor=${socket.lookingFor}`);
    }

    if (socket.partner) {
      socket.partner.emit('partner-left');
      socket.partner.partner = null;
      socket.partner = null;
    }

    waitingUsers = waitingUsers.filter(u => u.socket.id !== socket.id);

    const interests = socket.interests || [];
    const location = { country: socket.country || 'Unknown', countryCode: socket.countryCode || 'UN' };
    const matchCountry = socket.matchCountry || '';
    const identity = socket.identity || '';
    const lookingFor = socket.lookingFor || 'anyone';

    const partnerIndex = findMatchingUser(socket, interests, location, { matchCountry, identity, lookingFor });

    if (partnerIndex !== -1) {
      const partner = waitingUsers[partnerIndex];
      const user = {
        socket,
        country: socket.country,
        interests,
        countryCode: socket.countryCode,
        identity,
        lookingFor
      };
      createMatch(user, partner);
    } else {
      waitingUsers.push({ socket, country: socket.country, interests, countryCode: socket.countryCode, identity, lookingFor });
      socket.emit('searching');
    }
  });

  socket.on('signal', data => {
    if (socket.partner) {
      socket.partner.emit('signal', data);
    }
  });

  socket.on('chatMessage', data => {
    if (socket.partner) {
      socket.partner.emit('chatMessage', data);
    }
  });

  // Read receipts: partner confirms they rendered (saw) the sender's messages.
  // Relayed to the partner so they can turn their ✓ into a blue ✓✓.
  socket.on('message-seen', () => {
    if (socket.partner) {
      socket.partner.emit('message-seen');
    }
  });

  socket.on('typing', data => {
    if (socket.partner) {
      socket.partner.emit('typing', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    onlineUsers = Math.max(0, onlineUsers - 1);
    io.emit('onlineCount', onlineUsers);

    if (socket.partner) {
      socket.partner.emit('partner-left');
      socket.partner.partner = null;
    }
    waitingUsers = waitingUsers.filter(u => u.socket.id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log('===============================================');
  console.log(` ChatSphere server running on port ${PORT}`);
  console.log(` Open: http://localhost:${PORT}`);
  console.log('===============================================');
});
