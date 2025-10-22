// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, PermissionsBitField } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('ERROR: DISCORD_TOKEN environment variable is required.');
  process.exit(1);
}

// Intents needed for roles, guild members and messages
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

async function ensureLockRole(guild) {
  // Try to find existing role named 'lock' (case-insensitive)
  const existing = guild.roles.cache.find(r => r.name.toLowerCase() === 'lock');
  if (existing) return existing;

  // Create the role
  try {
    const role = await guild.roles.create({
      name: 'lock',
      reason: 'Created by bot for lock group',
      permissions: [] // no extra permissions by default
    });
    return role;
  } catch (err) {
    console.error('Failed to create role:', err);
    throw err;
  }
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;

    // Command: !lock @user  -> create role 'lock' if needed and assign, then set nickname to 'git hub'
    // Or !lockme -> do for the message author
    const content = message.content.trim();
    if (!content.startsWith('!lock')) return;

    // Permission check: bot needs Manage Roles and Manage Nicknames; also the user should have permission to use the command
    const botMember = await message.guild.members.fetch(client.user.id);
    const botHasManageRoles = botMember.permissions.has(PermissionsBitField.Flags.ManageRoles);
    const botHasManageNicknames = botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames);

    if (!botHasManageRoles || !botHasManageNicknames) {
      return message.reply('I need Manage Roles and Manage Nicknames permissions for this to work.');
    }

    // Determine target member
    let targetMember = null;

    // If command is "!lockme"
    if (content === '!lockme') {
      targetMember = message.member;
    } else {
      // Try to find mentioned user
      if (message.mentions.members && message.mentions.members.size > 0) {
        targetMember = message.mentions.members.first();
      } else {
        // Maybe the user passed an ID or username
        const parts = content.split(/\s+/);
        if (parts.length >= 2) {
          const idOrName = parts[1];
          // Try fetch by ID first
          try {
            targetMember = await message.guild.members.fetch(idOrName).catch(() => null);
          } catch (e) {
            targetMember = null;
          }
          if (!targetMember) {
            // fallback: search by displayName or username (case-insensitive)
            const lc = idOrName.toLowerCase();
            targetMember = message.guild.members.cache.find(m =>
              (m.displayName && m.displayName.toLowerCase() === lc) ||
              (m.user && m.user.username && m.user.username.toLowerCase() === lc)
            );
          }
        }
      }
    }

    if (!targetMember) {
      return message.reply('Could not find the target member. Use `!lock @user` or `!lockme`.');
    }

    // Ensure role exists
    const role = await ensureLockRole(message.guild);

    // Check role hierarchy: bot's highest role must be higher than the role to assign
    const botHighest = botMember.roles.highest;
    if (role.position >= botHighest.position) {
      return message.reply('I cannot manage the `lock` role because it is equal or higher than my highest role. Move my role above it and try again.');
    }

    // Assign role
    await targetMember.roles.add(role, `Assigning lock role via bot by ${message.author.tag}`);

    // Set nickname to "git hub"
    // Bot can only change nicknames for members whose highest role is below the bot's highest role
    const botCanChange = botMember.roles.highest.position > targetMember.roles.highest.position || targetMember.id === message.guild.ownerId;
    if (!botCanChange && targetMember.id !== client.user.id) {
      // attempt but likely fail
      await message.reply('I cannot change that member\'s nickname due to role hierarchy. Role was assigned but nickname change failed.');
      return;
    }

    await targetMember.setNickname('git hub', `Setting nickname to git hub via bot by ${message.author.tag}`);

    return message.reply(`Success: assigned role \`${role.name}\` and set nickname to \`git hub\` for ${targetMember.user.tag}.`);
  } catch (err) {
    console.error('Command error:', err);
    message.reply('Something went wrong while running the command. Check bot logs.');
  }
});

client.login(TOKEN);
