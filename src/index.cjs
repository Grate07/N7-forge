const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const {
  addOpenTicket,
  addPanelMessage,
  findOpenTickets,
  getGuild,
  nextTicketNumber,
  removeOpenTicket,
  removeOpenTicketsByChannel,
  removePanelMessage,
  reservePendingTicket,
  updateGuild
} = require("./store.cjs");
const { buildTranscript } = require("./transcript.cjs");

const PANEL_IMAGE_PATH = path.join(__dirname, "..", "assets", "support-banner.jpg");
const PANEL_IMAGE_NAME = "support-banner.jpg";
const UPDATED_BOT_ARCHIVE_PATH = path.join(__dirname, "..", "zyre-ticket-bot-updated.zip");
const GRATE_DELIVERY_RECORD_PATH = path.join(__dirname, "..", "data", "grate-delivery.json");
const SET_COMMAND_ROLE_IDS = new Set([
  "1528809663825444875",
  "1533563068758364470",
  "1487876967729725600"
]);
const SET_COMMAND_NAMES = new Set([
  "set-panel-n7cloud",
  "set-categories",
  "set-category-n7",
  "set-claim-role",
  "set-claim-ticket-user",
  "set-unclaim-ticket",
  "set-close-req-role",
  "set-transcript",
  "set-ticket-category",
  "set-category",
  "set-ticket-role",
  "set-ticket-per-user"
]);
const HELP_ROLE_IDS = new Set([
  "1533563077688033412",
  "1487876967729725600"
]);
const CLOSE_ALL_TICKETS_ROLE_IDS = new Set([
  "1533563068758364470",
  "1487876967729725600"
]);
const ticketCreationLocks = new Set();
const N7_CLOUD_CATEGORIES = [
  {
    key: "n7-sales-plans",
    name: "Sales & Plans",
    description: "Questions about plans, services, and sales",
    emoji: "🛒",
    color: "#5865f2"
  },
  {
    key: "n7-technical-support",
    name: "Technical Support",
    description: "Help with VPS, game servers, and technical issues",
    emoji: "🛠️",
    color: "#5865f2"
  },
  {
    key: "n7-billing-upgrades",
    name: "Billing & Upgrades",
    description: "Billing questions, payments, and upgrades",
    emoji: "💳",
    color: "#5865f2"
  },
  {
    key: "n7-management",
    name: "Management",
    description: "Contact the management team",
    emoji: "🤝",
    color: "#5865f2"
  }
];

function safeLog(botLogger, level, message, extra = {}) {
  if (botLogger && typeof botLogger[level] === "function") botLogger[level](extra, message);
}

function commandOption(name, description, type = 3, required = false) {
  return { name, description, type, required };
}

function buildSlashCommands() {
  return [
    {
      name: "ticket-panel",
      description: "Send the ticket panel and support banner to a channel.",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      options: [{ name: "channel", description: "The channel where the panel should be sent.", type: 7, channel_types: [ChannelType.GuildText], required: true }]
    },
    {
      name: "set-panel-n7cloud",
      description: "Send the N7 Cloud support panel to this channel."
    },
    {
      name: "ticket-panel-edit",
      description: "Customize the ticket panel content and appearance.",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      options: [
        commandOption("title", "New panel title.", 3),
        commandOption("description", "New panel description.", 3),
        commandOption("footer", "New panel footer.", 3),
        commandOption("color", "Embed color, for example #6d4aff.", 3),
        commandOption("banner", "Show the support image below the dropdown.", 5)
      ]
    },
    {
      name: "ticket-panel-reset",
      description: "Reset the ticket panel content to the default text.",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString()
    },
    {
      name: "set-claim-role",
      description: "Set the only role allowed to claim tickets and use staff controls.",
      options: [{ name: "role", description: "The staff role.", type: 8, required: true }]
    },
    {
      name: "set-claim-ticket-user",
      description: "Set the only role allowed to claim tickets.",
      options: [{ name: "role", description: "The role allowed to claim tickets.", type: 8, required: true }]
    },
    {
      name: "set-unclaim-ticket",
      description: "Set the only role allowed to unclaim tickets.",
      options: [{ name: "role", description: "The role allowed to unclaim tickets.", type: 8, required: true }]
    },
    {
      name: "set-close-req-role",
      description: "Set the role allowed to ask ticket owners to close tickets.",
      options: [{ name: "role", description: "The role allowed to request ticket closure.", type: 8, required: true }]
    },
    {
      name: "close-ticket-close-req",
      description: "Ask the ticket owner to close this ticket.",
    },
    {
      name: "close-all-tickets",
      description: "Close every open ticket belonging to a user.",
      options: [{ name: "username", description: "The Discord user whose open tickets should be closed.", type: 6, required: true }]
    },
    {
      name: "set-transcript",
      description: "Set the channel that receives HTML transcripts.",
      options: [{ name: "channel", description: "The transcript channel.", type: 7, channel_types: [ChannelType.GuildText], required: true }]
    },
    {
      name: "set-ticket-category",
      description: "Choose which Discord category receives each ticket type.",
      options: [
        { name: "ticket_type", description: "The configured ticket type key.", type: 3, required: true, autocomplete: true },
        { name: "category", description: "The Discord category where tickets are created.", type: 7, channel_types: [ChannelType.GuildCategory], required: true }
      ]
    },
    {
      name: "set-categories",
      description: "List categories the bot can use, or route a ZYRE ticket type.",
      options: [
        { name: "ticket_type", description: "The ZYRE ticket type to route.", type: 3, autocomplete: true },
        { name: "category", description: "The Discord category where tickets are created.", type: 7, channel_types: [ChannelType.GuildCategory] }
      ]
    },
    {
      name: "set-category-n7",
      description: "Route an N7 Cloud department into a Discord category.",
      options: [
        { name: "department", description: "The N7 Cloud department to route.", type: 3, required: true, autocomplete: true },
        { name: "category", description: "The Discord category where tickets are created.", type: 7, channel_types: [ChannelType.GuildCategory], required: true }
      ]
    },
    {
      name: "set-category",
      description: "Route a ticket option into a Discord category.",
      options: [
        { name: "ticket_type", description: "The configured ticket type key.", type: 3, required: true, autocomplete: true },
        { name: "category", description: "The Discord category where tickets are created.", type: 7, channel_types: [ChannelType.GuildCategory], required: true }
      ]
    },
    {
      name: "set-ticket-role",
      description: "Choose the staff role for a ticket option.",
      options: [
        { name: "option", description: "The ticket option this role handles.", type: 3, required: true, autocomplete: true },
        { name: "role", description: "The role that handles this ticket option.", type: 8, required: true }
      ]
    },
    {
      name: "set-ticket-per-user",
      description: "Set how many open tickets one user can have.",
      options: [{
        name: "limit",
        description: "Maximum open tickets per user.",
        type: 4,
        required: true,
        choices: [
          { name: "1", value: 1 },
          { name: "2", value: 2 },
          { name: "3", value: 3 }
        ]
      }]
    },
    {
      name: "ticket-category-add",
      description: "Add or replace a ticket option in the dropdown.",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      options: [
        commandOption("key", "Short unique key, such as support or store.", 3, true),
        commandOption("name", "Label shown to members.", 3, true),
        commandOption("description", "Short helper text shown to members.", 3, true),
        commandOption("emoji", "One emoji shown beside the label.", 3, true),
        commandOption("color", "Embed color, for example #6d4aff.")
      ]
    },
    {
      name: "ticket-category-edit",
      description: "Edit an existing ticket option without recreating it.",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      options: [
        commandOption("key", "The existing ticket option key.", 3, true),
        commandOption("name", "New label.", 3),
        commandOption("description", "New helper text.", 3),
        commandOption("emoji", "New emoji.", 3),
        commandOption("color", "New embed color.", 3)
      ]
    },
    {
      name: "ticket-category-remove",
      description: "Remove a ticket option from the dropdown.",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
      options: [commandOption("key", "The category key to remove.", 3, true)]
    },
    {
      name: "ticket-config",
      description: "Show the current ticket configuration.",
      default_member_permissions: PermissionFlagsBits.ManageGuild.toString()
    },
    { name: "help", description: "Show ticket bot commands and setup help." }
  ];
}

