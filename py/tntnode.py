import os
import re
import time
import json
from datetime import datetime
from pathlib import Path
import asyncio
import requests
from websocket import WebSocketApp, WebSocketException
from uuid import uuid4
from fake_useragent import UserAgent
from dotenv import load_dotenv
from colorama import init, Fore, Style

init()
# logging
COLORS = {
    'reset': Style.RESET_ALL,
    'cyan': Fore.CYAN,
    'green': Fore.GREEN,
    'yellow': Fore.YELLOW,
    'red': Fore.RED,
    'white': Fore.WHITE,
    'bold': Style.BRIGHT,
    'blue': Fore.BLUE,
    'magenta': Fore.MAGENTA,
    'gray': Fore.LIGHTBLACK_EX,
}

# Fungsi logger
class Logger:
    @staticmethod
    def info(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['cyan']}[INFO]{prefix} {msg}{COLORS['reset']}")

    @staticmethod
    def warn(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['yellow']}[WARN]{prefix} {msg}{COLORS['reset']}")

    @staticmethod
    def error(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['red']}[ERROR]{prefix} {msg}{COLORS['reset']}")

    @staticmethod
    def success(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['green']}[SUCCESS]{prefix} {msg}{COLORS['reset']}")

    @staticmethod
    def loading(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['magenta']}[LOADING]{prefix} {msg}{COLORS['reset']}")

    @staticmethod
    def step(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['blue']}[STEP]{prefix} {COLORS['bold']}{msg}{COLORS['reset']}")

    @staticmethod
    def critical(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['red']}{COLORS['bold']}[FATAL]{prefix} {msg}{COLORS['reset']}")

    @staticmethod
    def summary(msg):
        print(f"{COLORS['green']}{COLORS['bold']}[SUMMARY] {msg}{COLORS['reset']}")

    @staticmethod
    def bandwidth(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"{COLORS['white']}[BANDWIDTH]{prefix} {msg}{COLORS['reset']}")

    @staticmethod
    def banner():
        banner = f"""
{COLORS['green']}============================ WELCOME TO TITAN NODE ============================={COLORS['reset']}
{COLORS['yellow']}
 ██████╗██╗   ██║ █████╗ ███╗   ██║███╗   ██║ ██████╗ ██████╗ ███████╗
██╔════╝██║   ██║██╔══██╗████╗  ██║████╗  ██║██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║███████║██╔██╗ ██║██╔██╗ ██║██║   ██║██║  ██║█████╗  
██║     ██║   ██║██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║██║  ██║██╔══╝  
╚██████╗╚██████╔╝██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝██████╔╝███████╗
 ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝
{COLORS['reset']}
{COLORS['cyan']}================== TitanNet Node Runner by CUANNODE =================={COLORS['reset']}
{COLORS['magenta']}       Powered by Insider - Run Multiple Nodes with Ease       {COLORS['reset']}
{COLORS['yellow']}           Credit: Greyscope&Co, Arcxteam, xAI Community       {COLORS['reset']}
{COLORS['cyan']}======================================================================={COLORS['reset']}
"""
        print(banner)

    @staticmethod
    def section(msg, account_index=None):
        line = '─' * 50
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"\n{COLORS['gray']}{line}{COLORS['reset']}")
        if msg:
            print(f"{COLORS['white']}{COLORS['bold']}{prefix} {msg} {COLORS['reset']}")
        print(f"{COLORS['gray']}{line}{COLORS['reset']}\n")

    @staticmethod
    def countdown(msg, account_index=None):
        prefix = f" Account {account_index}:" if account_index else ""
        print(f"\r{COLORS['blue']}[COUNTDOWN]{prefix} {msg}{COLORS['reset']}", end="")

# proxies.txt
def read_proxies():
    proxy_file_path = Path(__file__).parent / 'proxies.txt'
    try:
        if proxy_file_path.exists():
            with open(proxy_file_path, 'r', encoding='utf-8') as f:
                proxies = [p.strip() for p in f.readlines() if p.strip() and re.match(r'^http(s)?:\/\/[^:]+(:\w+)?@[^:]+:\d+$', p.strip())]
            if not proxies:
                Logger.warn('No valid proxies found in proxies.txt.')
            return proxies
        Logger.warn('proxies.txt not found.')
        return []
    except Exception as e:
        Logger.error(f"Error reading proxies.txt: {str(e)}")
        return []

