const net = require("net");
const { MonitorType } = require("./monitor-type");
const { UP, log } = require("../../src/util");

const HLL_MAGIC = 0xDE450508;
const HLL_HEADER_LEN = 12; // <III  little-endian uint32 x3
const HLL_VERSION = 2;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Minimal Hell Let Loose RCONv2 client (self-contained TCP implementation).
 * Protocol reference: see project doc rconv2.md / connection.py
 *
 * Flow:
 *  1. TCP connect.
 *  2. Send ServerConnect (empty body, no auth) -> response.contentBody is base64-encoded XOR key.
 *  3. Send Login (password as contentBody, body XOR-encrypted) -> response.contentBody is auth token.
 *  4. Subsequent commands carry authToken and are XOR-encrypted.
 */
class HLLRconClient {
    /**
     * @param {string} host Server host
     * @param {number} port RCON port
     * @param {number} timeoutMs Socket timeout in milliseconds
     */
    constructor(host, port, timeoutMs = DEFAULT_TIMEOUT_MS) {
        this.host = host;
        this.port = port;
        this.timeoutMs = timeoutMs;
        this.socket = null;
        this.xorKey = null;
        this.authToken = "";
        this._requestId = 0;
        this._buffer = Buffer.alloc(0);
        this._pending = new Map(); // requestId -> {resolve, reject}
        this._closed = false;
    }