function ticketKeyFromChannel(channel) {
  return channel?.topic?.match(/type=([a-z0-9-]+)/i)?.[1] || null;
}

function staffMember(member, settings, channel) {
  const ticketKey = ticketKeyFromChannel(channel);
  const ticketRoleId = ticketKey ? settings.ticketRoleIds?.[ticketKey] : null;
  return Boolean(
    hasPermission(member, PermissionFlagsBits.ManageChannels) ||
      hasPermission(member, PermissionFlagsBits.Administrator) ||
      hasRole(member, settings.claimRoleId) ||
      hasRole(member, ticketRoleId)
  );
}

function hasRole(member, roleId) {
  if (!roleId || !member) return false;
  if (member.roles?.cache?.has(roleId)) return true;
  return Array.isArray(member.roles) && member.roles.includes(roleId);
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has?.(permission) || member?.permissions?.has?.(String(permission)));
}

function canClaimTicket(member, settings, channel) {
  // A configured claim role is authoritative. Do not let broad staff access
  // or a ticket-specific role bypass the administrator's explicit choice.
  if (settings.claimRoleId) return hasRole(member, settings.claimRoleId);
  return staffMember(member, settings, channel);
}

function unclaimMember(member, settings) {
  // A dedicated unclaim role takes precedence. If none is configured, the
  // claim role controls both claim and unclaim actions.
  if (settings.unclaimRoleId) return hasRole(member, settings.unclaimRoleId);
  if (settings.claimRoleId) return hasRole(member, settings.claimRoleId);
  return false;
}

function ticketButtons({ claimed = false } = {}) {
  const buttons = [
    new ButtonBuilder().setCustomId("ticket:claim").setLabel(claimed ? "Ticket Claimed" : "Claim Ticket").setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary).setEmoji("🙋").setDisabled(claimed)
  ];
  if (claimed) {
    buttons.push(new ButtonBuilder().setCustomId("ticket:unclaim").setLabel("Unclaim").setStyle(ButtonStyle.Secondary).setEmoji("↩️"));
  }
  buttons.push(
    new ButtonBuilder().setCustomId("ticket:close").setLabel("Close").setStyle(ButtonStyle.Danger).setEmoji("🔒"),
    new ButtonBuilder().setCustomId("ticket:close-reason").setLabel("Close with reason").setStyle(ButtonStyle.Secondary).setEmoji("📝")
  );
  return new ActionRowBuilder().addComponents(buttons);
}

function closeRequestButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket:close-request").setLabel("Close My Ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
  );
}

function panelComponents(settings) {
  const options = settings.categories.slice(0, 25).map((category) => ({
    label: category.name.slice(0, 100),
    description: category.description.slice(0, 100),
    value: category.key,
    emoji: category.emoji
  }));
  const menu = new StringSelectMenuBuilder().setCustomId("ticket:category").setPlaceholder("Select a ticket type").addOptions(options);
  return [new ActionRowBuilder().addComponents(menu)];
}

function panelEmbed(settings) {
  const embed = new EmbedBuilder()
    .setColor(settings.panel.color)
    .setAuthor({ name: "ZYRE MC" })
    .setTitle(settings.panel.title)
    .setDescription(`${settings.panel.description}\n\nSelect a ticket type below. You can have up to **${settings.maxTicketsPerUser}** open ticket${settings.maxTicketsPerUser === 1 ? "" : "s"} at a time.`)
    .setFooter({ text: settings.panel.footer })
    .setTimestamp();
  if (settings.panel.bannerEnabled) embed.setImage(`attachment://${PANEL_IMAGE_NAME}`);
  return embed;
}

function panelFiles() {
  if (!fs.existsSync(PANEL_IMAGE_PATH)) throw new Error(`Panel image was not found at ${PANEL_IMAGE_PATH}`);
  return [new AttachmentBuilder(PANEL_IMAGE_PATH, { name: PANEL_IMAGE_NAME, description: "ZYRE MC support banner" })];
}

function n7CloudPanelEmbed() {
  return new EmbedBuilder()
    .setColor("#5865f2")
    .setTitle("☁️ N7 Cloud Support Centre")
    .setDescription([
      "Welcome to N7 Cloud Support.",
      "",
      "Need help with a VPS, game server, billing",
      "or your order?",
      "",
      "Choose the appropriate department",
      "below and our team will assist you as",
      "soon as possible.",
      "",
      "• Please do not open duplicate tickets.",
      "• Never share passwords, API keys or OTPs.",
      "• Response time: Usually within 5–30 minutes.",
      "",
      "N7 Cloud • Reliable Hosting Support"
    ].join("\n"))
    .setFooter({ text: "N7 Cloud Support" });
}

function n7CloudPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`n7cloud:category:${N7_CLOUD_CATEGORIES[0].key}`)
        .setLabel(N7_CLOUD_CATEGORIES[0].name)
        .setEmoji(N7_CLOUD_CATEGORIES[0].emoji)
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`n7cloud:category:${N7_CLOUD_CATEGORIES[1].key}`)
        .setLabel(N7_CLOUD_CATEGORIES[1].name)
        .setEmoji(N7_CLOUD_CATEGORIES[1].emoji)
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`n7cloud:category:${N7_CLOUD_CATEGORIES[2].key}`)
        .setLabel(N7_CLOUD_CATEGORIES[2].name)
        .setEmoji(N7_CLOUD_CATEGORIES[2].emoji)
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`n7cloud:category:${N7_CLOUD_CATEGORIES[3].key}`)
        .setLabel(N7_CLOUD_CATEGORIES[3].name)
        .setEmoji(N7_CLOUD_CATEGORIES[3].emoji)
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function ticketCategoryForKey(settings, key) {
  return settings.categories.find((category) => category.key === key)
    || N7_CLOUD_CATEGORIES.find((category) => category.key === key);
}

function isTicketPanelMessage(message, clientUserId) {
  return Boolean(
    message?.author?.id === clientUserId &&
      message.embeds?.some((embed) => embed.author?.name === "ZYRE MC") &&
      message.components?.some((row) =>
        row.components?.some((component) => component.customId === "ticket:category")
      )
  );
}

