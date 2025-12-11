/**
 * Persistent LLM Client for TRAI
 * Connects to inference_server.py that keeps model loaded in GPU
 *
 * Usage:
 *   const client = new PersistentLLMClient();
 *   await client.initialize();
 *   const response = await client.generateResponse("Your prompt here");
 */

const { spawn } = require('child_process');
const path = require('path');

class PersistentLLMClient {
    constructor() {
        this.serverProcess = null;
        this.isReady = false;
        this.pendingRequests = new Map();
        this.requestId = 0;
    }

    /**
     * Start the persistent Python server
     * This loads the model into GPU memory (takes 10-20s, but only once!)
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            console.log('🚀 Starting persistent TRAI inference server...');

            // Use ctransformers server (CHANGE 627: Fixed CUDA issues with ctransformers)
            const ctServer = path.join(__dirname, 'inference_server_ct.py');
            const ggufServer = path.join(__dirname, 'inference_server_gguf.py');
            const regularServer = path.join(__dirname, 'inference_server.py');
            const serverPath = require('fs').existsSync(ctServer) ? ctServer :
                             (require('fs').existsSync(ggufServer) ? ggufServer : regularServer);

            // Spawn persistent Python process
            this.serverProcess = spawn('python3', [serverPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Listen for server ready signal
            this.serverProcess.stderr.on('data', (data) => {
                const message = data.toString();
                console.log(`[TRAI Server] ${message.trim()}`);

                // Server is ready when model is loaded
                if (message.includes('Server Ready') || message.includes('Server running, ready for requests')) {
                    this.isReady = true;
                    console.log('✅ TRAI Persistent Server Ready!');
                    resolve();
                }
            });

            // Handle server stdout (responses)
            this.serverProcess.stdout.on('data', (data) => {
                try {
                    const lines = data.toString().split('\n').filter(l => l.trim());

                    for (const line of lines) {
                        const result = JSON.parse(line);

                        // Find pending request and resolve it
                        const pendingIds = Array.from(this.pendingRequests.keys());
                        if (pendingIds.length > 0) {
                            const reqId = pendingIds[0]; // FIFO
                            const pending = this.pendingRequests.get(reqId);
                            this.pendingRequests.delete(reqId);

                            if (result.error) {
                                pending.reject(new Error(result.error));
                            } else {
                                pending.resolve(result.response);
                            }
                        }
                    }
                } catch (error) {
                    console.error('❌ Failed to parse server response:', error.message);
                }
            });

            // Handle server exit
            this.serverProcess.on('exit', (code) => {
                console.log(`⚠️ TRAI Server exited with code ${code}`);
                // If server exits during initialization, reject immediately
                if (!this.isReady) {
                    reject(new Error(`Server failed to start (exit code ${code})`));
                }
                this.isReady = false;

                // Reject all pending requests
                for (const [id, pending] of this.pendingRequests) {
                    pending.reject(new Error('Server died'));
                }
                this.pendingRequests.clear();
            });

            this.serverProcess.on('error', (error) => {
                console.error('❌ Failed to start TRAI server:', error.message);
                reject(error);
            });

            // Timeout if server doesn't start in 60s
            setTimeout(() => {
                if (!this.isReady) {
                    reject(new Error('Server startup timeout (60s)'));
                }
            }, 60000);
        });
    }

    /**
     * Generate response using the persistent server (FAST!)
     * @param {string} prompt - The prompt to send
     * @param {number} maxTokens - Max tokens to generate
     * @returns {Promise<string>} - The generated response
     */
    async generateResponse(prompt, maxTokens = 300) {
        if (!this.isReady) {
            throw new Error('TRAI Server not ready');
        }

        return new Promise((resolve, reject) => {
            const reqId = this.requestId++;

            // Store pending request
            this.pendingRequests.set(reqId, { resolve, reject });

            // Send request to server
            const request = JSON.stringify({ prompt, max_tokens: maxTokens }) + '\n';
            this.serverProcess.stdin.write(request);

            // Timeout after 10s
            setTimeout(() => {
                if (this.pendingRequests.has(reqId)) {
                    this.pendingRequests.delete(reqId);
                    reject(new Error('Inference timeout (10s)'));
                }
            }, 10000);
        });
    }

    /**
     * Shutdown the server gracefully
     */
    shutdown() {
        if (this.serverProcess) {
            console.log('🛑 Shutting down TRAI server...');
            this.serverProcess.kill('SIGTERM');
            this.serverProcess = null;
            this.isReady = false;
        }
    }

    /**
     * Get server status
     */
    getStatus() {
        return {
            ready: this.isReady,
            pendingRequests: this.pendingRequests.size,
            processAlive: this.serverProcess && !this.serverProcess.killed
        };
    }
}

module.exports = PersistentLLMClient;
