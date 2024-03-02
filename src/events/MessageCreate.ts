import { PrivateDmThread, Reputation, StickyMessage } from "@/mongo";
import { GuildPreferencesCache, StickyMessageCache } from "@/redis";
import type { ICachedStickyMessage } from "@/redis/schemas/StickyMessage";
import {
	ChannelType,
	Colors,
	EmbedBuilder,
	Events,
	Guild,
	Message,
	TextChannel,
	ThreadChannel,
} from "discord.js";
import type { DiscordClient } from "../registry/DiscordClient";
import BaseEvent from "../registry/Structure/BaseEvent";

export default class MessageCreateEvent extends BaseEvent {
	constructor() {
		super(Events.MessageCreate);
	}

	async execute(client: DiscordClient, message: Message) {
		if (message.author.bot) return;

		if (message.guild) {
			const guildPreferences = await GuildPreferencesCache.get(
				message.guild.id,
			);

			const keywords = (guildPreferences.keywords || []).filter(
				({ keyword }) => keyword === message.content.toLowerCase(),
			);

			if (keywords.length > 0) {
				message.reply(keywords[0].response);
			}

			if (guildPreferences.repEnabled === null) {
				// TODO: Bot logging for unset guild prefs
				return;
			}

			if (message.reference && (guildPreferences.repEnabled || true))
				this.handleRep(
					message as Message<true>,
					guildPreferences?.repDisabledChannelIds || [],
				);

			if (client.stickyChannelIds.some((id) => id === message.channelId)) {
				if (!(client.stickyCounter[message.channelId] > 4)) {
					if (isNaN(client.stickyCounter[message.channelId]))
						client.stickyCounter[message.channelId] = 0;
					client.stickyCounter[message.channelId]++;
					return;
				}

				await this.handleStickyMessages(message as Message<true>);
				client.stickyCounter[message.channelId] = 0;
			}
		} else
			this.handleModMail(
				message as Message<false>,
				client.guilds.cache.get("894596848357089330")!,
				"1204423423799988314",
			);
	}

	// TODO: Logging
	private async handleModMail(
		message: Message<false>,
		guild: Guild,
		threadsChannelId: string,
	) {
		const channel = guild.channels.cache.get(threadsChannelId);

		if (!channel || !(channel instanceof TextChannel)) return;

		const res = await PrivateDmThread.findOne({
			userId: message.author.id,
		}).exec();

		let thread: ThreadChannel;

		if (!res) {
			thread = await channel.threads.create({
				name: `${message.author.username} (${message.author.id})`,
				type: ChannelType.PrivateThread,
				startMessage: `Username: \`${message.author.username}\`\nUser ID: \`${message.author.id}\``,
			});

			await PrivateDmThread.create({
				userId: message.author.id,
				threadId: thread.id,
			});
		} else thread = channel.threads.cache.get(res.threadId)!;

		const embed = new EmbedBuilder()
			.setTitle("New DM Recieved")
			.setAuthor({
				name: message.author.username,
				iconURL: message.author.displayAvatarURL(),
			})
			.setDescription(message.content)
			.setTimestamp(message.createdTimestamp)
			.setColor(Colors.Red);

		thread.send({
			embeds: [embed],
		});
	}

	// TODO: Refactor reputation system
	private async handleRep(
		message: Message<true>,
		repDisabledChannels: string[],
	) {
		const referenceMessage = await message.fetchReference();

		if (
			!referenceMessage.author.bot &&
			!(referenceMessage.author.id === message.author.id)
		) {
			const channelId =
				message.channel.isThread() && !message.channel.isThreadOnly()
					? message.channel.parentId
					: message.channelId;

			if (!repDisabledChannels.some((id) => id === channelId)) {
				const rep = [];

				if (
					[
						"you're welcome", // 'your welcome',
						"ur welcome",
						"no problem",
						"np",
						"yw",
					].some((phrase) => message.content.toLowerCase().includes(phrase))
				)
					rep.push(message.author);

				if (
					[
						"ty",
						"thanks",
						"thank",
						"thank you",
						"thx",
						"tysm",
						"thank u",
						"thnks",
						"tanks",
						"thanku",
						"tyvm",
						"thankyou",
					].some((phrase) => message.content.toLowerCase().includes(phrase))
				)
					rep.push(referenceMessage.author);

				for (const user of rep) {
					const member = await message.guild.members.fetch(user.id);

					if (member) {
						const res = await Reputation.findOneAndUpdate(
							{
								guildId: message.guildId,
								userId: member.id,
							},
							{
								$inc: {
									rep: 1,
								},
							},
							{
								upsert: true,
							},
						).exec();

						const rep = res?.rep;

						if ([100, 500, 1000, 5000].some((amnt) => rep === amnt)) {
							const role = message.guild.roles.cache.get(`${rep}+ Rep Club`);
							message.channel.send(
								`Gave +1 Rep to <@${member.id}> (${rep})${role ? `\nWelcome to the ${role.name}` : ""}`,
							);

							if (role) member.roles.add(role);
						}
					}
				}
			}
		}
	}

	private async handleStickyMessages(message: Message<true>) {
		const stickyMessages = (await StickyMessageCache.search()
			.where("channelId")
			.equals(message.channelId)
			.returnAll()) as ICachedStickyMessage[];

		for (const stickyMessage of stickyMessages) {
			if (!stickyMessage.enabled) return;

			if (stickyMessage.messageId) {
				const oldSticky = await message.channel.messages.fetch(
					stickyMessage.messageId,
				);

				if (oldSticky) await oldSticky.delete();
			}

			const embeds = stickyMessage.embeds.map(
				(embed) => new EmbedBuilder(embed),
			);

			const newSticky = await message.channel.send({
				embeds,
			});

			const res = await StickyMessage.findOneAndUpdate(
				{
					messageId: stickyMessage.messageId,
				},
				{
					$set: {
						messageId: newSticky.id,
					},
				},
			);

			await StickyMessageCache.set(res!.id, {
				...stickyMessage,
				messageId: newSticky.id,
			});
		}
	}
}
