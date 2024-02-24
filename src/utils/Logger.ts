import { GuildPreferences } from '@/mongo';
import type { DiscordClient } from '@/registry/client';
import { Colors, EmbedBuilder, type Guild, type User } from 'discord.js';

export default class Logger {
    constructor(private client: DiscordClient) {}

    public info(message: string) {
        console.log(`[ \x1b[0;34mi\x1b[0m ] ${message}`);
    }

    public warn(message: string) {
        console.log(`[ \x1b[0;33m!\x1b[0m ] ${message}`);
    }

    public error(message: string) {
        console.error(`[ \x1b[0;31mx\x1b[0m ] ${message}`);
    }

    public async ban(
        user: User,
        guild: Guild,
        reason: string,
        daysOfMessagesDeleted: number,
    ) {
        const modlogChannelId =
            (
                await GuildPreferences.findOne({
                    guildId: guild.id,
                }).exec()
            )?.modlogChannel || '';

        const modlogChannel = guild.channels.cache.get(modlogChannelId);

        if (modlogChannel && modlogChannel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setTitle('User Banned')
                .setDescription(reason)
                .setFooter({
                    text: `${daysOfMessagesDeleted} days of messages deleted`,
                })
                .setColor(Colors.Red)
                .setAuthor({
                    name: user.displayName,
                    iconURL: user.displayAvatarURL(),
                });

            await modlogChannel.send({
                embeds: [embed],
            });
        }
    }
}