async function refreshTicketPanels(guild, settings, client) {
  let refreshed = 0;
  for (const panel of settings.panelMessageIds || []) {
    const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
    const message = channel?.isTextBased?.()
      ? await channel.messages.fetch(panel.messageId).catch(() => null)
      : null;
    if (!message || !isTicketPanelMessage(message, client.user.id)) {
      removePanelMessage(guild.id, panel.messageId);
      continue;
    }
    await message.edit({
      embeds: [panelEmbed(settings)],
      components: panelComponents(settings)
    }).then(() => {
      refreshed += 1;
    }).catch(() => {});
  }
  return refreshed;
}

async function discoverTicketPanels(guild, client) {
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  let discovered = 0;
  for (const channel of channels.values()) {
    if (!channel?.isTextBased?.() || !channel.messages?.fetch) continue;
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) continue;
    for (const message of messages.values()) {
      if (!isTicketPanelMessage(message, client.user.id)) continue;
      addPanelMessage(guild.id, { channelId: channel.id, messageId: message.id });
      discovered += 1;
    }
  }
  return discovered;
}

function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "");
}

function slugify(value) {
  return String(value).normalize("NFKD").replace(/[^\w\s-]/g, "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 45) || "ticket";
}

function ticketCategoryId(settings, categoryKey) {
  if (categoryKey.startsWith("n7-")) return settings.n7CategoryChannelIds?.[categoryKey] || undefined;
  return settings.categoryChannelIds?.[categoryKey] || settings.ticketParentId || undefined;
}

async function validTicketParent(guild, settings, categoryKey) {
  const configuredId = ticketCategoryId(settings, categoryKey);
  if (!configuredId) return undefined;
  const parent = await guild.channels.fetch(configuredId).catch(() => null);
  return parent?.type === ChannelType.GuildCategory ? parent.id : undefined;
}

function ticketEmbed({ member, category, number, issue, username, claimedBy }) {
  const fields = [
    { name: "Opened by", value: `${member}`, inline: false },
    { name: "Type", value: category.name, inline: true },
    { name: "Status", value: "Open", inline: true },
    { name: "Issue", value: issue || "Not provided", inline: false }
  ];
  if (username) {
    fields.splice(3, 0, { name: "Minecraft Username", value: username, inline: false });
  }
  if (claimedBy) fields.push({ name: "Claimed by", value: `${claimedBy}`, inline: false });
  return new EmbedBuilder()
    .setColor(category.color || "#6d4aff")
    .setTitle(`${category.emoji} SUP-${String(number).padStart(6, "0")} — ${category.name}`)
    .addFields(fields)
    .setFooter({ text: "ZYRE MC Ticket Desk" })
    .setTimestamp();
}

async function registerCommands(client, token, botLogger) {
  const applicationId = process.env.DISCORD_CLIENT_ID || client.application?.id;
  if (!applicationId) throw new Error("Unable to determine the Discord application ID.");
  const rest = new REST({ version: "10" }).setToken(token);
  const guildId = process.env.DISCORD_GUILD_ID;
  const body = buildSlashCommands();
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
    safeLog(botLogger, "info", "Registered Discord slash commands in test guild.", { guildId, count: body.length });
  } else {
    await rest.put(Routes.applicationCommands(applicationId), { body });
    safeLog(botLogger, "info", "Registered Discord global slash commands.", { count: body.length });
  }
}

async function fetchAllMessages(channel) {
  const messages = [];
  let before;
  while (messages.length < 5000) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!page.size) break;
    messages.push(...page.values());
    if (page.size < 100) break;
    before = page.last().id;
  }
  return messages;
}

async function findExistingTicketChannels(guild, userId) {
  const channels = [];
  const storedTickets = findOpenTickets(guild.id, userId);

  for (const storedTicket of storedTickets) {
    const storedChannel = await guild.channels.fetch(storedTicket.channelId).catch(() => null);
    if (storedChannel?.topic?.includes(`owner=${userId}`) && storedChannel.topic.includes("ZYRE ticket")) {
      channels.push(storedChannel);
    } else {
      removeOpenTicket(guild.id, userId, storedTicket.channelId);
    }
  }

  const allGuildChannels = await guild.channels.fetch().catch(() => guild.channels.cache);
  for (const channel of allGuildChannels.values()) {
    if (
      channel.type === ChannelType.GuildText &&
      channel.topic?.includes("ZYRE ticket") &&
      channel.topic.includes(`owner=${userId}`) &&
      !channels.some((existing) => existing.id === channel.id)
    ) {
      const type = channel.topic.match(/type=([a-z0-9-]+)/i)?.[1] || "general";
      const number = Number(channel.topic.match(/number=(\d+)/)?.[1] || 0);
      addOpenTicket(guild.id, userId, {
        channelId: channel.id,
        category: type,
        number,
        createdAt: channel.createdAt?.toISOString?.() || new Date().toISOString()
      });
      channels.push(channel);
    }
  }

  return channels;
}

async function countOpenTicketChannels(guild, userId) {
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  let count = 0;
  for (const channel of channels.values()) {
    if (
      channel?.type === ChannelType.GuildText &&
      channel.topic?.includes("ZYRE ticket") &&
      channel.topic.includes(`owner=${userId}`)
    ) {
      count += 1;
    }
  }
  return count;
}

async function createTicket(interaction, category) {
  const settings = getGuild(interaction.guildId);
  const openTicketCount = await countOpenTicketChannels(interaction.guild, interaction.user.id);
  if (openTicketCount >= settings.maxTicketsPerUser) {
    return interaction.reply({
      content: `You already have ${openTicketCount} open ticket${openTicketCount === 1 ? "" : "s"}. The current limit is ${settings.maxTicketsPerUser}. Close one before opening another.`,
      ephemeral: true
    });
  }

  const number = nextTicketNumber(interaction.guildId);
  const reserved = reservePendingTicket(interaction.guildId, interaction.user.id, {
    category: category.key,
    startedAt: Date.now()
  });
  if (!reserved) {
    return interaction.reply({
      content: "You already have a ticket form open. Submit or close it before opening another ticket.",
      ephemeral: true
    });
  }
  const modal = new ModalBuilder().setCustomId(`ticket:modal:${category.key}:${number}`).setTitle(`${category.name} ticket`);
  const issue = new TextInputBuilder()
    .setCustomId("issue")
    .setLabel(category.key.startsWith("n7-") ? "Describe the problem" : "How can we help?")
    .setPlaceholder(category.key.startsWith("n7-") ? "Tell us what you need help with" : "Give us the details so we can help quickly")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  if (category.key.startsWith("n7-")) {
    modal.addComponents(new ActionRowBuilder().addComponents(issue));
  } else {
    const username = new TextInputBuilder()
      .setCustomId("minecraft_username")
      .setLabel("Minecraft username")
      .setPlaceholder("Your in-game username")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(32);
    modal.addComponents(new ActionRowBuilder().addComponents(username), new ActionRowBuilder().addComponents(issue));
  }
  try {
    await interaction.showModal(modal);
  } catch (error) {
    updateGuild(interaction.guildId, (current) => {
      const pendingTickets = { ...(current.pendingTickets || {}) };
      delete pendingTickets[interaction.user.id];
      return { ...current, pendingTickets };
    });
    throw error;
  }
}

