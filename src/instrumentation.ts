// 서버 시작 시 밀린 회차를 만들고, 켜져 있는 동안 1시간마다 다시 확인한다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrap } = await import("./lib/runs");
  const tick = () => bootstrap().catch((e) => console.error("[bootstrap]", e));
  await tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}
