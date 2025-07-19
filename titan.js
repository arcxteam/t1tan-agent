const WebSocket = require('ws');
const axios = require('axios').default;
const jwt = require('jsonwebtoken');
const base64url = require('base64url');
const crypto = require('crypto');
const fs = require('fs');
const ProxyAgent = require('proxy-agent');

// Load configs
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const accounts = JSON.parse(fs.readFileSync('account.json', 'utf8'));
const proxies = fs.readFileSync('proxy.txt', 'utf8').trim().split('\n').filter(line => line.trim());

// Fungsi helper
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(base64url.decode(payload));
  } catch (e) {
    console.error('Gagal decode JWT:', e);
    return {};
  }
}

function getAxiosInstance(proxy = null) {
  const instance = axios.create({
    headers: { ...config.headers, 'User-Agent': config.USER_AGENT },
  });
  if (proxy) {
    instance.defaults.httpAgent = new ProxyAgent(proxy);
    instance.defaults.httpsAgent = new ProxyAgent(proxy);
  }
  return instance;
}

function getWSOptions(proxy = null) {
  const options = { headers: { 'User-Agent': config.USER_AGENT } };
  if (proxy) {
    options.agent = new ProxyAgent(proxy);
  }
  return options;
}

function logToFile(accountIndex, message) {
  fs.appendFileSync(`titan_akun${accountIndex + 1}.log`, `${new Date().toISOString()} - ${message}\n`);
}

// Fungsi per akun
async function runAccount(account, index, proxy) {
  let { email, password, accessToken, refreshToken, userId } = account;
  const axiosInst = getAxiosInstance(proxy);
  const log = (msg) => {
    console.log(`[Akun ${index + 1} - ${email}]: ${msg}`);
    logToFile(index, msg);
  };

  async function login() {
    try {
      const response = await axiosInst.post(`${config.BASE_URL}/api/auth/login`, { email, password });
      accessToken = response.data.access_token;
      refreshToken = response.data.refresh_token;
      const jwtData = decodeJWT(accessToken);
      userId = jwtData.user_id;
      log('Login berhasil!');
    } catch (error) {
      log(`Login gagal: ${error.message}. Gunakan fallback token.`);
    }
  }

  async function refreshAccessToken() {
    try {
      const response = await axiosInst.post(`${config.BASE_URL}/api/auth/refresh-token`, { refresh_token: refreshToken });
      accessToken = response.data.access_token;
      const jwtData = decodeJWT(accessToken);
      userId = jwtData.user_id;
      log('Token direfresh!');
    } catch (error) {
      log(`Refresh gagal: ${error.message}. Login ulang...`);
      await login();
    }
  }

  async function getUserInfo() {
    try {
      const response = await axiosInst.get(`${config.BASE_URL}/api/user/info`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      log(`User Info: ${JSON.stringify(response.data)}`);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        await refreshAccessToken();
        getUserInfo();
      } else {
        log(`Gagal get info: ${error.message}`);
      }
    }
  }

  async function loadJobs() {
    try {
      const response = await axiosInst.get(`${config.BASE_URL}/api/websockets/jobs`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const jobs = response.data.jobs || [];
      log(`Loaded Jobs: ${JSON.stringify(jobs)}`);
      for (const job of jobs) {
        await loadJobScript(job);
      }
    } catch (error) {
      log(`Load jobs gagal: ${error.message}`);
    }
  }

  async function loadJobScript(job) {
    try {
      const response = await axiosInst.get(job.script_url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const scriptContent = response.data;
      const hash = crypto.createHash('sha256').update(scriptContent).digest('hex');
      if (hash !== job.script_hash) {
        log(`Hash script ${job.id} tidak cocok.`);
        return;
      }
      log(`Script job ${job.id}: ${scriptContent}`);
      // Extend jika perlu execute: require('vm') sandbox di sini
    } catch (error) {
      log(`Load script job ${job.id} gagal: ${error.message}`);
    }
  }

  let ws;
  function connectWS() {
    const options = getWSOptions(proxy);
    ws = new WebSocket(config.WS_URL, [], options);

    ws.on('open', () => {
      log('WS Terbuka');
      const authMsg = JSON.stringify({ cmd: 1, token: accessToken, user_id: userId });
      ws.send(authMsg);
      setInterval(() => ws.send(JSON.stringify({ cmd: 1 })), 30000); // PING
    });

    ws.on('message', (message) => {
      let data;
      try { data = JSON.parse(message); } catch { data = message; }
      log(`WS Pesan: ${JSON.stringify(data)}`);
      if (data.cmd === 3) {
        log('Update jobs—sync.');
        loadJobs();
      }
    });

    ws.on('close', () => {
      log('WS Ditutup. Reconnect...');
      setTimeout(connectWS, 5000);
    });

    ws.on('error', (error) => log(`WS Error: ${error.message}`));
  }

  await login();
  await loadJobs();
  connectWS();
  setInterval(getUserInfo, 300000); // Poll setiap 5 menit
}

// Main: Jalankan paralel semua akun
(async () => {
  const promises = accounts.map((account, index) => {
    const proxy = proxies[index % proxies.length] || null; // Assign proxy cycling
    return runAccount(account, index, proxy);
  });
  await Promise.all(promises);
})();