async function finishTicket(interaction, category, number) {
  await interaction.deferReply({ ephemeral: true });
  const lockKey = `${interaction.guildId}:${interaction.user.id}`;
  if (ticketCreationLocks.has(lockKey)) {
    await interaction.editReply({ content: "Your ticket is already being created. Please wait a moment." });
    return;
  }
  ticketCreationLocks.add(lockKey);
  try {
    const settings = getGuild(interaction.guildId);
    const openTicketCount = await countOpenTicketChannels(interaction.guild, interaction.user.id);
    if (openTicketCount >= settings.maxTicketsPerUser) {
      await interaction.editReply({
        content: `You already have ${openTicketCount} open ticket${openTicketCount === 1 ? "" : "s"}. The current limit is ${settings.maxTicketsPerUser}. Close one before opening another.`
      });
      return;
    }
    const parentId = await validTicketParent(interaction.guild, settings, category.key);
    const configuredParentId = ticketCategoryId(settings, category.key);
    if (configuredParentId && !parentId) {
      updateGuild(interaction.guildId, (current) => {
        const categoryChannelIds = { ...(current.categoryChannelIds || {}) };
        if (categoryChannelIds[category.key] === configuredParentId) delete categoryChannelIds[category.key];
        return { ...current, categoryChannelIds };
      });
    }
    const channelName = `${slugify(category.name)}-${slugify(interaction.user.username)}`.slice(0, 100);
    const permissionOverwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] }
    ];
    const ticketRoleId = settings.ticketRoleIds?.[category.key];
    for (const roleId of new Set([settings.claimRoleId, settings.unclaimRoleId, ticketRoleId].filter(Boolean))) {
      permissionOverwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] });
    }

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      ...(parentId ? { parent: parentId } : {}),
      topic: `ZYRE ticket | owner=${interaction.user.id} | type=${category.key} | number=${number}`,
      permissionOverwrites,
      reason: `Ticket opened by ${interaction.user.tag}`
    });
    addOpenTicket(interaction.guildId, interaction.user.id, { channelId: channel.id, category: category.key, number, createdAt: new Date().toISOString() });
    const issue = interaction.fields.getTextInputValue("issue");
    const username = category.key.startsWith("n7-")
      ? null
      : interaction.fields.getTextInputValue("minecraft_username");
    await channel.send({
      content: `${interaction.user} ${ticketRoleId ? `<@&${ticketRoleId}>` : ""}`.trim(),
      embeds: [ticketEmbed({ member: interaction.member, category, number, issue, username })],
      components: [ticketButtons()]
    });
    await interaction.editReply({ content: `Your ticket is ready: ${channel}` });
  } finally {
    ticketCreationLocks.delete(lockKey);
    updateGuild(interaction.guildId, (current) => {
      const pendingTickets = { ...(current.pendingTickets || {}) };
      delete pendingTickets[interaction.user.id];
      return { ...current, pendingTickets };
    });
  }
}

