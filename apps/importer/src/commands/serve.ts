import { randomUUID } from "node:crypto";
import type { Runtime } from "../infra/context.js";
import { createWebhookServer, type WebhookStatus } from "../infra/webhook-server.js";
import { incrementalSync } from "../usecases/incremental-sync.js";

const RENEW_MARGIN_MS = 3_600_000;
const MIN_RENEW_MS = 60_000;
const DEFAULT_RENEW_MS = 6 * 3_600_000;
const CHANNEL_ID_KEY = "drive_channel_id";
const CHANNEL_EXPIRATION_KEY = "drive_channel_expiration";

export interface RunningServe {
  close(): Promise<void>;
}

export async function runServe(runtime: Runtime): Promise<RunningServe> {
  const { config, drive, logger, state } = runtime;
  const status: WebhookStatus = {
    channelId: await state.getMeta(CHANNEL_ID_KEY),
    expiration: await state.getMeta(CHANNEL_EXPIRATION_KEY),
    lastEventAt: null,
    lastApplyAt: null,
    lastApplyReport: null,
  };

  let applying = false;
  let queued = false;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let renewal: ReturnType<typeof setTimeout> | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;

  const apply = async (): Promise<void> => {
    if (applying) {
      queued = true;
      return;
    }
    applying = true;
    try {
      const report = await incrementalSync(
        runtime,
        runtime.resolver,
        config.drive.documentDelayMs,
        config.drive.concurrency,
      );
      status.lastApplyAt = new Date().toISOString();
      status.lastApplyReport = report;
      logger.info("apply finished", { ...report });
    } catch (error) {
      logger.error("apply failed", { error });
    } finally {
      applying = false;
      if (queued) {
        queued = false;
        await apply();
      }
    }
  };

  const onEvent = (): void => {
    status.lastEventAt = new Date().toISOString();
    if (debounce) return;
    debounce = setTimeout(() => {
      debounce = null;
      void apply();
    }, config.drive.debounceMs);
  };

  const scheduleRenewal = (): void => {
    if (renewal) clearTimeout(renewal);
    const expiration = Number(status.expiration ?? "0");
    const delay =
      Number.isFinite(expiration) && expiration > Date.now()
        ? Math.max(MIN_RENEW_MS, expiration - Date.now() - RENEW_MARGIN_MS)
        : DEFAULT_RENEW_MS;
    renewal = setTimeout(() => {
      renewal = null;
      void register();
    }, delay);
    renewal.unref();
  };

  const register = async (): Promise<void> => {
    const url = config.drive.webhookUrl;
    if (!url) {
      logger.warn("DRIVE_WEBHOOK_URL not set; running poll-only (use apply by cron)");
      return;
    }
    if (!url.startsWith("https://")) {
      logger.error("DRIVE_WEBHOOK_URL must be a public HTTPS URL; Google will not deliver to this address");
      return;
    }
    if (!config.drive.webhookToken) {
      logger.error("DRIVE_WEBHOOK_TOKEN is required to authenticate notifications; channel not registered");
      return;
    }

    try {
      const result = await drive.watch(url, config.drive.webhookToken, randomUUID());
      status.channelId = result.id;
      status.expiration = result.expiration;
      await state.setMeta(CHANNEL_ID_KEY, result.id);
      if (result.expiration) await state.setMeta(CHANNEL_EXPIRATION_KEY, result.expiration);
      logger.info("drive watch channel registered", { channelId: result.id, expiration: result.expiration });
    } catch (error) {
      logger.error("failed to register drive watch channel", { error });
    }
    scheduleRenewal();
  };

  const server = createWebhookServer({
    port: config.drive.port,
    expectedToken: config.drive.webhookToken,
    logger,
    onEvent,
    status: () => status,
    onImage: (request) => runtime.docs.getImage(request.docId, request.objectId),
    isKnownDoc: async (docId) => (await state.get(docId)) !== null,
  });
  await server.listen();
  logger.info("importer webhook listening", { port: config.drive.port });

  await register();

  if (config.drive.pollIntervalMs > 0) {
    logger.info("drive polling enabled as fallback", { intervalMs: config.drive.pollIntervalMs });
    void apply();
    poll = setInterval(() => {
      void apply();
    }, config.drive.pollIntervalMs);
    poll.unref();
  }

  return {
    close: async (): Promise<void> => {
      if (debounce) clearTimeout(debounce);
      if (renewal) clearTimeout(renewal);
      if (poll) clearInterval(poll);
      await server.close();
    },
  };
}
