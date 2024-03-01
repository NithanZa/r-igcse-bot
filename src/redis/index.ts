import { createClient } from "redis";
import { logger } from "..";

export const redis = createClient({
	url: process.env.REDIS_URL,
});

redis.on("error", logger.error);

export { GuildPreferencesCache } from "./schemas/GuildPreferences";
export { QuestionCache } from "./schemas/Question";
export { SessionCache } from "./schemas/Session";
// export { StickyMessageR } from "./schemas/StickyMessage";
// export { PracticeUserCache } from "./schemas/User";
// export { PracticeViewCache } from "./schemas/View";
