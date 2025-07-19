const WebSocket = require('ws');
const axios = require('axios').default;
const jwt = require('jsonwebtoken');
const base64url = require('base64url');
const crypto = require('crypto');
const fs = require('fs');
const ProxyAgent = require('proxy-agent');
const { v4: uuidv4 } = require('uuid');

// Load configs
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const accounts = JSON.parse(fs.readFileSync('account.json', 'utf8'));
let proxies = [];
if (fs.existsSync('proxy.txt')) {
  proxies = fs.readFileSync('proxy.txt', 'utf8').trim().split('\n').filter(line => line.trim());
}

// Constants dari constant.js
const WEBSOCKET_CMD_PING = 1;
const WEBSOCKET_CMD_PONG = 2;
const WEBSOCKET_CMD_UPDATE_JOBS = 3;
const BOOTSTRAP_DEFAULT = ["https://task.titannet.io"];
const API_HARBOR_LIST_JSON = '/api/public/webnodes/discover';
const API_AUTH_TEST = '/api/auth/test';
const API_WEBSOCKET = '/api/public/webnodes/ws';
const API_LOAD_JOBS = '/api/webnodes/jobs';

// Fungsi helper dari util.js
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(base64url.decode(payload));
  } catch (e) {
    return {};
  }
}

async function calculateSha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getAxiosInstance(proxy = null) {
  const instance = axios.create({
    headers: { 'User-Agent': config.USER_AGENT },
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

function generateAgentInfo() {
  return {
    ext_version: '0.0.4', // Dummy dari manifest
    language: 'en', // Atau 'cn' jika zh
    user_script_enabled: false, // Di VPS no
    device_id: uuidv4(), // Random atau dari storage
    install_time: new Date().toISOString()
  };
}

async function findHarbors(axiosInst, bootstraps) {
  for (const bs of bootstraps) {
    try {
      const response = await axiosInst.post(`${bs}${API_HARBOR_LIST_JSON}`, generateAgentInfo(), { timeout: 3000 });
      const harbors = response.data.harbors || [];
      if (harbors.length > 0) return harbors;
    } catch (e) {
      console.log(`Harbor find failed for ${bs}: ${e.message}`);
    }
  }
  return [];
}

async function selectHarbor(axiosInst, harbors) {
  for (const harbor of harbors) {
    try {
      const response = await axiosInst.get(`${harbor}${API_AUTH_TEST}`, { timeout: 3000 });
      if (response.status === 200) return harbor;
    } catch (e) {}
  }
  return null;
}

// Fungsi per akun
async function runAccount(account, index, proxy) {
  let { email, password, accessToken: fallbackAccess, refreshToken: fallbackRefresh, userId: fallbackUserId } = account;
  let accessToken = fallbackAccess;
  let refreshToken = fallbackRefresh;
  let userId = fallbackUserId;
  let harbor = config.BASE_URL;
  const axiosInst = getAxiosInstance(proxy);
  const log = (msg) => {
    console.log(`[Akun ${index + 1} - ${email}]: ${msg}`);
    logToFile(index, msg);
  };

  // Jika BASE_URL gagal, find harbor
  async function ensureHarbor() {
    try {
      await axiosInst.get(`${harbor}/api/auth/test`, { timeout: 3000 });
    } catch (e) {
      log('BASE_URL gagal, find harbors...');
      const harbors = await findHarbors(axiosInst, BOOTSTRAP_DEFAULT);
      harbor = await selectHarbor(axiosInst, harbors);
      if (!harbor) throw new Error('No harbor found');
      log(`Harbor selected: ${harbor}`);
    }
  }

  await ensureHarbor();

  async function login() {
    try {
      const response = await axiosInst.post(`${harbor}/api/auth/login`, { user_id: email, password });
      accessToken = response.data.data.access_token;
      refreshToken = response.data.data.refresh_token;
      const jwtData = decodeJWT(accessToken);
      userId = jwtData.user_id;
      log('Login berhasil!');
    } catch (error) {
      log(`Login gagal: ${error.message}. Gunakan fallback.`);
    }
  }

  async function refreshAccessToken() {
    try {
      const response = await axiosInst.post(`${harbor}/api/auth/refresh-token`, { refresh_token: refreshToken });
      accessToken = response.data.data.access_token;
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
      const response = await axiosInst.get(`${harbor}/api/user/info`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      log(`User Info: ${JSON.stringify(response.data)}`);
    } catch (error) {
      if (error.response?.status === 401) {
        await refreshAccessToken();
        getUserInfo();
      } else {
        log(`Gagal get info: ${error.message}`);
      }
    }
  }

  async function loadJobs() {
    try {
      const response = await axiosInst.get(`${harbor}${API_LOAD_JOBS}`, {
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
      const hash = await calculateSha256(scriptContent);
      if (hash !== job.script_hash) {
        log(`Hash script ${job.id} tidak cocok.`);
        return;
      }
      log(`Script job ${job.id}: ${scriptContent}`);
    } catch (error) {
      log(`Load script job ${job.id} gagal: ${error.message}`);
    }
  }

  let ws;
  function connectWS() {
    const wsUrl = `${harbor.replace(/^http/, 'ws')}${API_WEBSOCKET}?token=${accessToken}&device_id=${generateAgentInfo().device_id}`;
    const options = getWSOptions(proxy);
    ws = new WebSocket(wsUrl, [], options);

    ws.on('open', () => {
      log('WS Terbuka');
      const authMsg = JSON.stringify({ cmd: WEBSOCKET_CMD_PING, echo: 'init', jobReport: { cfgcnt: 0, jobcnt: 0 } });
      ws.send(authMsg);
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ cmd: WEBSOCKET_CMD_PING, echo: 'keep', jobReport: { cfgcnt: 0, jobcnt: 0 } }));
        }
      }, 15000); // 15s dari asrun.js
    });

    ws.on('message', (message) => {
      let data;
      try { data = JSON.parse(message); } catch { data = message; }
      log(`WS Pesan: ${JSON.stringify(data)}`);
      if (data.cmd === WEBSOCKET_CMD_PING) {
        if (data.userDataUpdate) {
          log(`Update points: ${JSON.stringify(data.userDataUpdate)}`);
          // Simulasi notify
        }
        ws.send(JSON.stringify({ cmd: WEBSOCKET_CMD_PONG, echo: data.echo }));
      } else if (data.cmd === WEBSOCKET_CMD_PONG) {
        log('PONG diterima');
      } else if (data.cmd === WEBSOCKET_CMD_UPDATE_JOBS) {
        log('Update jobs—sync.');
        loadJobs();
      }
    });

    ws.on('close', () => {
      log('WS Ditutup. Reconnect 10s...');
      setTimeout(connectWS, 10000);
    });

    ws.on('error', (error) => log(`WS Error: ${error.message}`));
  }

  await login();
  await loadJobs();
  connectWS();
  setInterval(getUserInfo, 300000);
}

// Main: Jalankan dengan delay antar akun
(async () => {
  for (let index = 0; index < accounts.length; index++) {
    const account = accounts[index];
    const proxy = proxies[index] || null;
    await runAccount(account, index, proxy);
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5000 + 5000)); // Delay 5-10s
  }
})();
