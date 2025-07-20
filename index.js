const mineflayer = require("mineflayer");
const express = require("express");

// Web server to keep Replit alive
const app = express();
let botStatus = {
  connected: false,
  uptime: 0,
  reconnectCount: 0,
  lastError: null,
  startTime: Date.now(),
};

app.get("/", (req, res) => {
  const uptimeMinutes = Math.floor((Date.now() - botStatus.startTime) / 60000);
  res.json({
    status: "🟢 AFK Bot Running",
    connected: botStatus.connected,
    uptime: `${uptimeMinutes} minutes`,
    reconnects: botStatus.reconnectCount,
    lastError: botStatus.lastError,
  });
});

app.listen(3000, () => console.log("🌐 Web server running on port 3000"));

// Bot configuration
const config = {
  host: process.env.SERVER_HOST || "3rsi_01.aternos.me",
  port: parseInt(process.env.SERVER_PORT) || 61765,
  username: process.env.BOT_USERNAME || "AFKbot",
  version: process.env.MC_VERSION || "1.21.8", // Auto-detect or specify version
  auth: "offline", // Offline mode - no Microsoft credentials needed
};

let bot;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const baseReconnectDelay = 5000; // 5 seconds

// Anti-AFK activities
const antiAfkActivities = {
  jump: false,
  walk: false,
  look: false,
  sneak: false,
};

let activityInterval;

function startAntiAfkActivities() {
  if (activityInterval) clearInterval(activityInterval);

  activityInterval = setInterval(() => {
    if (!bot || !bot.entity) return;

    try {
      // Random jump every 30-60 seconds
      if (Math.random() < 0.3) {
        bot.setControlState("jump", true);
        setTimeout(() => bot.setControlState("jump", false), 100);
      }

      // Random sneak every 45 seconds
      if (Math.random() < 0.2) {
        bot.setControlState("sneak", true);
        setTimeout(() => bot.setControlState("sneak", false), 200);
      }

      // Random look around
      if (Math.random() < 0.4) {
        const yaw = Math.random() * Math.PI * 2;
        const pitch = (Math.random() - 0.5) * 0.5;
        bot.look(yaw, pitch);
      }

      // Small random movement every 90 seconds
      if (Math.random() < 0.15) {
        const forward = Math.random() > 0.5;
        bot.setControlState("forward", forward);
        setTimeout(() => bot.setControlState("forward", false), 500);
      }
    } catch (error) {
      console.log("⚠️ Error during anti-AFK activity:", error.message);
    }
  }, 30000); // Every 30 seconds
}

function stopAntiAfkActivities() {
  if (activityInterval) {
    clearInterval(activityInterval);
    activityInterval = null;
  }
}

function startBot() {
  console.log(`🚀 Starting bot (attempt ${reconnectAttempts + 1})...`);

  try {
    bot = mineflayer.createBot(config);
  } catch (error) {
    console.log("❌ Failed to create bot:", error.message);
    handleReconnect();
    return;
  }

  // Bot event handlers
  bot.on("login", () => {
    console.log(`🔐 Logged in as ${bot.username}`);
    botStatus.connected = false; // Still connecting
  });

  bot.on("spawn", () => {
    console.log("✅ Bot spawned successfully!");
    console.log(`📍 Position: ${bot.entity.position}`);
    console.log(`🌍 World: ${bot.game.dimension}`);

    botStatus.connected = true;
    botStatus.lastError = null;
    reconnectAttempts = 0;

    // Start anti-AFK activities
    startAntiAfkActivities();

    // Send a message to confirm bot is active (if chat is allowed)
    setTimeout(() => {
      try {
        bot.chat("AFK Bot is now active! 🤖");
      } catch (e) {
        console.log("💬 Could not send chat message (possibly disabled)");
      }
    }, 2000);
  });

  bot.on("health", () => {
    if (bot.health <= 0) {
      console.log("💀 Bot died, respawning...");
      bot.respawn();
    } else if (bot.food <= 3) {
      console.log("🍖 Bot is hungry (food level:", bot.food + ")");
    }
  });

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    console.log(`💬 ${username}: ${message}`);

    // Simple commands (optional)
    if (message.toLowerCase().includes("afk bot status")) {
      try {
        const uptime = Math.floor((Date.now() - botStatus.startTime) / 60000);
        bot.chat(
          `🤖 Active for ${uptime}m, Health: ${bot.health}, Food: ${bot.food}`,
        );
      } catch (e) {
        console.log("Could not respond to status request");
      }
    }
  });

  bot.on("kicked", (reason, loggedIn) => {
    console.log("⚠️ Bot was kicked:", reason);
    botStatus.lastError = `Kicked: ${reason}`;
    botStatus.connected = false;
    stopAntiAfkActivities();
    handleReconnect();
  });

  bot.on("end", () => {
    console.log("🔌 Connection ended");
    botStatus.connected = false;
    stopAntiAfkActivities();
    handleReconnect();
  });

  bot.on("error", (err) => {
    console.log("❌ Bot error:", err.message);
    botStatus.lastError = err.message;
    botStatus.connected = false;
    stopAntiAfkActivities();

    // Handle specific errors
    if (
      err.message.includes("ENOTFOUND") ||
      err.message.includes("ECONNREFUSED")
    ) {
      console.log("🌐 Server appears to be offline or unreachable");
    } else if (err.message.includes("Invalid session")) {
      console.log("🔑 Authentication issue - check username/auth settings");
    }

    handleReconnect();
  });

  // Handle process termination gracefully
  process.on("SIGINT", () => {
    console.log("🛑 Shutting down bot...");
    stopAntiAfkActivities();
    if (bot) {
      try {
        bot.chat("AFK Bot shutting down! 👋");
        bot.quit();
      } catch (e) {
        // Ignore errors during shutdown
      }
    }
    process.exit(0);
  });
}

function handleReconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.log(
      `❌ Max reconnection attempts (${maxReconnectAttempts}) reached. Stopping.`,
    );
    return;
  }

  reconnectAttempts++;
  botStatus.reconnectCount++;

  // Exponential backoff: 5s, 10s, 20s, 40s, then 60s max
  const delay = Math.min(
    baseReconnectDelay * Math.pow(2, reconnectAttempts - 1),
    60000,
  );

  console.log(
    `🔁 Reconnecting in ${delay / 1000} seconds... (attempt ${reconnectAttempts}/${maxReconnectAttempts})`,
  );

  setTimeout(() => {
    startBot();
  }, delay);
}

// Environment variable validation
function validateConfig() {
  // All variables are now optional since we have defaults
  console.log(
    "✅ Using default configuration (can be overridden with environment variables)",
  );
  console.log(`🎯 Target: ${config.host}:${config.port}`);
  console.log(`👤 Username: ${config.username}`);
  console.log("🔓 Auth mode: Offline (no Microsoft account needed)");
}

// Start the application
console.log("🤖 Aternos AFK Bot Starting...");
validateConfig();
startBot();

// Keep-alive heartbeat (helps with Replit)
setInterval(() => {
  console.log(
    `💓 Heartbeat - Bot ${botStatus.connected ? "connected" : "disconnected"}`,
  );
}, 300000); // Every 5 minutes
