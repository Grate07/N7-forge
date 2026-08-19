const fs = require("node:fs");
const path = require("node:path");

// Keep settings beside this standalone bot package. The host may launch it
// with a different working directory, but the bot and its settings must
// always use the same store.
const DATA_DIR = path.join(__dirname, "..", "data");
const SETTINGS_FILE = path.join(DATA_DIR, "guild-settings.json");

const DEFAULT_CATEGORIES = [
  {
    key: "general",
    name: "General Support",
    description: "Questions, help, and general support",
    emoji: "🎟️",
    color: "#6d4aff"
  },
  {
    key: "billing",
    name: "Billing",
    description: "Payments, plans, and billing questions",
    emoji: "💳",
    color: "#2aa7ff"
  },
  {
    key: "bug",
    name: "Bug Report",
    description: "Report a bug or technical issue",
    emoji: "🪱",
    color: "#a56bff"
  },
  {
    key: "store",
    name: "Store Support",
    description: "Purchases, ranks, and store questions",
    emoji: "🛒",
    color: "#2bcf88"
  },
  {
    key: "appeal",
    name: "Ban Appeal",
    description: "Appeal a moderation action",
    emoji: "⚖️",
    color: "#ffb84d"
  },
  {
    key: "player",
    name: "Player Report",
    description: "Report a player or rule-breaking incident",
    emoji: "🚨",
    color: "#ff5666"
  }
];

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, "{}\n", "utf8");
}

function readAll() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeAll(data) {
  ensureStore();
  const temporary = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, SETTINGS_FILE);
}

function defaultGuildSettings() {
  return {
    panel: {
      title: "ZYRE MC Ticket Support",
      description:
        "Welcome to the Ticket Support Center!\n\nChoose the appropriate ticket type below to receive assistance from our staff.",
      footer: "ZYRE MC • Select a ticket type below",
      color: "#6d4aff",
      bannerEnabled: true
    },
    claimRoleId: null,
    unclaimRoleId: null,
    closeRequestRoleId: null,
    ticketRoleIds: {},
    transcriptChannelId: null,
    ticketParentId: null,
    categoryChannelIds: {},
    panelMessageIds: [],
    ticketCounter: 0,
    maxTicketsPerUser: 1,
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
    openTickets: {},
    pendingTickets: {}
  };
}

function normalizeGuildSettings(settings) {
  const defaults = defaultGuildSettings();
  const current = settings || {};
  current.panel = { ...defaults.panel, ...(current.panel || {}) };
  current.claimRoleId ||= null;
  current.unclaimRoleId ||= null;
  current.closeRequestRoleId ||= null;
  current.ticketRoleIds ||= {};
  current.transcriptChannelId ||= null;
  current.ticketParentId ||= null;
  current.categoryChannelIds ||= {};
  current.panelMessageIds = Array.isArray(current.panelMessageIds)
    ? current.panelMessageIds.filter((item) => item?.channelId && item?.messageId)
    : [];
  current.ticketCounter = Number(current.ticketCounter || 0);
  current.maxTicketsPerUser = Math.min(3, Math.max(1, Number(current.maxTicketsPerUser || 1)));
  current.openTickets ||= {};
  for (const [userId, tickets] of Object.entries(current.openTickets)) {
    if (Array.isArray(tickets)) {
      current.openTickets[userId] = tickets.filter((ticket) => ticket?.channelId);
    } else if (tickets?.channelId) {
      // Migrate the previous one-ticket-per-user record shape.
      current.openTickets[userId] = [tickets];
    } else {
      delete current.openTickets[userId];
    }
  }
  current.pendingTickets ||= {};
  current.categories = (current.categories || defaults.categories)
    .filter((category) => category?.key && category.name)
    .filter((category) => category.key !== "report" && category.name !== "Report a User")
    .slice(0, 25);
  return current;
}

function getGuild(guildId) {
  const all = readAll();
  const existing = normalizeGuildSettings(all[guildId]);
  const wasMissing = !all[guildId];
  all[guildId] = existing;
  if (wasMissing) writeAll(all);
  return existing;
}

function updateGuild(guildId, updater) {
  const all = readAll();
  const current = normalizeGuildSettings(all[guildId]);
  const updated = normalizeGuildSettings(updater(current) || current);
  all[guildId] = updated;
  writeAll(all);
  return updated;
}

function nextTicketNumber(guildId) {
  let number = 0;
  updateGuild(guildId, (settings) => {
    settings.ticketCounter += 1;
    number = settings.ticketCounter;
    return settings;
  });
  return number;
}

function findOpenTicket(guildId, userId) {
  return findOpenTickets(guildId, userId)[0] || null;
}

function findOpenTickets(guildId, userId) {
  return getGuild(guildId).openTickets[userId] || [];
}

function addOpenTicket(guildId, userId, ticket) {
  return updateGuild(guildId, (settings) => {
    const tickets = Array.isArray(settings.openTickets[userId]) ? settings.openTickets[userId] : [];
    settings.openTickets[userId] = [...tickets.filter((item) => item.channelId !== ticket.channelId), ticket];
    return settings;
  });
}

function removeOpenTicket(guildId, userId, channelId) {
  return updateGuild(guildId, (settings) => {
    const tickets = Array.isArray(settings.openTickets[userId]) ? settings.openTickets[userId] : [];
    const remaining = channelId ? tickets.filter((ticket) => ticket.channelId !== channelId) : [];
    if (remaining.length) settings.openTickets[userId] = remaining;
    else delete settings.openTickets[userId];
    return settings;
  });
}

function removeOpenTicketsByChannel(guildId, channelId) {
  let removed = false;
  updateGuild(guildId, (settings) => {
    for (const [userId, tickets] of Object.entries(settings.openTickets || {})) {
      const remaining = (Array.isArray(tickets) ? tickets : []).filter((ticket) => ticket.channelId !== channelId);
      if (remaining.length !== (Array.isArray(tickets) ? tickets.length : 0)) {
        if (remaining.length) settings.openTickets[userId] = remaining;
        else delete settings.openTickets[userId];
        removed = true;
      }
    }
    return settings;
  });
  return removed;
}

function addPanelMessage(guildId, panelMessage) {
  return updateGuild(guildId, (settings) => {
    const existing = settings.panelMessageIds.filter(
      (item) => item.channelId !== panelMessage.channelId || item.messageId !== panelMessage.messageId
    );
    settings.panelMessageIds = [...existing, panelMessage].slice(-25);
    return settings;
  });
}

function removePanelMessage(guildId, messageId) {
  return updateGuild(guildId, (settings) => {
    settings.panelMessageIds = settings.panelMessageIds.filter((item) => item.messageId !== messageId);
    return settings;
  });
}

function reservePendingTicket(guildId, userId, ticket) {
  let reserved = false;
  updateGuild(guildId, (settings) => {
    const existing = settings.pendingTickets?.[userId];
    const isActive = existing && Date.now() - Number(existing.startedAt || 0) < 10 * 60 * 1000;
    if (isActive) return settings;
    settings.pendingTickets[userId] = ticket;
    reserved = true;
    return settings;
  });
  return reserved;
}

module.exports = {
  DEFAULT_CATEGORIES,
  addOpenTicket,
  addPanelMessage,
  findOpenTicket,
  findOpenTickets,
  getGuild,
  nextTicketNumber,
  removeOpenTicket,
  removeOpenTicketsByChannel,
  removePanelMessage,
  reservePendingTicket,
  updateGuild
};