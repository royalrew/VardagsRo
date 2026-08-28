import { beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  configuredServices: vi.fn(),
  databaseStatus: vi.fn(),
  storageIsHealthy: vi.fn(),
}));

vi.mock("@/server/config", () => ({
  configuredServices: services.configuredServices,
}));
vi.mock("@/server/database", () => ({
  databaseStatus: services.databaseStatus,
}));
vi.mock("@/server/storage", () => ({
  storageIsHealthy: services.storageIsHealthy,
}));

async function readinessModule() {
  return import("@/server/readiness");
}

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  services.configuredServices.mockReset();
  services.databaseStatus.mockReset();
  services.storageIsHealthy.mockReset();
  services.configuredServices.mockReturnValue({
    openai: true,
    r2: true,
    mail: true,
  });
  services.databaseStatus.mockResolvedValue("ok");
  services.storageIsHealthy.mockResolvedValue(true);
});

describe("cached service readiness", () => {
  it("coalesces concurrent dependency probes", async () => {
    let resolveDatabase!: (value: "ok") => void;
    services.databaseStatus.mockReturnValue(
      new Promise((resolve) => {
        resolveDatabase = resolve;
      }),
    );
    const { serviceReadiness } = await readinessModule();

    const first = serviceReadiness();
    const second = serviceReadiness();

    expect(services.databaseStatus).toHaveBeenCalledOnce();
    expect(services.storageIsHealthy).toHaveBeenCalledOnce();
    resolveDatabase("ok");
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { ready: true },
      { ready: true },
    ]);
  });

  it("reuses both healthy and unhealthy results only within the short TTL", async () => {
    vi.useFakeTimers();
    services.databaseStatus.mockResolvedValue("unavailable");
    const { READINESS_CACHE_TTL_MS, serviceReadiness } = await readinessModule();

    await expect(serviceReadiness()).resolves.toMatchObject({ ready: false });
    services.databaseStatus.mockResolvedValue("ok");
    await expect(serviceReadiness()).resolves.toMatchObject({ ready: false });
    expect(services.databaseStatus).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(READINESS_CACHE_TTL_MS + 1);
    await expect(serviceReadiness()).resolves.toMatchObject({ ready: true });
    expect(services.databaseStatus).toHaveBeenCalledTimes(2);
  });

  it("fails closed when dependency checks do not settle before the deadline", async () => {
    vi.useFakeTimers();
    services.databaseStatus.mockReturnValue(new Promise(() => undefined));
    services.storageIsHealthy.mockReturnValue(new Promise(() => undefined));
    const { READINESS_CHECK_TIMEOUT_MS, serviceReadiness } =
      await readinessModule();

    const result = serviceReadiness();
    await vi.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);

    await expect(result).resolves.toMatchObject({
      ready: false,
      services: { database: "unavailable", r2: "unavailable" },
    });
  });

  it("turns rejected dependency checks into a not-ready result", async () => {
    services.databaseStatus.mockRejectedValue(new Error("database secret"));
    services.storageIsHealthy.mockRejectedValue(new Error("storage secret"));
    const { serviceReadiness } = await readinessModule();

    await expect(serviceReadiness()).resolves.toMatchObject({
      ready: false,
      services: { database: "unavailable", r2: "unavailable" },
    });
  });
});
