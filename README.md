# TITAN AGENT NODE

Here’s the step-by-step tutorial for setting up the **Titan Network Galileo Testnet Node** in English:

---

### **Minimum Hardware Requirements**
- **CPU**: 2 cores
- **RAM**: 2GB
- **Storage**: 50GB SSD

---

### **Step 1: Prepare Wallet and Obtain Key**
1. Go to the Testnet link: [https://test4.titannet.io/](https://test4.titannet.io/).
2. Connect your **Kepler Wallet**.
3. Copy the **key** provided after connecting your wallet.

---

### **Step 2: Install Dependencies**
1. **Update your system**:
   ```bash
   sudo apt update
   ```
2. **Install Snap** (skip if already installed):
   ```bash
   sudo apt install snapd
   ```
3. **Enable Snap**:
   ```bash
   sudo systemctl enable --now snapd.socket
   ```
4. **Install Multipass** using Snap:
   ```bash
   sudo snap install multipass
   ```

---

### **Step 3: Download and Extract Installation Package**
1. **Download the installation package**:
   ```bash
   wget https://pcdn.titannet.io/test4/bin/agent-linux.zip
   ```
2. **Create a directory** to store the installation files:
   ```bash
   mkdir -p /opt/titanagent
   ```
3. **Extract the package** into the created directory:
   ```bash
   unzip agent-linux.zip -d /opt/titanagent
   ```

---

### **Step 4: Run the Node**
1. **Create a screen session** to run the node:
   ```bash
   screen -S titan
   ```
2. **Navigate to the Titan directory**:
   ```bash
   cd /opt/titanagent
   ```
3. **Run the agent** by replacing `<your-key>` with the key you copied earlier:
   ```bash
   ./agent --working-dir=/opt/titanagent --server-url=https://test4-api.titannet.io --key=<your-key>
   ```
   **Note**: Make sure to replace `<your-key>` with your actual key.

4. **Copy your Node ID** displayed after running the command.

5. **Exit the screen session** without stopping the process:
   - Press `CTRL + A`, then `D`.

---

### **Step 5: Verify Node Status**
1. Visit the following link to check your node’s status:
   [https://test4.titannet.io/nodeDetails](https://test4.titannet.io/nodeDetails).
2. Search for your **Node ID** to confirm that your node is running properly.

---

### **Important Notes**
- Currently, the node can only be run in the **China region**. Support for other regions will be announced soon.
- For more detailed instructions, refer to the official documentation:
  [Titan Network Galileo Testnet Guide](https://titannet.gitbook.io/titan-network-en/galileo-testnet/node-participation-guide/run-titan-agent-on-linux).

---

### **Example Tweet**:
"🚀 Just set up my **Titan Network Galileo Testnet Node**! 🌐 Here’s how:  
1. Prepare your Kepler Wallet & get your key.  
2. Install dependencies (Snap & Multipass).  
3. Download & extract the installation package.  
4. Run the node with your key.  
5. Verify your node status on the dashboard.  
Note: Currently available for the China region only.  
Check out the full guide here: https://titannet.gitbook.io/titan-network-en/galileo-testnet/node-participation-guide/run-titan-agent-on-linux #Blockchain #Testnet #TitanNetwork"
