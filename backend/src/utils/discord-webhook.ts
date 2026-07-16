import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import axios from 'axios';

const dbUrl = process.env.DATABASE_URL || 'file:prisma/dev.db';
const adapter = new PrismaBetterSqlite3({ url: dbUrl } as any);
const prisma = new PrismaClient({ adapter });

export async function sendDiscordNotification(
  teamId: string,
  eventType: 'deploy' | 'database' | 'error',
  embed: {
    title: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp?: string;
    url?: string;
  }
) {
  try {
    if (!teamId) return;

    // Find all team members of this team
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: true,
      },
    });

    // Filter members who have discordWebhookUrl and the corresponding notifications enabled
    const usersToNotify = members.filter((m) => {
      const u = m.user;
      if (!u || !u.discordWebhookUrl) return false;
      if (eventType === 'deploy') return u.discordNotifyDeploys;
      if (eventType === 'error') return u.discordNotifyErrors;
      if (eventType === 'database') return u.discordNotifyDatabases;
      return false;
    });

    if (usersToNotify.length === 0) return;

    const payload = {
      embeds: [
        {
          ...embed,
          timestamp: embed.timestamp || new Date().toISOString(),
          footer: {
            text: '📡 KH Cloud Alerts',
          },
        },
      ],
    };

    await Promise.all(
      usersToNotify.map(async (m) => {
        try {
          await axios.post(m.user.discordWebhookUrl!, payload);
        } catch (err: any) {
          console.error(
            `Failed to send Discord webhook notification to user ${m.user.id}:`,
            err.message
          );
        }
      })
    );
  } catch (err: any) {
    console.error('Error in sendDiscordNotification:', err.message);
  }
}

export async function sendDirectDiscordNotification(
  webhookUrl: string,
  embed: {
    title: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  }
) {
  try {
    const payload = {
      embeds: [
        {
          ...embed,
          timestamp: new Date().toISOString(),
          footer: {
            text: '📡 KH Cloud Alert Test',
          },
        },
      ],
    };
    await axios.post(webhookUrl, payload);
  } catch (err: any) {
    console.error('Failed to send direct Discord notification:', err.message);
    throw new Error(err.response?.data?.message || err.message);
  }
}
