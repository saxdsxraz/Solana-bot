const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const WebSocket = require('ws');
const { token, GUILD_ID, CHANNEL_ID } = require('./config.json');

// Initialize the client with proper intents
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

let walletsToMonitor = [];

client.once('ready', async () => {
  console.log('Bot logged in as ' + client.user.tag);

  // Register slash commands
  await registerSlashCommands();

  // Connect to Solana WebSocket
  const SOLANA_WS_URL = 'wss://flashy-fittest-bush.solana-mainnet.quiknode.pro/58c0854cfbdebd22588c792a901cc028b6815c33';
  const wss = new WebSocket(SOLANA_WS_URL);

  wss.on('open', function open() {
    console.log('Connected to Solana WebSocket');
    subscribeToSolanaTransactions(wss);
  });

  wss.on('message', function incoming(data) {
    handleTransaction(data);
  });

  wss.on('error', (error) => {
    console.error('WebSocket Error:', error);
  });

  wss.on('close', (closeEvent) => {
    console.log('WebSocket Closed:', closeEvent);
  });
});

// Register slash commands
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder().setName('add_wallet').setDescription('Add a wallet to monitor').addStringOption(option => option.setName('wallet').setDescription('Wallet address').setRequired(true)),
    new SlashCommandBuilder().setName('remove_wallet').setDescription('Remove a wallet from monitoring').addStringOption(option => option.setName('wallet').setDescription('Wallet address').setRequired(true)),
    new SlashCommandBuilder().setName('list_wallets').setDescription('List all monitored wallets')
  ]
  .map(command => command.toJSON());

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: commands }
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error('Error registering application commands:', error);
  }
}

// Handle incoming interactions (commands)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  // Defer the reply immediately
  try {
    await interaction.deferReply({ ephemeral: false }); // Defer reply to keep the interaction alive
  } catch (error) {
    console.error('Error deferring reply:', error);
    return;
  }

  try {
    if (commandName === 'add_wallet') {
      const wallet = interaction.options.getString('wallet');
      walletsToMonitor.push(wallet);
      console.log(`Added wallet: ${wallet}`);
      await interaction.followUp(`Wallet ${wallet} added to monitoring.`);
    } else if (commandName === 'remove_wallet') {
      const wallet = interaction.options.getString('wallet');
      if (walletsToMonitor.includes(wallet)) {
        walletsToMonitor = walletsToMonitor.filter(w => w !== wallet);
        console.log(`Removed wallet: ${wallet}`);
        await interaction.followUp(`Wallet ${wallet} removed from monitoring.`);
      } else {
        await interaction.followUp(`Wallet ${wallet} is not being monitored.`);
      }
    } else if (commandName === 'list_wallets') {
      if (walletsToMonitor.length > 0) {
        await interaction.followUp(`Currently monitored wallets: ${walletsToMonitor.join(', ')}`);
      } else {
        await interaction.followUp('No wallets are being monitored.');
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    await interaction.followUp('An error occurred while processing your command.');
  }
});

// Handle Solana transaction logs
function handleTransaction(data) {
  const transactionData = JSON.parse(data);
  console.log('Received transaction data:', transactionData);

  if (transactionData.result && transactionData.result.logs) {
    for (let wallet of walletsToMonitor) {
      if (transactionData.result.logs.some(log => log.includes(wallet))) {
        sendTransactionToDiscord(wallet, transactionData.result.logs);
      }
    }
  }
}

// Send transaction details to Discord
function sendTransactionToDiscord(wallet, logs) {
  const channel = client.channels.cache.get(CHANNEL_ID);
  if (channel) {
    channel.send(`New transaction for wallet ${wallet}:\n${logs.join('\n')}`);
  } else {
    console.error('Channel not found');
  }
}

// Subscribe to Solana transactions (one wallet at a time)
function subscribeToSolanaTransactions(wss) {
  walletsToMonitor.forEach(wallet => {
    const subscriptionMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [
        {
          mentions: [wallet], // One wallet per subscription
        },
        {
          commitment: "confirmed",
        },
      ],
    };

    wss.send(JSON.stringify(subscriptionMessage));
    console.log(`Subscribed to wallet: ${wallet}`);
  });
}

// Start the bot
client.login(token);
