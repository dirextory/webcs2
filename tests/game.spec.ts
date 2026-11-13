import { test, expect } from "@playwright/test";

test("loadout, settings, deployment, movement, shooting, reload, and pause", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "DEPLOY NOW" })).toBeEnabled();
  await page.getByRole("button", { name: "LOADOUT", exact: true }).click();
  await page.getByRole("button", { name: /SUPPRESSED RIFLE.*M4A1-S/ }).click();
  await page.getByRole("button", { name: "CONFIRM LOADOUT" }).click();
  await expect(page.locator(".weapon-card-footer")).toContainText("M4A1-S");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("BOT DIFFICULTY").selectOption("Easy");
  await page.getByLabel("BOT OPPONENTS").selectOption("3");
  await page.getByRole("button", { name: "ALL SET" }).click();
  await expect(page.locator(".bot-summary")).toContainText("3 BOTS");
  await page.getByRole("button", { name: "DEPLOY NOW" }).click();
  await expect(page.locator(".ammo>strong")).toHaveText("25");
  await expect(page.locator(".game-status")).toContainText("3 HOSTILES");
  const before = Number(await page.locator(".radar circle").getAttribute("cy"));
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  await expect
    .poll(async () => Number(await page.locator(".radar circle").getAttribute("cy")))
    .toBeLessThan(before);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await page.locator(".ammo>strong").innerText()))
    .toBeLessThan(25);
  await page.keyboard.press("r");
  await expect(page.locator(".ammo")).toContainText("RELOADING");
  await expect(page.locator(".ammo>strong")).toHaveText("25", { timeout: 20_000 });
  await page.keyboard.down("Tab");
  await expect(page.locator(".scoreboard")).toBeVisible();
  await page.keyboard.up("Tab");
  await expect(page.locator(".scoreboard")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".pause-modal")).toBeVisible();
  const paused = await page.locator(".round-time").innerText();
  await page.waitForTimeout(1200);
  await expect(page.locator(".round-time")).toHaveText(paused);
  await page.getByRole("button", { name: "RESUME MATCH" }).click();
  await expect(page.locator(".pause-modal")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "LEAVE MATCH" }).click();
  await expect(page.getByRole("button", { name: "DEPLOY NOW" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("combat simulation: cover, headshots, bot damage, rounds, and respawns", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/game.ts";
    const { Game } = await import(modulePath);
    const mount = document.createElement("div");
    mount.style.cssText = "position:fixed;width:320px;height:240px;visibility:hidden";
    document.body.appendChild(mount);
    const g = new Game(
      mount,
      () => {},
      () => {},
    ) as any;
    // Exercise the real simulation deterministically, without waiting for a full match.
    cancelAnimationFrame(g.frame);
    g.capture = () => {};
    g.start("ak", "elimination", { difficulty: "Hard", bots: 3, sensitivity: 1, volume: 0 });
    g.configure({ difficulty: "Hard", bots: 7, sensitivity: 1, volume: 0 }, "ak");
    const deploymentBotCount = g.settings.bots === 3;
    const collision = g.blocked(7, 0) && !g.blocked(0, 17);
    g.bots.slice(1).forEach((b: any) => {
      b.hp = 0;
      b.group.visible = false;
    });
    g.state.alive = 1;
    const bot = g.bots[0];
    bot.group.position.set(0, 0, 10);
    g.camera.position.y = 1.2;
    g.camera.rotation.set(0, 0, 0);
    g.elapsed = 10;
    g.shoot();
    const bodyDamage = bot.hp === 66;
    g.elapsed = 11;
    g.camera.position.y = 1.88;
    g.shoot();
    const headshot = bot.hp <= 0 && g.state.kills === 1;
    const roundWon = g.state.score[0] === 1 && g.state.message === "ROUND WON";
    g.state.message = "";
    g.nextRoundAt = 0;
    g.state.score = [4, 0];
    g.finishRound(true);
    const matchEnded = g.state.ended && g.state.message === "MISSION COMPLETE" && !g.running;
    g.start("m4", "deathmatch", { difficulty: "Hard", bots: 3, sensitivity: 1, volume: 0 });
    g.bots[0].group.position.set(0, 0, 12);
    g.bots.forEach((b: any) => {
      b.cooldown = 0;
    });
    const originalRandom = Math.random;
    Math.random = () => 0;
    g.updateBots(0.1);
    Math.random = originalRandom;
    const botDamage = g.state.health < 100;
    g.bots[0].hp = 0;
    g.bots[0].group.visible = false;
    g.bots[0].cooldown = 0;
    g.state.alive--;
    g.updateBots(0.1);
    const respawn = g.bots[0].hp === 100 && g.bots[0].group.visible;
    g.dispose();
    mount.remove();
    return {
      collision,
      bodyDamage,
      headshot,
      roundWon,
      matchEnded,
      botDamage,
      respawn,
      deploymentBotCount,
    };
  });
  expect(result).toEqual({
    collision: true,
    bodyDamage: true,
    headshot: true,
    roundWon: true,
    matchEnded: true,
    botDamage: true,
    respawn: true,
    deploymentBotCount: true,
  });
});

test("deathmatch and compact lobby render correctly", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 950 });
  await page.goto("/");
  await page.getByRole("button", { name: "DEATHMATCH", exact: true }).click();
  await expect(page.locator(".mode-card")).toContainText("Fast respawns");
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflows).toBe(false);
  await page.getByRole("button", { name: "DEPLOY NOW" }).click();
  await expect(page.locator(".round-score")).toContainText("DEATHMATCH");
  await expect(page.locator(".round-time")).toHaveText(/^(3:00|2:5[0-9])$/);
});