# .env
def read_refresh_tokens():
    load_dotenv()
    tokens = []
    i = 1
    while os.getenv(f'REFRESH_TOKEN_{i}'):
        tokens.append(os.getenv(f'REFRESH_TOKEN_{i}'))
        i += 1
    if not tokens and os.getenv('REFRESH_TOKEN'):
        tokens.append(os.getenv('REFRESH_TOKEN'))
    if not tokens:
        Logger.error('No refresh tokens found in .env file.')
    return tokens

class TitanNode:
    def __init__(self, refresh_token, proxy=None, account_index=1, proxy_index=None):
        self.refresh_token = refresh_token
        self.proxy = proxy
        self.account_index = account_index
        self.proxy_index = proxy_index
        self.access_token = None
        self.user_id = None
        self.email = None
        self.device_id = str(uuid4())
        self.data_sent = 0
        self.data_received = 0
        self.servers = [
            {'api': 'https://task.titannet.info', 'ws': 'wss://task.titannet.info'},
            {'api': 'https://task.titanedge.cn', 'ws': 'wss://task.titanedge.cn'},
            {'api': 'https://task.titannet.io', 'ws': 'wss://task.titannet.io'},
            {'api': 'https://task.titandev.info', 'ws': 'wss://task.titandev.info'},
        ]
        self.current_server_index = 0
        self.session = requests.Session()
        self.ua = UserAgent()
        self.session.headers.update({
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'User-Agent': self.ua.random,
        })
        if self.proxy:
            self.session.proxies = {'http': self.proxy, 'https': self.proxy}
        self.ws = None
        self.reconnect_interval = 5 * 60  # 5 menit
        self.ping_interval = None
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 5
        self.is_single_account = None  # Akan diatur di start()

    async def refresh_access_token(self):
        Logger.loading("Refreshing access token...", None if self.is_single_account else self.account_index)
        try:
            response = self.session.post(
                f"{self.servers[self.current_server_index]['api']}/api/auth/refresh-token",
                json={"refresh_token": self.refresh_token}
            )
            self.data_sent += len(json.dumps({"refresh_token": self.refresh_token}))
            self.data_received += len(json.dumps(response.json()))
            data = response.json()
            if data.get('code') == 0:
                self.access_token = data['data']['access_token']
                self.user_id = data['data']['user_id']
                self.email = data['data'].get('email', 'Unknown')
                self.session.headers.update({'Authorization': f'Bearer {self.access_token}'})
                Logger.success(f"Access token refreshed. Email: {self.email}", None if self.is_single_account else self.account_index)
                Logger.bandwidth(f"Data Sent: {self.data_sent} bytes, Received: {self.data_received} bytes", None if self.is_single_account else self.account_index)
                return True
            else:
                Logger.error(f"Failed to refresh token: {data.get('msg', 'Unknown error')}", None if self.is_single_account else self.account_index)
                return False
        except Exception as e:
            Logger.error(f"Error refreshing access token: {str(e)}", None if self.is_single_account else self.account_index)
            return False

    async def register_node(self):
        Logger.loading("Registering node...", None if self.is_single_account else self.account_index)
        try:
            payload = {
                "ext_version": "0.0.4",
                "language": "en",
                "user_script_enabled": True,
                "device_id": self.device_id,
                "install_time": datetime.utcnow().isoformat(),
            }
            response = self.session.post(
                f"{self.servers[self.current_server_index]['api']}/api/webnodes/register",
                json=payload
            )
            self.data_sent += len(json.dumps(payload))
            self.data_received += len(json.dumps(response.json()))
            data = response.json()
            if data.get('code') == 0:
                Logger.success("Node registered successfully.", None if self.is_single_account else self.account_index)
                Logger.success(f"Initial Points: {json.dumps(data['data'])}", None if self.is_single_account else self.account_index)
            else:
                Logger.error(f"Node registration failed: {data.get('msg', 'Unknown error')}", None if self.is_single_account else self.account_index)
        except Exception as e:
            Logger.error(f"Error registering node: {str(e)}", None if self.is_single_account else self.account_index)

    def connect_websocket(self):
        server = self.servers[self.current_server_index]
        Logger.loading(f"Connecting to WebSocket at {server['ws']}...", None if self.is_single_account else self.account_index)
        ws_url = f"{server['ws']}/api/public/webnodes/ws?token={self.access_token}&device_id={self.device_id}"
        headers = {'User-Agent': self.session.headers['User-Agent']}
        proxy_dict = {'http': self.proxy, 'https': self.proxy} if self.proxy else None

        def on_open(ws):
            Logger.success(f"WebSocket connection established to {server['ws']}. Waiting for jobs...", None if self.is_single_account else self.account_index)
            self.reconnect_attempts = 0
            async def ping():
                while self.ws and self.ws.sock and self.ws.sock.connected:
                    echo_message = json.dumps({"cmd": 1, "echo": "echo me", "jobReport": {"cfgcnt": 2, "jobcnt": 0}})
                    self.ws.send(echo_message)
                    self.data_sent += len(echo_message)
                    await asyncio.sleep(30)
            asyncio.ensure_future(ping())

        def on_message(ws, data):
            try:
                self.data_received += len(data)
                message = json.loads(data)
                if message.get('cmd') == 1:
                    response = json.dumps({"cmd": 2, "echo": message['echo']})
                    ws.send(response)
                    self.data_sent += len(response)
                if message.get('userDataUpdate'):
                    Logger.success(
                        f"TNTIP Points Update - Get Today: {message['userDataUpdate']['today_points']}, Get Total: {message['userDataUpdate']['total_points']}",
                        None if self.is_single_account else self.account_index
                    )
                Logger.bandwidth(f"Data Sent: {self.data_sent} bytes, Received: {self.data_received} bytes", None if self.is_single_account else self.account_index)
            except Exception as e:
                Logger.warn(f"Could not parse message: {data}", None if self.is_single_account else self.account_index)

        def on_error(ws, error):
            Logger.error(f"WebSocket error: {str(error)}", None if self.is_single_account else self.account_index)
            ws.close()

        def on_close(ws, close_status_code, close_msg):
            Logger.warn("WebSocket connection closed. Attempting to reconnect...", None if self.is_single_account else self.account_index)
            if self.ping_interval:
                self.ping_interval.cancel()
            if self.reconnect_attempts < self.max_reconnect_attempts:
                self.reconnect_attempts += 1
                delay = self.reconnect_interval * (2 ** self.reconnect_attempts)
                Logger.info(f"Reconnecting in {delay} seconds...", None if self.is_single_account else self.account_index)
                time.sleep(delay)
                asyncio.run(self.try_next_server())
            else:
                Logger.critical(f"Max reconnect attempts reached on {server['ws']}. Stopping.", None if self.is_single_account else self.account_index)

        self.ws = WebSocketApp(ws_url, header=headers, on_open=on_open, on_message=on_message, on_error=on_error, on_close=on_close)
        self.ws.run_forever(proxy=proxy_dict)

    async def try_next_server(self):
        self.current_server_index = (self.current_server_index + 1) % len(self.servers)
        new_server = self.servers[self.current_server_index]
        Logger.info(f"Switching to server: {new_server['api']}", None if self.is_single_account else self.account_index)
        self.session = requests.Session()
        self.session.headers.update({
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'User-Agent': self.ua.random,
        })
        if self.proxy:
            self.session.proxies = {'http': self.proxy, 'https': self.proxy}
        await self.start()

    async def start(self):
        self.is_single_account = len(read_refresh_tokens()) == 1
        Logger.banner()
        Logger.section(f"Starting Account {self.account_index}", None if self.is_single_account else self.account_index)
        Logger.step(f"Device ID: {self.device_id}", None if self.is_single_account else self.account_index)
        if self.proxy:
            Logger.info(f"Using Proxy {self.proxy_index + 1}: {self.proxy}", None if self.is_single_account else self.account_index)
        else:
            Logger.info("Running in Direct Mode (No Proxy)", None if self.is_single_account else self.account_index)

        if await self.refresh_access_token():
            await self.register_node()
            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, self.connect_websocket)
        else:
            Logger.error("Could not start bot due to token refresh failure.", None if self.is_single_account else self.account_index)
            if self.current_server_index < len(self.servers) - 1:
                await self.try_next_server()

async def main():
    refresh_tokens = read_refresh_tokens()
    proxies = read_proxies()

    if not refresh_tokens:
        Logger.critical("No valid refresh tokens found. Please add REFRESH_TOKEN or REFRESH_TOKEN_1, etc., to .env file.")
        return

    if len(refresh_tokens) > 1 and len(proxies) < len(refresh_tokens):
        Logger.critical("Multiple accounts require an equal or greater number of proxies. Please add more proxies to proxies.txt.")
        return

    Logger.summary(f"Starting {len(refresh_tokens)} account(s) with {len(proxies)} available proxies.")

    tasks = []
    for index, token in enumerate(refresh_tokens):
        proxy = proxies[index % len(proxies)] if len(refresh_tokens) > 1 else None
        proxy_index = index % len(proxies) if len(refresh_tokens) > 1 else None
        node = TitanNode(token, proxy, index + 1, proxy_index)
        tasks.append(node.start())
        await asyncio.sleep(15)  # Delay 15

    await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())