async function closeTicketChannel(interaction, channel, reason) {
  const settings = getGuild(interaction.guildId);
  const ownerId = channel.topic?.match(/owner=(\d+)/)?.[1];
  const transcriptFileName = `transcript-${channel.name}-${Date.now()}.html`;
  let transcriptChannelSent = false;
  let ownerDmSent = false;
  try {
    let messages = [];
    try {
      messages = await fetchAllMessages(channel);
    } catch (error) {
      console.error(`Unable to fetch messages for ${channel.id}:`, error);
    }
    const html = buildTranscript({ channel, guild: interaction.guild, messages, closedBy: interaction.user, reason });
    const transcriptBuffer = Buffer.from(html, "utf8");
    const transcriptChannel = settings.transcriptChannelId ? await interaction.guild.channels.fetch(settings.transcriptChannelId).catch(() => null) : null;
    if (transcriptChannel?.isTextBased()) {
      try {
        await transcriptChannel.send({
          embeds: [new EmbedBuilder().setColor("#ed4f6a").setTitle("Ticket Transcript").setDescription(`**Channel:** ${channel}\n**Closed by:** ${interaction.user}\n**Reason:** ${reason || "No reason provided"}`).setTimestamp()],
          files: [new AttachmentBuilder(transcriptBuffer, { name: transcriptFileName, description: `HTML transcript for ${channel.name}` })]
        });
        transcriptChannelSent = true;
      } catch (error) {
        console.error(`Unable to send transcript to channel ${settings.transcriptChannelId}:`, error);
      }
    }
    if (ownerId) {
      const owner = await interaction.client.users.fetch(ownerId).catch(() => null);
      if (owner) {
        try {
          await owner.send({
            content: `Your ticket **${channel.name}** has been closed. Here is your transcript.`,
            files: [new AttachmentBuilder(transcriptBuffer, { name: transcriptFileName, description: `HTML transcript for ${channel.name}` })]
          });
          ownerDmSent = true;
        } catch (error) {
          console.error(`Unable to DM ticket transcript to ${ownerId}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Unable to prepare transcript for ${channel.id}:`, error);
  } finally {
    if (ownerId) removeOpenTicket(interaction.guildId, ownerId, channel.id);
    else removeOpenTicketsByChannel(interaction.guildId, channel.id);
  }
  const delivery = transcriptChannelSent && ownerDmSent
    ? "The transcript was sent to the transcript channel and DMed to the ticket owner."
    : transcriptChannelSent
      ? "The transcript was sent to the transcript channel. I could not DM the ticket owner."
      : ownerDmSent
        ? "The transcript was DMed to the ticket owner. No transcript channel is configured."
        : "The ticket is closed, but the transcript could not be delivered.";
  await channel.delete(`Ticket closed by ${interaction.user.tag}: ${reason || "No reason provided"}`).catch((error) => {
    console.error(`Unable to delete closed ticket channel ${channel.id}:`, error);
  });
  return delivery;
}

async function closeTicket(interaction, reason) {
  if (!interaction.replied && !interaction.deferred) await interaction.deferReply({ ephemeral: true });
  const delivery = await closeTicketChannel(interaction, interaction.channel, reason);
  await interaction.editReply({ content: delivery }).catch(() => {});
}

function canUseCloseAllTicketsCommand(interaction) {
  return Boolean(
    [...CLOSE_ALL_TICKETS_ROLE_IDS].some((roleId) => hasRole(interaction.member, roleId))
  );
}

async function findTicketChannelsForUser(guild, userId) {
  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  const matchingChannels = new Map();
  for (const channel of channels.values()) {
    if (
      channel?.type === ChannelType.GuildText &&
      channel.topic?.includes("ZYRE ticket") &&
      channel.topic?.includes(`owner=${userId}`)
    ) {
      matchingChannels.set(channel.id, channel);
    }
  }
  for (const storedTicket of findOpenTickets(guild.id, userId)) {
    if (storedTicket?.channelId && !matchingChannels.has(storedTicket.channelId)) {
      const storedChannel = await guild.channels.fetch(storedTicket.channelId).catch(() => null);
      if (storedChannel?.type === ChannelType.GuildText) matchingChannels.set(storedChannel.id, storedChannel);
    }
  }
  return [...matchingChannels.values()];
}

function panelDefaults() {
  return {
    title: "ZYRE MC Ticket Support",
    description: "Need help with something? Select the most relevant option below to open a support ticket.",
    footer: "ZYRE MC • Select a ticket type below",
    color: "#6d4aff",
    bannerEnabled: true
  };
}

function canUseSetCommand(interaction) {
  return Boolean(
    [...SET_COMMAND_ROLE_IDS].some((roleId) => hasRole(interaction.member, roleId))
  );
}

function setCommandDenied(interaction) {
  return interaction.reply({
    content: "Only the configured ticket management roles can use this command.",
    ephemeral: true
  });
}

function readGrateDeliveryRecord() {
  try {
    return JSON.parse(fs.readFileSync(GRATE_DELIVERY_RECORD_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeGrateDeliveryRecord(record) {
  fs.mkdirSync(path.dirname(GRATE_DELIVERY_RECORD_PATH), { recursive: true });
  fs.writeFileSync(GRATE_DELIVERY_RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

async function dmUpdatedBotFileToGrate(client, botLogger) {
  if (!fs.existsSync(UPDATED_BOT_ARCHIVE_PATH)) {
    safeLog(botLogger, "warn", "Updated bot archive was not found; skipping Grate delivery.");
    return;
  }

  const archiveStats = fs.statSync(UPDATED_BOT_ARCHIVE_PATH);
  const deliveryKey = `${archiveStats.size}:${archiveStats.mtimeMs}`;
  if (readGrateDeliveryRecord()?.deliveryKey === deliveryKey) return;

  const matches = new Map();
  safeLog(botLogger, "info", "Looking for Grate to deliver the updated bot archive.", { guildCount: client.guilds.cache.size });
  for (const guild of client.guilds.cache.values()) {
    const candidates = new Map(guild.members.cache);
    try {
      const searched = await guild.members.fetch({ query: "grate", limit: 25 });
      for (const [memberId, member] of searched) candidates.set(memberId, member);
    } catch (error) {
      safeLog(botLogger, "warn", "Could not search guild members for Grate.", { guildId: guild.id, error });
    }
    for (const member of candidates.values()) {
      const username = member.user.username.toLowerCase();
      const displayName = (member.displayName || "").toLowerCase();
      const globalName = (member.user.globalName || "").toLowerCase();
      if (username === "_grate" || username === "grate" || displayName === "grate" || globalName === "grate") {
        matches.set(member.user.id, member.user);
      }
    }
  }

  if (!matches.size) {
    safeLog(botLogger, "warn", "Could not find a Discord member matching _grate or Grate; the archive was not delivered.");
    return;
  }

  let delivered = 0;
  for (const user of matches.values()) {
    try {
      await user.send({
        content: "Here is the updated ZYRE MC ticket bot file. It includes the N7 Cloud panel and the updated staff-role permissions.",
        files: [{ attachment: UPDATED_BOT_ARCHIVE_PATH, name: "zyre-ticket-bot-updated.zip" }]
      });
      delivered += 1;
    } catch (error) {
      safeLog(botLogger, "warn", "Could not DM the updated bot file to Grate.", { userId: user.id, error });
    }
  }

  if (delivered) {
    writeGrateDeliveryRecord({ deliveryKey, deliveredAt: new Date().toISOString(), delivered });
    safeLog(botLogger, "info", "Sent the updated bot file to Grate.", { delivered });
  } else {
    safeLog(botLogger, "warn", "Found Grate, but Discord did not accept the DM; check DM privacy settings.");
  }
}

async function handleAutocomplete(interaction) {
  if (!["set-ticket-category", "set-category", "set-categories", "set-category-n7", "set-ticket-role"].includes(interaction.commandName)) {
    return;
  }
  const settings = getGuild(interaction.guildId);
  const focusedOption = interaction.options.getFocused(true);
  const query = interaction.options.getFocused().toLowerCase();
  if (focusedOption.name === "category") {
    const channels = await interaction.guild.channels.fetch().catch(() => interaction.guild.channels.cache);
    const choices = [...channels.values()]
      .filter((channel) => channel?.type === ChannelType.GuildCategory)
      .filter((channel) => {
        const permissions = channel.permissionsFor?.(interaction.client.user);
        return permissions?.has(PermissionFlagsBits.ViewChannel) && permissions.has(PermissionFlagsBits.ManageChannels);
      })
      .filter((channel) => channel.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map((channel) => ({ name: channel.name.slice(0, 100), value: channel.id }));
    return interaction.respond(choices);
  }
  const source = interaction.commandName === "set-category-n7"
    ? N7_CLOUD_CATEGORIES
    : settings.categories;
  const choices = source
    .filter((category) => `${category.key} ${category.name}`.toLowerCase().includes(query))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.name} (${category.key})`.slice(0, 100),
      value: category.key
    }));
  await interaction.respond(choices);
}

async function handleCommand(interaction) {
  const settings = getGuild(interaction.guildId);
  if (interaction.commandName === "ticket-panel") {
    const channel = interaction.options.getChannel("channel", true);
    const panelMessage = await channel.send({
      embeds: [panelEmbed(settings)],
      components: panelComponents(settings),
      files: settings.panel.bannerEnabled ? panelFiles() : []
    });
    addPanelMessage(interaction.guildId, { channelId: channel.id, messageId: panelMessage.id });
    return interaction.reply({ content: `Ticket panel sent to ${channel}.`, ephemeral: true });
  }
  if (interaction.commandName === "set-panel-n7cloud") {
    if (!canUseSetCommand(interaction)) return setCommandDenied(interaction);
    await interaction.channel.send({
      embeds: [n7CloudPanelEmbed()],
      components: n7CloudPanelComponents()
    });
    return interaction.reply({ content: "N7 Cloud support panel sent to this channel.", ephemeral: true });
  }
  if (interaction.commandName === "set-categories") {
    const ticketType = interaction.options.getString("ticket_type");
    const category = interaction.options.getChannel("category");
    if (!ticketType && !category) {
      const channels = await interaction.guild.channels.fetch().catch(() => interaction.guild.channels.cache);
      const available = [...channels.values()]
        .filter((channel) => channel?.type === ChannelType.GuildCategory)
        .filter((channel) => {
          const permissions = channel.permissionsFor?.(interaction.client.user);
          return permissions?.has(PermissionFlagsBits.ViewChannel) && permissions.has(PermissionFlagsBits.ManageChannels);
        })
        .map((channel) => `• ${channel.name} — \`${channel.id}\``);
      return interaction.reply({
        content: available.length
          ? `Categories I can use for ticket channels:\n${available.join("\n")}\n\nUse \`/set-categories ticket_type category\` to route a ZYRE ticket type.`
          : "I cannot see or manage any Discord category channels in this server.",
        ephemeral: true
      });
    }
    if (!ticketType || !category) {
      return interaction.reply({ content: "Choose both a ticket type and a Discord category, or leave both empty to list available categories.", ephemeral: true });
    }
    if (!settings.categories.some((item) => item.key === ticketType.toLowerCase())) {
      return interaction.reply({ content: `Unknown ticket type \`${ticketType}\`. Use autocomplete to choose a configured type.`, ephemeral: true });
    }
    updateGuild(interaction.guildId, (current) => ({
      ...current,
      categoryChannelIds: { ...(current.categoryChannelIds || {}), [ticketType.toLowerCase()]: category.id }
    }));
    return interaction.reply({ content: `**${ticketType}** tickets will now be created under ${category}.`, ephemeral: true });
  }
  if (interaction.commandName === "set-category-n7") {
    const department = interaction.options.getString("department", true).toLowerCase();
    const category = interaction.options.getChannel("category", true);
    if (!N7_CLOUD_CATEGORIES.some((item) => item.key === department)) {
      return interaction.reply({ content: `Unknown N7 Cloud department \`${department}\`. Use autocomplete to choose one.`, ephemeral: true });
    }
    updateGuild(interaction.guildId, (current) => ({
      ...current,
      n7CategoryChannelIds: { ...(current.n7CategoryChannelIds || {}), [department]: category.id }
    }));
    return interaction.reply({ content: `**${department}** N7 Cloud tickets will now be created under ${category}.`, ephemeral: true });
  }
  if (interaction.commandName === "ticket-panel-edit") {
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const footer = interaction.options.getString("footer");
    const color = interaction.options.getString("color");
    const banner = interaction.options.getBoolean("banner");
    if (color && !validColor(color)) return interaction.reply({ content: "Color must be a six-digit hex value such as `#6d4aff`.", ephemeral: true });
    if (!title && !description && !footer && !color && banner === null) return interaction.reply({ content: "Provide at least one panel setting to change.", ephemeral: true });
    updateGuild(interaction.guildId, (current) => ({
      ...current,
      panel: { ...current.panel, ...(title ? { title: title.slice(0, 256) } : {}), ...(description ? { description: description.slice(0, 4000) } : {}), ...(footer ? { footer: footer.slice(0, 2048) } : {}), ...(color ? { color } : {}), ...(banner !== null ? { bannerEnabled: banner } : {}) }
    }));
    return interaction.reply({ content: "Panel settings saved. Run `/ticket-panel` to publish the updated panel.", ephemeral: true });
  }
  if (interaction.commandName === "ticket-panel-reset") {
    updateGuild(interaction.guildId, (current) => ({ ...current, panel: panelDefaults() }));
    return interaction.reply({ content: "Panel settings reset. Run `/ticket-panel` to publish the default panel again.", ephemeral: true });
  }
  if (interaction.commandName === "close-all-tickets") {
    if (!canUseCloseAllTicketsCommand(interaction)) {
      return interaction.reply({
        content: "Only roles `1533563068758364470` and `1487876967729725600` can use this command.",
        ephemeral: true
      });
    }
    const username = interaction.options.getUser("username", true);
    await interaction.deferReply({ ephemeral: true });
    const channels = await findTicketChannelsForUser(interaction.guild, username.id);
    if (!channels.length) {
      removeOpenTicket(interaction.guildId, username.id);
      return interaction.editReply({ content: `${username} has no open tickets to close.` });
    }

    let closedCount = 0;
    for (const channel of channels) {
      await closeTicketChannel(
        interaction,
        channel,
        `Closed by ${interaction.user.tag} using /close-all-tickets`
      );
      closedCount += 1;
    }
    return interaction.editReply({
      content: `Closed ${closedCount} ticket${closedCount === 1 ? "" : "s"} for ${username}. Transcripts were processed using the normal ticket close flow.`
    });
  }
  if (SET_COMMAND_NAMES.has(interaction.commandName) && !canUseSetCommand(interaction)) {
    return setCommandDenied(interaction);
  }
  if (interaction.commandName === "set-claim-role") {
    const role = interaction.options.getRole("role", true);
    updateGuild(interaction.guildId, (current) => ({ ...current, claimRoleId: role.id }));
    return interaction.reply({ content: `Tickets can now be claimed by ${role}.`, ephemeral: true });
  }
  if (interaction.commandName === "set-claim-ticket-user") {
    const role = interaction.options.getRole("role", true);
    updateGuild(interaction.guildId, (current) => ({ ...current, claimRoleId: role.id }));
    return interaction.reply({ content: `The ticket claim role is now ${role}.`, ephemeral: true });
  }
  if (interaction.commandName === "set-unclaim-ticket") {
    const role = interaction.options.getRole("role", true);
    updateGuild(interaction.guildId, (current) => ({ ...current, unclaimRoleId: role.id }));
    return interaction.reply({ content: `Tickets can now be unclaimed by ${role}.`, ephemeral: true });
  }
  if (interaction.commandName === "set-close-req-role") {
    const role = interaction.options.getRole("role", true);
    updateGuild(interaction.guildId, (current) => ({ ...current, closeRequestRoleId: role.id }));
    return interaction.reply({ content: `${role} can now ask ticket owners to close their tickets.`, ephemeral: true });
  }
  if (interaction.commandName === "set-transcript") {
    const channel = interaction.options.getChannel("channel", true);
    updateGuild(interaction.guildId, (current) => ({ ...current, transcriptChannelId: channel.id }));
    return interaction.reply({ content: `HTML transcripts will be sent to ${channel}.`, ephemeral: true });
  }
  if (["set-ticket-category", "set-category"].includes(interaction.commandName)) {
    const ticketType = interaction.options.getString("ticket_type", true).toLowerCase();
    const category = interaction.options.getChannel("category", true);
    if (!settings.categories.some((item) => item.key === ticketType)) return interaction.reply({ content: `Unknown ticket type \`${ticketType}\`. Available types: ${settings.categories.map((item) => item.key).join(", ")}`, ephemeral: true });
    updateGuild(interaction.guildId, (current) => ({ ...current, categoryChannelIds: { ...(current.categoryChannelIds || {}), [ticketType]: category.id } }));
    return interaction.reply({ content: `**${ticketType}** tickets will now be created under ${category}.`, ephemeral: true });
  }
  if (interaction.commandName === "set-ticket-role") {
    const ticketType = interaction.options.getString("option", true).toLowerCase();
    const role = interaction.options.getRole("role", true);
    if (!settings.categories.some((item) => item.key === ticketType)) {
      return interaction.reply({
        content: `Unknown ticket option \`${ticketType}\`. Available options: ${settings.categories.map((item) => item.key).join(", ")}`,
        ephemeral: true
      });
    }
    updateGuild(interaction.guildId, (current) => ({
      ...current,
      ticketRoleIds: { ...(current.ticketRoleIds || {}), [ticketType]: role.id }
    }));
    return interaction.reply({
      content: `${role} will now handle **${ticketType}** tickets and will be pinged when one opens.`,
      ephemeral: true
    });
  }
  if (interaction.commandName === "set-ticket-per-user") {
    const limit = interaction.options.getInteger("limit", true);
    const updatedSettings = updateGuild(interaction.guildId, (current) => ({ ...current, maxTicketsPerUser: limit }));
    const refreshedPanels = await refreshTicketPanels(interaction.guild, updatedSettings, interaction.client);
    return interaction.reply({
      content: `Users can now have up to ${limit} open ticket${limit === 1 ? "" : "s"} at a time. Updated ${refreshedPanels} existing ticket panel${refreshedPanels === 1 ? "" : "s"}.`,
      ephemeral: true
    });
  }
  if (interaction.commandName === "close-ticket-close-req") {
    if (!settings.closeRequestRoleId || !interaction.member?.roles?.cache?.has(settings.closeRequestRoleId)) {
      return interaction.reply({ content: "You do not have the configured close-request role.", ephemeral: true });
    }
    const ownerId = interaction.channel?.topic?.match(/owner=(\d+)/)?.[1];
    if (!ownerId) return interaction.reply({ content: "This command can only be used inside an open ticket.", ephemeral: true });
    await interaction.channel.send({
      content: `<@${ownerId}> ${interaction.user} has requested that you close this ticket.`,
      embeds: [new EmbedBuilder().setColor("#ffb84d").setTitle("Ticket close request").setDescription("If your issue has been resolved, use the button below to close your ticket and receive the transcript.")],
      components: [closeRequestButton()]
    });
    return interaction.reply({ content: "The ticket owner has been asked to close this ticket.", ephemeral: true });
  }
  if (interaction.commandName === "ticket-category-add") {
    const key = interaction.options.getString("key", true).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32);
    const color = interaction.options.getString("color") || "#6d4aff";
    if (!validColor(color)) return interaction.reply({ content: "Color must be a six-digit hex value such as `#6d4aff`.", ephemeral: true });
    const category = {
      key,
      name: interaction.options.getString("name", true).slice(0, 100),
      description: interaction.options.getString("description", true).slice(0, 100),
      emoji: interaction.options.getString("emoji", true).slice(0, 2),
      color
    };
    updateGuild(interaction.guildId, (current) => ({ ...current, categories: [...current.categories.filter((item) => item.key !== key), category].slice(0, 25) }));
    return interaction.reply({ content: `Ticket option **${category.name}** saved. Run \`/ticket-panel\` to publish the updated dropdown.`, ephemeral: true });
  }
  if (interaction.commandName === "ticket-category-edit") {
    const key = interaction.options.getString("key", true).toLowerCase();
    const name = interaction.options.getString("name");
    const description = interaction.options.getString("description");
    const emoji = interaction.options.getString("emoji");
    const color = interaction.options.getString("color");
    if (color && !validColor(color)) return interaction.reply({ content: "Color must be a six-digit hex value such as `#6d4aff`.", ephemeral: true });
    const currentCategory = settings.categories.find((item) => item.key === key);
    if (!currentCategory) return interaction.reply({ content: `No ticket option exists with the key \`${key}\`.`, ephemeral: true });
    updateGuild(interaction.guildId, (current) => ({ ...current, categories: current.categories.map((item) => item.key === key ? { ...item, ...(name ? { name: name.slice(0, 100) } : {}), ...(description ? { description: description.slice(0, 100) } : {}), ...(emoji ? { emoji: emoji.slice(0, 2) } : {}), ...(color ? { color } : {}) } : item) }));
    return interaction.reply({ content: `Ticket option **${name || currentCategory.name}** updated. Run \`/ticket-panel\` to publish it.`, ephemeral: true });
  }
  if (interaction.commandName === "ticket-category-remove") {
    const key = interaction.options.getString("key", true).toLowerCase();
    updateGuild(interaction.guildId, (current) => ({ ...current, categories: current.categories.filter((item) => item.key !== key) }));
    return interaction.reply({ content: `Ticket option \`${key}\` removed. Run \`/ticket-panel\` to publish the updated dropdown.`, ephemeral: true });
  }
  if (interaction.commandName === "ticket-config") {
    const claimRole = settings.claimRoleId ? `<@&${settings.claimRoleId}>` : "Not set";
    const transcript = settings.transcriptChannelId ? `<#${settings.transcriptChannelId}>` : "Not set";
    const destinations = Object.entries(settings.categoryChannelIds || {}).map(([key, channelId]) => `**${key}** → <#${channelId}>`).join("\n") || "Not set";
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(settings.panel.color).setTitle("ZYRE MC Ticket Configuration").addFields(
        { name: "Panel title", value: settings.panel.title, inline: false },
        { name: "Banner", value: settings.panel.bannerEnabled ? "Enabled" : "Disabled", inline: true },
        { name: "Claim role", value: claimRole, inline: true },
         { name: "Unclaim role", value: settings.unclaimRoleId ? `<@&${settings.unclaimRoleId}>` : "Not set", inline: true },
         { name: "Close-request role", value: settings.closeRequestRoleId ? `<@&${settings.closeRequestRoleId}>` : "Not set", inline: true },
        { name: "Tickets per user", value: String(settings.maxTicketsPerUser), inline: true },
        { name: "Transcript channel", value: transcript, inline: true },
        { name: "Ticket destinations", value: destinations },
        { name: "Ticket staff roles", value: Object.entries(settings.ticketRoleIds || {}).map(([key, roleId]) => `**${key}** → <@&${roleId}>`).join("\n") || "Not set" },
        { name: "Ticket options", value: settings.categories.map((item) => `${item.emoji} ${item.key} — ${item.name}`).join("\n") || "None" }
      )],
      ephemeral: true
    });
  }
  if (interaction.commandName === "help") {
    if (!interaction.member?.roles?.cache?.some((role) => HELP_ROLE_IDS.has(role.id))) {
      return interaction.reply({
        content: "Only the configured help-access roles can use this command.",
        ephemeral: true
      });
    }
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#6d4aff")
          .setAuthor({ name: "ZYRE MC" })
          .setTitle("ZYRE MC Ticket Bot Help")
          .setDescription("Complete guide to the ZYRE MC ticket system and administration commands.")
          .addFields(
            {
              name: "How members open tickets",
              value: "Use the ticket panel dropdown, choose a ticket type, and complete the Minecraft username and issue form. Each user can have up to the configured ticket limit open at a time."
            },
            {
              name: "Ticket controls",
              value: "Only the configured claim role can use **Claim Ticket** when one is set. Only the configured unclaim role can use **Unclaim** when one is set. Staff can close tickets immediately or with a reason. The ticket owner can close their own ticket or use the **Close My Ticket** button after a close request."
            },
            {
              name: "Transcripts",
              value: "When a ticket closes, an HTML transcript is sent to the configured transcript channel and DMed to the user who opened the ticket. If the user has DMs disabled, channel delivery still proceeds."
            },
            {
              name: "Management permissions",
              value: "All `/set-` commands and `/close-all-tickets` are restricted to the configured ticket management roles."
            },
            {
              name: "Help permissions",
              value: "This `/help` command is restricted to roles `1533563077688033412` and `1487876967729725600`."
            },
            {
              name: "Panel commands",
              value: [
                "`/ticket-panel channel:<channel>` — publish the ticket panel and support banner in a text channel.",
                "`/ticket-panel-edit [title] [description] [footer] [color] [banner]` — change one or more panel settings.",
                "`/ticket-panel-reset` — restore the default panel title, description, footer, color, and banner setting."
              ].join("\n")
            },
            {
              name: "Ticket option commands",
              value: [
                "`/ticket-category-add key:<key> name:<name> description:<description> emoji:<emoji> [color]` — add or replace a ticket type in the dropdown.",
                "`/ticket-category-edit key:<key> [name] [description] [emoji] [color]` — edit an existing ticket type.",
                "`/ticket-category-remove key:<key>` — remove a ticket type from the dropdown.",
                "Run `/ticket-panel` again after changes to publish the updated dropdown."
              ].join("\n")
            },
            {
              name: "Ticket setup commands",
              value: [
                "`/set-claim-role role:<role>` — set the only staff role allowed to claim tickets and use staff controls.",
                "`/set-claim-ticket-user role:<role>` — set the only role allowed to use **Claim Ticket**.",
                "`/set-unclaim-ticket role:<role>` — set the only role allowed to use **Unclaim**.",
                "`/set-close-req-role role:<role>` — set the role allowed to request ticket closure.",
                "`/set-transcript channel:<channel>` — choose where HTML transcripts are sent.",
                "`/set-ticket-category ticket_type:<key> category:<category>` — route a ticket type to a Discord category.",
                "`/set-category ticket_type:<key> category:<category>` — alias for `/set-ticket-category`.",
                "`/set-ticket-role option:<key> role:<role>` — set the staff role for a ticket type.",
                "`/set-ticket-per-user limit:<1|2|3>` — set how many tickets each user may have open simultaneously; closing one frees the slot."
              ].join("\n")
            },
            {
              name: "Staff and information commands",
              value: [
                "`/close-ticket-close-req` — ask the owner of the current ticket to close it; usable by the configured close-request role inside a ticket.",
                "`/close-all-tickets username:<user>` — close every open ticket belonging to a selected user and process their transcripts.",
                "`/ticket-config` — show the current panel, roles, transcript channel, ticket limit, destinations, and ticket types.",
                "`/help` — show this complete command guide."
              ].join("\n")
            }
          )
          .setFooter({ text: "ZYRE MC • Ticket Support" })
      ],
      ephemeral: true
    });
  }
}

