const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
const fs = require('fs');
const chalk = require('chalk');
const queueLimit = 10000;

module.exports = {
	name: 'playtop',
  aliases: ["pt"],
	description: 'Bật bài hát sẽ phát ngay tiếp theo',
	usage: '[playtop [song]',
	guildOnly: true,
	cooldown: 1,
	async execute(message) {
		try {
			const args = message.content.split(' ');
			const queue = message.client.queue;
			const serverQueue = message.client.queue.get(message.guild.id);
			const voiceChannel = message.member.voice.channel;

			if (!serverQueue) return message.channel.send('Bạn chỉ có thể playtop khi đã có bài hát trong hàng đợi! Sử dụng lệnh play bình thường để thay thế.');
			if (!serverQueue.songs.length) return message.channel.send('Bạn chỉ có thể playtop khi đã có bài hát trong hàng đợi! Sử dụng lệnh play bình thường để thay thế');
			if (!voiceChannel) return message.channel.send('Phải ở trong voice channel thì mới bật được bài hát');
			
			const permissions = voiceChannel.permissionsFor(message.client.user);
			if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
				return message.channel.send('Bố Phong cần quyền vào và nói trong kênh voice');
			}

			if (!args[1]) {
				return message.channel.send('Please enter an argument for the play command!');
			}

			// check for the playlist command
			const playlistSongs = [];
			let chosenPlaylist;
			if (args[1] === 'playlist') {
				const playlistsLocation = `../MonkeeMusic/music_data/${message.guild.id}.json`;
				const data = fs.readFileSync(playlistsLocation);
				const playlists = await JSON.parse(data);
				if (!args[2]) {
					return await message.channel.send('Please specify which playlist you would like to add!');
				}
				for (playlist in playlists) {
					if (args[2] === playlist) {
						chosenPlaylist = playlists[`${playlist}`];
						break;
					}
				}
				for (playlistSong of chosenPlaylist) {
					playlistSongs.push(playlistSong);
				}
				console.log(`${message.author.username} tried to get a playlist`);
			}
			
			const song = await this.getSong(message, args, playlistSongs);
			this.checkQueue(message, args, song, voiceChannel, queue, queueLimit, serverQueue, playlistSongs);
		} catch (error) {
			console.log(error);
			return message.channel.send(error.message);
		}
	},

	async play(message, song) {
		const queue = message.client.queue;
		const guild = message.guild;
		const serverQueue = queue.get(message.guild.id);

		if (!song) {
			await serverQueue.voiceChannel.leave();
			queue.delete(guild.id);
			return;
		}
		const queueBitrate = serverQueue.bitrate;

		const dispatcher = serverQueue.connection
			.play(ytdl(song.url), {bitrate: queueBitrate})
			.on('finish', () => {
				if (!serverQueue.loop && serverQueue.numberOfLoops <= 0) {
					serverQueue.songs.shift();
				}
				if (serverQueue.numberOfLoops > 0) {
					serverQueue.numberOfLoops--;
				}
				this.play(message, serverQueue.songs[0]);
			})
			.on('error', error => console.error(error));

		dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
		if (!serverQueue.loop) {
			await message.channel.send(`:monkey_face: :musical_note: Start playing: **${song.title}**`);
		}
	},

	async getSong(message, args, playlistSongs) {
		let videoId = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=RickAstleyVEVO&ab';
		let song = 0;
		if (!playlistSongs.length) {
			currentQuery = args.slice(1, args.length + 1).join([' ']);
			if (!currentQuery.startsWith('http')) {
				console.log(`${chalk.yellow(`${message.author.username}`)} tried to query "${chalk.cyan(currentQuery)}"`);
				const results = await ytsr(currentQuery, {limit: 1, pages: 1});
				try {	
					videoId = results.items[0].id;
				} catch {
					console.log('no results found for query.');
					message.channel.send('There were no results found for that query! Try again!');
				}
			} else {
				videoId = args[1]
			}
			songInfo = await ytdl.getInfo(videoId);
			song = {
				title: songInfo.videoDetails.title,
				channel: songInfo.videoDetails.author.name,
				thumbnail: songInfo.videoDetails.thumbnails[0].url,
				url: songInfo.videoDetails.video_url,
				duration: songInfo.videoDetails.lengthSeconds,
				isLivestream: songInfo.videoDetails.isLive
			};
		return song;
		}
	},

	async checkQueue(message, args, song, voiceChannel, queue, queueLimit, serverQueue, playlistSongs) {
		if (!song) {
			return message.channel.send('Sorry, Không tìm thấy bài hát nào phù hợp! :worried: Thử lại đi.');
		}
		// Construct the serverQueue if it does not already exist. 
		if (!serverQueue) {
			const queueConstruct = {
				textChannel: message.channel,
				voiceChannel: voiceChannel,
				connection: null,
				songs: [],
				volume: 5,
				bitrate: 512,
				loop: false,
				numberOfLoops: 0,
				playing: true
			};

			await queue.set(message.guild.id, queueConstruct);
			if (!playlistSongs.length) {
				if (song) {
					const currentSong = queueConstruct.songs[0];
					delete queueConstruct.songs[0];
					serverQueue.songs.shift();
					queueConstruct.songs.unshift(currentSong, song);
				}
			} else {
				queueConstruct.songs = queueConstruct.songs.concat(playlistSongs);
			}

			try {
				var connection = await voiceChannel.join();
				queueConstruct.connection = connection;
				this.play(message, queueConstruct.songs[0]);
			} catch (err) {
				console.log(err);
				queue.delete(message.guild.id);
				return await message.channel.send(err);
			}
		} else {
			if (serverQueue.songs.length >= queueLimit) {
				return message.channel.send(`You have reached the maximum number of songs to have in queue (**${queueLimit}**) :worried:`);
			}
			if (!playlistSongs.length) {
				if (song) {
					const currentSong = serverQueue.songs[0];
					delete serverQueue.songs[0];
					serverQueue.songs.shift();
					serverQueue.songs.unshift(currentSong, song);
					return await message.channel.send(`**${song.title}** has been added to the queue! :monkey_face:`);
				}
			} else {
				serverQueue.songs = serverQueue.songs.concat(playlistSongs);
				return await message.channel.send(`Bài **${args[2]}** đã được thêm vào hàng chờ :monkey_face:`);
			}

		}
	}
};