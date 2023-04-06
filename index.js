const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const { prefix } = require("./config.json");
const configs = require("./config.json");
const ytdl = require("ytdl-core");
const express = require('express');
const app = express();
const google = require("googleapis");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
	],
});

const queue = new Map();

const youtube = new google.youtube_v3.Youtube({
  version : 'v3',
  auth : configs.GOOGLE_KEY
});

app.get("/", (request, response) => {
  const ping = new Date();
  ping.setHours(ping.getHours() - 3);
  console.log(`Ping recebido às ${ping.getUTCHours()}:${ping.getUTCMinutes()}:${ping.getUTCSeconds()}`);
  response.sendStatus(200);
});
app.listen(process.env.PORT); // Recebe solicitações que o deixa online

client.once("ready", () => {
  console.log("Ready!");
});

client.once("reconnecting", () => {
  console.log("Reconnecting!");
});

client.once("disconnect", () => {
  console.log("Disconnect!");
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const serverQueue = queue.get(message.guild.id);

  if (message.content.startsWith(`${prefix}play`)) {
    message.delete();
    if (message.content.length <= 6)
      return message.channel.send(
        `**${message.author.username}, :** ` +
          "`" +
          "Link vazio, musica não encontrada`"
      );
    execute(message, serverQueue);
    return;
  } else if (message.content.startsWith(`${prefix}skip`)) {
    skip(message, serverQueue);
    return;
  } else if (message.content.startsWith(`${prefix}stop`)) {
    stop(message, serverQueue);
    return;
  } else {
    message.channel.send("(?play, ?skip ou ?stop) Precisa ser um desses comandos!");
  }
});

async function pullsong(args, callback){
    if(ytdl.validateURL(args) == false){
      argsfull = args.join(' ');
      youtube.search.list({
        q: argsfull,
        part: 'snippet',
        fields: 'items(id(videoId), snippet(title))',
        type: 'video'
      }, function(err, resultado){
          if(err){
            console.log(err);
            serverQueue.songs = [];
            serverQueue.connection.dispatcher.end();
          }
          if(resultado){
            const id = resultado.data.items[0].id.videoId;
            const title = resultado.data.items[0].snippet.title;
            const url = 'https://www.youtube.com/watch?v=' + id;

            song = {
              title: title,
              url: url,
            };

            return callback(song);
          }
      });
    }else{
      const songInfo = await ytdl.getInfo(args);
      const title = songInfo.videoDetails.title;
      const url = songInfo.videoDetails.video_url;

      song = {
        title: title,
        url: url,
      };

      return callback(song);
    }
}

async function execute(message, serverQueue) {
  const args = message.content.split(" ");

  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel)
    return message.channel.send(
      "Entre em um canal do discord para eu te identificar"
    );
  const permissions = voiceChannel.permissionsFor(message.client.user);
  if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
    return message.channel.send(
      "Estou sem permissão"
    );
  }
  pullsong(args.slice(1), async function(response){
    const song = {
        title: response.title,
        url: response.url,
      };
    
    if (!serverQueue) {
      const queueContruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true
      };

      queue.set(message.guild.id, queueContruct);

      queueContruct.songs.push(song);

      try {
        var connection = await voiceChannel.join();
        queueContruct.connection = connection;
        play(message.guild, queueContruct.songs[0]);
      } catch (err) {
        console.log(err);
        queue.delete(message.guild.id);
        return message.channel.send(err);
      }
    } else {
      serverQueue.songs.push(song);
      return message.channel.send(`${song.title} ta na fila!`);
    }
  });

}

function skip(message, serverQueue) {
  if (!message.member.voice.channel)
    return message.channel.send(
      "Entre no canal para pular a musica!"
    );
  if (!serverQueue){
    return message.channel.send("não tem musica para eu pula!");
    serverQueue.connection.dispatcher.end();
  }
  serverQueue.songs.splice(0,1);
  play(message.guild, serverQueue.songs[0]);

}

function stop(message, serverQueue) {
  if (!message.member.voice.channel)
    return message.channel.send(
      "Entre no canal para parar a musica!"
    );
    
  if (!serverQueue)
    return message.channel.send("não tem musica para eu parar!");
    
  serverQueue.songs = [];
  serverQueue.connection.dispatcher.end();
}

function play(guild, song) {

  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }
    const dispatcher = serverQueue.connection
    .play(ytdl(song.url))
    .on("finish", () => {
      serverQueue.songs.splice(0,1);
      if(!serverQueue.songs[0]){
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
      }
      play(guild, serverQueue.songs[0]);
    })
    .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    serverQueue.textChannel.send(`TUTS TUTS: **${song.title}**`);
}

client.login(configs.TOKEN_DISCORD);