    /**
     * Open TCP connection and complete ServerConnect handshake.
     * @returns {Promise<void>}
     */
    connect() {
        return new Promise((resolve, reject) => {
            this.socket = new net.Socket();
            this.socket.setTimeout(this.timeoutMs);

            const onError = (err) => {
                this._failAll(err);
                reject(err);
            };
            this.socket.once("error", onError);
            this.socket.once("timeout", () => {
                const err = new Error("HLL RCON socket timeout");
                this.socket.destroy(err);
                onError(err);
            });
            this.socket.on("data", (chunk) => this._onData(chunk));
            this.socket.on("close", () => {
                this._closed = true;
                this._failAll(new Error("HLL RCON connection closed"));
            });

            this.socket.connect(this.port, this.host, async () => {
                try {
                    // ServerConnect: no auth, no XOR yet
                    const resp = await this._exchange("ServerConnect", "", { encrypt: false, includeAuth: false });
                    if (resp.statusCode !== 200) {
                        throw new Error(`ServerConnect failed: ${resp.statusCode} ${resp.statusMessage}`);
                    }
                    if (typeof resp.contentBody !== "string" || !resp.contentBody) {
                        throw new Error("ServerConnect returned empty XOR key");
                    }
                    this.xorKey = Buffer.from(resp.contentBody, "base64");
                    if (this.xorKey.length === 0) {
                        throw new Error("ServerConnect returned invalid XOR key");
                    }
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    /**
     * Authenticate with the RCON password.
     * @param {string} password RCON password
     * @returns {Promise<void>}
     */
    async login(password) {
        const resp = await this._exchange("Login", password, { encrypt: true, includeAuth: false });
        if (resp.statusCode !== 200) {
            throw new Error(`Login failed: ${resp.statusCode} ${resp.statusMessage || "unauthorized"}`);
        }
        if (typeof resp.contentBody !== "string" || !resp.contentBody) {
            throw new Error("Login returned empty auth token");
        }
        this.authToken = resp.contentBody;
    }

    /**
     * Fetch session info via GetServerInformation { Name: "session" }.
     * Returns { playerCount, maxPlayerCount } among other fields.
     * Used as the lightweight heartbeat query (small fixed-shape payload),
     * unlike `players` which can be very large under load.
     * @returns {Promise<{playerCount: number, maxPlayerCount: number, raw: object}>}
     */
    async getSession() {
        const body = JSON.stringify({ Name: "session", Value: "" });
        const resp = await this._exchange("GetServerInformation", body, { encrypt: true, includeAuth: true });
        if (resp.statusCode !== 200) {
            throw new Error(`GetServerInformation(session) failed: ${resp.statusCode} ${resp.statusMessage}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(resp.contentBody || "{}");
        } catch (e) {
            throw new Error("Invalid JSON in session response");
        }
        const playerCount = Number(parsed.playerCount);
        const maxPlayerCount = Number(parsed.maxPlayerCount);
        if (!Number.isFinite(playerCount)) {
            throw new Error("Session response missing numeric playerCount");
        }
        return {
            playerCount,
            maxPlayerCount: Number.isFinite(maxPlayerCount) ? maxPlayerCount : 0,
            raw: parsed,
        };
    }

    /**
     * Count DISCONNECTED entries in the admin log within the given window.
     * Calls GetAdminLog with Filters="disconnected" (server-side narrow) and
     * additionally requires each entry's message to start with "DISCONNECTED "
     * to avoid edge cases where the substring matches another action.
     * @param {number} sinceSec Window length in seconds (must be >= 0)
     * @returns {Promise<number>} Count of disconnect events in the window
     */
    async getDisconnectCountSince(sinceSec) {
        const safeSeconds = Math.max(0, Math.floor(Number(sinceSec) || 0));
        const body = JSON.stringify({
            LogBackTrackTime: safeSeconds,
            Filters: "disconnected",
        });
        const resp = await this._exchange("GetAdminLog", body, { encrypt: true, includeAuth: true });
        if (resp.statusCode !== 200) {
            throw new Error(`GetAdminLog failed: ${resp.statusCode} ${resp.statusMessage}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(resp.contentBody || "{}");
        } catch (e) {
            throw new Error("Invalid JSON in admin log response");
        }
        const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
        let count = 0;
        for (const entry of entries) {
            const msg = entry && typeof entry.message === "string" ? entry.message : "";
            if (msg.startsWith("DISCONNECTED ")) {
                count += 1;
            }
        }
        return count;
    }

    /**
     * Close the underlying socket.
     * @returns {void}
     */
    close() {
        if (this.socket && !this._closed) {
            try {
                this.socket.end();
            } catch (_) { /* ignore */ }
            try {
                this.socket.destroy();
            } catch (_) { /* ignore */ }
        }
        this._closed = true;
    }

    /**
     * XOR a buffer in-place against the negotiated key.
     * @param {Buffer} buf Buffer to transform
     * @returns {Buffer} The same buffer reference (for chaining)
     */
    _xor(buf) {
        if (!this.xorKey || this.xorKey.length === 0) {
            return buf;
        }
        for (let i = 0; i < buf.length; i++) {
            buf[i] = buf[i] ^ this.xorKey[i % this.xorKey.length];
        }
        return buf;
    }

    /**
     * Send a command and wait for the matching response.
     * @param {string} name Command name
     * @param {string} contentBody Stringified body (already JSON-stringified for object params)
     * @param {{encrypt: boolean, includeAuth: boolean}} opts Encryption + auth options
     * @returns {Promise<{requestId: number, name: string, version: number, statusCode: number, statusMessage: string, contentBody: string}>}
     */
    _exchange(name, contentBody, opts) {
        return new Promise((resolve, reject) => {
            if (!this.socket || this._closed) {
                reject(new Error("HLL RCON not connected"));
                return;
            }
            this._requestId += 1;
            const requestId = this._requestId;

            const payload = {
                authToken: opts.includeAuth ? (this.authToken || "") : "",
                version: HLL_VERSION,
                name,
                contentBody: contentBody || "",
            };
            const bodyJson = Buffer.from(JSON.stringify(payload), "utf8");
            const body = opts.encrypt ? this._xor(Buffer.from(bodyJson)) : bodyJson;

            const header = Buffer.alloc(HLL_HEADER_LEN);
            header.writeUInt32LE(HLL_MAGIC, 0);
            header.writeUInt32LE(requestId, 4);
            header.writeUInt32LE(body.length, 8);

            const timer = setTimeout(() => {
                this._pending.delete(requestId);
                reject(new Error(`HLL RCON timeout waiting for response to ${name}`));
            }, this.timeoutMs);

            this._pending.set(requestId, {
                resolve: (resp) => {
                    clearTimeout(timer);
                    resolve(resp);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });

            this.socket.write(Buffer.concat([ header, body ]), (err) => {
                if (err) {
                    const pending = this._pending.get(requestId);
                    if (pending) {
                        this._pending.delete(requestId);
                        pending.reject(err);
                    }
                }
            });
        });
    }

    /**
     * Handle incoming bytes and split out complete frames.
     * @param {Buffer} chunk Newly received bytes
     * @returns {void}
     */
    _onData(chunk) {
        this._buffer = Buffer.concat([ this._buffer, chunk ]);
        while (this._buffer.length >= HLL_HEADER_LEN) {
            const magic = this._buffer.readUInt32LE(0);
            if (magic !== HLL_MAGIC) {
                this._failAll(new Error(`Invalid HLL RCON magic: 0x${magic.toString(16)}`));
                this.close();
                return;
            }
            const requestId = this._buffer.readUInt32LE(4);
            const bodyLen = this._buffer.readUInt32LE(8);
            if (this._buffer.length < HLL_HEADER_LEN + bodyLen) {
                return; // wait for more data
            }
            const bodyEnc = this._buffer.slice(HLL_HEADER_LEN, HLL_HEADER_LEN + bodyLen);
            this._buffer = this._buffer.slice(HLL_HEADER_LEN + bodyLen);

            // Responses after ServerConnect are XOR-encrypted using the same key.
            const bodyBytes = this.xorKey ? this._xor(Buffer.from(bodyEnc)) : bodyEnc;
            let parsed;
            try {
                parsed = JSON.parse(bodyBytes.toString("utf8"));
            } catch (e) {
                this._failAll(new Error("Failed to parse HLL RCON response JSON"));
                this.close();
                return;
            }
            const pending = this._pending.get(requestId);
            if (pending) {
                this._pending.delete(requestId);
                pending.resolve({
                    requestId,
                    name: String(parsed.name || ""),
                    version: Number(parsed.version || HLL_VERSION),
                    statusCode: Number(parsed.statusCode),
                    statusMessage: String(parsed.statusMessage || ""),
                    contentBody: parsed.contentBody == null ? "" : String(parsed.contentBody),
                });
            }
        }
    }

    /**
     * Reject every in-flight request (used during socket failure/close).
     * @param {Error} err Error to propagate
     * @returns {void}
     */
    _failAll(err) {
        for (const [ , pending ] of this._pending) {
            try {
                pending.reject(err);
            } catch (_) { /* ignore */ }
        }
        this._pending.clear();
    }
}

/**
 * Hell Let Loose RCONv2 monitor.
 *
 * Heartbeat reports current player count via GetServerInformation { Name: "session" }
 * (`playerCount` / `maxPlayerCount`), which is the lightweight, official endpoint
 * used by hll_rcon_tool's `get_slots()`.
 *
 * Optionally raises DOWN when:
 *  - low-population alert is enabled and player count < hllMinPlayers, or
 *  - rapid-exit alert is enabled and the number of DISCONNECTED entries in the
 *    server's admin log within the configured window is >= hllExitDrop.
 *    The admin log is queried with GetAdminLog (Filters="disconnected",
 *    LogBackTrackTime=hllExitWindowSec); each entry whose message starts with
 *    "DISCONNECTED " is counted.
 *
 * No per-monitor state is needed: rapid-exit detection is fully driven by the
 * server's own admin log, so restarts of uptime-kuma don't reset baselines.
 */
class HLLRconMonitorType extends MonitorType {
    name = "hll-rcon";

    /**
     * @inheritdoc
     */
    async check(monitor, heartbeat, _server) {
        if (!monitor.hostname) {
            throw new Error("Hostname is required.");
        }
        if (!monitor.port) {
            throw new Error("Port is required.");
        }
        if (!monitor.hllRconPassword) {
            throw new Error("RCON password is required.");
        }

        const interval = Math.max(1, Number(monitor.interval) || 60);
        // Cap timeout to a fraction of the interval to avoid stacking checks,
        // but always leave at least a few seconds so logins can complete.
        const timeoutMs = Math.max(3000, Math.min(20000, interval * 1000 * 0.8));

        // Threshold parameters (read up-front so we know whether we need the admin log call)
        const minEnabled = Boolean(monitor.hllMinPlayersEnabled);
        const minPlayers = Math.max(0, parseInt(monitor.hllMinPlayers, 10) || 0);
        const exitEnabled = Boolean(monitor.hllExitEnabled);
        const exitDrop = Math.max(0, parseInt(monitor.hllExitDrop, 10) || 0);
        const windowSec = Math.max(1, parseInt(monitor.hllExitWindowSec, 10) || 300);

        const client = new HLLRconClient(monitor.hostname, Number(monitor.port), timeoutMs);
        let playerCount;
        let maxPlayerCount = 0;
        let disconnectsInWindow = 0;
        try {
            await client.connect();
            await client.login(String(monitor.hllRconPassword));
            const session = await client.getSession();
            playerCount = session.playerCount;
            maxPlayerCount = session.maxPlayerCount;
            if (exitEnabled && exitDrop > 0) {
                disconnectsInWindow = await client.getDisconnectCountSince(windowSec);
            }
        } catch (e) {
            throw new Error(`HLL RCON check failed: ${e.message}`);
        } finally {
            client.close();
        }

        const reasons = [];
        if (minEnabled && playerCount < minPlayers) {
            reasons.push(`player count ${playerCount} is below threshold ${minPlayers}`);
        }
        if (exitEnabled && exitDrop > 0 && disconnectsInWindow >= exitDrop) {
            reasons.push(`${disconnectsInWindow} disconnects within the last ${windowSec}s (threshold ${exitDrop})`);
        }

        if (reasons.length > 0) {
            const msg = `HLL RCON alert: ${reasons.join("; ")} (current ${playerCount})`;
            log.debug("monitor", `[hll-rcon] ${monitor.name || monitor.id}: ${msg}`);
            throw new Error(msg);
        }

        heartbeat.status = UP;
        heartbeat.msg = maxPlayerCount > 0
            ? `Players: ${playerCount}/${maxPlayerCount}`
            : `Players: ${playerCount}`;
        // Reuse the heartbeat `ping` column as the time-series sample for the
        // player-count chart, status pages, prometheus exporter and badge SVG.
        // UI components that render this value as "ms" are switched to a
        // "players" label when monitor.type === "hll-rcon".
        heartbeat.ping = playerCount;
    }
}

module.exports = {
    HLLRconClient,
    HLLRconMonitorType,
};