function startDiscordBot(botLogger) {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) {
    safeLog(botLogger, "warn", "DISCORD_BOT_TOKEN is not configured; Discord bot was not started.");
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  });

  client.once(Events.ClientReady, async (readyClient) => {
    safeLog(botLogger, "info", "Discord ticket bot logged in.", { tag: readyClient.user.tag });
    try {
      await registerCommands(client, token, botLogger);
      await dmUpdatedBotFileToGrate(client, botLogger);
      let discoveredPanels = 0;
      let refreshedPanels = 0;
      for (const guild of client.guilds.cache.values()) {
        discoveredPanels += await discoverTicketPanels(guild, client);
        refreshedPanels += await refreshTicketPanels(guild, getGuild(guild.id), client);
      }
      safeLog(botLogger, "info", "Refreshed existing ticket panels.", { discovered: discoveredPanels, count: refreshedPanels });
    } catch (error) {
      safeLog(botLogger, "error", "Unable to register Discord slash commands.", { error });
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) return await handleAutocomplete(interaction);
      if (interaction.isChatInputCommand()) return await handleCommand(interaction);
      if (interaction.isStringSelectMenu() && interaction.customId === "ticket:category") {
        const settings = getGuild(interaction.guildId);
        const category = settings.categories.find((item) => item.key === interaction.values[0]);
        if (!category) return interaction.reply({ content: "That ticket type is no longer configured.", ephemeral: true });
        return await createTicket(interaction, category);
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket:modal:")) {
        const [, , key, numberText] = interaction.customId.split(":");
        const settings = getGuild(interaction.guildId);
        const category = ticketCategoryForKey(settings, key);
        if (!category) return interaction.reply({ content: "That ticket type is no longer configured.", ephemeral: true });
        return await finishTicket(interaction, category, Number(numberText));
      }
      if (interaction.isButton() && interaction.customId === "ticket:claim") {
        const settings = getGuild(interaction.guildId);
        if (!canClaimTicket(interaction.member, settings, interaction.channel)) return interaction.reply({ content: "You do not have permission to claim tickets.", ephemeral: true });
        const existingClaim = interaction.message.embeds[0]?.fields?.find((field) => field.name === "Claimed by");
        if (existingClaim) return interaction.reply({ content: `This ticket is already claimed by ${existingClaim.value}.`, ephemeral: true });
        const ticket = interaction.channel.topic?.match(/number=(\d+)/)?.[1] || "ticket";
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = originalEmbed
          ? EmbedBuilder.from(originalEmbed).addFields({ name: "Claimed by", value: `${interaction.user}`, inline: false })
          : new EmbedBuilder()
              .setColor("#2bcf88")
              .setTitle("Ticket Claimed")
              .setDescription(`${interaction.user} is now handling **SUP-${String(ticket).padStart(6, "0")}**.`)
              .setTimestamp();
        await interaction.update({ embeds: [updatedEmbed], components: [ticketButtons({ claimed: true })] });
        return;
      }
      if (interaction.isButton() && interaction.customId.startsWith("n7cloud:category:")) {
        const key = interaction.customId.split(":")[2];
        const category = N7_CLOUD_CATEGORIES.find((item) => item.key === key);
        if (!category) return interaction.reply({ content: "That N7 Cloud department is no longer available.", ephemeral: true });
        return await createTicket(interaction, category);
      }
      if (interaction.isButton() && interaction.customId === "ticket:unclaim") {
        const settings = getGuild(interaction.guildId);
        if (!unclaimMember(interaction.member, settings)) {
          return interaction.reply({ content: "You do not have permission to unclaim tickets.", ephemeral: true });
        }
        const originalEmbed = interaction.message.embeds[0];
        const updatedEmbed = originalEmbed
          ? EmbedBuilder.from(originalEmbed).setFields((originalEmbed.fields || []).filter((field) => field.name !== "Claimed by"))
          : null;
        await interaction.update({
          ...(updatedEmbed ? { embeds: [updatedEmbed] } : {}),
          components: [ticketButtons()]
        });
        return;
      }
      if (interaction.isButton() && interaction.customId === "ticket:close-request") {
        const ownerId = interaction.channel.topic?.match(/owner=(\d+)/)?.[1];
        if (ownerId !== interaction.user.id) {
          return interaction.reply({ content: "Only the person who opened this ticket can use this button.", ephemeral: true });
        }
        return await closeTicket(interaction, "Closed by ticket owner after a staff close request");
      }
      if (interaction.isButton() && ["ticket:close", "ticket:close-reason"].includes(interaction.customId)) {
        const settings = getGuild(interaction.guildId);
        if (!staffMember(interaction.member, settings, interaction.channel) && !interaction.channel.topic?.includes(`owner=${interaction.user.id}`)) return interaction.reply({ content: "Only the ticket owner or ticket staff can close this ticket.", ephemeral: true });
        if (interaction.customId === "ticket:close") return await closeTicket(interaction, "No reason provided");
        const modal = new ModalBuilder().setCustomId("ticket:close-modal").setTitle("Close ticket");
        const reason = new TextInputBuilder().setCustomId("reason").setLabel("Reason for closing").setPlaceholder("Resolved, duplicate, no response, etc.").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500);
        modal.addComponents(new ActionRowBuilder().addComponents(reason));
        return interaction.showModal(modal);
      }
      if (interaction.isModalSubmit() && interaction.customId === "ticket:close-modal") return await closeTicket(interaction, interaction.fields.getTextInputValue("reason") || "No reason provided");
    } catch (error) {
      safeLog(botLogger, "error", "Discord interaction error.", { error });
      const response = { content: "Something went wrong while processing that action. Check the bot logs for details.", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    }
  });

  client.on(Events.ChannelDelete, (channel) => {
    if (channel.guildId) removeOpenTicketsByChannel(channel.guildId, channel.id);
  });

  client.login(token).catch((error) => safeLog(botLogger, "error", "Discord bot login failed.", { error }));
}

module.exports = { startDiscordBot };