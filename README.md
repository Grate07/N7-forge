# ZYRE MC / N7  Ticket Bot

Complete Discord ticket bot source and support banner. The package can run directly on a Pterodactyl Node.js server.

## Included features

- Customizable ticket panel title, description, footer, color, and banner toggle.
- Minecraft-style support banner attached inside the panel embed.
- Configurable ticket options with add, edit, remove, and dropdown controls.
- Configurable limit of 1, 2, or 3 simultaneously open tickets per user using `/set-ticket-per-user limit:<1|2|3>`; closing a ticket frees that slot, and the default is 1.
- Stale ticket records are cleared when their channel no longer exists.
- Existing ticket channels are detected even if the settings file is out of sync.
- Duplicate dropdown clicks and simultaneous modal submissions are protected by atomic pending reservations and creation locks.
- Ticket records are cleared automatically when a ticket channel is deleted.
- Ticket options routed into configured Discord categories.
- Per-ticket-type staff roles with channel access and automatic role ping.
- Configurable claim role with ticket claim control; when configured, only that role can use Claim Ticket.
- Configurable unclaim role with an Unclaim button after a ticket is claimed; when configured, only that role can use Unclaim.
- Claiming preserves the original ticket embed and adds a Claimed by field.
- Staff close requests using `/close-ticket-close-req` and a ticket-owner Close My Ticket button.
- Authorized staff can use `/close-all-tickets username:<user>` to close every open ticket belonging to a selected user.
- Configurable close-request role using `/set-close-req-role`.
- HTML transcript sent to the configured transcript channel and DMed to the ticket owner when a ticket closes.
- Configurable transcript destination.
- All `/set-` commands restricted to roles `1528809663825444875`, `1533563068758364470`, and `1487876967729725600`.
- `/close-all-tickets` restricted to roles `1533563068758364470` and `1487876967729725600`.
- `/help` restricted to roles `1533563077688033412` and `1487876967729725600`.
- `/help` explains the ticket workflow, permissions, transcripts, panel commands, ticket option commands, setup commands, and staff commands.
- Autocomplete for configured ticket options.
- Ticket creation immediately defers the interaction to avoid Discord `Unknown interaction` failures.
- N7 Cloud tickets use a single problem-description field and do not ask for a Minecraft username.

## Included files

- `run.cjs` — simple launcher for hosting the bot with `npm start`
- `src/index.cjs` — main bot logic and command handlers
- `src/store.cjs` — per-guild JSON settings store
- `src/transcript.cjs` — HTML transcript generation
- `assets/support-banner.jpg` — panel banner
- `zyre-ticket-bot-updated.zip` — portable archive created for delivery; it is not required inside the extracted runtime folder

## Host integration

Expected environment variables:

- `DISCORD_TOKEN` — bot token; keep this secret
- `DISCORD_CLIENT_ID` — optional application ID override
- `DISCORD_GUILD_ID` — optional test guild ID for faster command registration

Install `discord.js` 14.x and load `src/index.cjs` from the host application with `startDiscordBot(logger)`.

Live guild settings and secrets are intentionally not included in this package.

## Pterodactyl deployment

1. Create a Node.js server using Node.js 18 or newer.
2. Upload this ZIP to the server's Files page and extract it.
3. Set the server startup command to `npm start`.
4. In the server's Startup or Variables page, add:
   - `DISCORD_TOKEN` — the Discord bot token.
   - `DISCORD_CLIENT_ID` — optional application ID override.
   - `DISCORD_GUILD_ID` — optional test server ID. Set this while testing so slash commands register immediately in that server; remove it for global registration.
5. Start or restart the server. The bot should log in and register its slash commands.

This bot is a background Discord process and does not need a web port. Do not add a port mapping or an HTTP startup command. Keep `DISCORD_TOKEN` private and never put it in `package.json`, source files, or a public repository.

After deployment, run `/set-panel-n7cloud` in the target channel. The N7 Cloud form contains only **Describe the problem**; the existing `/ticket-panel` form keeps its original Minecraft username field.

## Ticket limit

The two configured ticket management roles can run `/set-ticket-per-user limit:<1|2|3>` to choose how many tickets each user may have open at the same time. A user can open another ticket after one of their tickets is closed. Existing servers keep the previous one-ticket limit until this command is changed.

## Claim and unclaim permissions

When a claim role is configured with `/set-claim-role` or `/set-claim-ticket-user`, that role is required for the Claim Ticket button; administrator or channel-management permissions and ticket-specific roles do not bypass it. When an unclaim role is configured with `/set-unclaim-ticket`, that role is required for the Unclaim button. If no unclaim role is configured, the configured claim role can also unclaim tickets.
