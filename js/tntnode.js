require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { HttpsProxyAgent } = require('https-proxy-agent');
const randomUseragent = require('random-useragent');

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    bold: "\x1b[1m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m",
};

const logger = {
    info: (msg, accountIndex = null) => console.log(`${colors.cyan}[INFO]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
    warn: (msg, accountIndex = null) => console.log(`${colors.yellow}[WARN]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
    error: (msg, accountIndex = null) => console.log(`${colors.red}[ERROR]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
    success: (msg, accountIndex = null) => console.log(`${colors.green}[SUCCESS]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
    loading: (msg, accountIndex = null) => console.log(`${colors.magenta}[LOADING]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
    step: (msg, accountIndex = null) => console.log(`${colors.blue}[STEP]${accountIndex ? ` Account ${accountIndex}:` : ''} ${colors.bold}${msg}${colors.reset}`),
    critical: (msg, accountIndex = null) => console.log(`${colors.red}${colors.bold}[FATAL]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    bandwidth: (msg, accountIndex = null) => console.log(`${colors.white}[BANDWIDTH]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
    banner: () => {
        const banner = `
${colors.green}============================ WELCOME TO TITAN NODE =============================${colors.reset}
${colors.yellow}
 ██████╗██╗   ██║ █████╗ ███╗   ██║███╗   ██║ ██████╗ ██████╗ ███████╗
██╔════╝██║   ██║██╔══██╗████╗  ██║████╗  ██║██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║███████║██╔██╗ ██║██╔██╗ ██║██║   ██║██║  ██║█████╗  
██║     ██║   ██║██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║██║  ██║██╔══╝  
╚██████╗╚██████╔╝██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝██████╔╝███████╗
 ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝
${colors.reset}
${colors.cyan}================== TitanNet Node Runner by CUANNODE ==================${colors.reset}
${colors.magenta}       Powered by Insider - Run Multiple Nodes with Ease       ${colors.reset}
${colors.yellow}           Credit: Greyscope&Co, Arcxteam, xAI Community       ${colors.reset}
${colors.cyan}=======================================================================${colors.reset}
`;
        console.log(banner);
    },
    section: (msg, accountIndex = null) => {
        const line = '─'.repeat(50);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold}${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg, accountIndex = null) => process.stdout.write(`\r${colors.blue}[COUNTDOWN]${accountIndex ? ` Account ${accountIndex}:` : ''} ${msg}${colors.reset}`),
};

/**
 * Reads proxies from proxies.txt
 * @returns {string[]}
 */
function readProxies() {
    const proxyFilePath = path.join(__dirname, 'proxies.txt');
    try {
        if (fs.existsSync(proxyFilePath)) {
            const proxies = fs.readFileSync(proxyFilePath, 'utf-8')
                .split('\n')
                .map(p => p.trim())
                .filter(p => p && /^http(s)?:\/\/[^:]+(:\w+)?@[^:]+:\d+$/.test(p));
            if (proxies.length === 0) logger.warn('No valid proxies found in proxies.txt.');
            return proxies;
        }
        logger.warn('proxies.txt not found.');
        return [];
    } catch (error) {
        logger.error(`Error reading proxies.txt: ${error.message}`);
        return [];
    }
}

/**
 * Reads refresh tokens from .env
 * @returns {string[]}
 */
function readRefreshTokens() {
    const tokens = [];
    let i = 1;
    while (process.env[`REFRESH_TOKEN_${i}`]) {
        tokens.push(process.env[`REFRESH_TOKEN_${i}`]);
        i++;
    }
    if (!tokens.length && process.env.REFRESH_TOKEN) {
        tokens.push(process.env.REFRESH_TOKEN);
    }
    if (!tokens.length) {
        logger.error('No refresh tokens found in .env file.');
    }
    return tokens;
}

class TitanNode {
    constructor(refreshToken, proxy = null, accountIndex = 1, proxyIndex = null) {
        this.refreshToken = refreshToken;
        this.proxy = proxy;
        this.accountIndex = accountIndex;
        this.proxyIndex = proxyIndex;
        this.accessToken = null;
        this.userId = null;
        this.email = null;
        this.deviceId = uuidv4();
        this.dataSent = 0;
        this.dataReceived = 0;
        this.servers = [
            { api: 'https://task.titannet.info', ws: 'wss://task.titannet.info' },
            { api: 'https://task.titanedge.cn', ws: 'wss://task.titanedge.cn' },
            { api: 'https://task.titannet.io', ws: 'wss://task.titannet.io' },
            { api: 'https://task.titandev.info', ws: 'wss://task.titandev.info' },
        ];
        this.currentServerIndex = 0;

        const agent = this.proxy ? new HttpsProxyAgent(this.proxy) : null;

        this.api = axios.create({
            baseURL: this.servers[this.currentServerIndex].api,
            httpsAgent: agent,
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Content-Type': 'application/json',
                'User-Agent': randomUseragent.getRandom(),
            },
        });

        this.api.interceptors.request.use((config) => {
            this.dataSent += JSON.stringify(config.data || {}).length;
            return config;
        });

        this.api.interceptors.response.use((response) => {
            this.dataReceived += JSON.stringify(response.data || {}).length;
            return response;
        });

        this.ws = null;
        this.reconnectInterval = 1000 * 60 * 5;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.isSingleAccount = null; // Will be set in start()
    }

    async refreshAccessToken() {
        logger.loading(`Refreshing access token...`, this.accountIndex);
        try {
            const response = await this.api.post('/api/auth/refresh-token', {
                refresh_token: this.refreshToken,
            });

            if (response.data && response.data.code === 0) {
                this.accessToken = response.data.data.access_token;
                this.userId = response.data.data.user_id;
                this.email = response.data.data.email || 'Unknown';
                this.api.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
                logger.success(`Access token refreshed. Email: ${this.email}`, this.accountIndex);
                logger.bandwidth(`Data Sent: ${this.dataSent} bytes, Received: ${this.dataReceived} bytes`, this.accountIndex);
                return true;
            } else {
                logger.error(`Failed to refresh token: ${response.data.msg || 'Unknown error'}`, this.accountIndex);
                return false;
            }
        } catch (error) {
            logger.error(`Error refreshing access token: ${error.message}`, this.accountIndex);
            return false;
        }
    }

    async registerNode() {
        logger.loading(`Registering node...`, this.accountIndex);
        try {
            const payload = {
                ext_version: "0.0.4",
                language: "en",
                user_script_enabled: true,
                device_id: this.deviceId,
                install_time: new Date().toISOString(),
            };
            const response = await this.api.post('/api/webnodes/register', payload);

            if (response.data && response.data.code === 0) {
                logger.success(`Node registered successfully.`, this.accountIndex);
                logger.success(`Initial Points: ${JSON.stringify(response.data.data)}`, this.accountIndex);
            } else {
                logger.error(`Node registration failed: ${response.data.msg || 'Unknown error'}`, this.accountIndex);
            }
        } catch (error) {
            logger.error(`Error registering node: ${error.message}`, this.accountIndex);
        }
    }

    connectWebSocket() {
        const server = this.servers[this.currentServerIndex];
        logger.loading(`Connecting to WebSocket at ${server.ws}...`, this.accountIndex);
        const wsUrl = `${server.ws}/api/public/webnodes/ws?token=${this.accessToken}&device_id=${this.deviceId}`;
        const agent = this.proxy ? new HttpsProxyAgent(this.proxy) : null;

        this.ws = new WebSocket(wsUrl, {
            agent: agent,
            headers: {
                'User-Agent': this.api.defaults.headers['User-Agent'],
            },
        });

        this.ws.on('open', () => {
            logger.success(`WebSocket connection established to ${server.ws}. Waiting for jobs...`, this.accountIndex);
            this.reconnectAttempts = 0;
            this.pingInterval = setInterval(() => {
                if (this.ws.readyState === WebSocket.OPEN) {
                    const echoMessage = JSON.stringify({ cmd: 1, echo: "echo me", jobReport: { cfgcnt: 2, jobcnt: 0 } });
                    this.ws.send(echoMessage);
                    this.dataSent += echoMessage.length;
                }
            }, 30 * 1000);
        });

        this.ws.on('message', (data) => {
            try {
                this.dataReceived += data.length;
                const message = JSON.parse(data);
                if (message.cmd === 1) {
                    const response = JSON.stringify({ cmd: 2, echo: message.echo });
                    this.ws.send(response);
                    this.dataSent += response.length;
                }
                if (message.userDataUpdate) {
                    logger.success(`TNTIP Points Update - Get Today: ${message.userDataUpdate.today_points}, Get Total: ${message.userDataUpdate.total_points}`, this.accountIndex);
                }
                logger.bandwidth(`Data Sent: ${this.dataSent} bytes, Received: ${this.dataReceived} bytes`, this.accountIndex);
            } catch (error) {
                logger.warn(`Could not parse message: ${data}`, this.accountIndex);
            }
        });

        this.ws.on('error', (error) => {
            logger.error(`WebSocket error: ${error.message}`, this.accountIndex);
            this.ws.close();
        });

        this.ws.on('close', () => {
            logger.warn(`WebSocket connection closed. Attempting to reconnect...`, this.accountIndex);
            clearInterval(this.pingInterval);
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts);
                setTimeout(() => this.tryNextServer(), delay);
            } else {
                logger.critical(`Max reconnect attempts reached on ${server.ws}. Stopping.`, this.accountIndex);
            }
        });
    }

    tryNextServer() {
        this.currentServerIndex = (this.currentServerIndex + 1) % this.servers.length;
        const newServer = this.servers[this.currentServerIndex];
        logger.info(`Switching to server: ${newServer.api}`, this.accountIndex);
        this.api.defaults.baseURL = newServer.api;
        this.start();
    }

    async start() {
        this.isSingleAccount = readRefreshTokens().length === 1;
        logger.banner();
        logger.section(`Starting Account ${this.accountIndex}`, this.isSingleAccount ? null : this.accountIndex);
        logger.step(`Device ID: ${this.deviceId}`, this.isSingleAccount ? null : this.accountIndex);
        if (this.proxy) {
            logger.info(`Using Proxy ${this.proxyIndex + 1}: ${this.proxy}`, this.isSingleAccount ? null : this.accountIndex);
        } else {
            logger.info(`Running in Direct Mode (No Proxy)`, this.isSingleAccount ? null : this.accountIndex);
        }

        const tokenRefreshed = await this.refreshAccessToken();
        if (tokenRefreshed) {
            await this.registerNode();
            this.connectWebSocket();
        } else {
            logger.error(`Could not start bot due to token refresh failure.`, this.isSingleAccount ? null : this.accountIndex);
            if (this.currentServerIndex < this.servers.length - 1) {
                this.tryNextServer();
            }
        }
    }
}

function main() {
    const refreshTokens = readRefreshTokens();
    const proxies = readProxies();

    if (!refreshTokens.length) {
        logger.critical('No valid refresh tokens found. Please add REFRESH_TOKEN or REFRESH_TOKEN_1, etc., to .env file.');
        return;
    }

    if (refreshTokens.length > 1 && proxies.length < refreshTokens.length) {
        logger.critical('Multiple accounts require an equal or greater number of proxies. Please add more proxies to proxies.txt.');
        return;
    }

    logger.summary(`Starting ${refreshTokens.length} account(s) with ${proxies.length} available proxies.`);

    refreshTokens.forEach((token, index) => {
        const proxy = refreshTokens.length > 1 ? proxies[index % proxies.length] : null;
        const proxyIndex = refreshTokens.length > 1 ? index % proxies.length : null;
        setTimeout(() => {
            const bot = new TitanNode(token, proxy, index + 1, proxyIndex);
            bot.start();
        }, index * 10000);
    });
}

main();